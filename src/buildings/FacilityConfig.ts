import type { BuildingType } from "../core/GameState";
import { OPERATIONS_CONFIG } from "../operations/OperationsConfig";

/**
 * FacilityConfig — what each building TYPE contributes (V1.1-A). Pure data,
 * no Three.js, no per-building storage: a building only ever stores its
 * `type`, and this table is looked up from that (spec §A.4) so identical
 * buildings never duplicate their settings.
 *
 * `comfort` / `service` here are NOT a second tuning knob — for every type
 * that already drives the V0.7 operations formulas (CHECK_IN, SECURITY,
 * BAGGAGE, LOUNGE, and the new amenities below) the numbers are read straight
 * from OPERATIONS_CONFIG, so there is exactly one place that balances them.
 * TERMINAL / GATE get their own small reference numbers — they don't feed
 * AirportOperations' formulas (that would swing the score the moment the
 * airport's starting Terminal/Gates existed), they only feed the
 * FacilityManager summary + the Facility HUD panel.
 */
export interface FacilityEffect {
  /** How many passengers this facility is sized for, for HUD display. */
  passengerCapacity?: number;
  /** Comfort contribution (satisfaction-side), for HUD display / summary. */
  comfort?: number;
  /** Service contribution (service-score-side), for HUD display / summary. */
  service?: number;
}

const S = OPERATIONS_CONFIG.serviceBonusPerFacility;
const C = OPERATIONS_CONFIG.satisfactionBonusPerFacility;

export const FACILITY_EFFECTS: Partial<Record<BuildingType, FacilityEffect>> = {
  TERMINAL: { passengerCapacity: 20, comfort: 5, service: 5 },
  GATE: { passengerCapacity: 6, comfort: 2, service: 2 },
  RUNWAY: {},
  CHECK_IN: { service: S.CHECK_IN, comfort: C.CHECK_IN },
  SECURITY: { service: S.SECURITY, comfort: C.SECURITY },
  BAGGAGE: { passengerCapacity: 20, service: S.BAGGAGE, comfort: C.BAGGAGE },
  LOUNGE: { passengerCapacity: 6, comfort: C.LOUNGE },
  SHOP: { comfort: C.SHOP, service: S.SHOP },
  FOOD: { comfort: C.FOOD, service: S.FOOD },
  RESTROOM: { comfort: C.RESTROOM, service: S.RESTROOM },
  // V2.1 content expansion.
  PARKING: { comfort: C.PARKING, service: S.PARKING },
  VIP_LOUNGE: { passengerCapacity: 8, comfort: C.VIP_LOUNGE, service: S.VIP_LOUNGE },
};

export function getFacilityEffect(type: BuildingType): FacilityEffect {
  return FACILITY_EFFECTS[type] ?? {};
}
