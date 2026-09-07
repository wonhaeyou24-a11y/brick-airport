import type { AircraftData, AircraftState, GameState } from "../core/GameState";
import { FLIGHT_CONFIG } from "./FlightConfig";

/**
 * FlightScheduler — keeps the airport alive by requesting new arrivals over
 * time, and counts flight departures.
 *
 * Pure logic: reads / writes GameState only, never a Three.js object. Actual
 * Aircraft mesh + route creation is delegated to the `spawnAircraft` hook
 * (AircraftManager.spawn), which is where the graphics live (spec §29).
 *
 * Flow per request:
 *   timer fires -> a gate is free & under the cap -> reserve gate, create
 *   AircraftData (state LANDING at the arrival point), hand it to the hook.
 *   No gate -> queue the request (bounded); retried when a gate frees.
 *
 * totalFlights: incremented exactly once per departure via a prev-state map
 * (prev !== TAKEOFF && cur === TAKEOFF), same one-shot pattern PassengerManager
 * uses for aircraft events (spec §18, §19).
 */
export interface FlightSchedulerHooks {
  spawnAircraft(data: AircraftData): void;
}

export class FlightScheduler {
  private timer: number = FLIGHT_CONFIG.initialSpawnDelay;
  private pending = 0;
  private readonly prevState = new Map<string, AircraftState>();

  constructor(
    private readonly state: GameState,
    private readonly hooks: FlightSchedulerHooks,
  ) {}

  get pendingFlights(): number {
    return this.pending;
  }

  update(deltaTime: number): void {
    this.countDepartures();

    this.timer -= deltaTime;
    if (this.timer <= 0) {
      this.timer = FLIGHT_CONFIG.spawnInterval;
      this.requestFlight();
    }

    // A gate may have freed up — work through the queue.
    let guard = FLIGHT_CONFIG.maxPendingFlights + 2;
    while (this.pending > 0 && guard-- > 0 && this.tryDispatch()) {
      this.pending -= 1;
    }
  }

  /** Manual request (e.g. a future "call a flight" button). */
  requestFlight(): void {
    // Airport is full — drop the request rather than queue it forever.
    if (this.state.data.aircraft.length >= this.effectiveCap) return;
    if (this.tryDispatch()) return;
    // Under the cap but every gate is busy — queue it (bounded).
    if (this.pending < FLIGHT_CONFIG.maxPendingFlights) this.pending += 1;
  }

  // --------------------------------------------------------------- internals

  /**
   * Concurrent-aircraft ceiling: the config value, but never below the gate
   * count so building gates lets the airport run more flights (spec §24).
   */
  private get effectiveCap(): number {
    return Math.max(
      FLIGHT_CONFIG.maxActiveAircraft,
      this.state.data.gates.length,
    );
  }

  /** Create one arrival if there's room and a free gate. */
  private tryDispatch(): boolean {
    if (this.state.data.aircraft.length >= this.effectiveCap) return false;

    const gate = this.state.findAvailableGate();
    if (!gate) return false;

    const id = this.state.nextAircraftId();
    const num = Number(/(\d+)$/.exec(id)?.[1] ?? 0);

    // Reserve the gate up front so nothing else claims it during approach.
    this.state.occupyGate(gate.id, id);

    const data: AircraftData = {
      id,
      type: `A-${String(num).padStart(3, "0")}`,
      state: "LANDING",
      position: { ...FLIGHT_CONFIG.arrivalSpawn },
      heading: Math.PI,
      speed: 9,
      targetPosition: null,
      homeGateId: gate.id,
      capacity: FLIGHT_CONFIG.defaultCapacity,
    };
    this.state.addAircraft(data);
    this.hooks.spawnAircraft(data);
    return true;
  }

  private countDepartures(): void {
    for (const ac of this.state.data.aircraft) {
      const prev = this.prevState.get(ac.id);
      if (prev !== undefined && prev !== "TAKEOFF" && ac.state === "TAKEOFF") {
        this.state.recordFlightDeparture();
      }
      this.prevState.set(ac.id, ac.state);
    }
  }
}
