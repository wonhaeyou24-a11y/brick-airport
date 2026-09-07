/**
 * GameLoop — requestAnimationFrame driver.
 *
 * Separates "when to tick" from "what to tick". Game supplies an update
 * callback (deltaTime in seconds) and a render callback. Each system that
 * needs per-frame work is called from Game's update, so systems stay
 * independently updatable as the game grows.
 */
export type UpdateFn = (deltaTime: number) => void;
export type RenderFn = () => void;

export class GameLoop {
  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  private running = false;
  private rafId = 0;
  private lastTime = 0;

  /** Clamp large gaps (tab switch, breakpoints) so nothing jumps. */
  private readonly maxDelta = 0.1;

  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (delta > this.maxDelta) delta = this.maxDelta;

    this.update(delta);
    this.render();

    this.rafId = requestAnimationFrame(this.tick);
  };
}
