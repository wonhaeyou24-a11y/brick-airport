import type { Vec3 } from "../core/GameState";

/**
 * vehicleWaypoints — fixed points a ground vehicle drives between (V0.8-B).
 *
 * Pure data / maths, no Three.js. Deliberately NOT pathfinding (spec §15, §50):
 * a depot slot, one service lane along the ramp side of the apron, and a work
 * spot derived from the gate's park position — the same waypoint style the
 * passenger and aircraft routes use.
 */

/** World z of the perimeter service lane, along the north edge of the runway. */
export const SERVICE_LANE_Z = 4.2;

/** A point on the service lane at world x. */
export function serviceLanePoint(x: number): Vec3 {
  return { x, y: 0, z: SERVICE_LANE_Z };
}

/** Where a vehicle stops to work — ramp side of the parked aircraft. */
export function workPosition(park: Vec3): Vec3 {
  return { x: park.x, y: 0, z: park.z - 1.6 };
}

/** Depot slot → onto the lane → across to the gate → in to the work spot. */
export function pathToGate(home: Vec3, park: Vec3): Vec3[] {
  return [
    serviceLanePoint(home.x),
    serviceLanePoint(park.x),
    workPosition(park),
  ];
}

/** Work spot → back onto the lane → across to the depot x → into the slot. */
export function pathToDepot(home: Vec3, park: Vec3): Vec3[] {
  return [
    serviceLanePoint(park.x),
    serviceLanePoint(home.x),
    { ...home },
  ];
}
