import type { FlightData, GameState } from "../core/GameState";
import {
  computeAirportSatisfaction,
  computeFlightSatisfaction,
  computeOnTimeRate,
  computeServiceScore,
} from "./AirportOperations";
import { OPERATIONS_CONFIG } from "./OperationsConfig";

/**
 * OperationsManager — orchestrates the V0.7 operations layer: it decides WHEN
 * to recompute and WHERE to store, delegating every formula to the pure
 * AirportOperations module (spec §80).
 *
 * Recompute points, never per-frame accumulation (spec §60):
 *   - a building is placed        → service score
 *   - a flight completes          → on-time rate (+ satisfaction / reputation
 *                                    in V0.7-D / V0.7-E)
 *
 * No Three.js. Reads / writes GameState.operations + airport.reputation only.
 */
export class OperationsManager {
  /** on-time flags of the most recent completed flights (bounded ring). */
  private readonly recentOnTime: boolean[] = [];
  /** averageSatisfaction of the most recent completed flights (bounded ring). */
  private readonly recentSatisfaction: number[] = [];

  constructor(private readonly state: GameState) {
    this.recomputeServiceScore();
  }

  /** The set of service facilities changed — recompute the service score. */
  recomputeServiceScore(): void {
    const counts = this.state.serviceFacilityCounts();
    this.state.operations.serviceScore = computeServiceScore(counts);
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

    this.pushRecent(this.recentOnTime, onTime);
    this.pushRecent(this.recentSatisfaction, flight.averageSatisfaction);

    const o = this.state.operations;
    o.onTimeRate = computeOnTimeRate(this.recentOnTime);
    o.passengerSatisfaction = computeAirportSatisfaction(this.recentSatisfaction);
  }

  private pushRecent<T>(ring: T[], value: T): void {
    ring.push(value);
    if (ring.length > OPERATIONS_CONFIG.recentFlightWindow) ring.shift();
  }
}
