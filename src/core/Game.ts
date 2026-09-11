import * as THREE from "three";
import {
  GameState,
  makeBuilding,
  isFlightOver,
  isServiceFacility,
} from "./GameState";
import type {
  BuildingData,
  BuildingType,
  FlightData,
  FlightState,
  GameStateData,
  GateData,
  OperationalEventType,
} from "./GameState";
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
import {
  BUILDING_CONFIG,
  BUILDING_TYPES,
  getBuildingConfig,
  buildingLabel,
  checkPurchase,
  type PurchaseResult,
} from "../buildings/BuildingConfig";
import { computeAirportLevel } from "../progression/AirportProgression";
import {
  MAX_EXPANSION_LEVEL,
  checkExpansion,
  expansionBounds,
  expansionTier,
} from "../progression/Expansion";
import { OperationsManager } from "../operations/OperationsManager";
import { GroundOperationManager } from "../operations/GroundOperationManager";
import { MissionManager } from "../missions/MissionManager";
import { OperationalEventManager } from "../events/OperationalEventManager";
import { FacilityManager } from "../buildings/FacilityManager";
import { ExpansionOverlay } from "../world/ExpansionOverlay";
import { SaveManager } from "../save/SaveManager";
import { clearTransientSelection } from "../save/SaveData";
import {
  TURNAROUND_SEQUENCE,
  operationGlyph,
} from "../operations/GroundOperation";
import { AircraftManager } from "../aircraft/AircraftManager";
import { FlightScheduler } from "../aircraft/FlightScheduler";
import { GroundVehicleManager } from "../vehicles/GroundVehicleManager";
import { StaffManager } from "../staff/StaffManager";
import {
  STAFF_CONFIG,
  staffRoleConfig,
  staffRoleLabel,
} from "../staff/StaffConfig";
import { jitterFromId, experienceLabelKo } from "../operations/AirportOperations";
import { CURRENT_LOCALE, cityLabel, formatMoney, stateLabel, t } from "../i18n/strings";
import { getFacilityEffect } from "../buildings/FacilityConfig";
import { PassengerManager } from "../passengers/PassengerManager";
import { DEFAULT_WAYPOINTS } from "../passengers/waypoints";
import { Economy } from "../economy/Economy";
import { CameraController } from "../camera/CameraController";
import { SelectionManager } from "../selection/SelectionManager";
import type { Selectable } from "../selection/Selectable";
import type { StaffRole } from "./GameState";
import { HUD, type SelectionInfo } from "../ui/HUD";
import { BuildMenu, type BuildMenuItem } from "../ui/BuildMenu";

/**
 * Game — top-level composition root.
 *
 * Owns the Three.js Scene / Renderer and creates + updates every system.
 * Systems are updated explicitly from update() so each stays independently
 * tickable. Three.js objects never drive game logic: GameState is the source
 * of truth, and all state / world mutation for a placed building funnels
 * through commitBuilding().
 */
/**
 * A cheap, one-time heuristic for "small screen or touch-primary device"
 * (spec §22/§26) — never used for gameplay, only for shadow/pixel-ratio
 * quality. Narrow viewport OR a coarse (touch) primary pointer.
 */
function isLowPowerDevice(): boolean {
  const narrow = window.innerWidth <= 480;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return narrow || coarsePointer;
}

/** Periodic autosave interval, in accumulated game-seconds (spec §C.1). */
const AUTOSAVE_INTERVAL = 60;
/**
 * Floor between an event-triggered save (mission/building/level/flight) and
 * the previous save — event triggers only set `savePending`; this is what
 * actually gates writing, so a burst of events in one frame never becomes a
 * burst of saves (spec §C.2's "모든 프레임마다 저장하면 안 된다").
 */
const MIN_EVENT_SAVE_GAP = 20;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  /** Decided once at startup from viewport/pointer heuristics (V1.3-E). */
  private readonly lowPowerDevice: boolean;

  private readonly state: GameState;
  private readonly cameraController: CameraController;
  private readonly world: AirportWorld;
  private readonly occupancy: GridOccupancy;
  private readonly gridCursor: GridCursor;
  private readonly buildingPreview: BuildingPreview;
  private readonly expansionOverlay: ExpansionOverlay;
  private readonly buildController: BuildController;
  private readonly aircraftManager: AircraftManager;
  private readonly flightScheduler: FlightScheduler;
  private readonly vehicleManager: GroundVehicleManager;
  private readonly staffManager: StaffManager;
  private readonly passengerManager: PassengerManager;
  private readonly economy: Economy;
  private readonly operations: OperationsManager;
  private readonly groundOps: GroundOperationManager;
  private readonly missions: MissionManager;
  private readonly operationalEvents: OperationalEventManager;
  private readonly facilities: FacilityManager;
  private readonly saveManager = new SaveManager();
  private saveStatus: "IDLE" | "SAVED" | "ERROR" = "IDLE";
  /** Game-seconds accumulated since the last save, of any kind (V1.2-C). */
  private secondsSinceSave = 0;
  /** An event (mission/building/level/flight) wants a save once the floor below is met. */
  private savePending = false;
  /** True for the duration of one save() call — a second save waits instead of overlapping. */
  private saveInProgress = false;
  private readonly gateStatus: GateStatusSync;
  private readonly selection: SelectionManager;
  private readonly hud: HUD;
  private readonly buildMenu: BuildMenu;
  private readonly loop: GameLoop;

  /** Signature of the currently displayed aircraft selection, for live HUD. */
  private shownAircraftSig = "";
  /** Signature of the top-bar dynamic HUD stats. */
  private shownStatsSig = "";
  /** Signature of the Airport Statistics panel. */
  private shownStatisticsSig = "";
  /** Signature of the BuildMenu availability (level | money bucket). */
  private shownBuildMenuSig = "";
  /** Signature of the Recent Flights panel (V0.6-E). */
  private shownHistorySig = "";
  /** Signature of the Operations metrics row (V0.7). */
  private shownOperationsSig = "";
  /** Signature of the Ground Operations panel (V0.8-E). */
  private shownGroundOpsSig = "";
  /** Signature of the airport status indicator (V1.5). */
  private shownAirportStatusSig = "";
  /** Signature of the Missions panel (V1.0-E). */
  private shownMissionsSig = "";
  /** Signature of the Operational Events panel (V1.0-E). */
  private shownEventsSig = "";
  /** Signature of the BuildMenu's expansion card (V1.2-E). */
  private shownExpansionSig = "";

  constructor(
    canvas: HTMLCanvasElement,
    hudContainer: HTMLElement,
    initialData?: GameStateData,
    bootNotice?: string,
  ) {
    this.canvas = canvas;

    const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? canvas;

    // Mobile-aware shadow quality (spec §22/§26): same gameplay everywhere,
    // just a cheaper shadow map + lower pixel ratio on small/touch devices so
    // 375x812 doesn't pay desktop shadow cost. Decided once at startup.
    this.lowPowerDevice = isLowPowerDevice();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.lowPowerDevice ? 1.5 : 2),
    );
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.lowPowerDevice
      ? THREE.PCFShadowMap
      : THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ecae6);

    this.addLights();

    // Loading a save (spec §B.6/§B.7): GameState's own constructor is already
    // the full migration pipeline (old version -> current schema), and every
    // manager below already builds its meshes FROM this.state.data — so
    // handing it a restored GameStateData here, instead of always creating a
    // fresh one, is the entire "World rebuild" step. No separate reconstruction
    // path, no manager rewritten.
    this.state = new GameState(initialData);
    clearTransientSelection(this.state.data);

    this.cameraController = new CameraController(canvas, w, h);

    this.world = new AirportWorld(this.state);
    this.scene.add(this.world.group);

    this.occupancy = new GridOccupancy(this.state.data.buildings);

    this.gridCursor = new GridCursor();
    this.scene.add(this.gridCursor.object);

    this.buildingPreview = new BuildingPreview();
    this.scene.add(this.buildingPreview.object);

    this.expansionOverlay = new ExpansionOverlay();
    this.expansionOverlay.setLevel(this.state.airport.expansionLevel ?? 0);
    this.scene.add(this.expansionOverlay.object);
    this.cameraController.setHomeViewSize(
      expansionTier(this.state.airport.expansionLevel ?? 0).worldSize * 0.96,
    );
    this.cameraController.setPanBounds(
      expansionTier(this.state.airport.expansionLevel ?? 0).worldSize / 2,
    );

    this.buildController = new BuildController(
      this.occupancy,
      this.buildingPreview,
      {
        nextId: (type) => this.state.nextBuildingId(type),
        canPurchase: (type) =>
          checkPurchase(type, this.state.airport.money, this.state.airport.level),
        commit: (data) => this.commitBuilding(data),
        onModeChange: (s) => this.onBuildModeChange(s),
      },
      () => expansionBounds(this.state.airport.expansionLevel ?? 0),
    );

    this.aircraftManager = new AircraftManager(this.state);
    this.scene.add(this.aircraftManager.group);

    this.vehicleManager = new GroundVehicleManager(this.state);
    this.scene.add(this.vehicleManager.group);

    this.staffManager = new StaffManager(this.state);
    this.scene.add(this.staffManager.group);

    this.operations = new OperationsManager(this.state);

    this.flightScheduler = new FlightScheduler(this.state, {
      spawnAircraft: (data) => this.aircraftManager.spawn(data),
      onFlightCompleted: (flight) => {
        this.operations.handleFlightCompleted(flight);
        this.requestEventSave();
      },
    });

    this.passengerManager = new PassengerManager(
      this.state,
      DEFAULT_WAYPOINTS,
      (id) => this.onPassengerRemoved(id),
    );
    this.scene.add(this.passengerManager.group);

    this.economy = new Economy(this.state);
    this.groundOps = new GroundOperationManager(
      this.state,
      this.vehicleManager,
      this.staffManager,
    );
    this.missions = new MissionManager(this.state, {
      grantMoney: (n) => this.economy.grantReward(n),
      grantReputation: (n) => this.operations.grantReputation(n),
    });
    this.operationalEvents = new OperationalEventManager(this.state, {
      grantMoney: (n) => this.economy.grantReward(n),
      grantReputation: (n) => this.operations.grantReputation(n),
    });
    this.facilities = new FacilityManager(this.state);
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
      onSave: () => this.save(),
      onLoad: () => this.requestLoad(),
    });
    this.refreshHudStats();
    this.refreshStatistics();

    this.buildMenu = new BuildMenu(
      hudContainer,
      BUILDING_TYPES.map((type) => ({
        type,
        label: buildingLabel(type),
      })),
      {
        onSelectType: (type) => this.onBuildTypeSelected(type),
        onCancel: () => this.buildController.cancel(),
        onExpand: () => this.expandAirport(),
      },
    );
    this.refreshBuildMenu();
    this.refreshExpansionCard();
    this.refreshOperations();

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);

    if (bootNotice) this.hud.showNotice(bootNotice, 4000);
  }

  start(): void {
    this.onResize();
    this.loop.start();
  }

  // ------------------------------------------------------------- save/load

  hasSave(): boolean {
    return this.saveManager.hasSave();
  }

  /** Current save-status badge for the HUD (V1.2-E). */
  getSaveStatus(): "IDLE" | "SAVED" | "ERROR" {
    return this.saveStatus;
  }

  /**
   * Write the current GameStateData now (spec §B.4). Synchronous — localStorage
   * has no async API — but still goes through the same outcome shape a future
   * async backend would need, so callers don't have to change later.
   */
  save(): boolean {
    if (this.saveInProgress) {
      this.savePending = true;
      return false;
    }
    this.saveInProgress = true;
    const result = this.saveManager.save(this.state.data);
    this.saveInProgress = false;
    this.saveStatus = result.ok ? "SAVED" : "ERROR";
    this.hud.setSaveStatus(this.saveStatus);
    this.secondsSinceSave = 0;
    if (!result.ok) this.hud.showNotice("저장 실패 — 이전 저장 유지됨");
    return result.ok;
  }

  /**
   * Autosave heartbeat (V1.2-C) — called once per Game.update(). Fires on the
   * fixed interval, or sooner when an event set `savePending` and the min gap
   * since the last save has already elapsed. Never runs more than once per
   * MIN_EVENT_SAVE_GAP seconds, so a burst of events never becomes a burst of
   * writes (spec §C.2, §23 — no per-frame save/stringify).
   */
  private tickAutosave(deltaTime: number): void {
    this.secondsSinceSave += deltaTime;
    if (this.secondsSinceSave >= AUTOSAVE_INTERVAL) {
      this.save();
      this.savePending = false;
      return;
    }
    if (this.savePending && this.secondsSinceSave >= MIN_EVENT_SAVE_GAP) {
      this.save();
      this.savePending = false;
    }
  }

  /** A meaningful event happened — ask for a save, subject to the min gap above. */
  private requestEventSave(): void {
    this.savePending = true;
  }

  /**
   * Ask to restore the last save. A reload is the safest way to rebuild the
   * whole object graph (Scene/renderer/every manager) from restored data
   * without a second "resync" path alongside the constructor's normal one
   * (spec §0 — no manager gets a rewrite for this). main.ts already loads the
   * save on boot when one exists, so a plain reload IS the load.
   */
  requestLoad(): void {
    if (!this.saveManager.hasSave()) {
      this.hud.showNotice("불러올 저장 데이터가 없습니다.");
      return;
    }
    if (!window.confirm("마지막 저장을 불러올까요? 저장하지 않은 진행 상황은 사라집니다.")) {
      return;
    }
    window.location.reload();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.selection.dispose();
    this.cameraController.dispose();
    this.passengerManager.dispose();
    this.vehicleManager.dispose();
    this.staffManager.dispose();
    this.aircraftManager.dispose();
    this.buildingPreview.dispose();
    this.expansionOverlay.dispose();
    this.gridCursor.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  /**
   * Direct placement helper (console / tests) — free, skips the purchase check.
   * The build-mode UI goes through BuildController -> commitBuilding().
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
      false,
    );
    return true;
  }

  // --------------------------------------------------------------- internals

  /**
   * Single funnel for adding a building. When `charge` (the normal build path),
   * the purchase is re-checked and the cost deducted atomically before the
   * building is committed — on any failure nothing changes (spec §8, §9, §32).
   */
  private commitBuilding(data: BuildingData, charge = true): boolean {
    if (charge) {
      const purchase = checkPurchase(
        data.type,
        this.state.airport.money,
        this.state.airport.level,
      );
      if (!purchase.ok) {
        this.showBuildDenied(purchase);
        return false;
      }
      const cost = getBuildingConfig(data.type).cost;
      if (!this.state.spendMoney(cost)) {
        this.showBuildDenied({ ok: false, reason: "INSUFFICIENT_FUNDS", cost });
        return false;
      }
      this.hud.showSpend(cost);
    }

    this.state.data.buildings.push(data);
    this.occupancy.add(data);
    this.world.addBuilding(data);
    let gate: GateData | null = null;
    if (data.type === "GATE") gate = this.state.addGateForBuilding(data);
    if (isServiceFacility(data.type)) this.operations.recomputeServiceScore();
    this.refreshHudStats();
    if (charge) {
      // Build confirmation (spec §13) — a short "X 건설 완료" alongside the
      // existing showSpend() money pop, so the player sees WHAT was bought,
      // not just that money moved.
      const name = gate
        ? `${t("gate")} ${gateName(gate.id)}`
        : buildingLabel(data.type);
      this.hud.showNotice(`${name} 건설 완료`, 1800);
      this.requestEventSave(); // a free console placeBuilding() doesn't count
    }
    return true;
  }

  private onBuildTypeSelected(type: BuildingType): void {
    const purchase = checkPurchase(
      type,
      this.state.airport.money,
      this.state.airport.level,
    );
    if (!purchase.ok && purchase.reason === "LOCKED") {
      this.hud.showNotice(`공항 레벨 ${purchase.requiredLevel} 이상 필요`);
      return;
    }
    this.buildController.begin(type);
  }

  private showBuildDenied(purchase: PurchaseResult): void {
    if (purchase.ok) return;
    this.hud.showNotice(
      purchase.reason === "LOCKED"
        ? `공항 레벨 ${purchase.requiredLevel} 이상 필요`
        : "잔액이 부족합니다",
    );
  }

  // ---------------------------------------------------------- expansion

  /**
   * Buy the next expansion tier (spec §D.4). Mirrors commitBuilding's
   * purchase pattern: re-check atomically, deduct, then apply — nothing
   * changes on any failure. Existing buildings/gates/aircraft never move
   * (expansion only widens PlacementSystem's allowed region — see
   * progression/Expansion.ts and world/cells.ts's GRID_COLS/ROWS ceiling).
   */
  expandAirport(): boolean {
    const level = this.state.airport.expansionLevel ?? 0;
    const result = checkExpansion(
      level,
      this.state.airport.level,
      this.state.airport.money,
    );
    if (!result.ok) {
      this.hud.showNotice(
        result.reason === "LOCKED"
          ? `공항 레벨 ${result.requiredLevel} 이상 필요`
          : result.reason === "MAX_LEVEL"
            ? "이미 최대로 확장되었습니다"
            : "잔액이 부족합니다",
      );
      return false;
    }
    const tier = expansionTier(level + 1);
    if (!this.state.spendMoney(tier.cost)) {
      this.hud.showNotice("잔액이 부족합니다");
      return false;
    }
    this.hud.showSpend(tier.cost);
    this.state.airport.expansionLevel = level + 1;
    this.expansionOverlay.setLevel(level + 1);
    this.cameraController.setHomeViewSize(tier.worldSize * 0.96);
    this.cameraController.setPanBounds(tier.worldSize / 2);
    this.hud.showNotice(
      `공항이 ${tier.worldSize}×${tier.worldSize}로 확장되었습니다!`,
    );
    this.requestEventSave();
    return true;
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d9db6, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(28, 40, 18);
    sun.castShadow = !this.lowPowerDevice; // spec §22/§26 — shadows off on small/touch devices
    const mapSize = this.lowPowerDevice ? 512 : 1024;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    // Covers the fully-expanded 80x80 airport (V1.2-D) with a small margin.
    const s = 42;
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
      ...this.vehicleManager.selectables,
      ...this.staffManager.selectables,
      ...this.passengerManager.selectables,
    ];
  }

  /**
   * Hire another staff member of `role` (spec §B.3). Uses the shared
   * spendMoney() economy API — no change to revenue handling (spec §10, §B.3).
   * Exposed for the console / a future hire button; returns false if unaffordable.
   */
  hireStaff(role: StaffRole): boolean {
    const cfg = staffRoleConfig(role);
    if (!this.state.spendMoney(cfg.hiringCost)) {
      this.hud.showNotice("Not enough money");
      return false;
    }
    this.hud.showSpend(cfg.hiringCost);

    const id = this.state.nextStaffId();
    const seq = Number(/(\d+)$/.exec(id)?.[1] ?? 0);
    const name = STAFF_CONFIG.names[seq % STAFF_CONFIG.names.length];
    const home = {
      x: 12 + (seq % 3) * 1.6,
      y: 0,
      z: 8 + (Math.floor(seq / 3) % 3) * 1.6,
    };
    const skill = Math.round(
      Math.max(
        40,
        Math.min(95, cfg.skill + jitterFromId(id) * STAFF_CONFIG.skillJitter),
      ),
    );
    this.state.addStaff({
      id,
      name,
      role,
      state: "IDLE",
      position: { ...home },
      targetPosition: null,
      operationId: null,
      skill,
      hiredAt: Date.now(),
      salary: cfg.salary,
      homePosition: { ...home },
      speed: STAFF_CONFIG.speed,
    });
    this.refreshHudStats();
    this.hud.showNotice(`${name} 채용됨 · ${staffRoleLabel(role)}`);
    return true;
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

      const cfg = state.type ? getBuildingConfig(state.type) : null;
      this.hud.setSelection({
        title: t("buildMode"),
        lines: [
          `${state.type ? buildingLabel(state.type) : "—"}${cfg ? `  ${formatMoney(cfg.cost)}` : ""}`,
          state.cell ? `${t("cell")} ${state.cell.col}, ${state.cell.row}` : "—",
          `${t("status")}: ${buildStatusText(state)}`,
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
        const flight = this.state.getFlightByAircraft(a.id);
        if (flight) {
          lines.push(`${t("flight")}: ${flight.id}`);
          lines.push(`${t("route")}: ${flightRoute(flight)}`);
          lines.push(
            `${t("status")}: ${stateLabel(flight.state)}${flight.delayed ? " ⚠ 지연" : ""}`,
          );
        }
        lines.push(`${t("state")}: ${stateLabel(a.state)}`);
        lines.push(`${t("gate")}: ${a.homeGateId ? gateName(a.homeGateId) : "—"}`);
        const board = this.state.getAircraftBoarding(a.id);
        if (board.total > 0) {
          lines.push(`${t("passengers")}: ${board.boarded} / ${board.total}`);
        }
        if (flight) lines.push(flightProgressLine(flight.state));
        if (flight) {
          for (const line of this.groundOpChecklist(flight.id)) lines.push(line);
        }
      }
      return { title: s.getSelectionLabel(), lines };
    }

    if (s.selectionKind === "GROUND_VEHICLE") {
      const v = this.state.getGroundVehicle(s.id);
      const lines: string[] = [];
      if (v) {
        lines.push(`${t("status")}: ${stateLabel(v.state)}`);
        const op = this.state.getGroundOperation(v.operationId);
        if (op) {
          const flight = this.state.getFlight(op.flightId);
          lines.push(`${t("operation")}: ${opLabel(op.type)}`);
          lines.push(`${t("flight")}: ${flight ? flight.id : "—"}`);
          lines.push(`${t("aircraft")}: ${op.aircraftId}`);
          lines.push(`${t("gate")}: ${gateName(op.gateId)}`);
        } else {
          lines.push(`${t("operation")}: —`);
        }
      }
      return { title: s.getSelectionLabel(), lines };
    }

    if (s.selectionKind === "GROUND_STAFF") {
      const st = this.state.getStaff(s.id);
      const lines: string[] = [];
      if (st) {
        lines.push(`${t("role")}: ${staffRoleLabel(st.role)}`);
        lines.push(`${t("state")}: ${stateLabel(st.state)}`);
        lines.push(`${t("skill")}: ${st.skill}`);
        const op = this.state.getGroundOperation(st.operationId);
        if (op) {
          const flight = this.state.getFlight(op.flightId);
          lines.push(`${t("operation")}: ${opLabel(op.type)}`);
          lines.push(`${t("flight")}: ${flight ? flight.id : "—"}`);
          lines.push(`${t("gate")}: ${gateName(op.gateId)}`);
        } else {
          lines.push(`${t("operation")}: —`);
        }
      }
      return { title: s.getSelectionLabel(), lines };
    }

    if (s.selectionKind === "PASSENGER") {
      const p = this.state.getPassenger(s.id);
      const lines: string[] = [];
      if (p) {
        const flight = this.state.getFlight(p.flightId);
        lines.push(`${t("flight")}: ${flight ? flight.id : "—"}`);
        if (flight) lines.push(`${t("route")}: ${flightRoute(flight)}`);
        lines.push(`${routeTypeLabel(p.routeType)} · ${stateLabel(p.state)}`);
        if (flight) {
          lines.push(
            `${t("flight")} ${t("status")}: ${stateLabel(flight.state)}${flight.delayed ? " ⚠ 지연" : ""}`,
          );
        }
        lines.push(`${t("aircraft")}: ${p.aircraftId ?? "—"}`);
        lines.push(`${t("gate")}: ${p.gateId ? gateName(p.gateId) : "—"}`);
        if (p.satisfaction !== undefined) {
          lines.push(`${t("satisfaction")}: ${p.satisfaction}`);
          lines.push(`${t("experience")}: ${experienceLabelKo(p.satisfaction)}`);
          if (p.waitingSeconds !== undefined) {
            lines.push(`${t("waiting")}: ${p.waitingSeconds}초`);
          }
        }
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
          lines.push(`${stateLabel(gate.status)} · ${board.boarded} / ${board.total}`);
        } else {
          lines.push(stateLabel(gate.status));
        }
        if (gate.aircraftId) {
          const ac = this.state.getAircraft(gate.aircraftId);
          const inbound =
            gate.status === "AVAILABLE" && !!ac && ac.state !== "PARKED";
          lines.push(
            `${t("aircraft")}: ${gate.aircraftId}${inbound ? " (접근 중)" : ""}`,
          );
        }
        const gateFlight = this.activeFlightForGate(gate.id);
        lines.push(`${t("flight")}: ${gateFlight ? gateFlight.id : "없음"}`);
        if (gateFlight) lines.push(`${t("route")}: ${flightRoute(gateFlight)}`);
        if (gateFlight) {
          const svc = this.groundServiceLabel(gateFlight.id);
          if (svc) lines.push(`${t("groundService")}: ${svc}`);
        }
      }
      return {
        title: gate ? `${t("gate")} ${gateName(gate.id)}` : t("gate"),
        lines,
      };
    }
    if (b && isServiceFacility(b.type)) {
      const effect = getFacilityEffect(b.type);
      const built = this.state.countBuildingsByType(b.type);
      const lines = [t("serviceFacility"), `${t("level2")} ${b.level}`];
      if (effect.passengerCapacity) lines.push(`${t("capacity")} ${effect.passengerCapacity}`);
      lines.push(`${t("comfort")} +${effect.comfort ?? 0} · ${t("service")} +${effect.service ?? 0}`);
      lines.push(built > 1 ? `${built}개 건설됨 (중복 보너스 감소)` : "1개 건설됨");
      return { title: buildingLabel(b.type), lines };
    }
    if (b && b.type === "TERMINAL") {
      const effect = getFacilityEffect(b.type);
      const built = this.state.countBuildingsByType("TERMINAL");
      const capacity = (effect.passengerCapacity ?? 0) * built;
      const inTerminal = this.state.data.passengers.filter((p) =>
        TERMINAL_PASSENGER_STATES.has(p.state),
      ).length;
      return {
        title: buildingLabel("TERMINAL"),
        lines: [
          t("facility"),
          `${t("level2")} ${b.level}`,
          `${t("capacity")} ${capacity}`,
          `${t("comfort")} +${effect.comfort ?? 0} · ${t("service")} +${effect.service ?? 0}`,
          `${t("passengers")} ${inTerminal} / ${capacity}`,
        ],
      };
    }
    if (b) {
      const label = buildingLabel(b.type);
      return { title: label, lines: [`${t("type")}: ${label}`, `${t("level2")}: ${b.level}`] };
    }
    return { title: s.getSelectionLabel() };
  }

  /** Compact per-task state + staff string for a flight's turnaround, for HUD signatures. */
  private groundOpSig(flightId: string): string {
    return this.state
      .getGroundOperationsForFlight(flightId)
      .map((o) => {
        const staff = o.staffId
          ? this.state.getStaff(o.staffId)?.state === "WORKING"
            ? "w"
            : "a"
          : "-";
        return `${o.state[0]}${staff}`;
      })
      .join("");
  }

  /**
   * "Ground Operations" checklist lines for a flight's turnaround, with each
   * task's staff status (spec §42, §E.4).
   */
  private groundOpChecklist(flightId: string): string[] {
    const ops = this.state.getGroundOperationsForFlight(flightId);
    if (ops.length === 0) return [];
    const lines = [t("groundOperations")];
    for (const type of TURNAROUND_SEQUENCE) {
      const op = ops.find((o) => o.type === type);
      if (!op) continue;
      lines.push(
        `  ${operationGlyph(op.state)} ${opLabel(type)}${this.taskStaffNote(op)}`,
      );
    }
    return lines;
  }

  private taskStaffNote(op: {
    state: string;
    staffId?: string | null;
  }): string {
    if (op.state === "COMPLETED" || op.state === "CANCELLED") return "";
    if (op.staffId) {
      const working =
        this.state.getStaff(op.staffId)?.state === "WORKING";
      return working ? " · 작업 중" : " · 이동 중";
    }
    return " · 직원 대기";
  }

  /** "REFUELING" (current task) or "READY" for a gate's turnaround (spec §43). */
  private groundServiceLabel(flightId: string): string | null {
    const ops = this.state.getGroundOperationsForFlight(flightId);
    if (ops.length === 0) return null;
    if (ops.every((o) => o.state === "COMPLETED")) return stateLabel("READY");
    const current = ops.find(
      (o) => o.state !== "COMPLETED" && o.state !== "CANCELLED",
    );
    return current ? opLabel(current.type) : "—";
  }

  /** The active (non-finished) flight tied to a gate, via its aircraft or gateId. */
  private activeFlightForGate(gateId: string): FlightData | undefined {
    const gate = this.state.getGate(gateId);
    if (gate?.aircraftId) {
      const byAircraft = this.state.getFlightByAircraft(gate.aircraftId);
      if (byAircraft) return byAircraft;
    }
    return this.state.data.flights.find(
      (f) => f.gateId === gateId && !isFlightOver(f.state),
    );
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
        const f = this.state.getFlightByAircraft(a.id);
        const gopSig = f ? this.groundOpSig(f.id) : "-";
        sig = `${a.state}|${a.homeGateId ?? "-"}|${b.boarded}/${b.total}|${f?.id ?? "-"}:${f?.state ?? "-"}:${f?.delayed ? "D" : "-"}|${gopSig}`;
      }
    } else if (sel.selectionKind === "PASSENGER") {
      const p = this.state.getPassenger(sel.id);
      if (p) {
        const f = this.state.getFlight(p.flightId);
        sig = `${p.state}|${p.aircraftId ?? "-"}|${p.gateId ?? "-"}|${f?.id ?? "-"}:${f?.state ?? "-"}:${f?.delayed ? "D" : "-"}|${p.satisfaction ?? "-"}`;
      }
    } else if (sel.selectionKind === "GROUND_VEHICLE") {
      const v = this.state.getGroundVehicle(sel.id);
      if (v) {
        const op = this.state.getGroundOperation(v.operationId);
        sig = `${v.state}|${op?.id ?? "-"}:${op?.type ?? "-"}:${op?.state ?? "-"}`;
      }
    } else if (sel.selectionKind === "GROUND_STAFF") {
      const st = this.state.getStaff(sel.id);
      if (st) {
        const op = this.state.getGroundOperation(st.operationId);
        sig = `${st.state}|${op?.id ?? "-"}:${op?.type ?? "-"}:${op?.state ?? "-"}`;
      }
    } else {
      const building = this.state.getBuilding(sel.id);
      if (building?.type === "GATE") {
        const gate = this.state.getGateByBuilding(building.id);
        if (gate) {
          const b = this.state.getGateBoarding(gate.id);
          const f = this.activeFlightForGate(gate.id);
          const gopSig = f ? this.groundOpSig(f.id) : "-";
          sig = `${gate.status}|${gate.aircraftId ?? "-"}|${b.boarded}/${b.total}|${f?.id ?? "-"}:${f?.state ?? "-"}|${gopSig}`;
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
      staffCount: this.staffManager.count,
      staffActive: this.staffManager.activeCount,
    });
  }

  private update(deltaTime: number): void {
    this.cameraController.update(deltaTime);
    this.flightScheduler.update(deltaTime);
    this.aircraftManager.update(deltaTime);
    this.passengerManager.update(deltaTime);

    // Ground operations: create + drive each parked aircraft's turnaround, then
    // move the staff + vehicles it dispatched this frame.
    const groundTick = this.groundOps.update(deltaTime);
    for (const notice of groundTick.notices) this.hud.showNotice(notice);
    this.staffManager.update(deltaTime);
    this.vehicleManager.update(deltaTime);

    // Derive each gate's operational status from the aircraft + passengers.
    this.gateStatus.update(deltaTime);

    // Economy: pay ticket revenue for passengers that just boarded.
    const revenue = this.economy.settleBoarding();
    if (revenue > 0) this.hud.showRevenue(revenue);

    // Operations: tick events, surface notices, honour surge flight requests.
    const opsTick = this.operations.update(deltaTime);
    for (const notice of opsTick.notices) this.hud.showNotice(notice);
    for (let i = 0; i < opsTick.extraFlightRequests; i += 1) {
      this.flightScheduler.requestFlight();
    }

    // Missions: keep the objective queue filled, track progress, pay rewards.
    const missionTick = this.missions.update(deltaTime);
    for (const notice of missionTick.notices) this.hud.showNotice(notice);
    if (missionTick.notices.length > 0) this.requestEventSave();

    // Operational events: raise/track/resolve the short operating prompts.
    const eventTick = this.operationalEvents.update(deltaTime);
    for (const notice of eventTick.notices) this.hud.showNotice(notice);

    // Facility effects: recompute only when the building list actually
    // changed (signature-gated inside FacilityManager itself).
    this.facilities.update();

    // Autosave heartbeat (V1.2-C).
    this.tickAutosave(deltaTime);

    this.refreshProgression();
    this.refreshSelectionHud();
    this.refreshDynamicStats();
    this.refreshStatistics();
    this.refreshOperations();
    this.refreshAirportStatus();
    this.refreshFlightHistory();
    this.refreshGroundOps();
    this.refreshMissions();
    this.refreshEvents();
    this.refreshBuildMenu();
    this.refreshExpansionCard();
  }

  /**
   * Missions panel (V1.0-E) — the ACTIVE objectives (max 3). DOM only touched
   * when a title / progress / reward changes. A separate mid-stack panel; it
   * never replaces the Statistics panel (spec §E.1).
   */
  private refreshMissions(): void {
    const active = this.state.data.missions
      .filter((m) => m.state === "ACTIVE")
      .slice(0, 3);
    const sig = active
      .map((m) => `${m.id}:${m.progress}/${m.target}`)
      .join(",");
    if (sig === this.shownMissionsSig) return;
    this.shownMissionsSig = sig;
    this.hud.setMissions(
      active.map((m) => ({
        title: m.title,
        description: m.description,
        progressText: `${formatCount(m.progress)}/${formatCount(m.target)}`,
        progressFraction: m.target > 0 ? m.progress / m.target : 0,
        rewardText: `+${formatMoney(m.rewardMoney)} · 평판 +${m.rewardReputation}`,
      })),
    );
  }

  /**
   * Operational Events panel (V1.0-E) — the ACTIVE operating prompts. DOM only
   * touched when progress / remaining time changes (time bucketed to whole
   * seconds so it isn't rewritten every frame).
   */
  private refreshEvents(): void {
    const active = this.state.data.operationalEvents.filter(
      (e) => e.state === "ACTIVE",
    );
    const sig = active
      .map((e) => {
        const left = Math.max(0, Math.ceil(e.duration - e.elapsed));
        return `${e.id}:${e.progress}/${e.target}:${left}`;
      })
      .join(",");
    if (sig === this.shownEventsSig) return;
    this.shownEventsSig = sig;
    this.hud.setEvents(
      active.map((e) => {
        const left = Math.max(0, Math.ceil(e.duration - e.elapsed));
        const mm = Math.floor(left / 60);
        const ss = String(left % 60).padStart(2, "0");
        return {
          icon: OPERATIONAL_EVENT_ICON[e.type],
          title: e.title,
          description: e.description,
          progressText: `${formatCount(e.progress)}/${formatCount(e.target)}`,
          progressFraction: e.target > 0 ? e.progress / e.target : 0,
          timeText: `${mm}:${ss} left`,
        };
      }),
    );
  }

  /**
   * Airport-wide status indicator (V1.5 §6) — a one-line read of existing
   * GroundOperation / Staff / Flight / Event state, in priority order.
   * Computed fresh every check; nothing here is a new persisted value.
   */
  private computeAirportStatus(): { label: string; tone: "good" | "warn" | "alert" } {
    if (this.state.data.operationalEvents.some((e) => e.state === "ACTIVE")) {
      return { label: t("statusEvent"), tone: "alert" };
    }

    const staffNeeded = this.state.data.groundOperations.some(
      (o) => (o.state === "PENDING" || o.state === "ASSIGNED") && !o.staffId,
    );
    const allStaffBusy =
      this.staffManager.count > 0 &&
      this.staffManager.activeCount >= this.staffManager.count;
    if (allStaffBusy && staffNeeded) {
      return { label: t("statusStaffShortage"), tone: "warn" };
    }

    if ((this.state.operations.groundEfficiency ?? 100) < 50) {
      return { label: t("statusGroundDelay"), tone: "warn" };
    }

    const allGatesBusy =
      this.state.data.gates.length > 0 &&
      this.state.data.gates.every((g) => g.status !== "AVAILABLE");
    const flightsWaiting = this.state.data.flights.some((f) => f.state === "SCHEDULED");
    if (allGatesBusy && flightsWaiting) {
      return { label: t("statusFlightBacklog"), tone: "warn" };
    }

    const capacity = this.facilities.getFacilityEffects().passengerCapacity;
    if (capacity > 0 && this.state.data.passengers.length > capacity * 0.9) {
      return { label: t("statusCongested"), tone: "warn" };
    }

    return { label: t("statusNormal"), tone: "good" };
  }

  private refreshAirportStatus(): void {
    const info = this.computeAirportStatus();
    const sig = `${info.label}|${info.tone}`;
    if (sig === this.shownAirportStatusSig) return;
    this.shownAirportStatusSig = sig;
    this.hud.setAirportStatus(info);
  }

  /**
   * Ground Operations panel (V0.8-E) — the task being worked for each active
   * turnaround plus the most recent completions. DOM only touched on change.
   */
  private refreshGroundOps(): void {
    const rows = this.groundOps.recentActivity(6);
    const sig = rows
      .map(
        (r) =>
          `${r.flightId}:${r.type}:${r.state}:${r.staffName ?? "-"}:${r.needsStaff ? "S" : "-"}`,
      )
      .join(",");
    if (sig === this.shownGroundOpsSig) return;
    this.shownGroundOpsSig = sig;
    this.hud.setGroundOperations(
      rows.map((r) => ({
        flightId: r.flightId,
        task: opLabel(r.type),
        state: r.state,
        staff: r.staffName
          ? `${staffRoleLabel(r.role)} · ${r.staffName}`
          : staffRoleLabel(r.role),
        needsStaff: r.needsStaff,
      })),
    );
  }

  /**
   * Push the live Operations metrics to the HUD when they change. A separate
   * block below the Statistics grid — the stats' meanings are untouched (§59).
   */
  private refreshOperations(): void {
    const o = this.state.operations;
    const reputation = Math.round(this.state.airport.reputation);
    const serviceScore = Math.round(o.serviceScore);
    const satisfaction = Math.round(o.passengerSatisfaction);
    const onTimeRate = Math.round(o.onTimeRate);
    const groundEfficiency = Math.round(o.groundEfficiency ?? 70);
    const sig = `${serviceScore}|${satisfaction}|${onTimeRate}|${groundEfficiency}|${reputation}`;
    if (sig === this.shownOperationsSig) return;
    this.shownOperationsSig = sig;
    this.hud.setOperations({
      serviceScore,
      satisfaction,
      onTimeRate,
      reputation,
      groundEfficiency,
    });
  }

  /**
   * BuildMenu's expansion card (V1.2-E) — reuses the same panel, no new large
   * UI (spec §E.5). DOM only touched when level / money-affordability changes.
   */
  private refreshExpansionCard(): void {
    const level = this.state.airport.expansionLevel ?? 0;
    const money = this.state.airport.money;
    const airportLevel = this.state.airport.level;
    const next = level + 1;
    const available = next <= MAX_EXPANSION_LEVEL;
    const tier = available ? expansionTier(next) : null;
    const locked = !!tier && airportLevel < tier.requiredLevel;
    const sig = `${available}|${level}|${locked}|${money >= (tier?.cost ?? 0)}`;
    if (sig === this.shownExpansionSig) return;
    this.shownExpansionSig = sig;
    this.buildMenu.setExpansion({
      available,
      worldSize: tier?.worldSize ?? 0,
      cost: tier?.cost ?? 0,
      requiredLevel: tier?.requiredLevel ?? 0,
      locked,
    });
  }

  /**
   * Recent Flights panel (V0.6-E) — the last few COMPLETED flights, newest
   * first. A separate panel from Airport Statistics; never replaces it. DOM is
   * only touched when the signature changes (perf §31).
   */
  private refreshFlightHistory(): void {
    const completed = this.state.data.flights
      .filter((f) => f.state === "COMPLETED")
      .sort(
        (a, b) =>
          (b.completedAt ?? 0) - (a.completedAt ?? 0) ||
          (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 5);

    const sig = completed
      .map((f) => `${f.id}:${f.revenue ?? 0}:${f.averageSatisfaction ?? "-"}`)
      .join(",");
    if (sig === this.shownHistorySig) return;
    this.shownHistorySig = sig;

    this.hud.setFlightHistory(
      completed.map((f) => ({
        id: f.id,
        route: flightRoute(f),
        revenue: f.revenue ?? 0,
        satisfaction:
          f.averageSatisfaction !== undefined
            ? Math.round(f.averageSatisfaction)
            : undefined,
      })),
    );
  }

  /** Bump airport.level when cumulative stats cross a threshold (one-shot). */
  private refreshProgression(): void {
    const a = this.state.airport;
    const target = computeAirportLevel(
      a.totalFlights ?? 0,
      a.totalPassengers ?? 0,
    );
    if (target <= a.level) return; // only ever rises; write only on change
    a.level = target;
    this.hud.showNotice(`공항 레벨 ${target}! 새 건물을 지을 수 있습니다.`);
    this.refreshHudStats();
    this.requestEventSave();
  }

  /** Push cost / lock state to the BuildMenu when level or money changes. */
  private refreshBuildMenu(): void {
    const { money, level } = this.state.airport;
    // Bucket by which types are affordable so tiny revenue ticks don't re-render.
    const affordBucket = BUILDING_TYPES.map((t) =>
      money >= BUILDING_CONFIG[t].cost ? "1" : "0",
    ).join("");
    const sig = `${level}|${affordBucket}`;
    if (sig === this.shownBuildMenuSig) return;
    this.shownBuildMenuSig = sig;

    const items: BuildMenuItem[] = BUILDING_TYPES.map((type) => {
      const cfg = BUILDING_CONFIG[type];
      return {
        type,
        cost: cfg.cost,
        requiredLevel: cfg.requiredLevel,
        locked: level < cfg.requiredLevel,
      };
    });
    this.buildMenu.setAvailability(items);
  }

  /** Refresh the top HUD stats when a tracked value changes. */
  private refreshDynamicStats(): void {
    const a = this.state.airport;
    const sig = `${a.level}|${a.money}|${this.passengerManager.count}|${this.aircraftManager.count}|${a.totalFlights ?? 0}|${this.staffManager.count}/${this.staffManager.activeCount}`;
    if (sig === this.shownStatsSig) return;
    this.shownStatsSig = sig;
    this.refreshHudStats();
  }

  /**
   * Recompute the Airport Statistics panel from GameState. Cumulative values
   * come straight from `airport.*`; the two derived ones are computed here.
   * DOM is only touched when the signature changes (perf §31).
   */
  private refreshStatistics(): void {
    const a = this.state.airport;
    const flights = a.totalFlights ?? 0;
    const passengers = a.totalPassengers ?? 0;
    const revenue = a.totalRevenue ?? 0;
    const balance = a.money;
    const avgPaxPerFlight = flights > 0 ? passengers / flights : 0;

    let departureTotal = 0;
    let departureBoarded = 0;
    for (const p of this.state.data.passengers) {
      if (p.routeType !== "DEPARTURE") continue;
      departureTotal += 1;
      if (p.state === "BOARDED") departureBoarded += 1;
    }
    const boardingRate =
      departureTotal > 0
        ? Math.round((departureBoarded / departureTotal) * 100)
        : 0;

    const sig = `${flights}|${passengers}|${revenue}|${balance}|${avgPaxPerFlight.toFixed(1)}|${boardingRate}`;
    if (sig === this.shownStatisticsSig) return;
    this.shownStatisticsSig = sig;
    this.hud.setStatistics({
      flights,
      passengers,
      revenue,
      balance,
      avgPaxPerFlight,
      boardingRate,
    });
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

/** "SEOUL → TOKYO" for a departure, "TOKYO → SEOUL" for an arrival. */
function routeTypeLabel(routeType: "DEPARTURE" | "ARRIVAL"): string {
  if (CURRENT_LOCALE !== "ko") return routeType;
  return routeType === "DEPARTURE" ? "출발" : "도착";
}

function flightRoute(flight: FlightData): string {
  return flight.routeType === "ARRIVAL"
    ? `${cityLabel(flight.destination)} → ${cityLabel(flight.origin)}`
    : `${cityLabel(flight.origin)} → ${cityLabel(flight.destination)}`;
}

/** The departure progress steps, in order (spec V0.6-D). */
const FLIGHT_PROGRESS_STEPS: readonly FlightState[] = [
  "SCHEDULED",
  "BOARDING",
  "READY",
  "DEPARTING",
  "FLYING",
];

/** Compact text progress bar: "Progress: ●●●○○". Pure text, no DOM work. */
function flightProgressLine(state: FlightState): string {
  if (state === "CANCELLED") return `${t("progress")}: 취소됨`;
  const idx = FLIGHT_PROGRESS_STEPS.indexOf(state);
  const filled =
    state === "COMPLETED" || idx < 0 ? FLIGHT_PROGRESS_STEPS.length : idx + 1;
  const dots = FLIGHT_PROGRESS_STEPS.map((_, i) =>
    i < filled ? "●" : "○",
  ).join("");
  return `${t("progress")}: ${dots}`;
}

/** "BOARDING_SERVICE" -> "Boarding Service" */
/** Whole-number display for a mission / event counter ("14,000", "3"). */
function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Passenger states that count as "in the terminal" for the Facility HUD (V1.1-E). */
const TERMINAL_PASSENGER_STATES: ReadonlySet<string> = new Set([
  "TO_TERMINAL",
  "CHECK_IN",
  "TO_TERMINAL_AFTER_ARRIVAL",
]);

const OPERATIONAL_EVENT_ICON: Record<OperationalEventType, string> = {
  PASSENGER_SURGE: "👥",
  FLIGHT_DEMAND: "✈",
  GROUND_DELAY: "🧰",
  MAINTENANCE_REQUEST: "🔧",
  STAFF_SHORTAGE: "🧑‍✈️",
};

function opLabel(type: string): string {
  if (CURRENT_LOCALE === "ko") return stateLabel(type);
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "gate-1" -> "G-01", "gate-004" -> "G-04" */
function gateName(gateId: string): string {
  const match = /(\d+)$/.exec(gateId);
  return match ? `G-${String(parseInt(match[1], 10)).padStart(2, "0")}` : gateId;
}

/** Player-facing reason text (spec §12's own suggested phrasing). */
function validityText(v: PlacementValidity): string {
  if (v.valid) return "배치 가능";
  if (v.reason === "OUT_OF_BOUNDS") return "공항 영역을 벗어났습니다";
  if (v.reason === "OUTSIDE_EXPANSION") return "공항을 먼저 확장해야 합니다";
  return "다른 시설과 겹칩니다";
}

/** Combined placement + purchase status for the BUILD MODE HUD line. */
function buildStatusText(state: BuildModeState): string {
  if (state.purchase && !state.purchase.ok) {
    return state.purchase.reason === "LOCKED"
      ? `레벨 ${state.purchase.requiredLevel} 필요`
      : "잔액 부족";
  }
  if (!state.cell) return "격자 위로 이동하세요";
  if (state.validity && !state.validity.valid) return validityText(state.validity);
  return "배치 가능";
}
