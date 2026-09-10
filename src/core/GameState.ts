import {
  CELL_SIZE,
  footprintCells,
  type CellCoord,
  type CellSize,
} from "../world/cells";
import { ECONOMY_CONFIG } from "../economy/EconomyConfig";

/**
 * GameState — the data-first source of truth for Brick Airport.
 *
 * RULE: this module never imports Three.js and never stores a Mesh / Object3D.
 * Graphics modules read from these plain objects and build their own meshes.
 * This keeps placeholder geometry swappable for polished brick assets later,
 * and gives save/load a clean serializable target in a future version.
 */

export type Vec3 = { x: number; y: number; z: number };

/**
 * Gate *operational* status, shown to the player and kept in sync each frame
 * by GateStatusSync from the aircraft lifecycle + passenger boarding:
 *
 *   AVAILABLE -> BOARDING -> READY -> DEPARTING -> AVAILABLE
 *
 * The internal "this gate is reserved" signal is `aircraftId !== null`, which
 * is separate and untouched. OCCUPIED is a legacy value from pre-V0.4.2 saves;
 * the constructor migrates it and GateStatusSync never writes it.
 */
export type GateStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "BOARDING"
  | "READY"
  | "DEPARTING";

/**
 * Service facilities (V0.7-C) — buildings that improve passenger processing and
 * satisfaction. They are ordinary BuildingData entries placed through the same
 * build pipeline; their *operational effect* is computed separately in the
 * operations layer, never stored on the building (spec §54).
 */
export type ServiceFacilityType = "CHECK_IN" | "SECURITY" | "BAGGAGE" | "LOUNGE";

export type BuildingType =
  | "TERMINAL"
  | "RUNWAY"
  | "GATE"
  | ServiceFacilityType;

export const SERVICE_FACILITY_TYPES: readonly ServiceFacilityType[] = [
  "CHECK_IN",
  "SECURITY",
  "BAGGAGE",
  "LOUNGE",
];

const SERVICE_FACILITY_SET: ReadonlySet<string> = new Set(SERVICE_FACILITY_TYPES);

export function isServiceFacility(
  type: BuildingType,
): type is ServiceFacilityType {
  return SERVICE_FACILITY_SET.has(type);
}

export type AircraftState =
  | "PARKED"
  | "TAXIING"
  | "TAKEOFF"
  | "FLYING"
  | "LANDING";

/**
 * Passenger lifecycle. DEPARTURE runs WAITING -> ... -> BOARDED; ARRIVAL runs
 * DISEMBARKING -> TO_TERMINAL_AFTER_ARRIVAL -> ARRIVED.
 */
export type PassengerState =
  | "WAITING"
  | "TO_TERMINAL"
  | "CHECK_IN"
  | "TO_GATE"
  | "BOARDING"
  | "BOARDED"
  | "DISEMBARKING"
  | "TO_TERMINAL_AFTER_ARRIVAL"
  | "ARRIVED";

export type PassengerRouteType = "DEPARTURE" | "ARRIVAL";

/**
 * Flight (항공편) lifecycle — a SEPARATE concept from AircraftState (V0.6-A).
 * One aircraft flies many flights over its life; a flight is the unit that
 * connects an aircraft, a gate and a set of passengers for one operation.
 *
 *   SCHEDULED -> BOARDING -> READY -> DEPARTING -> FLYING -> ARRIVING -> COMPLETED
 *
 * CANCELLED is a terminal state for a flight that never departed. This enum is
 * never merged with AircraftState — FlightLifecycle (V0.6-B) maps between them.
 */
export type FlightState =
  | "SCHEDULED"
  | "BOARDING"
  | "READY"
  | "DEPARTING"
  | "FLYING"
  | "ARRIVING"
  | "COMPLETED"
  | "CANCELLED";

/** Flight direction — reuses the passenger route vocabulary. */
export type FlightRouteType = PassengerRouteType;

/**
 * Live airport operating metrics (V0.7-A). Separate from the lifetime
 * accumulators (`totalRevenue` etc.) and from `reputation` — these describe the
 * airport's CURRENT service level, not its history:
 *
 *   serviceScore          — how well-equipped the airport is (facility-driven)
 *   passengerSatisfaction  — rolling average over recent completed flights
 *   onTimeRate             — % of recent flights that finished within budget
 *
 * All 0–100. Recomputed at event points (building placed, flight completed),
 * never re-accumulated per frame (spec §60).
 */
export interface OperationsData {
  serviceScore: number;
  passengerSatisfaction: number;
  onTimeRate: number;
}

/**
 * Seed values shown until the first recompute. Deliberately the "neutral"
 * starting point — a fresh airport with no facilities and no flight history.
 */
export const DEFAULT_OPERATIONS: OperationsData = {
  serviceScore: 50,
  passengerSatisfaction: 70,
  onTimeRate: 90,
};

/** Current on-disk state schema version. Older states migrate up in the ctor. */
export const STATE_VERSION = "0.7.0";

export interface AirportData {
  id: string;
  name: string;
  level: number;
  money: number;
  reputation: number;
  /** Lifetime ticket revenue. Optional for pre-V0.4 states (read via `?? 0`). */
  totalRevenue?: number;
  /** Lifetime passengers that have boarded. Optional for pre-V0.4 states. */
  totalPassengers?: number;
  /** Lifetime flight departures. Optional for pre-V0.4.1 states. */
  totalFlights?: number;
  /** Live operating metrics (V0.7-A). Optional for pre-V0.7 states. */
  operations?: OperationsData;
}

export interface BuildingData {
  id: string;
  type: BuildingType;
  /** Grid cell of the footprint's min corner. World position derives from this. */
  cell: CellCoord;
  /** Footprint in grid cells. */
  size: CellSize;
  /** Rotation around the Y axis, in radians. */
  rotationY: number;
  level: number;
  /** Grid cell keys this building occupies. Kept in sync with cell + size. */
  occupiedCells: string[];
}

export interface GateData {
  id: string;
  /** Building id of the gate structure this refers to. */
  buildingId: string;
  status: GateStatus;
  /** Aircraft currently occupying the gate, if any. */
  aircraftId: string | null;
  /** World-space position an aircraft parks at when using this gate. */
  parkPosition: Vec3;
}

export interface AircraftData {
  id: string;
  type: string;
  state: AircraftState;
  /** Current world position. Written by the aircraft simulation each frame. */
  position: Vec3;
  /** Heading in radians (Y axis). */
  heading: number;
  /** Units per second. */
  speed: number;
  /** Where the aircraft is currently moving toward, or null when idle. */
  targetPosition: Vec3 | null;
  /** Gate the aircraft is assigned to. */
  homeGateId: string | null;
  /** Max passengers this aircraft carries (drives departure spawn count). */
  capacity: number;
  /**
   * Flight this aircraft is currently operating, if any (V0.6-A). This is a
   * transient link, not a history — it is cleared when the flight completes and
   * reset when the aircraft is dispatched again. Optional for pre-V0.6 states.
   */
  currentFlightId?: string | null;
}

export interface PassengerData {
  id: string;
  /** Flight / aircraft this passenger belongs to. */
  flightId: string | null;
  aircraftId: string | null;
  /** Gate the passenger is heading to / arriving from. */
  gateId: string | null;
  state: PassengerState;
  routeType: PassengerRouteType;
  position: Vec3;
  targetPosition: Vec3 | null;
  /** Units per second. */
  speed: number;
  /** Cosmetic palette index for the placeholder minifig. */
  colorIndex: number;
  /** Set once ticket revenue for this passenger has been paid (double-pay guard). */
  revenueProcessed: boolean;
  /**
   * Final satisfaction 0–100 (V0.7-D), computed once when the passenger reaches
   * a terminal state (BOARDED / ARRIVED). Undefined until then.
   */
  satisfaction?: number;
}

/**
 * FlightData — one airport operation (V0.6-A). Connects an aircraft, a gate and
 * a group of passengers. Completed flights stay in `flights[]` with
 * state "COMPLETED" so they double as the flight history (V0.6-E).
 *
 * Every relation is nullable: a flight whose aircraft / gate / passengers are
 * missing must never crash the game — it just renders as "—".
 */
export interface FlightData {
  /** Flight id like "F-001". Namespaced apart from aircraft ids. */
  id: string;
  aircraftId: string | null;
  gateId: string | null;
  state: FlightState;
  routeType: FlightRouteType;
  /** Human-readable origin city, e.g. "SEOUL". */
  origin: string;
  /** Human-readable destination city, e.g. "TOKYO". */
  destination: string;
  /** Epoch ms the flight is scheduled for. */
  scheduledAt: number;
  /** Epoch ms the flight record was created. */
  createdAt: number;
  /** Passengers assigned to this flight. */
  passengerIds: string[];
  /** Epoch ms the flight completed (set once, on completion). */
  completedAt?: number;
  /** Ticket revenue attributed to this flight (set once, on completion). */
  revenue?: number;
  /**
   * Game-seconds this flight has been active (V0.7-B). Accumulated by
   * FlightScheduler each frame; used for the on-time judgement, which is
   * frame-rate / wall-clock independent (works under pumped-sim tests).
   */
  elapsedSeconds?: number;
  /** Whether the flight finished within its time budget (set on completion). */
  onTime?: boolean;
  /** Departure-passenger satisfaction scores captured as each one boards (V0.7-D). */
  paxSatisfaction?: number[];
  /** Mean passenger satisfaction for this flight (set on completion, V0.7-D). */
  averageSatisfaction?: number;
}

export interface GameStateData {
  version: string;
  airport: AirportData;
  buildings: BuildingData[];
  gates: GateData[];
  aircraft: AircraftData[];
  passengers: PassengerData[];
  /** All flights, past and present. COMPLETED entries are the history (V0.6-E). */
  flights: FlightData[];
  /** Currently selected entity, for HUD display. */
  selection: {
    kind: "AIRCRAFT" | "BUILDING" | "PASSENGER" | null;
    id: string | null;
  };
  /** Grid interaction state (hover / picked cell). */
  grid: {
    hoverCell: CellCoord | null;
    selectedCell: CellCoord | null;
  };
}

/** A flight in a terminal state — COMPLETED or CANCELLED — never transitions again. */
export function isFlightOver(state: FlightState): boolean {
  return state === "COMPLETED" || state === "CANCELLED";
}

/** Convenience: build a BuildingData with occupiedCells filled in. */
export function makeBuilding(
  partial: Omit<BuildingData, "occupiedCells">,
): BuildingData {
  return { ...partial, occupiedCells: footprintCells(partial.cell, partial.size) };
}

/**
 * Builds the initial, intentionally-small airport.
 * Coordinates here are grid cells / world units chosen to match AirportWorld.
 */
export function createInitialState(): GameStateData {
  return {
    version: STATE_VERSION,
    airport: {
      id: "airport-1",
      name: "My Airport",
      level: 1,
      money: ECONOMY_CONFIG.startingMoney,
      reputation: 0,
      totalRevenue: 0,
      totalPassengers: 0,
      totalFlights: 0,
      operations: { ...DEFAULT_OPERATIONS },
    },
    buildings: [
      makeBuilding({
        id: "runway-1",
        type: "RUNWAY",
        cell: { col: -9, row: -2 },
        size: { cols: 18, rows: 4 },
        rotationY: 0,
        level: 1,
      }),
      makeBuilding({
        id: "terminal-1",
        type: "TERMINAL",
        cell: { col: -4, row: 6 },
        size: { cols: 8, rows: 3 },
        rotationY: 0,
        level: 1,
      }),
      makeBuilding({
        id: "gate-building-1",
        type: "GATE",
        cell: { col: 0, row: 4 },
        size: { cols: 1, rows: 1 },
        rotationY: 0,
        level: 1,
      }),
      makeBuilding({
        id: "gate-building-2",
        type: "GATE",
        cell: { col: 3, row: 4 },
        size: { cols: 1, rows: 1 },
        rotationY: 0,
        level: 1,
      }),
      makeBuilding({
        id: "gate-building-3",
        type: "GATE",
        cell: { col: -3, row: 4 },
        size: { cols: 1, rows: 1 },
        rotationY: 0,
        level: 1,
      }),
    ],
    gates: [
      {
        id: "gate-1",
        buildingId: "gate-building-1",
        status: "OCCUPIED",
        aircraftId: "aircraft-1",
        parkPosition: { x: 1, y: 0, z: 7 },
      },
      {
        id: "gate-2",
        buildingId: "gate-building-2",
        status: "OCCUPIED",
        aircraftId: "aircraft-2",
        parkPosition: { x: 7, y: 0, z: 7 },
      },
      {
        id: "gate-3",
        buildingId: "gate-building-3",
        status: "AVAILABLE",
        aircraftId: null,
        parkPosition: { x: -5, y: 0, z: 7 },
      },
    ],
    aircraft: [
      {
        id: "aircraft-1",
        type: "A-001",
        state: "PARKED",
        position: { x: 1, y: 0, z: 7 },
        heading: 0,
        speed: 6,
        targetPosition: null,
        homeGateId: "gate-1",
        capacity: 6,
      },
      {
        id: "aircraft-2",
        type: "A-002",
        state: "PARKED",
        position: { x: 7, y: 0, z: 7 },
        heading: 0,
        speed: 6,
        targetPosition: null,
        homeGateId: "gate-2",
        capacity: 4,
      },
    ],
    passengers: [],
    flights: [],
    selection: { kind: null, id: null },
    grid: { hoverCell: null, selectedCell: null },
  };
}

/**
 * Thin wrapper that owns the state object and offers small typed accessors.
 * Kept deliberately minimal — no reducers, no events yet.
 */
export class GameState {
  readonly data: GameStateData;

  constructor(data: GameStateData = createInitialState()) {
    this.data = data;
    // Forward-compat: a state saved before V0.3 has no passengers array.
    if (!this.data.passengers) this.data.passengers = [];
    // Forward-compat: a state saved before V0.6 has no flights array.
    if (!this.data.flights) this.data.flights = [];
    // Forward-compat: pre-V0.4 passengers have no revenueProcessed flag.
    // Assume an already-BOARDED one was paid so it is never double-credited.
    for (const p of this.data.passengers) {
      if (p.revenueProcessed === undefined) {
        p.revenueProcessed = p.state === "BOARDED";
      }
    }
    // Forward-compat (pre-V0.4.2): OCCUPIED is not an operational status.
    // GateStatusSync recomputes every gate each frame; seed a sane value here.
    for (const g of this.data.gates) {
      if (g.status === "OCCUPIED") {
        g.status = g.aircraftId ? "BOARDING" : "AVAILABLE";
      }
    }
    // Forward-compat: a state saved before V0.7 has no operations metrics.
    if (!this.data.airport.operations) {
      this.data.airport.operations = { ...DEFAULT_OPERATIONS };
    }
    if (typeof this.data.airport.reputation !== "number") {
      this.data.airport.reputation = 0;
    }
    // All migrations have run — the state now matches the current schema.
    this.data.version = STATE_VERSION;
  }

  get airport(): AirportData {
    return this.data.airport;
  }

  /** Live operating metrics — always present (the ctor migrates old states). */
  get operations(): OperationsData {
    if (!this.data.airport.operations) {
      this.data.airport.operations = { ...DEFAULT_OPERATIONS };
    }
    return this.data.airport.operations;
  }

  getAircraft(id: string): AircraftData | undefined {
    return this.data.aircraft.find((a) => a.id === id);
  }

  /** A fresh, collision-free aircraft id like "aircraft-3". */
  nextAircraftId(): string {
    let max = 0;
    for (const a of this.data.aircraft) {
      const m = /(\d+)$/.exec(a.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `aircraft-${max + 1}`;
  }

  addAircraft(data: AircraftData): void {
    this.data.aircraft.push(data);
  }

  /** One-shot: call when an aircraft actually starts its takeoff roll. */
  recordFlightDeparture(): void {
    const a = this.data.airport;
    a.totalFlights = (a.totalFlights ?? 0) + 1;
  }

  /**
   * Deduct `amount` from the airport balance. Returns false (and changes
   * nothing) if the balance is too low — the atomic guard for a purchase
   * (spec §9, §32).
   */
  spendMoney(amount: number): boolean {
    if (this.data.airport.money < amount) return false;
    this.data.airport.money -= amount;
    return true;
  }

  getBuilding(id: string): BuildingData | undefined {
    return this.data.buildings.find((b) => b.id === id);
  }

  /** How many buildings of a given type exist (V0.7-C facility effects). */
  countBuildingsByType(type: BuildingType): number {
    let n = 0;
    for (const b of this.data.buildings) if (b.type === type) n += 1;
    return n;
  }

  /** Service-facility counts keyed by type, e.g. { CHECK_IN: 2, LOUNGE: 1 }. */
  serviceFacilityCounts(): Record<ServiceFacilityType, number> {
    const counts: Record<ServiceFacilityType, number> = {
      CHECK_IN: 0,
      SECURITY: 0,
      BAGGAGE: 0,
      LOUNGE: 0,
    };
    for (const b of this.data.buildings) {
      if (isServiceFacility(b.type)) counts[b.type] += 1;
    }
    return counts;
  }

  getGate(id: string): GateData | undefined {
    return this.data.gates.find((g) => g.id === id);
  }

  /** The gate whose structure is this building, if the building is a gate. */
  getGateByBuilding(buildingId: string): GateData | undefined {
    return this.data.gates.find((g) => g.buildingId === buildingId);
  }

  getGateByAircraft(aircraftId: string): GateData | undefined {
    return this.data.gates.find((g) => g.aircraftId === aircraftId);
  }

  /** First gate that is free (status AVAILABLE and no aircraft), or null. */
  findAvailableGate(): GateData | null {
    return (
      this.data.gates.find(
        (g) => g.status === "AVAILABLE" && g.aircraftId === null,
      ) ?? null
    );
  }

  /**
   * Reserve / link a gate to an aircraft (data relationship only — no meshes).
   * Only touches `aircraftId`; the operational `status` is derived each frame
   * by GateStatusSync. Cancels any stale DEPARTING linger defensively.
   */
  occupyGate(gateId: string, aircraftId: string): void {
    const gate = this.getGate(gateId);
    if (!gate) return;
    gate.aircraftId = aircraftId;
    if (gate.status === "DEPARTING") gate.status = "BOARDING";
  }

  /**
   * The aircraft at this gate is pushing back. Marks the gate DEPARTING and
   * keeps `aircraftId` for a short linger so the player sees it leave;
   * GateStatusSync clears both once the linger ends (spec §7, §8).
   */
  releaseGate(gateId: string): void {
    const gate = this.getGate(gateId);
    if (!gate) return;
    gate.status = "DEPARTING";
  }

  /** A fresh, collision-free building id like "gate-004" / "terminal-002". */
  nextBuildingId(type: BuildingType): string {
    const prefix = type.toLowerCase();
    const re = new RegExp(`^${prefix}\\D*(\\d+)$`);
    let max = 0;
    for (const b of this.data.buildings) {
      const m = re.exec(b.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix}-${String(max + 1).padStart(3, "0")}`;
  }

  /**
   * Register a gate for a freshly placed GATE building. The gate shares the
   * building id; its park position is just in front of the footprint (toward
   * the runway, -Z). Returns the new gate.
   */
  addGateForBuilding(building: BuildingData): GateData {
    const centreX =
      building.cell.col * CELL_SIZE + (building.size.cols * CELL_SIZE) / 2;
    const centreZ =
      building.cell.row * CELL_SIZE + (building.size.rows * CELL_SIZE) / 2;
    const gate: GateData = {
      id: building.id,
      buildingId: building.id,
      status: "AVAILABLE",
      aircraftId: null,
      parkPosition: { x: centreX, y: 0, z: centreZ - 2 },
    };
    this.data.gates.push(gate);
    return gate;
  }

  // ------------------------------------------------------------- passengers

  getPassenger(id: string): PassengerData | undefined {
    return this.data.passengers.find((p) => p.id === id);
  }

  addPassenger(passenger: PassengerData): void {
    this.data.passengers.push(passenger);
  }

  removePassenger(id: string): void {
    const i = this.data.passengers.findIndex((p) => p.id === id);
    if (i >= 0) this.data.passengers.splice(i, 1);
  }

  getPassengersForAircraft(
    aircraftId: string,
    routeType?: PassengerRouteType,
  ): PassengerData[] {
    return this.data.passengers.filter(
      (p) =>
        p.aircraftId === aircraftId &&
        (routeType === undefined || p.routeType === routeType),
    );
  }

  /** Departure boarding progress for an aircraft: { total, boarded }. */
  getAircraftBoarding(aircraftId: string): { total: number; boarded: number } {
    const dep = this.getPassengersForAircraft(aircraftId, "DEPARTURE");
    return {
      total: dep.length,
      boarded: dep.filter((p) => p.state === "BOARDED").length,
    };
  }

  /** Boarding progress at a gate (via the aircraft currently assigned). */
  getGateBoarding(gateId: string): { total: number; boarded: number } {
    const gate = this.getGate(gateId);
    if (!gate?.aircraftId) return { total: 0, boarded: 0 };
    return this.getAircraftBoarding(gate.aircraftId);
  }

  /**
   * True once every departure passenger for the aircraft has BOARDED (or there
   * are none — keeps pre-passenger behaviour intact). AircraftRoute reads this
   * to hold departure until boarding completes (spec §16).
   */
  areAircraftPassengersReady(aircraftId: string): boolean {
    const dep = this.getPassengersForAircraft(aircraftId, "DEPARTURE");
    return dep.length === 0 || dep.every((p) => p.state === "BOARDED");
  }

  // ---------------------------------------------------------------- flights

  /** A fresh, collision-free flight id like "F-001". */
  nextFlightId(): string {
    let max = 0;
    for (const f of this.data.flights) {
      const m = /(\d+)$/.exec(f.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `F-${String(max + 1).padStart(3, "0")}`;
  }

  addFlight(flight: FlightData): void {
    this.data.flights.push(flight);
  }

  getFlight(id: string | null | undefined): FlightData | undefined {
    if (!id) return undefined;
    return this.data.flights.find((f) => f.id === id);
  }

  /** The flight an aircraft is currently operating, if any. */
  getFlightByAircraft(aircraftId: string): FlightData | undefined {
    const ac = this.getAircraft(aircraftId);
    if (ac?.currentFlightId) {
      const byLink = this.getFlight(ac.currentFlightId);
      if (byLink) return byLink;
    }
    return this.data.flights.find(
      (f) => f.aircraftId === aircraftId && !isFlightOver(f.state),
    );
  }

  /** Record one departure passenger's satisfaction against its flight (V0.7-D). */
  recordPassengerSatisfaction(flightId: string, value: number): void {
    const flight = this.getFlight(flightId);
    if (!flight) return;
    if (!flight.paxSatisfaction) flight.paxSatisfaction = [];
    flight.paxSatisfaction.push(value);
  }

  /** Link a passenger to a flight (both directions stay consistent). No-op if unknown / dup. */
  addFlightPassenger(flightId: string, passengerId: string): void {
    const flight = this.getFlight(flightId);
    if (!flight) return;
    if (!flight.passengerIds.includes(passengerId)) {
      flight.passengerIds.push(passengerId);
    }
  }

  /** Shallow-merge a patch into a flight. No-op if the id is unknown. */
  updateFlight(id: string, patch: Partial<FlightData>): void {
    const flight = this.getFlight(id);
    if (!flight) return;
    Object.assign(flight, patch);
  }

  /**
   * Mark a flight COMPLETED (V0.6-A / V0.6-E). Idempotent: re-completing a
   * finished flight does nothing, so revenue is never counted twice. Clears the
   * aircraft's transient currentFlightId link so the plane can fly again.
   */
  completeFlight(id: string, revenue?: number): void {
    const flight = this.getFlight(id);
    if (!flight || isFlightOver(flight.state)) return;
    flight.state = "COMPLETED";
    flight.completedAt = Date.now();
    if (revenue !== undefined) flight.revenue = revenue;
    if (flight.aircraftId) {
      const ac = this.getAircraft(flight.aircraftId);
      if (ac && ac.currentFlightId === id) ac.currentFlightId = null;
    }
  }

  setSelection(
    kind: "AIRCRAFT" | "BUILDING" | "PASSENGER" | null,
    id: string | null,
  ): void {
    this.data.selection = { kind, id };
  }

  setHoverCell(cell: CellCoord | null): void {
    this.data.grid.hoverCell = cell;
  }

  setSelectedCell(cell: CellCoord | null): void {
    this.data.grid.selectedCell = cell;
  }
}
