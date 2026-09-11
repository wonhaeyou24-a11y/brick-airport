import * as THREE from "three";
import type { GameState, BuildingData } from "../core/GameState";
import { Ground } from "./Ground";
import { Grid } from "./Grid";
import { ServiceRoad } from "./ServiceRoad";
import { AirportProps } from "./AirportProps";
import { disposePaletteCache } from "./materials";
import { Building } from "../buildings/Building";
import { Runway } from "../buildings/Runway";
import { Terminal } from "../buildings/Terminal";
import { Gate } from "../buildings/Gate";
import { ServiceFacility } from "../buildings/ServiceFacility";
import { isServiceFacility } from "../core/GameState";

/**
 * AirportWorld — builds the static scenery (ground, grid, buildings) from
 * GameState and exposes it as one group plus a list of selectable buildings.
 * No per-frame logic: buildings are static in V0.1.
 */
export class AirportWorld {
  readonly group: THREE.Group;

  private readonly ground: Ground;
  private readonly grid: Grid;
  private readonly serviceRoad: ServiceRoad;
  private readonly props: AirportProps;
  private readonly buildings: Building[] = [];

  constructor(state: GameState) {
    this.group = new THREE.Group();
    this.group.name = "airport-world";

    this.ground = new Ground();
    this.group.add(this.ground.object);

    this.grid = new Grid();
    this.group.add(this.grid.object);

    this.serviceRoad = new ServiceRoad();
    this.group.add(this.serviceRoad.object);

    this.props = new AirportProps();
    this.group.add(this.props.object);

    for (const data of state.data.buildings) {
      const building = createBuilding(data);
      if (!building) continue;
      this.buildings.push(building);
      this.group.add(building.object);
    }
  }

  /** Buildings exposed for selection. */
  get selectables(): Building[] {
    return this.buildings;
  }

  /**
   * Add a building at runtime from its data (used by the placement system).
   * Caller is responsible for the GameState / occupancy side.
   */
  addBuilding(data: BuildingData): Building | null {
    const building = createBuilding(data);
    if (!building) return null;
    this.buildings.push(building);
    this.group.add(building.object);
    return building;
  }

  setGridVisible(visible: boolean): void {
    this.grid.setVisible(visible);
  }

  isGridVisible(): boolean {
    return this.grid.object.visible;
  }

  dispose(): void {
    for (const b of this.buildings) b.dispose();
    this.buildings.length = 0;
    this.serviceRoad.dispose();
    this.props.dispose();
    this.grid.dispose();
    this.ground.dispose();
    disposePaletteCache();
  }
}

function createBuilding(data: BuildingData): Building | null {
  switch (data.type) {
    case "RUNWAY":
      return new Runway(data);
    case "TERMINAL":
      return new Terminal(data);
    case "GATE":
      return new Gate(data);
    default:
      if (isServiceFacility(data.type)) return new ServiceFacility(data);
      console.warn(`AirportWorld: unknown building type "${data.type}"`);
      return null;
  }
}
