import type {
  GameState,
  GroundOperationData,
  GroundOperationState,
  GroundOperationType,
  StaffRole,
} from "../core/GameState";
import { isFlightOver, isServiceFacility } from "../core/GameState";
import type { GroundVehicleManager } from "../vehicles/GroundVehicleManager";
import type { StaffManager } from "../staff/StaffManager";
import {
  TURNAROUND_SEQUENCE,
  canCompleteGroundOperation,
  createGroundOperation,
  getGroundOperationDuration,
  nextPendingOperation,
  vehicleTypeForOperation,
} from "./GroundOperation";
import { computeGroundEfficiency } from "./AirportOperations";
import { OPERATIONS_CONFIG as C } from "./OperationsConfig";
import { roleForOperation, staffRoleLabel, staffSkillModifier } from "../staff/StaffConfig";
import type { GroundVehicleType } from "../core/GameState";
import { stateLabel } from "../i18n/strings";

/** What Game must act on after a ground-operations tick. */
export interface GroundOperationsTick {
  /** Short strings for the HUD notice system (spec §47). */
  notices: string[];
}

/** One row of the Ground Operations HUD panel (spec §45, §E.3). */
export interface GroundOpActivity {
  flightId: string;
  type: GroundOperationType;
  state: GroundOperationState;
  /** Staff role responsible for the task. */
  role: StaffRole;
  /** Name of the assigned staff member, if any. */
  staffName?: string;
  /** True when the task is PENDING because no staff of its role is free (§D.4). */
  needsStaff?: boolean;
}

const OP_ICON: Record<string, string> = {
  BAGGAGE: "🧳",
  CLEANING: "🧽",
  REFUELING: "⛽",
  BOARDING_SERVICE: "👥",
};

/**
 * GroundOperationManager — the aircraft-turnaround orchestrator (V0.8-C).
 *
 * When an aircraft is parked at a gate for a flight, it creates the four
 * turnaround tasks (BAGGAGE → CLEANING → REFUELING → BOARDING_SERVICE) and
 * drives them one at a time: claim a matching idle vehicle, wait for it to
 * reach the aircraft, run the work timer, then send the vehicle home. The
 * flight cannot push back until every task is COMPLETED (checked separately by
 * GameState.areGroundOperationsComplete via AircraftRoute — spec §30).
 *
 * No Three.js. Reads / writes GameState.groundOperations + groundVehicles
 * (through GroundVehicleManager). Passenger / aircraft / flight systems are
 * untouched — they relate only by id (spec §75).
 */
export class GroundOperationManager {
  /** flightId -> ops already created, so a turnaround is built exactly once. */
  private readonly turnaroundStarted = new Set<string>();
  /** flightId -> "ready for departure" notice already shown. */
  private readonly readyAnnounced = new Set<string>();
  /** operationId -> game-seconds it has sat PENDING (for the delay check). */
  private readonly pendingTime = new Map<string, number>();
  /** Recent finished tasks — true = it was delayed waiting for a resource (§38). */
  private readonly recentOps: boolean[] = [];
  /** operationIds currently blocked because no matching staff is free (§D.4). */
  private readonly staffBlocked = new Set<string>();
  /** Roles a "hire staff" notice has already been shown for. */
  private readonly staffRequiredAnnounced = new Set<string>();

  constructor(
    private readonly state: GameState,
    private readonly vehicles: GroundVehicleManager,
    private readonly staff: StaffManager,
  ) {
    this.recomputeEfficiency();
  }

  update(deltaTime: number): GroundOperationsTick {
    const notices: string[] = [];
    this.ensureTurnarounds();
    this.advanceOperations(deltaTime, notices);
    this.announceReady(notices);
    this.pruneFinished();
    return { notices };
  }

  /**
   * A curated feed for the Ground Operations HUD panel (spec §45): the task
   * currently being worked for each active turnaround, then the most recently
   * completed tasks, newest first, capped at `limit`.
   */
  recentActivity(limit = 6): GroundOpActivity[] {
    const rows: GroundOpActivity[] = [];

    for (const flightId of this.turnaroundStarted) {
      const cur = nextPendingOperation(
        this.state.getGroundOperationsForFlight(flightId),
      );
      if (cur) rows.push(this.toActivity(cur));
    }

    const done = this.state.data.groundOperations
      .filter((o) => o.state === "COMPLETED")
      .sort(
        (a, b) =>
          (b.completedAt ?? 0) - (a.completedAt ?? 0) ||
          b.id.localeCompare(a.id),
      );
    for (const op of done) {
      if (rows.length >= limit) break;
      rows.push(this.toActivity(op));
    }

    return rows.slice(0, limit);
  }

  private toActivity(op: GroundOperationData): GroundOpActivity {
    return {
      flightId: op.flightId,
      type: op.type,
      state: op.state,
      role: roleForOperation(op.type),
      staffName: this.state.getStaff(op.staffId)?.name,
      needsStaff: this.staffBlocked.has(op.id),
    };
  }

  // --------------------------------------------------------------- internals

  /** Build the four-task turnaround for any parked aircraft that lacks one. */
  private ensureTurnarounds(): void {
    for (const ac of this.state.data.aircraft) {
      if (ac.state !== "PARKED" || !ac.currentFlightId) continue;
      if (this.turnaroundStarted.has(ac.currentFlightId)) continue;

      const flight = this.state.getFlight(ac.currentFlightId);
      if (!flight || isFlightOver(flight.state)) continue;

      const gateId = flight.gateId ?? ac.homeGateId ?? "";
      const now = Date.now();
      for (const type of TURNAROUND_SEQUENCE) {
        this.state.addGroundOperation(
          createGroundOperation(
            this.state.nextGroundOperationId(),
            flight.id,
            ac.id,
            gateId,
            type,
            now,
          ),
        );
      }
      this.turnaroundStarted.add(flight.id);
    }
  }

  /**
   * Advance the current task for every in-progress turnaround. Only the first
   * unfinished task (in sequence order) is worked at a time (spec §25).
   *
   * A task needs BOTH a role-matched staff member AND a matching vehicle before
   * it starts — staff is claimed first (spec §D.2). It stays PENDING (never
   * fails) while either is unavailable (spec §D.4).
   */
  private advanceOperations(deltaTime: number, notices: string[]): void {
    for (const flightId of this.turnaroundStarted) {
      const ops = this.state.getGroundOperationsForFlight(flightId);
      const op = nextPendingOperation(ops);
      if (!op) continue;

      switch (op.state) {
        case "PENDING": {
          this.pendingTime.set(
            op.id,
            (this.pendingTime.get(op.id) ?? 0) + deltaTime,
          );
          if (!op.staffId) this.tryAssignStaff(op, notices);
          if (op.staffId && !op.vehicleId) this.tryAssignVehicle(op);
          if (op.staffId && op.vehicleId) this.markAssigned(op);
          break;
        }
        case "ASSIGNED": {
          const vehReady =
            !op.vehicleId || this.vehicles.isAtWork(op.vehicleId);
          const staffReady = !op.staffId || this.staff.isAtWork(op.staffId);
          if (vehReady && staffReady) {
            op.state = "IN_PROGRESS";
            op.startedAt = Date.now();
            op.duration = this.workDuration(op);
            notices.push(
              `${OP_ICON[op.type] ?? "🔧"} ${stateLabel(op.type)} 시작`,
            );
          }
          break;
        }
        case "IN_PROGRESS":
          op.elapsed = (op.elapsed ?? 0) + deltaTime;
          if (canCompleteGroundOperation(op)) {
            this.completeOperation(op, notices);
          }
          break;
        default:
          break;
      }
    }
  }

  /** Base task time scaled by the assigned staff member's skill (spec §D.3). */
  private workDuration(op: GroundOperationData): number {
    const base = getGroundOperationDuration(op.type);
    const staff = this.state.getStaff(op.staffId);
    return staff ? base * staffSkillModifier(staff.skill) : base;
  }

  /** Claim a role-matched idle staff member for a task (spec §C.1, §C.2). */
  private tryAssignStaff(op: GroundOperationData, notices: string[]): void {
    const role = roleForOperation(op.type);
    const staff = this.state.idleStaffForRole(role);
    if (!staff) {
      this.staffBlocked.add(op.id); // "STAFF REQUIRED" — the task waits (§D.4)
      // If the airport has NO staff of this role at all, prompt the player once.
      if (
        this.state.getStaffByRole(role).length === 0 &&
        !this.staffRequiredAnnounced.has(role)
      ) {
        this.staffRequiredAnnounced.add(role);
        notices.push(`⚠ 직원 필요: ${staffRoleLabel(role)}`);
      }
      return;
    }
    if (this.staff.assign(staff.id, op.id)) {
      op.staffId = staff.id;
      this.staffBlocked.delete(op.id);
      this.staffRequiredAnnounced.delete(role);
    }
  }

  private tryAssignVehicle(op: GroundOperationData): void {
    const type = vehicleTypeForOperation(op.type) as GroundVehicleType;
    const vehicle = this.state.idleGroundVehicle(type);
    if (!vehicle) return; // busy — the task waits (spec §35, §36)
    if (this.vehicles.dispatch(vehicle.id, op.id)) {
      op.vehicleId = vehicle.id;
    }
  }

  /** Move a task to ASSIGNED and flag it delayed if it waited too long (§35). */
  private markAssigned(op: GroundOperationData): void {
    op.state = "ASSIGNED";
    this.staffBlocked.delete(op.id);
    const waited = this.pendingTime.get(op.id) ?? 0;
    this.pendingTime.delete(op.id);
    if (waited > C.ground.pendingDelayThreshold) {
      op.delayed = true;
      const flight = this.state.getFlight(op.flightId);
      if (flight) flight.turnaroundDelayed = true;
    }
  }

  private completeOperation(
    op: GroundOperationData,
    notices: string[],
  ): void {
    const vehicleId = op.vehicleId ?? null;
    const staffId = op.staffId ?? null;
    const vehicleType = vehicleTypeForOperation(op.type);
    const role = roleForOperation(op.type);
    this.state.completeGroundOperation(op.id); // clears vehicleId + staffId
    this.recordCompletion(op);
    notices.push(`${OP_ICON[op.type] ?? "🔧"} ${stateLabel(op.type)} 완료`);

    // Shuttle the vehicle / staff straight to another gate that needs them,
    // else send them home.
    if (vehicleId) {
      const w = this.findWaitingOperation(vehicleType);
      if (w && this.vehicles.redirect(vehicleId, w.id)) w.vehicleId = vehicleId;
      else this.vehicles.recall(vehicleId);
    }
    if (staffId) {
      const w = this.findWaitingOperationForRole(role);
      if (w && this.staff.redirect(staffId, w.id)) w.staffId = staffId;
      else this.staff.recall(staffId);
    }
  }

  /** Track the recent-history summary and recompute ground efficiency (§38). */
  private recordCompletion(op: GroundOperationData): void {
    this.recentOps.push(op.delayed === true);
    if (this.recentOps.length > C.ground.recentWindow) this.recentOps.shift();
    this.recomputeEfficiency();
  }

  private recomputeEfficiency(): void {
    const facilityCount = this.state.data.buildings.filter((b) =>
      isServiceFacility(b.type),
    ).length;
    this.state.operations.groundEfficiency = computeGroundEfficiency({
      vehicleCount: this.state.data.groundVehicles.length,
      facilityCount,
      recentCompleted: this.recentOps.length,
      recentDelayed: this.recentOps.filter(Boolean).length,
    });
  }

  /** A PENDING task, next-in-sequence for its flight, still needing this vehicle type. */
  private findWaitingOperation(
    vehicleType: string,
  ): GroundOperationData | undefined {
    for (const flightId of this.turnaroundStarted) {
      const op = nextPendingOperation(
        this.state.getGroundOperationsForFlight(flightId),
      );
      if (
        op &&
        op.state === "PENDING" &&
        !op.vehicleId &&
        vehicleTypeForOperation(op.type) === vehicleType
      ) {
        return op;
      }
    }
    return undefined;
  }

  /** A PENDING task, next-in-sequence for its flight, still needing this role. */
  private findWaitingOperationForRole(
    role: string,
  ): GroundOperationData | undefined {
    for (const flightId of this.turnaroundStarted) {
      const op = nextPendingOperation(
        this.state.getGroundOperationsForFlight(flightId),
      );
      if (
        op &&
        op.state === "PENDING" &&
        !op.staffId &&
        roleForOperation(op.type) === role
      ) {
        return op;
      }
    }
    return undefined;
  }

  /** One "ready for departure" notice once every task for a flight is done. */
  private announceReady(notices: string[]): void {
    for (const flightId of this.turnaroundStarted) {
      if (this.readyAnnounced.has(flightId)) continue;
      const ops = this.state.getGroundOperationsForFlight(flightId);
      if (ops.length === 0) continue;
      if (ops.every((o) => o.state === "COMPLETED")) {
        notices.push(`✈ ${flightId} 출발 준비 완료`);
        this.readyAnnounced.add(flightId);
      }
    }
  }

  /** Drop bookkeeping for flights that have finished. */
  private pruneFinished(): void {
    for (const flightId of [...this.turnaroundStarted]) {
      const flight = this.state.getFlight(flightId);
      if (!flight || isFlightOver(flight.state)) {
        this.turnaroundStarted.delete(flightId);
        this.readyAnnounced.delete(flightId);
        for (const op of this.state.getGroundOperationsForFlight(flightId)) {
          this.pendingTime.delete(op.id);
          this.staffBlocked.delete(op.id);
        }
      }
    }
  }
}
