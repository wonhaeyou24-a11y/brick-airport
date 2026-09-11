import { OPERATIONS_CONFIG as C } from "./OperationsConfig";

/**
 * AirportOperations — pure operations maths (V0.7-A). No Three.js, no GameState
 * import, no mutation, no side effects: every function takes plain values and
 * returns a number / boolean.
 *
 * The orchestration (when to recompute, where to store) lives in
 * OperationsManager; this file only knows the formulas.
 */

/** Clamp any score into [minScore, maxScore]; NaN collapses to minScore. */
export function clampScore(value: number): number {
  if (Number.isNaN(value)) return C.minScore;
  return Math.max(C.minScore, Math.min(C.maxScore, value));
}

/**
 * Diminishing-returns sum for `count` facilities of one kind: the 1st adds
 * `perUnit`, the 2nd `perUnit * falloff`, the 3rd `perUnit * falloff²`, …, up
 * to `facilityStackCap` copies (spec §27, §55).
 */
export function facilityEffect(count: number, perUnit: number): number {
  const n = Math.min(Math.max(0, Math.floor(count)), C.facilityStackCap);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += perUnit * Math.pow(C.facilityStackFalloff, i);
  }
  return total;
}

/** How many of each service facility the airport has, keyed by type string. */
export type FacilityCounts = Record<string, number>;

/**
 * Service score = base + diminishing facility bonuses (+ a flat bonus while a
 * SERVICE_BONUS event is active). Facility-driven only (spec §35).
 */
export function computeServiceScore(
  counts: FacilityCounts,
  serviceBonusActive = false,
): number {
  let score = C.baseServiceScore;
  for (const type of Object.keys(C.serviceBonusPerFacility)) {
    score += facilityEffect(counts[type] ?? 0, C.serviceBonusPerFacility[type]);
  }
  if (serviceBonusActive) score += C.serviceBonusAmount;
  return clampScore(Math.round(score));
}

export interface PassengerSatisfactionInput {
  /** Facility counts at the moment the passenger finished. */
  counts: FacilityCounts;
  /** Game-seconds the passenger's walk took (WAITING → BOARDED / ARRIVED). */
  routeSeconds: number;
  /** Deterministic spread in [-1, 1] derived from the passenger id. */
  jitter: number;
}

/**
 * One passenger's satisfaction: base + facility bonuses − wait penalty ± jitter.
 * The flight-level on-time adjustment is NOT applied here — it is added later in
 * computeFlightSatisfaction, because the flight's on-time status is not known
 * until it completes (spec §30, §32). The SERVICE_BONUS event is applied at the
 * airport-aggregate level, not per passenger.
 */
export function computePassengerSatisfaction(
  input: PassengerSatisfactionInput,
): number {
  let score = C.baseSatisfaction;
  for (const type of Object.keys(C.satisfactionBonusPerFacility)) {
    score += facilityEffect(
      input.counts[type] ?? 0,
      C.satisfactionBonusPerFacility[type],
    );
  }
  const over = Math.max(0, input.routeSeconds - C.normalRouteSeconds);
  score -= Math.min(C.maxWaitPenalty, over * C.waitPenaltyPerSecond);
  score += input.jitter * C.satisfactionJitter;
  return clampScore(Math.round(score));
}

/**
 * A flight's average satisfaction: mean of its departure passengers' scores,
 * then a single on-time / delay adjustment (spec §33). Falls back to the base
 * when the flight recorded no passenger scores.
 */
export function computeFlightSatisfaction(
  passengerScores: readonly number[],
  onTime: boolean,
): number {
  const mean = passengerScores.length
    ? passengerScores.reduce((sum, s) => sum + s, 0) / passengerScores.length
    : C.baseSatisfaction;
  const adjust = onTime
    ? C.onTimeSatisfactionBonus
    : -C.delaySatisfactionPenalty;
  return clampScore(Math.round(mean + adjust));
}

/** % of the recent flights that were on-time (spec §36). */
export function computeOnTimeRate(recentOnTime: readonly boolean[]): number {
  if (recentOnTime.length === 0) return C.baseOnTimeRate;
  const onTime = recentOnTime.filter(Boolean).length;
  return clampScore(Math.round((onTime / recentOnTime.length) * 100));
}

/** Airport satisfaction = mean of recent flights' averages (spec §34). */
export function computeAirportSatisfaction(
  recentAverages: readonly number[],
): number {
  if (recentAverages.length === 0) return C.baseSatisfaction;
  const mean =
    recentAverages.reduce((sum, s) => sum + s, 0) / recentAverages.length;
  return clampScore(Math.round(mean));
}

/**
 * Nudge reputation toward a quality target built from the airport's current
 * satisfaction, on-time rate and service score. Small bounded step per flight
 * so one flight never swings the airport's standing (spec §44, §45).
 */
export function nextReputation(
  current: number,
  satisfaction: number,
  onTimeRate: number,
  serviceScore: number,
): number {
  const w = C.reputationWeights;
  const target =
    satisfaction * w.satisfaction +
    onTimeRate * w.onTime +
    serviceScore * w.service;
  const rawStep = (target - current) * C.reputationLerp;
  const step = Math.max(
    -C.reputationMaxStep,
    Math.min(C.reputationMaxStep, rawStep),
  );
  return clampScore(current + step);
}

/** On-time judgement for one flight: elapsed game-seconds within budget (§18, §36). */
export function isFlightOnTime(
  elapsedSeconds: number,
  budgetSeconds: number,
): boolean {
  return elapsedSeconds <= budgetSeconds;
}

/**
 * Multiplier (≤ 1) applied to a passenger processing step's dwell when a
 * matching service facility exists (spec §24, §25). More of the same facility
 * speeds it up further, with diminishing returns and a floor.
 */
export function facilitySpeedFactor(count: number): number {
  if (count <= 0) return 1;
  const reduction = Math.min(0.6, facilityEffect(count, 0.35));
  return Math.max(0.35, 1 - reduction);
}

export interface GroundEfficiencyInput {
  /** Ground vehicles in the fleet. */
  vehicleCount: number;
  /** Service facilities built (any type). */
  facilityCount: number;
  /** Turnaround tasks finished in the recent window. */
  recentCompleted: number;
  /** …of those, how many were delayed waiting for a vehicle (spec §35). */
  recentDelayed: number;
}

/**
 * Operational efficiency 0–100 (spec §32, §33): facilities + vehicles push it
 * up, recent turnaround delays pull it down. Pure — the manager feeds it a
 * small recent-history summary, never the whole operation list (spec §38).
 */
export function computeGroundEfficiency(input: GroundEfficiencyInput): number {
  const E = C.groundEfficiency;
  let score = E.base;
  score += Math.min(input.vehicleCount, E.vehicleCap) * E.perVehicle;
  score += Math.min(input.facilityCount, 6) * 2;

  if (input.recentCompleted > 0) {
    const cleanRatio = Math.max(
      0,
      1 - input.recentDelayed / input.recentCompleted,
    );
    score += cleanRatio * E.completedBonusMax;
    score -= (1 - cleanRatio) * E.delayPenaltyMax;
  } else {
    score += E.completedBonusMax * 0.5; // neutral before any turnaround history
  }
  return clampScore(Math.round(score));
}

/**
 * Player-facing label for a satisfaction score (V1.1-D). Pure display bucket
 * over the same 0-100 scale every satisfaction number already uses — reuses
 * the existing score, adds no new one.
 */
export function experienceLabel(satisfaction: number): string {
  if (satisfaction >= 90) return "Very Happy";
  if (satisfaction >= 75) return "Happy";
  if (satisfaction >= 50) return "Normal";
  if (satisfaction >= 30) return "Unhappy";
  return "Very Unhappy";
}

/**
 * Deterministic pseudo-jitter in [-1, 1] from a string id — so a passenger's
 * satisfaction is stable across recomputes but varies between passengers.
 */
export function jitterFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return ((hash % 1000) / 1000) * 2 - 1;
}
