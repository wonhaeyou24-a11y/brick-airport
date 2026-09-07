import * as THREE from "three";
import type { AircraftState, GameState, Vec3 } from "../core/GameState";
import { Passenger, disposePassengerResources } from "./Passenger";
import { PassengerRoute, ARRIVED_LINGER } from "./PassengerRoute";
import { boardingPoint, type PassengerWaypoints } from "./waypoints";

/**
 * PassengerManager — owns the passenger fleet and drives the departure /
 * arrival flow off aircraft state (spec §5, §28).
 *
 *   PARKED aircraft, no departure pax   -> spawn `capacity` departure pax
 *   airborne aircraft -> PARKED         -> spawn 3-5 arrival pax
 *   PARKED aircraft -> pushback          -> remove its (boarded) departure pax
 *   ARRIVED pax after a short linger     -> removed
 *
 * GameState.passengers is the source of truth. Meshes are reconciled from it;
 * no per-frame Mesh allocation (perf rule 25). AircraftRoute is untouched — we
 * only observe its state.
 */

const AIRBORNE: ReadonlySet<AircraftState> = new Set([
  "TAXIING",
  "TAKEOFF",
  "FLYING",
  "LANDING",
]);

export class PassengerManager {
  readonly group: THREE.Group;

  private readonly passengers = new Map<string, Passenger>();
  private readonly routes = new Map<string, PassengerRoute>();
  private readonly prevAircraftState = new Map<string, AircraftState>();

  private nextId = 1;
  private arrivalCounter = 0;

  constructor(
    private readonly state: GameState,
    private readonly waypoints: PassengerWaypoints,
  ) {
    this.group = new THREE.Group();
    this.group.name = "passengers";
  }

  getById(id: string): Passenger | undefined {
    return this.passengers.get(id);
  }

  get count(): number {
    return this.state.data.passengers.length;
  }

  update(deltaTime: number): void {
    this.detectAircraftEvents();
    this.ensureDeparturePassengers();
    this.reconcileEntities();

    for (const route of this.routes.values()) route.tick(deltaTime);

    this.cullArrived();
    this.reconcileEntities();
    this.syncTransforms();
  }

  dispose(): void {
    for (const p of this.passengers.values()) p.dispose();
    this.passengers.clear();
    this.routes.clear();
    this.prevAircraftState.clear();
    disposePassengerResources();
  }

  // ----------------------------------------------------- aircraft observation

  private detectAircraftEvents(): void {
    for (const ac of this.state.data.aircraft) {
      const prev = this.prevAircraftState.get(ac.id) ?? "PARKED";
      const cur = ac.state;

      if (prev === "PARKED" && cur !== "PARKED") {
        // Pushback — departure passengers are aboard, remove them.
        for (const p of this.state.getPassengersForAircraft(ac.id, "DEPARTURE")) {
          this.state.removePassenger(p.id);
        }
      } else if (AIRBORNE.has(prev) && cur === "PARKED") {
        // Just arrived at a gate — disembark some passengers.
        this.spawnArrivalPassengers(ac.id);
      }

      this.prevAircraftState.set(ac.id, cur);
    }
  }

  // --------------------------------------------------------------- spawning

  private ensureDeparturePassengers(): void {
    for (const ac of this.state.data.aircraft) {
      if (ac.state !== "PARKED" || !ac.homeGateId || ac.capacity <= 0) continue;
      if (this.state.getPassengersForAircraft(ac.id, "DEPARTURE").length > 0) {
        continue;
      }
      this.spawnDeparturePassengers(ac.id, ac.homeGateId, ac.capacity);
    }
  }

  spawnDeparturePassengers(
    aircraftId: string,
    gateId: string,
    count: number,
  ): void {
    const base = this.waypoints.terminalEntrance;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.6;
      this.state.addPassenger({
        id: this.mkId(),
        flightId: aircraftId,
        aircraftId,
        gateId,
        state: "WAITING",
        routeType: "DEPARTURE",
        position: { x: base.x + spread, y: 0, z: base.z - 1.4 },
        targetPosition: null,
        speed: 1.9 + (i % 3) * 0.15,
        colorIndex: i,
      });
    }
  }

  spawnArrivalPassengers(aircraftId: string): void {
    const ac = this.state.getAircraft(aircraftId);
    const gate = ac?.homeGateId ? this.state.getGate(ac.homeGateId) : null;
    if (!ac || !gate) return;

    const count = 3 + (this.arrivalCounter++ % 3); // 3–5
    const bp = boardingPoint(gate.parkPosition);
    for (let i = 0; i < count; i++) {
      const jitter: Vec3 = {
        x: bp.x + (i % 2) * 0.5,
        y: 0,
        z: bp.z - Math.floor(i / 2) * 0.5,
      };
      this.state.addPassenger({
        id: this.mkId(),
        flightId: aircraftId,
        aircraftId,
        gateId: gate.id,
        state: "DISEMBARKING",
        routeType: "ARRIVAL",
        position: jitter,
        targetPosition: null,
        speed: 2.0 + (i % 3) * 0.15,
        colorIndex: i + 2,
      });
    }
  }

  // ---------------------------------------------------------------- culling

  private cullArrived(): void {
    for (const [id, route] of this.routes) {
      if (route.arrivedTime > ARRIVED_LINGER) this.state.removePassenger(id);
    }
  }

  // --------------------------------------------------- mesh <-> data sync

  private reconcileEntities(): void {
    // Create for new PassengerData.
    for (const pd of this.state.data.passengers) {
      if (this.routes.has(pd.id)) continue;
      this.routes.set(
        pd.id,
        new PassengerRoute(pd, this.state, this.waypoints),
      );
      const passenger = new Passenger(pd);
      this.passengers.set(pd.id, passenger);
      this.group.add(passenger.object);
    }

    // Remove entities whose PassengerData is gone.
    for (const [id, passenger] of this.passengers) {
      if (this.state.getPassenger(id)) continue;
      passenger.dispose();
      this.passengers.delete(id);
      this.routes.delete(id);
    }
  }

  private syncTransforms(): void {
    for (const passenger of this.passengers.values()) {
      passenger.syncFromData();
    }
  }

  private mkId(): string {
    return `pax-${String(this.nextId++).padStart(4, "0")}`;
  }
}
