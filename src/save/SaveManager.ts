import type { GameStateData } from "../core/GameState";
import { SAVE_VERSION, looksLikeSaveData, type SaveData, type SaveInfo } from "./SaveData";

/**
 * SaveManager — the one local save slot (V1.2-B).
 *
 * Storage: localStorage. The audit (spec §1) found no existing save system
 * and no IndexedDB usage anywhere in the project; a serialized GameStateData
 * is tens of KB (~13KB for a busy airport), well inside localStorage's
 * per-origin quota, so the extra async complexity of IndexedDB buys nothing
 * here (spec §B.1 — "없으면 localStorage 또는 IndexedDB 검토").
 *
 * Only one slot (AUTOSAVE) for V1.2 (spec §B.2), but every method is keyed
 * off `SLOT_KEY` so a future manual-slot picker just needs a slot id
 * parameter, not a rewrite.
 */
const SLOT_KEY = "brick-airport:save:autosave";

export type SaveOutcome =
  | { ok: true }
  | { ok: false; reason: "STORAGE_ERROR"; message: string };

export class SaveManager {
  /** True while a write is in flight (spec §C.3 — never overlap two saves). */
  saveInProgress = false;

  hasSave(): boolean {
    try {
      return localStorage.getItem(SLOT_KEY) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Write the current GameStateData. Does not mutate `data` (spec §B.4 — the
   * caller's live state is read, never touched, during save).
   */
  save(data: GameStateData): SaveOutcome {
    const payload: SaveData = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      // Round-trip through JSON so the stored copy can never alias the live
      // state (spec §A.3 — a plain object graph, safe to hand to JSON.stringify
      // directly, but the round-trip also guarantees no accidental reference
      // is retained if this method's caller mutates `data` right after).
      gameState: JSON.parse(JSON.stringify(data)) as GameStateData,
    };
    try {
      const json = JSON.stringify(payload);
      localStorage.setItem(SLOT_KEY, json);
      return { ok: true };
    } catch (e) {
      // Storage full / disabled — the PREVIOUS save (if any) is untouched,
      // since setItem either replaces the key atomically or throws without
      // writing (spec §C.4 — "새 저장 실패 → 기존 저장 유지").
      return { ok: false, reason: "STORAGE_ERROR", message: String(e) };
    }
  }

  /**
   * Read + validate + hand back the GameStateData. Returns null on ANY
   * problem (missing, corrupt JSON, wrong shape) — never throws, never
   * deletes the offending entry (spec §C.5 — a corrupted save must not crash
   * the game and must not be silently wiped, in case it's recoverable by hand).
   */
  load(): GameStateData | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(SLOT_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!looksLikeSaveData(parsed)) return null;
    return parsed.gameState;
  }

  /** Cheap summary for the HUD Save panel — no GameState reconstruction needed. */
  getSaveInfo(): SaveInfo | null {
    const data = this.load();
    if (!data) return null;
    let savedAt = Date.now();
    try {
      const raw = localStorage.getItem(SLOT_KEY);
      if (raw) savedAt = (JSON.parse(raw) as SaveData).savedAt;
    } catch {
      /* fall back to now — info is display-only */
    }
    const a = data.airport;
    return {
      savedAt,
      airportName: a?.name ?? "My Airport",
      level: a?.level ?? 1,
      money: a?.money ?? 0,
      totalFlights: a?.totalFlights ?? 0,
      totalPassengers: a?.totalPassengers ?? 0,
    };
  }

  deleteSave(): void {
    try {
      localStorage.removeItem(SLOT_KEY);
    } catch {
      /* nothing to do — best-effort */
    }
  }
}
