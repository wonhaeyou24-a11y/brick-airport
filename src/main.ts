import "./style.css";
import { Game } from "./core/Game";
import { SaveManager } from "./save/SaveManager";

/**
 * Entry point. Wires the DOM to the Game composition root and starts the loop.
 *
 * Boot flow (V1.2-B, spec's core loop — "다시 시작 -> 불러오기 -> 기존 공항
 * 복원 -> 계속 플레이"): if a save exists, load it into the very first Game
 * instance instead of always starting fresh. A corrupted save shows a short
 * HUD notice and falls back to a new airport — it is never crashed on and
 * never deleted (spec §C.5).
 */
const canvas = document.getElementById("game-canvas");
const hudContainer = document.getElementById("hud");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("main: #game-canvas canvas element not found");
}
if (!hudContainer) {
  throw new Error("main: #hud container element not found");
}

const saveManager = new SaveManager();
let bootNotice: string | undefined;
const initialData = saveManager.hasSave() ? saveManager.load() : null;
if (saveManager.hasSave() && !initialData) {
  bootNotice = "Save data could not be loaded.";
}

const game = new Game(canvas, hudContainer, initialData ?? undefined, bootNotice);
game.start();

// Handy for debugging in the browser console during V0.1.
(window as unknown as { game: Game }).game = game;
