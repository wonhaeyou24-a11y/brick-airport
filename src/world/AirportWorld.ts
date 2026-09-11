import * as THREE from "three";
import type { GameState, BuildingData } from "../core/GameState";
import { Ground } from "./Ground";
import { Grid } from "./Grid";
import { ServiceRoad } from "./ServiceRoad";
import { Taxiway } from "./Taxiway";
import { Apron } from "./Apron";
import { AirportProps } from "./AirportProps";
import { DecorationManager } from "./DecorationManager";
import { disposePaletteCache } from "./materials";
import { Building } from "../buildings/Building";
import { Runway } from "../buildings/Runway";
import { Terminal } from "../buildings/Terminal";
import { Gate } from "../buildings/Gate";
import { ServiceFacility } from "../buildings/ServiceFacility";
import { isServiceFacility } from "../core/GameState";

/** Seconds a freshly-placed building takes to "pop" up to full size (V1.9 §14). */
const POP_IN_DURATION = 0.35;

/** Ease-out-back — a small overshoot past 1.0 before settling, so a new
 * building reads as a block snapping into place rather than just fading in. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/**
 * AirportWorld — builds the static scenery (ground, grid, buildings) from
 * GameState and exposes it as one group plus a list of selectable buildings.
 *
 * update() (V1.9) is deliberately small: it ticks the couple of purely
 * cosmetic per-frame animations that live at the world level — each Gate's
 * jet-bridge extension and a brief pop-in scale for a just-placed building —
 * neither of which touches GameState (spec §28's Mesh-is-not-source-of-truth
 * rule). Everything else here still loads once from GameState, same as V0.1.
 */
export class AirportWorld {
  readonly group: THREE.Group;

  private readonly ground: Ground;
  private readonly grid: Grid;
  private readonly serviceRoad: ServiceRoad;
  private readonly taxiway: Taxiway;
  private readonly apron: Apron;
  private readonly props: AirportProps;
  private readonly decorations: DecorationManager;
  private readonly buildings: Building[] = [];
  /** Buildings mid pop-in-scale animation (V1.9 §14) — empty almost always;
   * only ever grows right after a runtime addBuilding() call. */
  private readonly poppingIn: { obj: THREE.Object3D; elapsed: number }[] = [];

  constructor(state: GameState) {
    this.group = new THREE.Group();
    this.group.name = "airport-world";

    this.ground = new Ground();
    this.group.add(this.ground.object);

    this.grid = new Grid();
    this.group.add(this.grid.object);

    this.serviceRoad = new ServiceRoad();
    this.group.add(this.serviceRoad.object);

    this.apron = new Apron();
    this.group.add(this.apron.object);

    this.taxiway = new Taxiway();
    this.group.add(this.taxiway.object);

    this.props = new AirportProps();
    this.group.add(this.props.object);

    this.decorations = new DecorationManager();
    this.group.add(this.decorations.object);

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

  /** Look up a placed building's mesh instance by its BuildingData id (V1.7). */
  getBuildingObject(id: string): Building | undefined {
    return this.buildings.find((b) => b.id === id);
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
    // Pop-in feedback (V1.9 §14) — only for a building placed THIS session;
    // buildings loaded from a save (the constructor's own loop above) start
    // at full scale, no animation, since they were not "just built".
    building.object.scale.setScalar(0.05);
    this.poppingIn.push({ obj: building.object, elapsed: 0 });
    return building;
  }

  /**
   * Per-frame cosmetic tick (V1.9): Gate jet-bridge animation + the
   * construction pop-in. Cheap even when nothing is animating — the
   * pop-in list is empty almost all the time and this never allocates.
   */
  update(deltaTime: number): void {
    for (const b of this.buildings) {
      if (b instanceof Gate) b.tickAnimation(deltaTime);
    }

    for (let i = this.poppingIn.length - 1; i >= 0; i--) {
      const p = this.poppingIn[i];
      p.elapsed += deltaTime;
      const t = Math.min(1, p.elapsed / POP_IN_DURATION);
      const scale = 0.05 + (1 - 0.05) * easeOutBack(t);
      p.obj.scale.setScalar(Math.max(0.05, scale));
      if (t >= 1) {
        p.obj.scale.setScalar(1);
        this.poppingIn.splice(i, 1);
      }
    }
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
    this.apron.dispose();
    this.taxiway.dispose();
    this.props.dispose();
    this.decorations.dispose();
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
