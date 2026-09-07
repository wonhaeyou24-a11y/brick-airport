import * as THREE from "three";
import { GameState } from "./GameState";
import type { BuildingType } from "./GameState";
import { GameLoop } from "./GameLoop";
import { AirportWorld } from "../world/AirportWorld";
import { GridOccupancy } from "../world/GridOccupancy";
import { GridCursor } from "../world/GridCursor";
import { worldToCell } from "../world/Grid";
import { isCellInsideGrid, type CellCoord } from "../world/cells";
import { PlacementSystem } from "../construction/PlacementSystem";
import { AircraftManager } from "../aircraft/AircraftManager";
import { CameraController } from "../camera/CameraController";
import { SelectionManager } from "../selection/SelectionManager";
import type { Selectable } from "../selection/Selectable";
import { HUD, type SelectionInfo } from "../ui/HUD";

/**
 * Game — top-level composition root.
 *
 * Owns the Three.js Scene / Renderer, and creates + updates every system.
 * Systems are updated explicitly from update() so each stays independently
 * tickable as the game grows. Three.js objects never drive game logic:
 * GameState is the source of truth.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;

  private readonly state: GameState;
  private readonly cameraController: CameraController;
  private readonly world: AirportWorld;
  private readonly occupancy: GridOccupancy;
  private readonly gridCursor: GridCursor;
  private readonly placement: PlacementSystem;
  private readonly aircraftManager: AircraftManager;
  private readonly selection: SelectionManager;
  private readonly hud: HUD;
  private readonly loop: GameLoop;

  constructor(canvas: HTMLCanvasElement, hudContainer: HTMLElement) {
    this.canvas = canvas;

    const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ecae6);

    this.addLights();

    this.state = new GameState();

    this.cameraController = new CameraController(canvas, w, h);

    this.world = new AirportWorld(this.state);
    this.scene.add(this.world.group);

    this.occupancy = new GridOccupancy(this.state.data.buildings);
    this.placement = new PlacementSystem(this.occupancy);

    this.gridCursor = new GridCursor();
    this.scene.add(this.gridCursor.object);

    this.aircraftManager = new AircraftManager(this.state);
    this.scene.add(this.aircraftManager.group);

    this.selection = new SelectionManager(
      canvas,
      this.cameraController.camera,
      () => this.collectSelectables(),
    );
    this.selection.onSelectionChange((s) => this.onSelectionChange(s));
    this.selection.onHover((point) => this.onHoverGround(point));
    this.selection.onGroundTap((point) => this.onGroundTap(point));

    this.hud = new HUD(hudContainer, {
      onZoomIn: () => this.cameraController.zoomBy(1 / 1.25),
      onZoomOut: () => this.cameraController.zoomBy(1.25),
      onReset: () => this.cameraController.reset(),
      onToggleGrid: () =>
        this.world.setGridVisible(!this.world.isGridVisible()),
    });
    this.refreshHudStats();

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );

    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    this.onResize();
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    this.selection.dispose();
    this.cameraController.dispose();
    this.aircraftManager.dispose();
    this.gridCursor.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  /**
   * Placement foundation, exercised without a build menu yet.
   * Returns false if the target cells are out of bounds or occupied.
   */
  placeBuilding(type: BuildingType, col: number, row: number): boolean {
    this.placement.begin(type);
    this.placement.setPointerCell({ col, row });
    const data = this.placement.confirm();
    if (!data) {
      this.placement.cancel();
      return false;
    }
    this.state.data.buildings.push(data);
    this.occupancy.add(data);
    this.world.addBuilding(data);
    this.refreshHudStats();
    return true;
  }

  // --------------------------------------------------------------- internals

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d9db6, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(28, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    const s = 45;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    this.scene.add(sun);
  }

  private collectSelectables(): Selectable[] {
    return [...this.world.selectables, ...this.aircraftManager.selectables];
  }

  private onSelectionChange(selected: Selectable | null): void {
    // Object selection takes precedence over a picked cell.
    this.gridCursor.setSelected(null);
    this.state.setSelectedCell(null);

    if (selected) {
      this.state.setSelection(selected.selectionKind, selected.id);
      this.hud.setSelection(this.describeSelectable(selected));
      this.cameraController.focusOn(selected.object.position);
    } else {
      this.state.setSelection(null, null);
      this.hud.setSelection(null);
    }
  }

  private onHoverGround(point: THREE.Vector3 | null): void {
    const cell = this.pointToCell(point);
    this.gridCursor.setHover(cell);
    this.state.setHoverCell(cell);
  }

  private onGroundTap(point: THREE.Vector3 | null): void {
    const cell = this.pointToCell(point);
    this.gridCursor.setSelected(cell);
    this.state.setSelectedCell(cell);
    this.hud.setSelection(cell ? this.describeCell(cell) : null);
  }

  private pointToCell(point: THREE.Vector3 | null): CellCoord | null {
    if (!point) return null;
    const cell = worldToCell(point);
    return isCellInsideGrid(cell.col, cell.row) ? cell : null;
  }

  private describeSelectable(s: Selectable): SelectionInfo {
    if (s.selectionKind === "AIRCRAFT") {
      const a = this.state.getAircraft(s.id);
      const lines: string[] = [];
      if (a) {
        lines.push(`State: ${a.state}`);
        const gate = a.homeGateId ? this.state.getGate(a.homeGateId) : undefined;
        if (gate) lines.push(`Gate: ${gateName(gate.id)}`);
      }
      return { title: s.getSelectionLabel(), lines };
    }

    const b = this.state.getBuilding(s.id);
    if (b?.type === "GATE") {
      const gate = this.state.getGateByBuilding(b.id);
      return {
        title: gate ? `Gate ${gateName(gate.id)}` : "Gate",
        lines: gate
          ? [
              `Status: ${gate.status}`,
              gate.aircraftId ? `Aircraft: ${gate.aircraftId}` : "Aircraft: —",
            ]
          : [],
      };
    }
    if (b) {
      const label = capitalize(b.type);
      return { title: label, lines: [`Type: ${label}`, `Level: ${b.level}`] };
    }
    return { title: s.getSelectionLabel() };
  }

  private describeCell(cell: CellCoord): SelectionInfo {
    const occupant = this.occupancy.occupantAt(cell.col, cell.row);
    return {
      title: "Cell",
      lines: [
        `Col ${cell.col}, Row ${cell.row}`,
        occupant ? `Occupied: ${occupant}` : "Empty",
      ],
    };
  }

  private refreshHudStats(): void {
    const { airport } = this.state;
    this.hud.setStats({
      airportName: airport.name,
      level: airport.level,
      money: airport.money,
      aircraftCount: this.state.data.aircraft.length,
      gateCount: this.state.data.gates.length,
    });
  }

  private update(deltaTime: number): void {
    this.cameraController.update(deltaTime);
    this.aircraftManager.update(deltaTime);
  }

  private render(): void {
    this.renderer.render(this.scene, this.cameraController.camera);
  }

  private onResize = (): void => {
    const parent = this.canvas.parentElement ?? document.body;
    const width = parent.clientWidth;
    const height = parent.clientHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.cameraController.setViewportSize(width, height);
  };
}

/** "gate-1" -> "G-01" */
function gateName(gateId: string): string {
  const match = /(\d+)$/.exec(gateId);
  return match ? `G-${match[1].padStart(2, "0")}` : gateId;
}

function capitalize(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase();
}
