import type { GameStateData } from "../core/GameState";

/**
 * SaveData — the on-disk envelope around GameStateData (V1.2-A).
 *
 * GameStateData is already pure, JSON-safe data (no THREE objects, no
 * functions, no circular references — confirmed by the code audit), so this
 * wraps it directly instead of building a second parallel copy of the game's
 * fields (spec §A.2/§A.3).
 */
export const SAVE_VERSION = "1.2.0";

export interface SaveData {
  /** SaveData envelope version — bumped only if this wrapper's shape changes. */
  version: string;
  /** Epoch ms the save was written. */
  savedAt: number;
  /** The full GameStateData. Its own `.version` drives GameState's migration. */
  gameState: GameStateData;
}

/** Small, cheap summary for the HUD Save panel — no need to reconstruct GameState for this. */
export interface SaveInfo {
  savedAt: number;
  airportName: string;
  level: number;
  money: number;
  totalFlights: number;
  totalPassengers: number;
}

/**
 * Reset the transient, view-only parts of a restored GameStateData before it
 * becomes live (spec §A.5) — the Three.js object a saved selection pointed at
 * may not exist yet (or ever again) at load time, so selection always starts
 * clean. Mutates in place; called once, right after `new GameState(data)`.
 */
export function clearTransientSelection(data: GameStateData): void {
  data.selection = { kind: null, id: null };
  data.grid = { hoverCell: null, selectedCell: null };
}

/** Type-guard-ish shape check — just enough to know `raw` is worth handing to `new GameState()`. */
export function looksLikeSaveData(raw: unknown): raw is SaveData {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== "string" || typeof r.savedAt !== "number") return false;
  const gs = r.gameState;
  if (!gs || typeof gs !== "object") return false;
  const g = gs as Record<string, unknown>;
  // Enough of a shape check to rule out garbage; GameState's own migration
  // constructor tolerates anything beyond this (missing arrays, old version).
  return !!g.airport && typeof g.airport === "object";
}
