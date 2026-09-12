import type { GameState } from "../core/GameState";
import { ECONOMY_CONFIG } from "./EconomyConfig";
import { getDestination } from "../aircraft/FlightConfig";

/**
 * Economy — the airport's money ledger.
 *
 * Data-first: reads and writes GameState.airport only, never a Three.js object.
 * V0.4-A scope is revenue only (ticket income when a passenger boards);
 * construction / operating costs come in a later stage.
 *
 * Double-pay guard: each departure passenger is paid exactly once, tracked by
 * PassengerData.revenueProcessed. settleBoarding() is safe to call every frame
 * — a passenger that stays BOARDED for many frames is only settled on the
 * first one.
 */
export class Economy {
  /** Seconds accumulated toward the next salary payday (V2.2). Deliberately
   * NOT persisted — like HUD's own notice/revenue-flash timers, restarting
   * it at 0 after a save/load only shifts the next payday by a few seconds,
   * never affects money/staff/progression (spec §13 — no new SaveData). */
  private salaryClock = 0;

  constructor(private readonly state: GameState) {}

  get money(): number {
    return this.state.data.airport.money;
  }

  get totalRevenue(): number {
    return this.state.data.airport.totalRevenue ?? 0;
  }

  get totalPassengers(): number {
    return this.state.data.airport.totalPassengers ?? 0;
  }

  /**
   * Pay ticket revenue for every departure passenger that has just reached
   * BOARDED and hasn't been settled yet. Returns the cash added this call
   * (0 when nothing new boarded).
   */
  settleBoarding(): number {
    let newlyBoarded = 0;
    let revenue = 0;
    // V2.2 balance pass — reputation now actually pays off: at most a +15%
    // ticket-revenue bonus at reputation 100, same shape as the destination
    // multiplier below. Read once per call, not per passenger — it can't
    // change mid-loop.
    const reputationMultiplier =
      1 +
      (this.state.data.airport.reputation / 100) *
        ECONOMY_CONFIG.reputationRevenueBonusMax;
    for (const p of this.state.data.passengers) {
      if (
        p.routeType === "DEPARTURE" &&
        p.state === "BOARDED" &&
        !p.revenueProcessed
      ) {
        p.revenueProcessed = true;
        newlyBoarded += 1;
        // V2.1 content expansion — route distance now actually matters
        // economically: a long-haul destination's revenueMultiplier (a field
        // that existed since V0.7 but was never applied) scales this
        // passenger's ticket revenue. Falls back to the flat rate (x1) for a
        // passenger whose flight/destination can't be resolved, so nothing
        // regresses if data is ever missing.
        const flight = this.state.getFlight(p.flightId);
        const multiplier = flight ? (getDestination(flight.destination)?.revenueMultiplier ?? 1) : 1;
        // Rounded per-passenger (not just at the end) so money stays a clean
        // whole-won integer regardless of floating-point multiplication.
        revenue += Math.round(
          ECONOMY_CONFIG.ticketRevenuePerPassenger * multiplier * reputationMultiplier,
        );
      }
    }
    if (newlyBoarded === 0) return 0;

    this.addRevenue(revenue, newlyBoarded);
    return revenue;
  }

  /** Credit the airport and bump lifetime stats. */
  addRevenue(amount: number, passengers = 0): void {
    const airport = this.state.data.airport;
    airport.money += amount;
    airport.totalRevenue = (airport.totalRevenue ?? 0) + amount;
    airport.totalPassengers = (airport.totalPassengers ?? 0) + passengers;
  }

  /**
   * Credit the balance for a mission / event reward (V1.0-D). Deliberately does
   * NOT touch totalRevenue or totalPassengers — a reward is not ticket income,
   * so the revenue statistics keep their meaning (spec §8).
   */
  grantReward(amount: number): void {
    if (amount <= 0) return;
    this.state.data.airport.money += amount;
  }

  /**
   * V2.2 balance pass — charge every staff member's StaffConfig salary once
   * per ECONOMY_CONFIG.staffPaydayInterval game-seconds, using the salary
   * already stored on each StaffData (set at hire time, previously never
   * read again). A larger roster now has a real ongoing cost, and hiring
   * more staff than the airport's traffic needs is an actual trade-off
   * instead of a one-time fee. Never pushes money negative — an airport
   * that can't fully cover payday just pays what it can (recoverable
   * pressure, spec §11, not a hard failure) and tries the rest next cycle
   * is not tracked as debt, matching the existing no-negative-balance rule.
   * Returns the amount actually paid this call (0 on every non-payday tick).
   */
  paySalaries(deltaTime: number): number {
    this.salaryClock += deltaTime;
    if (this.salaryClock < ECONOMY_CONFIG.staffPaydayInterval) return 0;
    this.salaryClock -= ECONOMY_CONFIG.staffPaydayInterval;

    const due = this.state.data.staff.reduce((sum, s) => sum + s.salary, 0);
    if (due <= 0) return 0;

    const airport = this.state.data.airport;
    const paid = Math.min(due, airport.money);
    airport.money -= paid;
    return paid;
  }
}
