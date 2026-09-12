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
   * Floor on concurrent aircraft, not a ceiling: FlightScheduler.effectiveCap
   * is the LARGEST of this, the gate count, and the runway-derived cap below,
   * so building gates or runways always raises capacity, never lowers it.
   */
  maxActiveAircraft: 4,
  /** Most flight requests that may wait for a free gate at once. */
  maxPendingFlights: 3,
  /**
   * V2.2 balance pass — RUNWAY cost 8,000 (the 2nd-priciest building) and its
   * BuildMenu description already promised "increases takeoff/landing
   * capacity," but nothing read the runway count anywhere: a building whose
   * entire benefit was fake (audit's "buildings with no meaningful benefit").
   * Concurrent-aircraft capacity contributed per RUNWAY built, the same
   * Math.max-floor pattern gates already use in effectiveCap. 4 keeps the
   * airport's starting runway a no-op (matches the maxActiveAircraft floor),
   * so only a genuinely-built extra runway raises the ceiling.
   */
  aircraftPerRunway: 4,
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

// flightDuration is a game-seconds budget for the on-time check. Since V0.9 a
// normal SCHEDULED→FLYING cycle runs ~28–42s (arrival + staffed turnaround +
// boarding + departure), so these leave headroom for a busy airport while a
// FLIGHT_DELAY (+OPERATIONS_CONFIG.flightDelaySeconds) reliably pushes a flight
// over budget.
// V2.1 content expansion — revenueMultiplier is now actually applied
// (Economy.settleBoarding(), previously a reserved no-op field per this
// file's own old comment), so route choice has a real economic difference:
// short domestic hops pay less per ticket, long-haul international routes
// pay more. Two new destinations gated at the new Lv.4/Lv.5 tiers
// (AirportProgression.LEVEL_REQUIREMENTS) give those levels a concrete
// reason to reach, alongside the new facilities in BuildingConfig.
export const DESTINATIONS: readonly DestinationConfig[] = [
  { id: "BUSAN", name: "Busan", requiredLevel: 1, demand: 1, flightDuration: 58, revenueMultiplier: 0.8 },
  { id: "TOKYO", name: "Tokyo", requiredLevel: 1, demand: 1, flightDuration: 62, revenueMultiplier: 1 },
  { id: "BANGKOK", name: "Bangkok", requiredLevel: 2, demand: 1, flightDuration: 70, revenueMultiplier: 1.3 },
  { id: "PARIS", name: "Paris", requiredLevel: 3, demand: 1, flightDuration: 80, revenueMultiplier: 1.8 },
  { id: "NEW_YORK", name: "New York", requiredLevel: 4, demand: 1, flightDuration: 92, revenueMultiplier: 2.2 },
  { id: "DUBAI", name: "Dubai", requiredLevel: 5, demand: 1, flightDuration: 100, revenueMultiplier: 2.6 },
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
