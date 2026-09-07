import "./style.css";
import { Game } from "./core/Game";

/**
 * Entry point. Wires the DOM to the Game composition root and starts the loop.
 */
const canvas = document.getElementById("game-canvas");
const hudContainer = document.getElementById("hud");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("main: #game-canvas canvas element not found");
}
if (!hudContainer) {
  throw new Error("main: #hud container element not found");
}

const game = new Game(canvas, hudContainer);
game.start();

// Handy for debugging in the browser console during V0.1.
(window as unknown as { game: Game }).game = game;
