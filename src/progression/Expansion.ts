import type { CellBounds } from "../world/cells";

/**
 * Expansion — the airport's buildable-area tiers (V1.2-D). Pure data + maths,
 * no Three.js.
 *
 * Spec suggested 3 tiers gated at levels 2/3/4, but AirportProgression
 * (V0.5) only ever reaches level 3 (LEVEL_REQUIREMENTS has 3 entries) — this
 * project follows the existing progression cap rather than inventing an
 * unused level 4 (spec §D.5's own instruction: "현재 Level 요구조건과
 * 충돌하면 기존 progression을 우선한다"), so there are 2 real tiers:
 *
 *   level 0 (start)   24 cells (48x48)  — identical to the pre-V1.2 grid
 *   level 1            32 cells (64x64) — unlocks at Airport Level 2
 *   level 2            40 cells (80x80) — unlocks at Airport Level 3, the
 *                                         grid's hard ceiling (world/cells.ts)
 */
export interface ExpansionTier {
  level: number;
  /** Buildable area side length, in grid cells (square, centred on origin). */
  cells: number;
  /** World units, for HUD display. */
  worldSize: number;
  cost: number;
  requiredLevel: number;
}

export const EXPANSION_TIERS: readonly ExpansionTier[] = [
  { level: 0, cells: 24, worldSize: 48, cost: 0, requiredLevel: 1 },
  { level: 1, cells: 32, worldSize: 64, cost: 10000, requiredLevel: 2 },
  { level: 2, cells: 40, worldSize: 80, cost: 25000, requiredLevel: 3 },
];

export const MAX_EXPANSION_LEVEL = EXPANSION_TIERS.length - 1;

export function expansionTier(level: number): ExpansionTier {
  return EXPANSION_TIERS[Math.max(0, Math.min(level, MAX_EXPANSION_LEVEL))];
}

/** The current buildable rectangle, centred on the origin (spec §D.1/§D.2). */
export function expansionBounds(level: number): CellBounds {
  const half = expansionTier(level).cells / 2;
  return { minCol: -half, maxCol: half - 1, minRow: -half, maxRow: half - 1 };
}

export type ExpansionPurchaseResult =
  | { ok: true }
  | { ok: false; reason: "MAX_LEVEL" }
  | { ok: false; reason: "LOCKED"; requiredLevel: number }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; cost: number };

/** Same shape as BuildingConfig's checkPurchase, for the same reason (spec §D.4). */
export function checkExpansion(
  currentExpansionLevel: number,
  airportLevel: number,
  money: number,
): ExpansionPurchaseResult {
  const next = currentExpansionLevel + 1;
  if (next > MAX_EXPANSION_LEVEL) return { ok: false, reason: "MAX_LEVEL" };
  const tier = expansionTier(next);
  if (airportLevel < tier.requiredLevel) {
    return { ok: false, reason: "LOCKED", requiredLevel: tier.requiredLevel };
  }
  if (money < tier.cost) {
    return { ok: false, reason: "INSUFFICIENT_FUNDS", cost: tier.cost };
  }
  return { ok: true };
}
