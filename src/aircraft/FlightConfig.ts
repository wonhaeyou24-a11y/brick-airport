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
  /** Home city shown as the origin of every departure flight (V0.6-C). */
  homeCity: "SEOUL",
} as const;

/**
 * DestinationConfig — one place a departure flight can go (V0.7-B).
 *
 * Kept intentionally small (spec §13); more destinations / weighting come in a
 * later version. `revenueMultiplier` is reserved for a future economy pass and
 * is NOT applied to revenue in V0.7 (spec §57).
 */
export interface DestinationConfig {
  /** Stable id, also the label shown in a route ("SEOUL → TOKYO"). */
  id: string;
  /** Display name. */
  name: string;
  /** Airport level required before flights here are scheduled (spec §15). */
  requiredLevel: number;
  /** Relative demand. 1.0 for every destination in V0.7 (spec §17). */
  demand: number;
  /** Nominal game-seconds budget; the flight is on-time if it finishes within. */
  flightDuration: number;
  /** Reserved for a later economy pass — unused in V0.7. */
  revenueMultiplier: number;
}

// flightDuration is a game-seconds budget for the on-time check. A normal
// SCHEDULED→FLYING cycle runs ~20–32s, so these leave headroom for a busy
// airport while a FLIGHT_DELAY (+OPERATIONS_CONFIG.flightDelaySeconds) reliably
// pushes a flight over its budget.
export const DESTINATIONS: readonly DestinationConfig[] = [
  { id: "TOKYO", name: "Tokyo", requiredLevel: 1, demand: 1, flightDuration: 44, revenueMultiplier: 1 },
  { id: "BUSAN", name: "Busan", requiredLevel: 1, demand: 1, flightDuration: 40, revenueMultiplier: 1 },
  { id: "BANGKOK", name: "Bangkok", requiredLevel: 2, demand: 1, flightDuration: 52, revenueMultiplier: 1 },
  { id: "PARIS", name: "Paris", requiredLevel: 3, demand: 1, flightDuration: 62, revenueMultiplier: 1 },
];

/** Destinations unlocked at `level` (never empty — falls back to the first). */
export function availableDestinations(level: number): readonly DestinationConfig[] {
  const pool = DESTINATIONS.filter((d) => d.requiredLevel <= level);
  return pool.length > 0 ? pool : [DESTINATIONS[0]];
}

/** Look up a destination by id (for the on-time budget at completion). */
export function getDestination(id: string): DestinationConfig | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}
