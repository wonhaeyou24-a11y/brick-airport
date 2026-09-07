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
} as const;
