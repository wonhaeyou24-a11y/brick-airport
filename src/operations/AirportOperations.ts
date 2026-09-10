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
  /** Whether a SERVICE_BONUS event is currently active. */
  serviceBonusActive: boolean;
}

/**
 * One passenger's satisfaction: base + facility bonuses − wait penalty
 * (+ service-bonus event) ± jitter. The flight-level on-time adjustment is NOT
 * applied here — it is added later in computeFlightSatisfaction, because the
 * flight's on-time status is not known until it completes (spec §30, §32).
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
  if (input.serviceBonusActive) score += C.serviceBonusAmount;
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
