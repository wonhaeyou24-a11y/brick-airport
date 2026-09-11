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
  checkPurchase,
  type PurchaseResult,
} from "../buildings/BuildingConfig";
import { computeAirportLevel } from "../progression/AirportProgression";
import { OperationsManager } from "../operations/OperationsManager";
import { GroundOperationManager } from "../operations/GroundOperationManager";
import { MissionManager } from "../missions/MissionManager";
import { OperationalEventManager } from "../events/OperationalEventManager";
import { FacilityManager } from "../buildings/FacilityManager";
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
import { jitterFromId, experienceLabel } from "../operations/AirportOperations";
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
  /** Signature of the Missions panel (V1.0-E). */
  private shownMissionsSig = "";
  /** Signature of the Operational Events panel (V1.0-E). */
  private shownEventsSig = "";

  constructor(
    canvas: HTMLCanvasElement,
    hudContainer: HTMLElement,
    initialData?: GameStateData,
    bootNotice?: string,
  ) {
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
      onFlightCompleted: (flight) => this.operations.handleFlightCompleted(flight),
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
    });
    this.refreshHudStats();
    this.refreshStatistics();

    this.buildMenu = new BuildMenu(
      hudContainer,
      BUILDING_TYPES.map((type) => ({
        type,
        label: BUILDING_CONFIG[type].label,
      })),
      {
        onSelectType: (type) => this.onBuildTypeSelected(type),
        onCancel: () => this.buildController.cancel(),
      },
    );
    this.refreshBuildMenu();
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
    const result = this.saveManager.save(this.state.data);
    this.saveStatus = result.ok ? "SAVED" : "ERROR";
    if (!result.ok) this.hud.showNotice("Save failed — previous save kept.");
    return result.ok;
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
      this.hud.showNotice("No save to load.");
      return;
    }
    if (!window.confirm("Load the last save? Unsaved progress will be lost.")) {
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
    if (data.type === "GATE") this.state.addGateForBuilding(data);
    if (isServiceFacility(data.type)) this.operations.recomputeServiceScore();
    this.refreshHudStats();
    return true;
  }

  private onBuildTypeSelected(type: BuildingType): void {
    const purchase = checkPurchase(
      type,
      this.state.airport.money,
      this.state.airport.level,
    );
    if (!purchase.ok && purchase.reason === "LOCKED") {
      this.hud.showNotice(`Requires Airport Level ${purchase.requiredLevel}`);
      return;
    }
    this.buildController.begin(type);
  }

  private showBuildDenied(purchase: PurchaseResult): void {
    if (purchase.ok) return;
    this.hud.showNotice(
      purchase.reason === "LOCKED"
        ? `Requires Airport Level ${purchase.requiredLevel}`
        : "Not enough money",
    );
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
    this.hud.showNotice(`Hired ${name} · ${staffRoleLabel(role)}`);
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
        title: "BUILD MODE",
        lines: [
          `${cfg ? cfg.label : "—"}${cfg ? `  $${cfg.cost.toLocaleString("en-US")}` : ""}`,
          state.cell ? `Cell ${state.cell.col}, ${state.cell.row}` : "—",
          `Status: ${buildStatusText(state)}`,
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
          lines.push(`Flight: ${flight.id}`);
          lines.push(`Route: ${flightRoute(flight)}`);
          lines.push(
            `Status: ${flight.state}${flight.delayed ? " ⚠ delayed" : ""}`,
          );
        }
        lines.push(`State: ${a.state}`);
        lines.push(`Gate: ${a.homeGateId ? gateName(a.homeGateId) : "—"}`);
        const board = this.state.getAircraftBoarding(a.id);
        if (board.total > 0) {
          lines.push(`Passengers: ${board.boarded} / ${board.total}`);
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
        lines.push(`Status: ${v.state}`);
        const op = this.state.getGroundOperation(v.operationId);
        if (op) {
          const flight = this.state.getFlight(op.flightId);
          lines.push(`Operation: ${opLabel(op.type)}`);
          lines.push(`Flight: ${flight ? flight.id : "—"}`);
          lines.push(`Aircraft: ${op.aircraftId}`);
          lines.push(`Gate: ${gateName(op.gateId)}`);
        } else {
          lines.push("Operation: —");
        }
      }
      return { title: s.getSelectionLabel(), lines };
    }

    if (s.selectionKind === "GROUND_STAFF") {
      const st = this.state.getStaff(s.id);
      const lines: string[] = [];
      if (st) {
        lines.push(`Role: ${staffRoleLabel(st.role)}`);
        lines.push(`State: ${st.state}`);
        lines.push(`Skill: ${st.skill}`);
        const op = this.state.getGroundOperation(st.operationId);
        if (op) {
          const flight = this.state.getFlight(op.flightId);
          lines.push(`Operation: ${opLabel(op.type)}`);
          lines.push(`Flight: ${flight ? flight.id : "—"}`);
          lines.push(`Gate: ${gateName(op.gateId)}`);
        } else {
          lines.push("Operation: —");
        }
      }
      return { title: s.getSelectionLabel(), lines };
    }

    if (s.selectionKind === "PASSENGER") {
      const p = this.state.getPassenger(s.id);
      const lines: string[] = [];
      if (p) {
        const flight = this.state.getFlight(p.flightId);
        lines.push(`Flight: ${flight ? flight.id : "—"}`);
        if (flight) lines.push(`Route: ${flightRoute(flight)}`);
        lines.push(`${p.routeType} · ${p.state}`);
        if (flight) {
          lines.push(
            `Flight status: ${flight.state}${flight.delayed ? " ⚠ delayed" : ""}`,
          );
        }
        lines.push(`Aircraft: ${p.aircraftId ?? "—"}`);
        lines.push(`Gate: ${p.gateId ? gateName(p.gateId) : "—"}`);
        if (p.satisfaction !== undefined) {
          lines.push(`Satisfaction: ${p.satisfaction}`);
          lines.push(`Experience: ${experienceLabel(p.satisfaction)}`);
          if (p.waitingSeconds !== undefined) {
            lines.push(`Waiting: ${p.waitingSeconds}s`);
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
        const gateFlight = this.activeFlightForGate(gate.id);
        lines.push(`Flight: ${gateFlight ? gateFlight.id : "NONE"}`);
        if (gateFlight) lines.push(`Route: ${flightRoute(gateFlight)}`);
        if (gateFlight) {
          const svc = this.groundServiceLabel(gateFlight.id);
          if (svc) lines.push(`Ground Service: ${svc}`);
        }
      }
      return {
        title: gate ? `Gate ${gateName(gate.id)}` : "Gate",
        lines,
      };
    }
    if (b && isServiceFacility(b.type)) {
      const cfg = getBuildingConfig(b.type);
      const effect = getFacilityEffect(b.type);
      const built = this.state.countBuildingsByType(b.type);
      const lines = ["Facility", `Level ${b.level}`];
      if (effect.passengerCapacity) lines.push(`Capacity ${effect.passengerCapacity}`);
      lines.push(`Comfort +${effect.comfort ?? 0} · Service +${effect.service ?? 0}`);
      lines.push(built > 1 ? `${built} built (stacked bonus reduced)` : "1 built");
      return { title: cfg.label, lines };
    }
    if (b && b.type === "TERMINAL") {
      const effect = getFacilityEffect(b.type);
      const built = this.state.countBuildingsByType("TERMINAL");
      const capacity = (effect.passengerCapacity ?? 0) * built;
      const inTerminal = this.state.data.passengers.filter((p) =>
        TERMINAL_PASSENGER_STATES.has(p.state),
      ).length;
      return {
        title: "Terminal",
        lines: [
          "Facility",
          `Level ${b.level}`,
          `Capacity ${capacity}`,
          `Comfort +${effect.comfort ?? 0} · Service +${effect.service ?? 0}`,
          `Passengers ${inTerminal} / ${capacity}`,
        ],
      };
    }
    if (b) {
      const label = capitalize(b.type);
      return { title: label, lines: [`Type: ${label}`, `Level: ${b.level}`] };
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
    const lines = ["Ground Operations"];
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
      return working ? " · staff working" : " · staff on the way";
    }
    return " · waiting for staff";
  }

  /** "REFUELING" (current task) or "READY" for a gate's turnaround (spec §43). */
  private groundServiceLabel(flightId: string): string | null {
    const ops = this.state.getGroundOperationsForFlight(flightId);
    if (ops.length === 0) return null;
    if (ops.every((o) => o.state === "COMPLETED")) return "READY";
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

    // Operational events: raise/track/resolve the short operating prompts.
    const eventTick = this.operationalEvents.update(deltaTime);
    for (const notice of eventTick.notices) this.hud.showNotice(notice);

    // Facility effects: recompute only when the building list actually
    // changed (signature-gated inside FacilityManager itself).
    this.facilities.update();

    this.refreshProgression();
    this.refreshSelectionHud();
    this.refreshDynamicStats();
    this.refreshStatistics();
    this.refreshOperations();
    this.refreshFlightHistory();
    this.refreshGroundOps();
    this.refreshMissions();
    this.refreshEvents();
    this.refreshBuildMenu();
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
        rewardText: `+$${m.rewardMoney.toLocaleString("en-US")} · +${m.rewardReputation} rep`,
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
    this.hud.showNotice(`Airport Level ${target}! New buildings available.`);
    this.refreshHudStats();
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
function flightRoute(flight: FlightData): string {
  return flight.routeType === "ARRIVAL"
    ? `${flight.destination} → ${flight.origin}`
    : `${flight.origin} → ${flight.destination}`;
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
  if (state === "CANCELLED") return "Progress: cancelled";
  const idx = FLIGHT_PROGRESS_STEPS.indexOf(state);
  const filled =
    state === "COMPLETED" || idx < 0 ? FLIGHT_PROGRESS_STEPS.length : idx + 1;
  const dots = FLIGHT_PROGRESS_STEPS.map((_, i) =>
    i < filled ? "●" : "○",
  ).join("");
  return `Progress: ${dots}`;
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

function capitalize(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

function validityText(v: PlacementValidity): string {
  if (v.valid) return "VALID";
  return v.reason === "OUT_OF_BOUNDS" ? "INVALID (out of bounds)" : "INVALID (occupied)";
}

/** Combined placement + purchase status for the BUILD MODE HUD line. */
function buildStatusText(state: BuildModeState): string {
  if (state.purchase && !state.purchase.ok) {
    return state.purchase.reason === "LOCKED"
      ? `Requires Lv.${state.purchase.requiredLevel}`
      : "Not enough money";
  }
  if (!state.cell) return "Move over the grid";
  if (state.validity && !state.validity.valid) return validityText(state.validity);
  return "VALID";
}
