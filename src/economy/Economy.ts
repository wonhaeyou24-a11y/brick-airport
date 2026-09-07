import type { GameState } from "../core/GameState";
import { ECONOMY_CONFIG } from "./EconomyConfig";

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
    for (const p of this.state.data.passengers) {
      if (
        p.routeType === "DEPARTURE" &&
        p.state === "BOARDED" &&
        !p.revenueProcessed
      ) {
        p.revenueProcessed = true;
        newlyBoarded += 1;
      }
    }
    if (newlyBoarded === 0) return 0;

    const revenue = newlyBoarded * ECONOMY_CONFIG.ticketRevenuePerPassenger;
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
}
