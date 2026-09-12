import type { FlightData, GameState } from "../core/GameState";
import {
  clampScore,
  computeAirportSatisfaction,
  computeFlightSatisfaction,
  computeOnTimeRate,
  computeServiceScore,
  nextReputation,
} from "./AirportOperations";
import { AirportEventManager } from "./AirportEventManager";
import { OPERATIONS_CONFIG } from "./OperationsConfig";

/** What Game must act on after an operations tick. */
export interface OperationsTick {
  /** Short strings to show via the HUD notice system (spec §50). */
  notices: string[];
  /** Extra flight requests to fire (PASSENGER_SURGE, spec §42). */
  extraFlightRequests: number;
}

/**
 * OperationsManager — orchestrates the V0.7 operations layer: it decides WHEN
 * to recompute and WHERE to store, delegating every formula to the pure
 * AirportOperations module and every event to AirportEventManager (spec §80).
 *
 * Recompute points, never per-frame accumulation (spec §60):
 *   - a building is placed        → service score
 *   - a flight completes          → on-time rate, airport satisfaction, reputation
 *   - a SERVICE_BONUS toggles      → service score + satisfaction (event lift)
 *
 * No Three.js. Reads / writes GameState.operations + airport.reputation only.
 * (Economy.settleBoarding() also READS airport.reputation as a small ticket-
 * revenue bonus — V2.2 balance pass, so this drift has a real payoff.)
 */
export class OperationsManager {
  private readonly events = new AirportEventManager();
  /** on-time flags of the most recent completed flights (bounded ring). */
  private readonly recentOnTime: boolean[] = [];
  /** averageSatisfaction of the most recent completed flights (bounded ring). */
  private readonly recentSatisfaction: number[] = [];

  constructor(private readonly state: GameState) {
    this.recomputeServiceScore();
  }

  /** Per-frame: tick events, apply any SERVICE_BONUS lift. */
  update(deltaTime: number): OperationsTick {
    const tick = this.events.update(deltaTime, this.state);
    if (tick.serviceBonusChanged) {
      this.recomputeServiceScore();
      this.recomputeAirportSatisfaction();
    }
    return {
      notices: tick.notices,
      extraFlightRequests: tick.extraFlightRequests,
    };
  }

  /** The set of service facilities changed — recompute the service score. */
  recomputeServiceScore(): void {
    const counts = this.state.serviceFacilityCounts();
    this.state.operations.serviceScore = computeServiceScore(
      counts,
      this.events.serviceBonusActive,
    );
  }

  /** FlightScheduler hook: a flight just reached COMPLETED. */
  handleFlightCompleted(flight: FlightData): void {
    const onTime = flight.onTime ?? true;

    // Freeze the flight's average from the departure-pax scores it collected
    // (spec §33) — this is also what the Recent Flights ★ shows.
    flight.averageSatisfaction = computeFlightSatisfaction(
      flight.paxSatisfaction ?? [],
      onTime,
    );
    // A delayed turnaround costs the flight a little satisfaction (spec §39) —
    // small, so one slow turnaround never swings the airport's standing.
    if (flight.turnaroundDelayed) {
      flight.averageSatisfaction = clampScore(
        flight.averageSatisfaction - OPERATIONS_CONFIG.ground.turnaroundDelayPenalty,
      );
    }

    this.pushRecent(this.recentOnTime, onTime);
    this.pushRecent(this.recentSatisfaction, flight.averageSatisfaction);

    const o = this.state.operations;
    o.onTimeRate = computeOnTimeRate(this.recentOnTime);
    this.recomputeAirportSatisfaction();

    // Reputation drifts a small step toward the current quality target
    // (spec §44, §45). Never driven directly by a single flight's result.
    this.state.airport.reputation = nextReputation(
      this.state.airport.reputation,
      o.passengerSatisfaction,
      o.onTimeRate,
      o.serviceScore,
    );
  }

  /**
   * Apply a mission / event reputation reward (V1.0-D). Reuses the existing
   * `airport.reputation` field + the operations clamp — no new reputation
   * system (spec §9). A small bounded bump, distinct from the per-flight drift.
   */
  grantReputation(amount: number): void {
    if (amount === 0) return;
    this.state.airport.reputation = clampScore(
      this.state.airport.reputation + amount,
    );
  }

  /** Airport satisfaction = recent flight averages, plus any event lift. */
  private recomputeAirportSatisfaction(): void {
    let s = computeAirportSatisfaction(this.recentSatisfaction);
    if (this.events.serviceBonusActive) {
      s = clampScore(s + OPERATIONS_CONFIG.serviceBonusAmount);
    }
    this.state.operations.passengerSatisfaction = s;
  }

  private pushRecent<T>(ring: T[], value: T): void {
    ring.push(value);
    if (ring.length > OPERATIONS_CONFIG.recentFlightWindow) ring.shift();
  }
}
