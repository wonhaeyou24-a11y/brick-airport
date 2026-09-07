import type {
  AircraftState,
  FlightRouteType,
  FlightState,
  GameStateData,
} from "../core/GameState";
import { isFlightOver } from "../core/GameState";

/**
 * FlightLifecycle — pure Flight-state logic (V0.6-B). No Three.js, no GameState
 * mutation, no side effects: every function takes a plain snapshot and returns
 * a value.
 *
 * The Flight state machine is a SEPARATE concept from AircraftState. One
 * aircraft flies many flights; this module maps the aircraft's 5 states
 * (PARKED / TAXIING / TAKEOFF / FLYING / LANDING) plus boarding progress onto
 * the flight's lifecycle:
 *
 *   SCHEDULED -> BOARDING -> READY -> DEPARTING -> FLYING -> (ARRIVING) -> COMPLETED
 *
 * Flight state only ever moves FORWARD (deriveFlightState never regresses it),
 * which keeps the taxi-out / taxi-in ambiguity of AircraftState "TAXIING" from
 * dragging a departed flight back to BOARDING.
 */

/** Forward progression order. COMPLETED / CANCELLED are terminal (handled apart). */
const FLIGHT_STATE_ORDER: readonly FlightState[] = [
  "SCHEDULED",
  "BOARDING",
  "READY",
  "DEPARTING",
  "FLYING",
  "ARRIVING",
  "COMPLETED",
];

/** Rank of a flight state in the forward progression (CANCELLED === -1). */
export function flightStateRank(state: FlightState): number {
  if (state === "CANCELLED") return -1;
  return FLIGHT_STATE_ORDER.indexOf(state);
}

/** Snapshot the derivation needs — assembled by the caller from GameState. */
export interface FlightSnapshot {
  routeType: FlightRouteType;
  /** null when no aircraft is linked yet (flight still SCHEDULED). */
  aircraftState: AircraftState | null;
  /** Departure passengers that have BOARDED. */
  boarded: number;
  /** Departure passengers assigned to the flight. */
  total: number;
  /** The aircraft has reached TAKEOFF at least once since this flight began. */
  departed: boolean;
}

/** True once every assigned passenger has boarded (or there are none). */
export function boardingComplete(snap: FlightSnapshot): boolean {
  return snap.total === 0 || snap.boarded >= snap.total;
}

/**
 * The flight state implied purely by the current aircraft state + boarding,
 * ignoring forward-only clamping. Kept separate so it is easy to test.
 */
function impliedState(current: FlightState, snap: FlightSnapshot): FlightState {
  switch (snap.aircraftState) {
    case null:
      return "SCHEDULED";
    case "LANDING":
      // Inbound before boarding is still SCHEDULED; a plane landing after it has
      // already flown its flight is ARRIVING at the (unsimulated) destination.
      return flightStateRank(current) >= flightStateRank("DEPARTING")
        ? "ARRIVING"
        : "SCHEDULED";
    case "PARKED":
      return boardingComplete(snap) && snap.total > 0 ? "READY" : "BOARDING";
    case "TAXIING":
      // Taxi-out only means DEPARTING once boarding finished; otherwise the
      // aircraft is still manoeuvring at the gate.
      return flightStateRank(current) >= flightStateRank("READY")
        ? "DEPARTING"
        : "BOARDING";
    case "TAKEOFF":
      return "DEPARTING";
    case "FLYING":
      return snap.departed ? "FLYING" : "SCHEDULED";
  }
}

/**
 * Derive the next flight state. Terminal states (COMPLETED / CANCELLED) are
 * never changed. Otherwise the flight moves to the implied state, but only if
 * that is strictly forward of where it is now.
 */
export function deriveFlightState(
  current: FlightState,
  snap: FlightSnapshot,
): FlightState {
  if (isFlightOver(current)) return current;
  const implied = impliedState(current, snap);
  return flightStateRank(implied) > flightStateRank(current) ? implied : current;
}

/**
 * True when the aircraft may push back for this flight: it is parked, every
 * passenger has boarded, and the flight has not already left / finished.
 */
export function canDepart(current: FlightState, snap: FlightSnapshot): boolean {
  if (isFlightOver(current)) return false;
  if (flightStateRank(current) >= flightStateRank("DEPARTING")) return false;
  return snap.aircraftState === "PARKED" && boardingComplete(snap);
}

/**
 * True when the flight can be marked COMPLETED: the aircraft has departed and
 * is airborne and outbound (FLYING), and the flight is not already over.
 */
export function canComplete(current: FlightState, snap: FlightSnapshot): boolean {
  if (isFlightOver(current)) return false;
  if (!snap.departed) return false;
  return (
    snap.aircraftState === "FLYING" ||
    flightStateRank(current) >= flightStateRank("FLYING")
  );
}

/**
 * Dev-only consistency check (spec V0.6-C, optional). Pure: walks the state and
 * returns a list of relation problems. Empty array === healthy. Never throws,
 * never mutates — safe to call from the console.
 */
export function validateFlightRelations(data: GameStateData): string[] {
  const problems: string[] = [];
  const aircraftIds = new Set(data.aircraft.map((a) => a.id));
  const gateIds = new Set(data.gates.map((g) => g.id));
  const flightIds = new Set(data.flights.map((f) => f.id));
  const passengerById = new Map(data.passengers.map((p) => [p.id, p]));

  for (const f of data.flights) {
    if (!isFlightOver(f.state) && f.aircraftId && !aircraftIds.has(f.aircraftId)) {
      problems.push(`flight ${f.id}: active but aircraft ${f.aircraftId} is gone`);
    }
    if (f.gateId && !gateIds.has(f.gateId)) {
      problems.push(`flight ${f.id}: gate ${f.gateId} does not exist`);
    }
    for (const pid of f.passengerIds) {
      const p = passengerById.get(pid);
      if (p && p.flightId !== f.id) {
        problems.push(
          `flight ${f.id}: passenger ${pid} points at flight ${p.flightId ?? "—"}`,
        );
      }
    }
  }

  for (const p of data.passengers) {
    if (p.flightId && !flightIds.has(p.flightId)) {
      problems.push(`passenger ${p.id}: flight ${p.flightId} does not exist`);
    }
  }

  for (const a of data.aircraft) {
    if (a.currentFlightId && !flightIds.has(a.currentFlightId)) {
      problems.push(
        `aircraft ${a.id}: currentFlightId ${a.currentFlightId} does not exist`,
      );
    }
  }

  return problems;
}
