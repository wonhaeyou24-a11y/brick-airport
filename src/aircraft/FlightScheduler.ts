import type {
  AircraftData,
  AircraftState,
  FlightData,
  GameState,
} from "../core/GameState";
import { isFlightOver } from "../core/GameState";
import { ECONOMY_CONFIG } from "../economy/EconomyConfig";
import {
  FLIGHT_CONFIG,
  availableDestinations,
  getDestination,
  type DestinationConfig,
} from "./FlightConfig";
import {
  canComplete,
  deriveFlightState,
  type FlightSnapshot,
} from "./FlightLifecycle";
import { isFlightOnTime } from "../operations/AirportOperations";
import { AIRBORNE } from "../passengers/PassengerManager";

/**
 * FlightScheduler — keeps the airport alive by requesting new arrivals over
 * time, and owns the Flight (항공편) lifecycle (V0.6-C).
 *
 * Pure logic: reads / writes GameState only, never a Three.js object. Actual
 * Aircraft mesh + route creation is delegated to the `spawnAircraft` hook
 * (AircraftManager.spawn), which is where the graphics live (spec §29).
 *
 * Flow per request:
 *   timer fires -> a gate is free & under the cap -> create a Flight FIRST,
 *   then reserve the gate, create AircraftData (state LANDING at the arrival
 *   point) linked to that flight, and hand it to the hook. No gate -> queue
 *   the request (bounded); retried when a gate frees.
 *
 * Each frame syncFlights() then:
 *   - opens a fresh DEPARTURE flight for any serviceable aircraft that has none
 *     (this is how one aircraft flies many flights over its life);
 *   - advances every active flight's state via FlightLifecycle.deriveFlightState;
 *   - attributes ticket revenue to the flight (peak of its boarded pax — never
 *     re-added to airport totals, so no double revenue);
 *   - marks a flight COMPLETED once its aircraft is airborne and outbound.
 *
 * totalFlights: still incremented exactly once per departure via a prev-state
 * map (prev !== TAKEOFF && cur === TAKEOFF), same one-shot pattern
 * PassengerManager uses for aircraft events (spec §18, §19).
 */
export interface FlightSchedulerHooks {
  spawnAircraft(data: AircraftData): void;
  /** Fired once, the frame a flight reaches COMPLETED (V0.7 operations hook). */
  onFlightCompleted?(flight: FlightData): void;
  /** Fired once, the frame its aircraft first reaches TAKEOFF (V1.7 live-ops notice). */
  onAircraftTakeoff?(flight: FlightData): void;
  /**
   * Fired once, the frame an aircraft goes from airborne to PARKED at a gate
   * (V1.7). Takes the aircraft, not a flight: every FlightData created by this
   * scheduler is a DEPARTURE (spec's own routeType), so the flight tied to a
   * just-landed aircraft is really its *next* departure, not one that "arrived".
   */
  onAircraftArrived?(aircraft: AircraftData): void;
}

export class FlightScheduler {
  private timer: number = FLIGHT_CONFIG.initialSpawnDelay;
  private pending = 0;
  private readonly prevState = new Map<string, AircraftState>();
  /** Flight ids whose aircraft has begun its takeoff roll at least once. */
  private readonly departed = new Set<string>();
  private destinationIndex = 0;

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

    this.syncFlights(deltaTime);
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
   * V2.2 — also never below the runway-derived cap, so RUNWAY (previously
   * read nowhere) genuinely raises capacity too.
   */
  private get effectiveCap(): number {
    return Math.max(
      FLIGHT_CONFIG.maxActiveAircraft,
      this.state.data.gates.length,
      this.state.countBuildingsByType("RUNWAY") * FLIGHT_CONFIG.aircraftPerRunway,
    );
  }

  /** Create one arrival if there's room and a free gate. */
  private tryDispatch(): boolean {
    if (this.state.data.aircraft.length >= this.effectiveCap) return false;

    const gate = this.state.findAvailableGate();
    if (!gate) return false;

    const id = this.state.nextAircraftId();
    const num = Number(/(\d+)$/.exec(id)?.[1] ?? 0);

    // Flight FIRST (spec V0.6-C), then the aircraft that will operate it.
    const flight = this.createFlight(gate.id, id);

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
      currentFlightId: flight.id,
    };
    this.state.addAircraft(data);
    this.hooks.spawnAircraft(data);
    return true;
  }

  /** Open a new SCHEDULED departure flight to a level-appropriate destination. */
  private createFlight(gateId: string | null, aircraftId: string | null): FlightData {
    const now = Date.now();
    const dest = this.pickDestination();
    const flight: FlightData = {
      id: this.state.nextFlightId(),
      aircraftId,
      gateId,
      state: "SCHEDULED",
      routeType: "DEPARTURE",
      origin: FLIGHT_CONFIG.homeCity,
      destination: dest.id,
      scheduledAt: now,
      createdAt: now,
      passengerIds: [],
      elapsedSeconds: 0,
    };
    this.state.addFlight(flight);
    return flight;
  }

  /** Rotate through the destinations unlocked at the airport's current level. */
  private pickDestination(): DestinationConfig {
    const pool = availableDestinations(this.state.airport.level);
    return pool[this.destinationIndex++ % pool.length];
  }

  /**
   * Per-frame Flight lifecycle: assign flights to aircraft that need one,
   * advance flight states, attribute revenue, complete finished flights.
   */
  private syncFlights(deltaTime: number): void {
    // 1. Every serviceable aircraft gets a current flight (reuse over its life).
    for (const ac of this.state.data.aircraft) {
      const current = ac.currentFlightId
        ? this.state.getFlight(ac.currentFlightId)
        : undefined;
      if (current && !isFlightOver(current.state)) continue;
      const atGate =
        (ac.state === "PARKED" ||
          ac.state === "LANDING" ||
          ac.state === "TAXIING") &&
        ac.homeGateId !== null;
      if (atGate) {
        ac.currentFlightId = this.createFlight(ac.homeGateId, ac.id).id;
      }
    }

    // 2. Advance / complete each active flight.
    for (const flight of this.state.data.flights) {
      if (isFlightOver(flight.state)) continue;

      // Accumulate active game-time for the on-time judgement (V0.7-B).
      flight.elapsedSeconds = (flight.elapsedSeconds ?? 0) + deltaTime;

      const ac = flight.aircraftId
        ? this.state.getAircraft(flight.aircraftId)
        : undefined;
      const board = flight.aircraftId
        ? this.state.getAircraftBoarding(flight.aircraftId)
        : { total: 0, boarded: 0 };

      // Revenue attribution: peak count of this flight's paid departure pax,
      // so the value survives the passengers being removed on pushback. Never
      // re-added to airport totals — Economy already did that (no double pay).
      if (ac) {
        const paid = this.state
          .getPassengersForAircraft(ac.id, "DEPARTURE")
          .filter((p) => p.revenueProcessed).length;
        // V2.1: mirror Economy.settleBoarding()'s per-passenger multiplier so
        // this display/history figure matches the money actually credited,
        // instead of quietly reverting to the flat rate for every route.
        const multiplier = getDestination(flight.destination)?.revenueMultiplier ?? 1;
        const revenue = paid * Math.round(ECONOMY_CONFIG.ticketRevenuePerPassenger * multiplier);
        if (revenue > (flight.revenue ?? 0)) flight.revenue = revenue;
      }

      const snap: FlightSnapshot = {
        routeType: flight.routeType,
        aircraftState: ac?.state ?? null,
        boarded: board.boarded,
        total: board.total,
        departed: this.departed.has(flight.id),
      };

      const next = deriveFlightState(flight.state, snap);
      if (next !== flight.state) flight.state = next;

      if (canComplete(flight.state, snap)) {
        const budget =
          getDestination(flight.destination)?.flightDuration ?? Infinity;
        flight.onTime = isFlightOnTime(flight.elapsedSeconds ?? 0, budget);
        this.state.completeFlight(flight.id, flight.revenue ?? 0);
        this.departed.delete(flight.id);
        this.hooks.onFlightCompleted?.(flight);
      }
    }
  }

  /**
   * Same prevState sweep as before (spec §52/§53 one-shot pattern), extended
   * to also fire the V1.7 takeoff/arrival live-ops notices — still exactly one
   * GameState write (recordFlightDeparture) and no new bookkeeping beyond the
   * prevState map that already existed for departure counting.
   */
  private countDepartures(): void {
    for (const ac of this.state.data.aircraft) {
      const prev = this.prevState.get(ac.id);
      const flight = ac.currentFlightId
        ? this.state.getFlight(ac.currentFlightId)
        : undefined;

      if (prev !== undefined && prev !== "TAKEOFF" && ac.state === "TAKEOFF") {
        this.state.recordFlightDeparture();
        if (ac.currentFlightId) this.departed.add(ac.currentFlightId);
        if (flight) this.hooks.onAircraftTakeoff?.(flight);
      } else if (prev !== undefined && AIRBORNE.has(prev) && ac.state === "PARKED") {
        this.hooks.onAircraftArrived?.(ac);
      }
      this.prevState.set(ac.id, ac.state);
    }
  }
}
