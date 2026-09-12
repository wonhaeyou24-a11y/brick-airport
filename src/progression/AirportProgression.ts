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
  // Lv.2 kept fast and easy on purpose — the EARLY GAME's first, quick
  // reward for learning the airport loop (V2.2 §9's target experience).
  { level: 2, minFlights: 5, minPassengers: 20 },
  // V2.2 balance pass — a 600s idle-only simulation (no construction, no
  // hiring beyond the starting roster) reached every tier including the
  // former Lv.3-Lv.5 ceiling in under 9 minutes, leaving no room for a
  // mid/late game (spec §9's explicit "progression too fast" check).
  // Stretched ~1.5x/1.8x/2.3x the V2.1 values so reaching the true endgame
  // tier through natural play takes on the order of 15-20+ minutes instead
  // of under 9. The OR condition and escalating shape are unchanged — only
  // the numbers moved.
  { level: 3, minFlights: 22, minPassengers: 90 },
  { level: 4, minFlights: 48, minPassengers: 220 },
  { level: 5, minFlights: 100, minPassengers: 460 },
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
