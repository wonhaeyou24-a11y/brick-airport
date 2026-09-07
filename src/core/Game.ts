import * as THREE from "three";
import { GameState, makeBuilding } from "./GameState";
import type { BuildingData, BuildingType } from "./GameState";
import { GameLoop } from "./GameLoop";
import { GateStatusSync } from "./GateStatusSync";
import { AirportWorld } from "../world/AirportWorld";
import { GridOccupancy } from "../world/GridOccupancy";
import { GridCursor } from "../world/GridCursor";
import { worldToCell } from "../world/Grid";
import { isCellInsideGrid, type CellCoord } from "../world/cells";
import {
  BuildController,
  type BuildModeState,
} from "../construction/BuildController";
import { BuildingPreview } from "../construction/BuildingPreview";
import {
  BUILDING_FOOTPRINTS,
  type PlacementValidity,
} from "../construction/PlacementSystem";
import { AircraftManager } from "../aircraft/AircraftManager";
import { FlightScheduler } from "../aircraft/FlightScheduler";
import { PassengerManager } from "../passengers/PassengerManager";
import { DEFAULT_WAYPOINTS } from "../passengers/waypoints";
import { Economy } from "../economy/Economy";
import { CameraController } from "../camera/CameraController";
import { SelectionManager } from "../selection/SelectionManager";
import type { Selectable } from "../selection/Selectable";
import { HUD, type SelectionInfo } from "../ui/HUD";
import { BuildMenu } from "../ui/BuildMenu";

/**
 * Game — top-level composition root.
 *
 * Owns the Three.js Scene / Renderer and creates + updates every system.
 * Systems are updated explicitly from update() so each stays independently
 * tickable. Three.js objects never drive game logic: GameState is the source
 * of truth, and all state / world mutation for a placed building funnels
 * through commitBuilding().
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
  private readonly buildingPreview: BuildingPreview;
  private readonly buildController: BuildController;
  private readonly aircraftManager: AircraftManager;
  private readonly flightScheduler: FlightScheduler;
  private readonly passengerManager: PassengerManager;
  private readonly economy: Economy;
  private readonly gateStatus: GateStatusSync;
  private readonly selection: SelectionManager;
  private readonly hud: HUD;
  private readonly buildMenu: BuildMenu;
  private readonly loop: GameLoop;

  /** Signature of the currently displayed aircraft selection, for live HUD. */
  private shownAircraftSig = "";
  /** Signature of the dynamic HUD stats (money | passenger count). */
  private shownStatsSig = "";

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

    this.gridCursor = new GridCursor();
    this.scene.add(this.gridCursor.object);

    this.buildingPreview = new BuildingPreview();
    this.scene.add(this.buildingPreview.object);

    this.buildController = new BuildController(
      this.occupancy,
      this.buildingPreview,
      {
        nextId: (type) => this.state.nextBuildingId(type),
        commit: (data) => this.commitBuilding(data),
        onModeChange: (s) => this.onBuildModeChange(s),
      },
    );

    this.aircraftManager = new AircraftManager(this.state);
    this.scene.add(this.aircraftManager.group);

    this.flightScheduler = new FlightScheduler(this.state, {
      spawnAircraft: (data) => this.aircraftManager.spawn(data),
    });

    this.passengerManager = new PassengerManager(
      this.state,
      DEFAULT_WAYPOINTS,
      (id) => this.onPassengerRemoved(id),
    );
    this.scene.add(this.passengerManager.group);

    this.economy = new Economy(this.state);
    this.gateStatus = new GateStatusSync(this.state);

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

    this.buildMenu = new BuildMenu(hudContainer, {
      onSelectType: (type) => this.buildController.begin(type),
      onCancel: () => this.buildController.cancel(),
    });

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
  }

  start(): void {
    this.onResize();
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.selection.dispose();
    this.cameraController.dispose();
    this.passengerManager.dispose();
    this.aircraftManager.dispose();
    this.buildingPreview.dispose();
    this.gridCursor.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  /**
   * Direct placement helper (console / tests). The build-mode UI goes through
   * BuildController instead, which calls commitBuilding() via its commit hook.
   * Returns false if the footprint is out of bounds or occupied.
   */
  placeBuilding(type: BuildingType, col: number, row: number): boolean {
    const cell: CellCoord = { col, row };
    const size = BUILDING_FOOTPRINTS[type];
    if (!this.occupancy.isFootprintFree(cell, size)) return false;

    this.commitBuilding(
      makeBuilding({
        id: this.state.nextBuildingId(type),
        type,
        cell,
        size: { ...size },
        rotationY: 0,
        level: 1,
      }),
    );
    return true;
  }

  // --------------------------------------------------------------- internals

  /** Single funnel for adding a building to state + world + occupancy. */
  private commitBuilding(data: BuildingData): void {
    this.state.data.buildings.push(data);
    this.occupancy.add(data);
    this.world.addBuilding(data);
    if (data.type === "GATE") this.state.addGateForBuilding(data);
    this.refreshHudStats();
  }

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
    return [
      ...this.world.selectables,
      ...this.aircraftManager.selectables,
      ...this.passengerManager.selectables,
    ];
  }

  /** A selected passenger was removed by PassengerManager — drop the selection. */
  private onPassengerRemoved(id: string): void {
    const sel = this.selection.selected;
    if (sel && sel.selectionKind === "PASSENGER" && sel.id === id) {
      this.selection.select(null);
    }
  }

  private onSelectionChange(selected: Selectable | null): void {
    // Build mode owns the pointer; ignore selection churn while it is active.
    if (this.buildController.isActive) return;

    this.gridCursor.setSelected(null);
    this.state.setSelectedCell(null);
    this.shownAircraftSig = "";

    if (selected) {
      this.state.setSelection(selected.selectionKind, selected.id);
      this.hud.setSelection(this.describeSelectable(selected));
      if (selected.selectionKind === "AIRCRAFT") {
        this.cameraController.followTarget(selected.object);
      } else {
        this.cameraController.focusOn(selected.object.position);
      }
    } else {
      this.state.setSelection(null, null);
      this.hud.setSelection(null);
      this.cameraController.followTarget(null);
    }
  }

  private onBuildModeChange(state: BuildModeState): void {
    this.buildMenu.setState(state);
    this.selection.setPickingEnabled(!this.buildController.isActive);

    if (state.mode === "PLACEMENT") {
      this.selection.select(null);
      this.state.setSelection(null, null);
      this.cameraController.followTarget(null);
      this.gridCursor.setHover(null);
      this.gridCursor.setSelected(null);
      this.state.setHoverCell(null);
      this.state.setSelectedCell(null);

      const status = state.cell
        ? state.validity
          ? validityText(state.validity)
          : "—"
        : "Move over the grid";
      this.hud.setSelection({
        title: "BUILD MODE",
        lines: [
          capitalize(state.type ?? "—"),
          state.cell ? `Cell ${state.cell.col}, ${state.cell.row}` : "—",
          `Status: ${status}`,
        ],
      });
    } else {
      this.buildingPreview.hide();
      this.hud.setSelection(null);
    }
  }

  private onHoverGround(point: THREE.Vector3 | null): void {
    const cell = this.pointToCell(point);
    if (this.buildController.isActive) {
      this.buildController.updateHover(cell);
      return;
    }
    this.gridCursor.setHover(cell);
    this.state.setHoverCell(cell);
  }

  private onGroundTap(point: THREE.Vector3 | null): void {
    const cell = this.pointToCell(point);
    if (this.buildController.isActive) {
      this.buildController.confirmAt(cell);
      return;
    }
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
        lines.push(`Gate: ${a.homeGateId ? gateName(a.homeGateId) : "—"}`);
        const board = this.state.getAircraftBoarding(a.id);
        if (board.total > 0) {
          lines.push(`Passengers: ${board.boarded} / ${board.total}`);
        }
      }
      return { title: s.getSelectionLabel(), lines };
    }

    if (s.selectionKind === "PASSENGER") {
      const p = this.state.getPassenger(s.id);
      const lines: string[] = [];
      if (p) {
        lines.push(`${p.routeType} · ${p.state}`);
        lines.push(`Aircraft: ${p.aircraftId ?? "—"}`);
        lines.push(`Gate: ${p.gateId ? gateName(p.gateId) : "—"}`);
      }
      return { title: s.getSelectionLabel(), lines };
    }

    const b = this.state.getBuilding(s.id);
    if (b?.type === "GATE") {
      const gate = this.state.getGateByBuilding(b.id);
      const lines: string[] = [];
      if (gate) {
        const board = this.state.getGateBoarding(gate.id);
        if (
          (gate.status === "BOARDING" || gate.status === "READY") &&
          board.total > 0
        ) {
          lines.push(`${gate.status} · ${board.boarded} / ${board.total}`);
        } else {
          lines.push(gate.status);
        }
        if (gate.aircraftId) {
          const ac = this.state.getAircraft(gate.aircraftId);
          const inbound =
            gate.status === "AVAILABLE" && !!ac && ac.state !== "PARKED";
          lines.push(
            `Aircraft: ${gate.aircraftId}${inbound ? " (inbound)" : ""}`,
          );
        }
      }
      return {
        title: gate ? `Gate ${gateName(gate.id)}` : "Gate",
        lines,
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

  /**
   * Refresh the HUD when a selected aircraft's state / boarding changes, or a
   * selected gate's boarding changes.
   */
  private refreshSelectionHud(): void {
    if (this.buildController.isActive) return;
    const sel = this.selection.selected;
    if (!sel) return;

    let sig: string | null = null;
    if (sel.selectionKind === "AIRCRAFT") {
      const a = this.state.getAircraft(sel.id);
      if (a) {
        const b = this.state.getAircraftBoarding(a.id);
        sig = `${a.state}|${a.homeGateId ?? "-"}|${b.boarded}/${b.total}`;
      }
    } else if (sel.selectionKind === "PASSENGER") {
      const p = this.state.getPassenger(sel.id);
      if (p) sig = `${p.state}|${p.aircraftId ?? "-"}|${p.gateId ?? "-"}`;
    } else {
      const building = this.state.getBuilding(sel.id);
      if (building?.type === "GATE") {
        const gate = this.state.getGateByBuilding(building.id);
        if (gate) {
          const b = this.state.getGateBoarding(gate.id);
          sig = `${gate.status}|${gate.aircraftId ?? "-"}|${b.boarded}/${b.total}`;
        }
      }
    }

    if (sig === null || sig === this.shownAircraftSig) return;
    this.shownAircraftSig = sig;
    this.hud.setSelection(this.describeSelectable(sel));
  }

  private refreshHudStats(): void {
    const { airport } = this.state;
    this.hud.setStats({
      airportName: airport.name,
      level: airport.level,
      money: airport.money,
      aircraftCount: this.state.data.aircraft.length,
      gateCount: this.state.data.gates.length,
      passengerCount: this.state.data.passengers.length,
      flightCount: airport.totalFlights ?? 0,
    });
  }

  private update(deltaTime: number): void {
    this.cameraController.update(deltaTime);
    this.flightScheduler.update(deltaTime);
    this.aircraftManager.update(deltaTime);
    this.passengerManager.update(deltaTime);

    // Derive each gate's operational status from the aircraft + passengers.
    this.gateStatus.update(deltaTime);

    // Economy: pay ticket revenue for passengers that just boarded.
    const revenue = this.economy.settleBoarding();
    if (revenue > 0) this.hud.showRevenue(revenue);

    this.refreshSelectionHud();
    this.refreshDynamicStats();
  }

  /** Refresh the top HUD stats when a tracked value changes. */
  private refreshDynamicStats(): void {
    const a = this.state.airport;
    const sig = `${a.money}|${this.passengerManager.count}|${this.aircraftManager.count}|${a.totalFlights ?? 0}`;
    if (sig === this.shownStatsSig) return;
    this.shownStatsSig = sig;
    this.refreshHudStats();
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

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.buildController.cancel();
  };
}

/** "gate-1" -> "G-01", "gate-004" -> "G-04" */
function gateName(gateId: string): string {
  const match = /(\d+)$/.exec(gateId);
  return match ? `G-${String(parseInt(match[1], 10)).padStart(2, "0")}` : gateId;
}

function capitalize(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

function validityText(v: PlacementValidity): string {
  if (v.valid) return "VALID";
  return v.reason === "OUT_OF_BOUNDS" ? "INVALID (out of bounds)" : "INVALID (occupied)";
}
