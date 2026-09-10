import type {
  GroundOperationData,
  GroundOperationState,
  GroundOperationType,
} from "../core/GameState";
import { isGroundOperationOver } from "../core/GameState";
import { OPERATIONS_CONFIG as C } from "./OperationsConfig";

/**
 * GroundOperation — pure turnaround-task logic (V0.8-A). No Three.js, no
 * GameState mutation, no side effects: every function takes plain values and
 * returns a value. Orchestration (when to create, assign vehicles, advance
 * state) lives in GroundOperationManager.
 *
 * The task state machine — PENDING → ASSIGNED → IN_PROGRESS → COMPLETED — is a
 * SEPARATE concept from AircraftState, FlightState and vehicle state (spec §7,
 * §17, §75).
 */

/** The turnaround tasks, in the order they must run (spec §25). */
export const TURNAROUND_SEQUENCE: readonly GroundOperationType[] =
  C.ground.sequence;

/** Work time (game-seconds) a task of this type needs (spec §26). */
export function getGroundOperationDuration(type: GroundOperationType): number {
  return C.ground.duration[type] ?? 1.5;
}

/** The ground-vehicle type that performs a task of this type. */
export function vehicleTypeForOperation(type: GroundOperationType): string {
  return C.ground.vehicleForType[type] ?? "SERVICE_VEHICLE";
}

/** Build a fresh PENDING ground operation. Pure — the caller adds it to state. */
export function createGroundOperation(
  id: string,
  flightId: string,
  aircraftId: string,
  gateId: string,
  type: GroundOperationType,
  now: number,
): GroundOperationData {
  return {
    id,
    flightId,
    aircraftId,
    gateId,
    type,
    state: "PENDING",
    createdAt: now,
    duration: getGroundOperationDuration(type),
    elapsed: 0,
    vehicleId: null,
  };
}

/**
 * The next task that still needs work for a flight: the first, in sequence
 * order, that is not COMPLETED / CANCELLED. undefined when the turnaround is
 * done. Enforces the sequential ordering (spec §25) — later tasks are not
 * eligible until the earlier ones finish.
 */
export function nextPendingOperation(
  ops: readonly GroundOperationData[],
): GroundOperationData | undefined {
  for (const type of TURNAROUND_SEQUENCE) {
    const op = ops.find((o) => o.type === type);
    if (op && !isGroundOperationOver(op.state)) return op;
  }
  return undefined;
}

/** True when every task for a flight is finished (spec §27, §30). */
export function areOperationsComplete(
  ops: readonly GroundOperationData[],
): boolean {
  return ops.every((o) => isGroundOperationOver(o.state));
}

/**
 * True when a task may begin work: it has a vehicle in position and is not
 * already running / finished.
 */
export function canStartGroundOperation(
  op: GroundOperationData,
  vehicleInPosition: boolean,
): boolean {
  if (isGroundOperationOver(op.state)) return false;
  return op.state === "ASSIGNED" && vehicleInPosition;
}

/** True when a running task has done enough work to finish. */
export function canCompleteGroundOperation(op: GroundOperationData): boolean {
  if (op.state !== "IN_PROGRESS") return false;
  return (op.elapsed ?? 0) >= op.duration;
}

/** Compact per-task status glyph for the aircraft-turnaround HUD (spec §42). */
export function operationGlyph(state: GroundOperationState): string {
  switch (state) {
    case "COMPLETED":
      return "✓";
    case "IN_PROGRESS":
      return "●";
    case "ASSIGNED":
      return "◐";
    case "CANCELLED":
      return "×";
    default:
      return "○";
  }
}
