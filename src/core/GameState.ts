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
 * Gate operating states. AVAILABLE / OCCUPIED are used now; BOARDING / READY /
 * DEPARTING are reserved for the operations cycle in a later stage.
 */
export type GateStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "BOARDING"
  | "READY"
  | "DEPARTING";

export type BuildingType = "TERMINAL" | "RUNWAY" | "GATE";

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
}

export interface GameStateData {
  version: string;
  airport: AirportData;
  buildings: BuildingData[];
  gates: GateData[];
  aircraft: AircraftData[];
  passengers: PassengerData[];
  /** Currently selected entity, for HUD display. */
  selection: {
    kind: "AIRCRAFT" | "BUILDING" | null;
    id: string | null;
  };
  /** Grid interaction state (hover / picked cell). */
  grid: {
    hoverCell: CellCoord | null;
    selectedCell: CellCoord | null;
  };
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
    version: "0.4.1",
    airport: {
      id: "airport-1",
      name: "My Airport",
      level: 1,
      money: ECONOMY_CONFIG.startingMoney,
      reputation: 0,
      totalRevenue: 0,
      totalPassengers: 0,
      totalFlights: 0,
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
    // Forward-compat: pre-V0.4 passengers have no revenueProcessed flag.
    // Assume an already-BOARDED one was paid so it is never double-credited.
    for (const p of this.data.passengers) {
      if (p.revenueProcessed === undefined) {
        p.revenueProcessed = p.state === "BOARDED";
      }
    }
  }

  get airport(): AirportData {
    return this.data.airport;
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

  getBuilding(id: string): BuildingData | undefined {
    return this.data.buildings.find((b) => b.id === id);
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

  /** Link an aircraft to a gate (data relationship only — no meshes). */
  occupyGate(gateId: string, aircraftId: string): void {
    const gate = this.getGate(gateId);
    if (!gate) return;
    gate.status = "OCCUPIED";
    gate.aircraftId = aircraftId;
  }

  /** Free a gate and break its aircraft link. */
  releaseGate(gateId: string): void {
    const gate = this.getGate(gateId);
    if (!gate) return;
    gate.status = "AVAILABLE";
    gate.aircraftId = null;
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

  setSelection(kind: "AIRCRAFT" | "BUILDING" | null, id: string | null): void {
    this.data.selection = { kind, id };
  }

  setHoverCell(cell: CellCoord | null): void {
    this.data.grid.hoverCell = cell;
  }

  setSelectedCell(cell: CellCoord | null): void {
    this.data.grid.selectedCell = cell;
  }
}
