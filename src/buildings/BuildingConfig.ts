import type { BuildingType } from "../core/GameState";

/**
 * BuildingConfig — the single source for what a building costs and when it
 * unlocks. Pure data, no Three.js. Adding a new placeable building later
 * (PARKING, FUEL_STATION, HANGAR, …) is just another entry here.
 *
 * Costs are tuned so a fresh airport ($10,000) can grow: gates are cheap and
 * available from the start; the pricier / rarer buildings unlock with the
 * airport level (spec §4, §12, §20).
 */
export interface BuildingConfig {
  cost: number;
  requiredLevel: number;
  /** Player-facing name. */
  label: string;
}

export const BUILDING_CONFIG: Record<BuildingType, BuildingConfig> = {
  GATE: { cost: 1000, requiredLevel: 1, label: "Gate" },
  TERMINAL: { cost: 4000, requiredLevel: 2, label: "Terminal" },
  RUNWAY: { cost: 8000, requiredLevel: 3, label: "Runway" },
};

/** Placeable building types, in BuildMenu display order. */
export const BUILDING_TYPES: readonly BuildingType[] = [
  "TERMINAL",
  "GATE",
  "RUNWAY",
];

export function getBuildingConfig(type: BuildingType): BuildingConfig {
  return BUILDING_CONFIG[type];
}

/**
 * Purchase check — separate from placement (spec §5, §6). Placement asks
 * "is the space free?"; this asks "can the player afford / is it unlocked?".
 */
export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "LOCKED"; requiredLevel: number }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; cost: number };

export function checkPurchase(
  type: BuildingType,
  money: number,
  airportLevel: number,
): PurchaseResult {
  const cfg = BUILDING_CONFIG[type];
  if (airportLevel < cfg.requiredLevel) {
    return { ok: false, reason: "LOCKED", requiredLevel: cfg.requiredLevel };
  }
  if (money < cfg.cost) {
    return { ok: false, reason: "INSUFFICIENT_FUNDS", cost: cfg.cost };
  }
  return { ok: true };
}
