import type { GameState, GroundOperationData } from "../core/GameState";
import { isFlightOver } from "../core/GameState";
import type { GroundVehicleManager } from "../vehicles/GroundVehicleManager";
import {
  TURNAROUND_SEQUENCE,
  canCompleteGroundOperation,
  createGroundOperation,
  nextPendingOperation,
  vehicleTypeForOperation,
} from "./GroundOperation";
import type { GroundVehicleType } from "../core/GameState";

/** What Game must act on after a ground-operations tick. */
export interface GroundOperationsTick {
  /** Short strings for the HUD notice system (spec §47). */
  notices: string[];
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

  constructor(
    private readonly state: GameState,
    private readonly vehicles: GroundVehicleManager,
  ) {}

  update(deltaTime: number): GroundOperationsTick {
    const notices: string[] = [];
    this.ensureTurnarounds();
    this.advanceOperations(deltaTime, notices);
    this.announceReady(notices);
    this.pruneFinished();
    return { notices };
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
      op.state = "ASSIGNED";
      op.vehicleId = vehicle.id;
      notices.push(`${OP_ICON[op.type] ?? "🔧"} ${opWords(op.type)} started`);
    }
  }

  private completeOperation(
    op: GroundOperationData,
    notices: string[],
  ): void {
    const vehicleId = op.vehicleId ?? null;
    const vehicleType = vehicleTypeForOperation(op.type);
    this.state.completeGroundOperation(op.id);
    notices.push(`${OP_ICON[op.type] ?? "🔧"} ${opWords(op.type)} completed`);

    if (!vehicleId) return;

    // Shuttle the vehicle straight to another gate that needs it, if any —
    // otherwise send it home.
    const waiting = this.findWaitingOperation(vehicleType, op.id);
    if (waiting && this.vehicles.redirect(vehicleId, waiting.id)) {
      waiting.state = "ASSIGNED";
      waiting.vehicleId = vehicleId;
      notices.push(`${OP_ICON[waiting.type] ?? "🔧"} ${opWords(waiting.type)} started`);
    } else {
      this.vehicles.recall(vehicleId);
    }
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
      }
    }
  }
}
