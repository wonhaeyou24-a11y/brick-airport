/**
 * AirportProgression — pure level maths from cumulative operating stats.
 *
 * No Three.js, no GameState import. Game reads airport.totalFlights /
 * totalPassengers and calls computeAirportLevel(); it writes airport.level
 * only when the level actually rises (spec §14, §28).
 *
 * A stage is reached when EITHER threshold is met — whichever the airport
 * hits first through natural play (spec §27).
 */
export interface LevelRequirement {
  level: number;
  minFlights: number;
  minPassengers: number;
}

export const LEVEL_REQUIREMENTS: readonly LevelRequirement[] = [
  { level: 1, minFlights: 0, minPassengers: 0 },
  { level: 2, minFlights: 5, minPassengers: 20 },
  { level: 3, minFlights: 15, minPassengers: 60 },
  // V2.1 content expansion — continues the same escalating OR-threshold
  // pattern (each roughly 2x the prior tier), giving a reason to keep
  // playing past the old Lv.3 ceiling. Expansion.ts's grid stays capped at
  // its existing max tier (world/cells.ts's hard 40-cell ceiling) — these
  // levels unlock new BUILDING/FACILITY/route content instead (BuildingConfig,
  // FlightConfig), not more buildable area.
  { level: 4, minFlights: 30, minPassengers: 120 },
  { level: 5, minFlights: 50, minPassengers: 200 },
];

/** Player-facing tier name per level (V2.1 §3) — used only in the existing
 * level-up notice text, not a new UI surface. */
export const AIRPORT_TIER_NAME_KO: Record<number, string> = {
  1: "소형 공항",
  2: "지역 공항",
  3: "중형 공항",
  4: "국제 공항",
  5: "허브 공항",
};

/** Highest level whose flight- OR passenger-threshold the airport has met. */
export function computeAirportLevel(
  totalFlights: number,
  totalPassengers: number,
): number {
  let level = 1;
  for (const req of LEVEL_REQUIREMENTS) {
    if (totalFlights >= req.minFlights || totalPassengers >= req.minPassengers) {
      level = Math.max(level, req.level);
    }
  }
  return level;
}
