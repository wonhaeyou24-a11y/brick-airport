import type { Vec3 } from "../core/GameState";

/**
 * FlightConfig — scheduling tuning numbers, kept apart from the scheduler so
 * they are easy to rebalance later. Zero imports of game logic, no Three.js.
 *
 * These are V0.4-B *verification* values (short cycles so the loop is visible
 * in a quick test), not a final balance pass.
 */
export const FLIGHT_CONFIG = {
  /** Seconds after game start before the first extra flight is requested. */
  initialSpawnDelay: 15,
  /** Seconds between flight requests after that. */
  spawnInterval: 30,
  /**
   * Hard ceiling on concurrent aircraft. The effective cap is the smaller of
   * this and the current gate count, so the airport never has more planes than
   * it can park — and it grows automatically when the player builds gates.
   */
  maxActiveAircraft: 4,
  /** Most flight requests that may wait for a free gate at once. */
  maxPendingFlights: 3,
  /** Default capacity for a scheduled arrival. */
  defaultCapacity: 6,
  /** Where a new arrival appears (out past the approach, airborne). */
  arrivalSpawn: { x: 56, y: 12, z: 14 } as Vec3,
} as const;
