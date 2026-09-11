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
export type ServiceFacilityType =
  | "CHECK_IN"
  | "SECURITY"
  | "BAGGAGE"
  | "LOUNGE"
  // Amenities (V1.1-A) — comfort/service facilities, same build pipeline.
  | "SHOP"
  | "FOOD"
  | "RESTROOM";

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
  "SHOP",
  "FOOD",
  "RESTROOM",
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
 * Ground operation (지상조업) — one turnaround task for a parked aircraft
 * (V0.8-A). A SEPARATE concept from AircraftState / FlightState / vehicle state:
 * each system keeps its own responsibility and they relate only by id (spec §7,
 * §17, §75).
 *
 *   PENDING -> ASSIGNED -> IN_PROGRESS -> COMPLETED   (CANCELLED is terminal)
 */
export type GroundOperationType =
  | "BAGGAGE"
  | "CLEANING"
  | "REFUELING"
  | "BOARDING_SERVICE";

export type GroundOperationState =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface GroundOperationData {
  /** Ground-operation id like "gop-001". Namespaced apart from flights / vehicles. */
  id: string;
  flightId: string;
  aircraftId: string;
  gateId: string;
  type: GroundOperationType;
  state: GroundOperationState;
  /** Epoch ms the task was created (turnaround began). */
  createdAt: number;
  /** Epoch ms work actually started (vehicle reached the aircraft). */
  startedAt?: number;
  /** Epoch ms the task completed. */
  completedAt?: number;
  /** Game-seconds of work the task needs. */
  duration: number;
  /** Game-seconds of work done so far — frame-rate / wall-clock independent. */
  elapsed?: number;
  /** Ground vehicle assigned to the task, if any (V0.8-B). */
  vehicleId?: string | null;
  /** Staff member assigned to the task, if any (V0.9-C). */
  staffId?: string | null;
  /** True if the task waited PENDING longer than the delay threshold (V0.8-D). */
  delayed?: boolean;
}

/** A ground operation in a terminal state — never transitions again. */
export function isGroundOperationOver(state: GroundOperationState): boolean {
  return state === "COMPLETED" || state === "CANCELLED";
}

/**
 * Ground service vehicle (V0.8-B). Its own state machine — NOT merged with
 * GroundOperationState (spec §17): the vehicle describes where the truck IS,
 * the operation describes how the task is GOING.
 *
 *   IDLE -> MOVING -> WORKING -> RETURNING -> IDLE
 */
export type GroundVehicleType =
  | "BAGGAGE_CART"
  | "CLEANING_VEHICLE"
  | "FUEL_TRUCK"
  | "SERVICE_VEHICLE";

export type GroundVehicleState = "IDLE" | "MOVING" | "WORKING" | "RETURNING";

export interface GroundVehicleData {
  /** Vehicle id like "veh-001". */
  id: string;
  type: GroundVehicleType;
  state: GroundVehicleState;
  /** Current world position (y is always 0). */
  position: Vec3;
  /** Where it is driving toward, or null when parked / working. */
  targetPosition: Vec3 | null;
  /** The ground operation it is currently serving, if any. */
  operationId?: string | null;
  /** Concurrent operations it can handle — 1 for now (spec §37). */
  capacity: number;
  /** Depot slot it returns to when idle. */
  homePosition: Vec3;
  /** Units per second. */
  speed: number;
}

/**
 * Airport staff (V0.9-A). A staff member performs one Ground Operation type,
 * mapped by role. Its state machine is its OWN concept — never merged with
 * GroundOperationState or GroundVehicleState (spec §9, §75):
 *
 *   IDLE -> MOVING -> WORKING -> IDLE     (BREAK / UNAVAILABLE reserved)
 *
 * As with every other entity, NO Three.js object is stored here.
 */
export type StaffRole =
  | "GROUND_AGENT"
  | "CLEANING_AGENT"
  | "FUEL_OPERATOR"
  | "BAGGAGE_AGENT";

export type StaffState = "IDLE" | "MOVING" | "WORKING" | "BREAK" | "UNAVAILABLE";

export interface StaffData {
  /** Staff id like "staff-001". */
  id: string;
  name: string;
  role: StaffRole;
  state: StaffState;
  /** Current world position (y is always 0). */
  position: Vec3;
  /** Where they are walking toward, or null when at the staff room / working. */
  targetPosition: Vec3 | null;
  /** The ground operation they are currently working, if any. */
  operationId?: string | null;
  /** 0–100. Higher = slightly faster tasks (spec §D.3). */
  skill: number;
  /** Epoch ms the staff member was hired. */
  hiredAt: number;
  /** Wage — data only in V0.9, for a future operating-cost system (spec §B.4). */
  salary: number;
  /** Staff-room slot they return to when idle. */
  homePosition: Vec3;
  /** Units per second. */
  speed: number;
}

/**
 * Missions (V1.0-A) — the player's operational objectives. Progress is READ
 * from existing GameState counters (totalFlights, buildings.length, …), never
 * stored twice (spec §3). Absolute targets: the mission pool escalates.
 */
export type MissionType =
  | "FLIGHT_TARGET"
  | "PASSENGER_TARGET"
  | "REVENUE_TARGET"
  | "BUILD_TARGET"
  | "OPERATION_TARGET"
  | "STAFF_TARGET"
  // V1.1-D: facility / passenger-experience objectives, same absolute-target
  // shape as every other mission — no new MissionData fields.
  | "FACILITY_TARGET"
  | "SATISFACTION_TARGET";

export type MissionState =
  | "AVAILABLE"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export interface MissionData {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  state: MissionState;
  target: number;
  progress: number;
  rewardMoney: number;
  rewardReputation: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  expiresAt?: number;
}

/** A mission that will never change again. */
export function isMissionOver(state: MissionState): boolean {
  return state === "COMPLETED" || state === "FAILED" || state === "EXPIRED";
}

/**
 * Operational events (V1.0-C) — short-lived side objectives, separate from the
 * V0.7-E AirportEventManager flavour events (spec §C, §6). Progress is a DELTA
 * from `baseline` (the tracked counter when the event began); `duration` /
 * `elapsed` are game-seconds so expiry is frame-rate independent.
 */
export type OperationalEventType =
  | "PASSENGER_SURGE"
  | "STAFF_SHORTAGE"
  | "GROUND_DELAY"
  | "FLIGHT_DEMAND"
  | "MAINTENANCE_REQUEST";

export interface OperationalEventData {
  id: string;
  type: OperationalEventType;
  title: string;
  description: string;
  state: "ACTIVE" | "RESOLVED" | "EXPIRED";
  createdAt: number;
  /** Game-seconds allowed to resolve it. */
  duration: number;
  /** Game-seconds since it started. */
  elapsed: number;
  target: number;
  progress: number;
  /** The tracked counter's value when the event began (progress = current − baseline). */
  baseline: number;
  rewardMoney: number;
  rewardReputation: number;
}

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
  /** How smoothly ground operations run — facilities + vehicles − delays (V0.8-D). */
  groundEfficiency?: number;
}

/**
 * Seed values shown until the first recompute. Deliberately the "neutral"
 * starting point — a fresh airport with no facilities and no flight history.
 */
export const DEFAULT_OPERATIONS: OperationsData = {
  serviceScore: 50,
  passengerSatisfaction: 70,
  onTimeRate: 90,
  groundEfficiency: 70,
};

/** Current on-disk state schema version. Older states migrate up in the ctor. */
export const STATE_VERSION = "1.2.0";

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
  /** Airport expansion tier (V1.2-D) — index into Expansion.EXPANSION_TIERS. Optional for pre-V1.2 states. */
  expansionLevel?: number;
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
  /**
   * Game-seconds this passenger's route took, captured the same frame as
   * `satisfaction` (V1.1-C). HUD-only — the satisfaction formula already
   * consumed the live value when it ran; this is just so a selected passenger
   * can still show its own wait after the fact.
   */
  waitingSeconds?: number;
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
  /** Set by a FLIGHT_DELAY event (V0.7-E) — shown in the HUD, hurts on-time. */
  delayed?: boolean;
  /** Departure-passenger satisfaction scores captured as each one boards (V0.7-D). */
  paxSatisfaction?: number[];
  /** Mean passenger satisfaction for this flight (set on completion, V0.7-D). */
  averageSatisfaction?: number;
  /** Set if any of this flight's turnaround ground operations was delayed (V0.8-D). */
  turnaroundDelayed?: boolean;
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
  /** All turnaround ground operations, past and present (V0.8-A). */
  groundOperations: GroundOperationData[];
  /** The ground service vehicle fleet (V0.8-B). */
  groundVehicles: GroundVehicleData[];
  /** The airport staff (V0.9-A). */
  staff: StaffData[];
  /** Player objectives, past and present (V1.0-A). */
  missions: MissionData[];
  /** Short-lived operational events, past and present (V1.0-C). */
  operationalEvents: OperationalEventData[];
  /** Currently selected entity, for HUD display. */
  selection: {
    kind:
      | "AIRCRAFT"
      | "BUILDING"
      | "PASSENGER"
      | "GROUND_VEHICLE"
      | "GROUND_STAFF"
      | null;
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

/**
 * The starting ground-service fleet — one of each type (spec §18), lined up in
 * the depot on the ramp side of the apron. World layout only; the operations
 * layer decides what they do.
 */
export function defaultGroundVehicles(): GroundVehicleData[] {
  const types: GroundVehicleType[] = [
    "BAGGAGE_CART",
    "CLEANING_VEHICLE",
    "FUEL_TRUCK",
    "SERVICE_VEHICLE",
  ];
  return types.map((type, i) => {
    // A compact 2×2 depot just west of the runway, clear of the apron.
    const home: Vec3 = {
      x: -23 + (i % 2) * 1.9,
      y: 0,
      z: 1 + Math.floor(i / 2) * 1.7,
    };
    return {
      id: `veh-${String(i + 1).padStart(3, "0")}`,
      type,
      state: "IDLE" as const,
      position: { ...home },
      targetPosition: null,
      operationId: null,
      capacity: 1,
      homePosition: { ...home },
      speed: 12,
    };
  });
}

/**
 * The starting staff — one per role (spec §B.2), free, standing in a small
 * staff room east of the gates. Base skill / salary mirror StaffConfig; the
 * operations layer decides what they do.
 */
export function defaultStaff(): StaffData[] {
  // Small fixed skill spread so the starting crew aren't identical (spec §D.3).
  const roles: { role: StaffRole; name: string; skill: number; salary: number }[] =
    [
      { role: "BAGGAGE_AGENT", name: "Kim", skill: 68, salary: 75 },
      { role: "CLEANING_AGENT", name: "Lee", skill: 73, salary: 70 },
      { role: "FUEL_OPERATOR", name: "Park", skill: 76, salary: 100 },
      { role: "GROUND_AGENT", name: "Choi", skill: 66, salary: 80 },
    ];
  const now = Date.now();
  return roles.map(({ role, name, skill, salary }, i) => {
    const home: Vec3 = {
      x: 12 + (i % 2) * 1.6,
      y: 0,
      z: 8 + Math.floor(i / 2) * 1.6,
    };
    return {
      id: `staff-${String(i + 1).padStart(3, "0")}`,
      name,
      role,
      state: "IDLE" as StaffState,
      position: { ...home },
      targetPosition: null,
      operationId: null,
      skill,
      hiredAt: now,
      salary,
      homePosition: { ...home },
      speed: 6,
    };
  });
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
      expansionLevel: 0,
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
    groundOperations: [],
    groundVehicles: defaultGroundVehicles(),
    staff: defaultStaff(),
    missions: [],
    operationalEvents: [],
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
    if (this.data.airport.operations.groundEfficiency === undefined) {
      this.data.airport.operations.groundEfficiency =
        DEFAULT_OPERATIONS.groundEfficiency;
    }
    if (typeof this.data.airport.reputation !== "number") {
      this.data.airport.reputation = 0;
    }
    // Forward-compat: a state saved before V0.8 has no ground operations / fleet.
    if (!this.data.groundOperations) this.data.groundOperations = [];
    if (!this.data.groundVehicles || this.data.groundVehicles.length === 0) {
      this.data.groundVehicles = defaultGroundVehicles();
    }
    // Forward-compat: a state saved before V0.9 has no staff.
    if (!this.data.staff || this.data.staff.length === 0) {
      this.data.staff = defaultStaff();
    }
    // Forward-compat: a state saved before V1.0 has no missions / events.
    if (!this.data.missions) this.data.missions = [];
    if (!this.data.operationalEvents) this.data.operationalEvents = [];
    // Forward-compat: a state saved before V1.2 has no expansion level.
    if (typeof this.data.airport.expansionLevel !== "number") {
      this.data.airport.expansionLevel = 0;
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
      SHOP: 0,
      FOOD: 0,
      RESTROOM: 0,
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

  // ------------------------------------------------------ ground operations

  /** A fresh, collision-free ground-operation id like "gop-001". */
  nextGroundOperationId(): string {
    let max = 0;
    for (const o of this.data.groundOperations) {
      const m = /(\d+)$/.exec(o.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `gop-${String(max + 1).padStart(3, "0")}`;
  }

  addGroundOperation(op: GroundOperationData): void {
    this.data.groundOperations.push(op);
  }

  getGroundOperation(id: string | null | undefined): GroundOperationData | undefined {
    if (!id) return undefined;
    return this.data.groundOperations.find((o) => o.id === id);
  }

  /** All ground operations for a flight, in creation order. */
  getGroundOperationsForFlight(flightId: string): GroundOperationData[] {
    return this.data.groundOperations.filter((o) => o.flightId === flightId);
  }

  /** Shallow-merge a patch into a ground operation. No-op if the id is unknown. */
  updateGroundOperation(id: string, patch: Partial<GroundOperationData>): void {
    const op = this.getGroundOperation(id);
    if (op) Object.assign(op, patch);
  }

  /** Mark a ground operation COMPLETED (idempotent). Frees its vehicle + staff links. */
  completeGroundOperation(id: string): void {
    const op = this.getGroundOperation(id);
    if (!op || isGroundOperationOver(op.state)) return;
    op.state = "COMPLETED";
    op.completedAt = Date.now();
    op.vehicleId = null;
    op.staffId = null;
  }

  /**
   * True when an aircraft's current flight has no outstanding turnaround work
   * (every ground operation COMPLETED / CANCELLED, or none exist). AircraftRoute
   * reads this to hold departure until the turnaround is done (spec §30). Never
   * blocks an aircraft with no flight or no operations.
   */
  areGroundOperationsComplete(aircraftId: string): boolean {
    const flightId = this.getAircraft(aircraftId)?.currentFlightId;
    if (!flightId) return true;
    const ops = this.getGroundOperationsForFlight(flightId);
    return ops.every((o) => isGroundOperationOver(o.state));
  }

  // -------------------------------------------------------- ground vehicles

  getGroundVehicle(id: string | null | undefined): GroundVehicleData | undefined {
    if (!id) return undefined;
    return this.data.groundVehicles.find((v) => v.id === id);
  }

  getGroundVehiclesByType(type: GroundVehicleType): GroundVehicleData[] {
    return this.data.groundVehicles.filter((v) => v.type === type);
  }

  /** First fully-idle vehicle of a type (at the depot, no operation), or undefined. */
  idleGroundVehicle(type: GroundVehicleType): GroundVehicleData | undefined {
    return this.data.groundVehicles.find(
      (v) => v.type === type && v.state === "IDLE" && !v.operationId,
    );
  }

  addGroundVehicle(vehicle: GroundVehicleData): void {
    this.data.groundVehicles.push(vehicle);
  }

  // ---------------------------------------------------------------- staff

  /** A fresh, collision-free staff id like "staff-001". */
  nextStaffId(): string {
    let max = 0;
    for (const s of this.data.staff) {
      const m = /(\d+)$/.exec(s.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `staff-${String(max + 1).padStart(3, "0")}`;
  }

  addStaff(staff: StaffData): void {
    this.data.staff.push(staff);
  }

  getStaff(id: string | null | undefined): StaffData | undefined {
    if (!id) return undefined;
    return this.data.staff.find((s) => s.id === id);
  }

  /** Shallow-merge a patch into a staff member. No-op if the id is unknown. */
  updateStaff(id: string, patch: Partial<StaffData>): void {
    const staff = this.getStaff(id);
    if (staff) Object.assign(staff, patch);
  }

  removeStaff(id: string): void {
    const i = this.data.staff.findIndex((s) => s.id === id);
    if (i >= 0) this.data.staff.splice(i, 1);
  }

  getStaffByRole(role: StaffRole): StaffData[] {
    return this.data.staff.filter((s) => s.role === role);
  }

  /** First fully-idle staff member of a role (in the room, no operation), or undefined. */
  idleStaffForRole(role: StaffRole): StaffData | undefined {
    return this.data.staff.find(
      (s) => s.role === role && s.state === "IDLE" && !s.operationId,
    );
  }

  // -------------------------------------------------------------- missions

  /** A fresh, collision-free mission id like "mission-001". */
  nextMissionId(): string {
    let max = 0;
    for (const m of this.data.missions) {
      const n = /(\d+)$/.exec(m.id);
      if (n) max = Math.max(max, parseInt(n[1], 10));
    }
    return `mission-${String(max + 1).padStart(3, "0")}`;
  }

  addMission(mission: MissionData): void {
    this.data.missions.push(mission);
  }

  getMission(id: string | null | undefined): MissionData | undefined {
    if (!id) return undefined;
    return this.data.missions.find((m) => m.id === id);
  }

  /** Shallow-merge a patch into a mission. No-op if the id is unknown. */
  updateMission(id: string, patch: Partial<MissionData>): void {
    const mission = this.getMission(id);
    if (mission) Object.assign(mission, patch);
  }

  /**
   * Mark a mission COMPLETED. Idempotent — a mission that is already over never
   * transitions again, so the reward is paid exactly once (spec §12).
   */
  completeMission(id: string): boolean {
    const mission = this.getMission(id);
    if (!mission || mission.state !== "ACTIVE") return false;
    mission.state = "COMPLETED";
    mission.completedAt = Date.now();
    return true;
  }

  /** Mark a mission FAILED / EXPIRED. Idempotent; never pays a reward. */
  failMission(id: string, expired = false): void {
    const mission = this.getMission(id);
    if (!mission || isMissionOver(mission.state)) return;
    mission.state = expired ? "EXPIRED" : "FAILED";
    mission.completedAt = Date.now();
  }

  // ------------------------------------------------------ operational events

  /** A fresh, collision-free operational-event id like "opevt-001". */
  nextOperationalEventId(): string {
    let max = 0;
    for (const e of this.data.operationalEvents) {
      const n = /(\d+)$/.exec(e.id);
      if (n) max = Math.max(max, parseInt(n[1], 10));
    }
    return `opevt-${String(max + 1).padStart(3, "0")}`;
  }

  addOperationalEvent(event: OperationalEventData): void {
    this.data.operationalEvents.push(event);
  }

  getOperationalEvent(id: string | null | undefined): OperationalEventData | undefined {
    if (!id) return undefined;
    return this.data.operationalEvents.find((e) => e.id === id);
  }

  setSelection(
    kind:
      | "AIRCRAFT"
      | "BUILDING"
      | "PASSENGER"
      | "GROUND_VEHICLE"
      | "GROUND_STAFF"
      | null,
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
