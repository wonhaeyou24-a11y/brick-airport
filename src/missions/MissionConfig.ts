import type { MissionType } from "../core/GameState";

/**
 * MissionConfig — the fixed mission pool (spec §B.1). Pure data, no Three.js.
 *
 * Targets are ABSOLUTE (read against the lifetime GameState counters) and
 * escalate, so completing one naturally makes the next tier the goal. Tuned
 * against the current Economy / Progression balance (≈ $100 / passenger,
 * 4 ground operations per flight, 5 starting buildings, 4 starting staff).
 */
export interface MissionTemplate {
  type: MissionType;
  target: number;
  title: string;
  rewardMoney: number;
  rewardReputation: number;
}

export const MISSION_POOL: readonly MissionTemplate[] = [
  { type: "FLIGHT_TARGET", target: 3, title: "First Flights", rewardMoney: 500, rewardReputation: 3 },
  { type: "PASSENGER_TARGET", target: 20, title: "Passengers Served", rewardMoney: 500, rewardReputation: 3 },
  { type: "BUILD_TARGET", target: 6, title: "Grow the Airport", rewardMoney: 800, rewardReputation: 4 },
  { type: "OPERATION_TARGET", target: 10, title: "Ground Crew at Work", rewardMoney: 700, rewardReputation: 4 },
  { type: "REVENUE_TARGET", target: 2000, title: "Turn a Profit", rewardMoney: 600, rewardReputation: 3 },
  { type: "STAFF_TARGET", target: 5, title: "Build the Team", rewardMoney: 600, rewardReputation: 3 },
  { type: "FLIGHT_TARGET", target: 10, title: "Busy Skies", rewardMoney: 900, rewardReputation: 4 },
  { type: "PASSENGER_TARGET", target: 60, title: "Full Terminals", rewardMoney: 1000, rewardReputation: 5 },
  { type: "REVENUE_TARGET", target: 6000, title: "Steady Income", rewardMoney: 1200, rewardReputation: 5 },
  { type: "OPERATION_TARGET", target: 40, title: "Turnaround Machine", rewardMoney: 1400, rewardReputation: 6 },
  { type: "STAFF_TARGET", target: 6, title: "Fully Staffed", rewardMoney: 1000, rewardReputation: 5 },
  { type: "BUILD_TARGET", target: 8, title: "Terminal Expansion", rewardMoney: 1600, rewardReputation: 6 },
  { type: "FLIGHT_TARGET", target: 25, title: "Regional Hub", rewardMoney: 1800, rewardReputation: 7 },
  { type: "PASSENGER_TARGET", target: 150, title: "Passenger Milestone", rewardMoney: 2200, rewardReputation: 8 },
  { type: "REVENUE_TARGET", target: 14000, title: "Airport Fortune", rewardMoney: 2500, rewardReputation: 8 },
  // Facility / passenger-experience objectives (V1.1-D).
  { type: "FACILITY_TARGET", target: 2, title: "Passenger Amenities", rewardMoney: 700, rewardReputation: 4 },
  { type: "SATISFACTION_TARGET", target: 75, title: "Happy Travelers", rewardMoney: 900, rewardReputation: 4 },
  { type: "FACILITY_TARGET", target: 4, title: "Airport Services", rewardMoney: 1500, rewardReputation: 6 },
  { type: "SATISFACTION_TARGET", target: 85, title: "Five-Star Airport", rewardMoney: 2000, rewardReputation: 7 },
];

/** Max ACTIVE missions at once (spec §B.2). */
export const MAX_ACTIVE_MISSIONS = 3;

/** Player-facing objective text for a mission type + target. */
export function missionDescription(type: MissionType, target: number): string {
  switch (type) {
    case "FLIGHT_TARGET":
      return `Complete ${target} flights`;
    case "PASSENGER_TARGET":
      return `Serve ${target} passengers`;
    case "REVENUE_TARGET":
      return `Reach $${target.toLocaleString("en-US")} ticket revenue`;
    case "BUILD_TARGET":
      return `Have ${target} buildings`;
    case "OPERATION_TARGET":
      return `Complete ${target} ground operations`;
    case "STAFF_TARGET":
      return `Employ ${target} staff`;
    case "FACILITY_TARGET":
      return `Build ${target} service facilities`;
    case "SATISFACTION_TARGET":
      return `Reach ${target} average passenger satisfaction`;
  }
}
