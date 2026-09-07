import {
  footprintCells,
  type CellCoord,
  type CellSize,
} from "../world/cells";

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

export interface AirportData {
  id: string;
  name: string;
  level: number;
  money: number;
  reputation: number;
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
}

export interface GameStateData {
  version: string;
  airport: AirportData;
  buildings: BuildingData[];
  gates: GateData[];
  aircraft: AircraftData[];
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
    version: "0.2.0",
    airport: {
      id: "airport-1",
      name: "My Airport",
      level: 1,
      money: 1000,
      reputation: 0,
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
    ],
    gates: [
      {
        id: "gate-1",
        buildingId: "gate-building-1",
        status: "OCCUPIED",
        aircraftId: "aircraft-1",
        parkPosition: { x: 2, y: 0, z: 7 },
      },
    ],
    aircraft: [
      {
        id: "aircraft-1",
        type: "A-001",
        state: "PARKED",
        position: { x: 2, y: 0, z: 7 },
        heading: 0,
        speed: 6,
        targetPosition: null,
        homeGateId: "gate-1",
      },
    ],
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
  }

  get airport(): AirportData {
    return this.data.airport;
  }

  getAircraft(id: string): AircraftData | undefined {
    return this.data.aircraft.find((a) => a.id === id);
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
