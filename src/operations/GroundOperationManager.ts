import type {
  GameState,
  GroundOperationData,
  GroundOperationState,
  GroundOperationType,
} from "../core/GameState";
import { isFlightOver, isServiceFacility } from "../core/GameState";
import type { GroundVehicleManager } from "../vehicles/GroundVehicleManager";
import {
  TURNAROUND_SEQUENCE,
  canCompleteGroundOperation,
  createGroundOperation,
  nextPendingOperation,
  vehicleTypeForOperation,
} from "./GroundOperation";
import { computeGroundEfficiency } from "./AirportOperations";
import { OPERATIONS_CONFIG as C } from "./OperationsConfig";
import type { GroundVehicleType } from "../core/GameState";

/** What Game must act on after a ground-operations tick. */
export interface GroundOperationsTick {
  /** Short strings for the HUD notice system (spec §47). */
  notices: string[];
}

/** One row of the Ground Operations HUD panel (spec §45). */
export interface GroundOpActivity {
  flightId: string;
  type: GroundOperationType;
  state: GroundOperationState;
}

const OP_ICON: Record<string, string> = {
  BAGGAGE: "🧳",
  CLEANING: "🧽",
  REFUELING: "⛽",
  BOARDING_SERVICE: "👥",
};

function opWords(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  /** Recent finished tasks — true = it was delayed waiting for a vehicle (§38). */
  private readonly recentOps: boolean[] = [];

  constructor(
    private readonly state: GameState,
    private readonly vehicles: GroundVehicleManager,
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
      if (cur) rows.push({ flightId, type: cur.type, state: cur.state });
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
      rows.push({ flightId: op.flightId, type: op.type, state: op.state });
    }

    return rows.slice(0, limit);
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
   */
  private advanceOperations(deltaTime: number, notices: string[]): void {
    for (const flightId of this.turnaroundStarted) {
      const ops = this.state.getGroundOperationsForFlight(flightId);
      const op = nextPendingOperation(ops);
      if (!op) continue;

      switch (op.state) {
        case "PENDING":
          this.pendingTime.set(
            op.id,
            (this.pendingTime.get(op.id) ?? 0) + deltaTime,
          );
          this.tryAssignVehicle(op, notices);
          break;
        case "ASSIGNED":
          if (op.vehicleId && this.vehicles.isAtWork(op.vehicleId)) {
            op.state = "IN_PROGRESS";
            op.startedAt = Date.now();
          }
          break;
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

  private tryAssignVehicle(op: GroundOperationData, notices: string[]): void {
    const type = vehicleTypeForOperation(op.type) as GroundVehicleType;
    const vehicle = this.state.idleGroundVehicle(type);
    if (!vehicle) return; // busy — the task waits (spec §35, §36)

    if (this.vehicles.dispatch(vehicle.id, op.id)) {
      this.markAssigned(op, vehicle.id);
      notices.push(`${OP_ICON[op.type] ?? "🔧"} ${opWords(op.type)} started`);
    }
  }

  /** Attach a vehicle to a task and flag it delayed if it waited too long (§35). */
  private markAssigned(op: GroundOperationData, vehicleId: string): void {
    op.state = "ASSIGNED";
    op.vehicleId = vehicleId;
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
    const vehicleType = vehicleTypeForOperation(op.type);
    this.state.completeGroundOperation(op.id);
    this.recordCompletion(op);
    notices.push(`${OP_ICON[op.type] ?? "🔧"} ${opWords(op.type)} completed`);

    if (!vehicleId) return;

    // Shuttle the vehicle straight to another gate that needs it, if any —
    // otherwise send it home.
    const waiting = this.findWaitingOperation(vehicleType, op.id);
    if (waiting && this.vehicles.redirect(vehicleId, waiting.id)) {
      this.markAssigned(waiting, vehicleId);
      notices.push(`${OP_ICON[waiting.type] ?? "🔧"} ${opWords(waiting.type)} started`);
    } else {
      this.vehicles.recall(vehicleId);
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

  /** A PENDING task, next-in-sequence for its flight, that needs this vehicle type. */
  private findWaitingOperation(
    vehicleType: string,
    excludeOpId: string,
  ): GroundOperationData | undefined {
    for (const flightId of this.turnaroundStarted) {
      const ops = this.state.getGroundOperationsForFlight(flightId);
      const op = nextPendingOperation(ops);
      if (
        op &&
        op.id !== excludeOpId &&
        op.state === "PENDING" &&
        vehicleTypeForOperation(op.type) === vehicleType
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
        notices.push(`✈ Flight ${flightId} ready for departure`);
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
        }
      }
    }
  }
}
