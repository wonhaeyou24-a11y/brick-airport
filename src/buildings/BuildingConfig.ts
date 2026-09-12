import type { BuildingType } from "../core/GameState";
import { CURRENT_LOCALE, type Locale } from "../i18n/strings";
export { isServiceFacility } from "../core/GameState";
export type { ServiceFacilityType } from "../core/GameState";

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
  // Service facilities (V0.7-C). Costs sit between a gate and a terminal so a
  // growing airport ($10k start) can afford the basics early and the rest as
  // it levels up (spec §21, §22).
  CHECK_IN: { cost: 2000, requiredLevel: 1, label: "Check-in" },
  SECURITY: { cost: 2500, requiredLevel: 1, label: "Security" },
  BAGGAGE: { cost: 3000, requiredLevel: 2, label: "Baggage" },
  LOUNGE: { cost: 4000, requiredLevel: 3, label: "Lounge" },
  // Passenger-experience amenities (V1.1-A). Progression only reaches level 3
  // (AirportProgression), so these join LOUNGE there rather than inventing a
  // level 4 the game never hits (spec §10).
  FOOD: { cost: 2500, requiredLevel: 2, label: "Food Court" },
  RESTROOM: { cost: 1500, requiredLevel: 2, label: "Restroom" },
  SHOP: { cost: 3500, requiredLevel: 3, label: "Shop" },
  // V2.1 content expansion — unlocked at the new Lv.4/Lv.5 tiers
  // (AirportProgression.LEVEL_REQUIREMENTS), giving those levels a real
  // reason to reach (spec §3/§4/§13).
  PARKING: { cost: 4500, requiredLevel: 4, label: "Parking" },
  VIP_LOUNGE: { cost: 6000, requiredLevel: 5, label: "VIP Lounge" },
};

/** Placeable building types, in BuildMenu display order. */
export const BUILDING_TYPES: readonly BuildingType[] = [
  "TERMINAL",
  "GATE",
  "RUNWAY",
  "CHECK_IN",
  "SECURITY",
  "BAGGAGE",
  "LOUNGE",
  "FOOD",
  "RESTROOM",
  "SHOP",
  "PARKING",
  "VIP_LOUNGE",
];

export function getBuildingConfig(type: BuildingType): BuildingConfig {
  return BUILDING_CONFIG[type];
}

/** Korean player-facing names (V1.4-i18n) — kept beside BUILDING_CONFIG.label (English). */
const BUILDING_LABEL_KO: Record<BuildingType, string> = {
  GATE: "게이트",
  TERMINAL: "터미널",
  RUNWAY: "활주로",
  CHECK_IN: "체크인",
  SECURITY: "보안검색",
  BAGGAGE: "수하물",
  LOUNGE: "라운지",
  FOOD: "푸드코트",
  RESTROOM: "화장실",
  SHOP: "상점",
  PARKING: "주차장",
  VIP_LOUNGE: "VIP 라운지",
};

/** Locale-aware building name for the BuildMenu / selection HUD. */
export function buildingLabel(type: BuildingType, locale: Locale = CURRENT_LOCALE): string {
  return locale === "ko" ? BUILDING_LABEL_KO[type] : BUILDING_CONFIG[type].label;
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
