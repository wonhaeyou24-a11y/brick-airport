import type { Vec3 } from "../core/GameState";

/**
 * Passenger waypoints — fixed world positions for the airport walk paths.
 *
 * Pure data, no Three.js. Terminal-area points are chosen to sit on the apron
 * *in front of* the terminal (terminal front face ~z=12), so passengers stay
 * visible and never clip through the building. Gate-relative points are derived
 * from GateData.parkPosition so dynamically built gates (G-04, G-05 …) work
 * automatically (spec §7, §13, §24).
 */
export interface PassengerWaypoints {
  /** Where departure passengers gather / arrival passengers exit. */
  terminalEntrance: Vec3;
  checkIn: Vec3;
  security: Vec3;
  /** Final point for arrival passengers before they are removed. */
  arrivalArea: Vec3;
}

export const DEFAULT_WAYPOINTS: PassengerWaypoints = {
  terminalEntrance: { x: -6, y: 0, z: 10.5 },
  checkIn: { x: -2, y: 0, z: 11 },
  security: { x: 3, y: 0, z: 10.5 },
  arrivalArea: { x: -9, y: 0, z: 11 },
};

/** Point beside the parked aircraft where boarding / disembarking happens. */
export function boardingPoint(park: Vec3): Vec3 {
  return { x: park.x + 1.8, y: 0, z: park.z + 0.4 };
}

/** Point at the gate, between the aircraft and the terminal frontage. */
export function gateApproach(park: Vec3): Vec3 {
  return { x: park.x, y: 0, z: park.z + 2.4 };
}
