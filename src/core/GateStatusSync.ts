import type { GameState, GateData, GateStatus } from "./GameState";

/**
 * GateStatusSync — keeps every gate's *operational* status in sync with the
 * aircraft lifecycle and passenger boarding, each frame.
 *
 *   AVAILABLE  — no aircraft, or an aircraft is still inbound (not PARKED yet)
 *   BOARDING   — aircraft PARKED, departure passengers still boarding
 *   READY      — aircraft PARKED, every departure passenger has BOARDED
 *   DEPARTING  — aircraft has pushed back (releaseGate ran); brief linger so
 *                the player sees the gate empty out, then -> AVAILABLE
 *
 * Data-first: reads / writes GameState.gates only, no Three.js. The internal
 * reservation ("this gate is spoken for") is still `gate.aircraftId !== null`
 * and is untouched — FlightScheduler / AircraftRoute reservation logic keeps
 * working exactly as in V0.4-B (spec §2, §10).
 */

/** Seconds a gate shows DEPARTING after the aircraft pushes back. */
const DEPARTING_LINGER = 1.5;

export class GateStatusSync {
  /** gateId -> seconds left in the DEPARTING linger. */
  private readonly departing = new Map<string, number>();

  constructor(private readonly state: GameState) {}

  update(deltaTime: number): void {
    for (const gate of this.state.data.gates) {
      if (gate.status === "DEPARTING") {
        this.tickDeparting(gate, deltaTime);
        continue;
      }
      this.departing.delete(gate.id);
      gate.status = this.compute(gate);
    }
  }

  private tickDeparting(gate: GateData, deltaTime: number): void {
    const left = (this.departing.get(gate.id) ?? DEPARTING_LINGER) - deltaTime;
    if (left > 0) {
      this.departing.set(gate.id, left);
      return;
    }
    // Linger done — the gate is truly free now.
    this.departing.delete(gate.id);
    gate.aircraftId = null;
    gate.status = "AVAILABLE";
  }

  private compute(gate: GateData): GateStatus {
    if (!gate.aircraftId) return "AVAILABLE";

    const aircraft = this.state.getAircraft(gate.aircraftId);
    // Reserved but the aircraft is still inbound — nothing happening here yet.
    if (!aircraft || aircraft.state !== "PARKED") return "AVAILABLE";

    const board = this.state.getAircraftBoarding(gate.aircraftId);
    if (board.total > 0 && board.boarded >= board.total) return "READY";
    return "BOARDING";
  }
}
