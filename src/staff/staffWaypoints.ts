import type { Vec3 } from "../core/GameState";

/**
 * staffWaypoints — fixed points a staff member walks between (V0.9-B).
 *
 * Pure data / maths, no Three.js. NOT pathfinding (spec §C.4, §D.4): a room
 * slot, one apron-side walkway, and a work spot beside the aircraft — the same
 * waypoint style the vehicle / passenger routes use.
 */

/** World z of the staff walkway on the apron, between the gates and terminal. */
export const STAFF_LANE_Z = 9.4;

/** A point on the staff walkway at world x. */
export function staffLanePoint(x: number): Vec3 {
  return { x, y: 0, z: STAFF_LANE_Z };
}

/**
 * Where a staff member stands to work — beside the parked aircraft, offset from
 * the vehicle's work spot so they don't overlap (spec §52 — no collision).
 */
export function staffWorkPosition(park: Vec3): Vec3 {
  return { x: park.x + 1.5, y: 0, z: park.z - 0.7 };
}

/** Room slot → onto the walkway → across to the gate → in to the work spot. */
export function pathToGate(home: Vec3, park: Vec3): Vec3[] {
  return [
    staffLanePoint(home.x),
    staffLanePoint(park.x + 1.5),
    staffWorkPosition(park),
  ];
}

/** Work spot → back onto the walkway → across to the room x → into the slot. */
export function pathToRoom(home: Vec3, park: Vec3): Vec3[] {
  return [
    staffLanePoint(park.x + 1.5),
    staffLanePoint(home.x),
    { ...home },
  ];
}
