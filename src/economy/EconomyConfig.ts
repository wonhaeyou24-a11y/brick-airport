/**
 * EconomyConfig — the single source for economy tuning numbers.
 *
 * Kept in its own file with zero imports so both GameState (starting money)
 * and Economy (revenue rules) can depend on it without a circular import.
 * No Three.js, no game logic here — just constants.
 */
export const ECONOMY_CONFIG = {
  /** Airport cash at the start of a new game. */
  startingMoney: 10000,
  /** Cash earned each time one passenger reaches BOARDED. */
  ticketRevenuePerPassenger: 100,
  /**
   * V2.2 balance pass — StaffData.salary (StaffConfig) existed since V0.9 but
   * was documented as "data only", never actually deducted, so hiring staff
   * had a one-time cost and then zero ongoing expense forever — the audit's
   * clearest "money never becomes meaningful pressure" finding. Every staff
   * member's salary is now charged once per this many game-seconds (a
   * deterministic in-game "payday", not a random or wall-clock timer).
   */
  staffPaydayInterval: 60,
  /**
   * V2.2 balance pass — audit item "reputation that does not influence
   * progression or decisions": airport.reputation (OperationsManager) already
   * drifted toward a quality target every completed flight and was granted by
   * missions/events, but nothing ever READ it back — a dead-end stat besides
   * the HUD number. Reused as a ticket-revenue multiplier, the same pattern
   * destination.revenueMultiplier already uses in Economy.settleBoarding(), so
   * better ongoing service genuinely pays off. reputation is clamped 0-100
   * (OperationsConfig.minScore/maxScore), so this is at most a +15% bonus —
   * gentle, on the same scale as the existing skill/service modifiers.
   */
  reputationRevenueBonusMax: 0.15,
} as const;
