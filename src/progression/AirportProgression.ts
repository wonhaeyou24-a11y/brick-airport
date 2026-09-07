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
];

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
