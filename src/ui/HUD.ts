/**
 * HUD — HTML/CSS overlay. Pure view: it renders values it is handed and
 * emits button intents via callbacks. It holds no game state and never
 * touches Three.js.
 */

export interface HudStats {
  airportName: string;
  level: number;
  money: number;
  aircraftCount: number;
  gateCount: number;
  passengerCount: number;
}

/** What to show in the "SELECTED" panel. */
export interface SelectionInfo {
  title: string;
  lines?: string[];
}

export interface HudCallbacks {
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  onToggleGrid(): void;
}

export class HUD {
  private readonly root: HTMLElement;
  private readonly moneyEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly aircraftEl: HTMLElement;
  private readonly gateEl: HTMLElement;
  private readonly passengerEl: HTMLElement;
  private readonly airportNameEl: HTMLElement;
  private readonly selectionEl: HTMLElement;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.root = container;
    this.root.innerHTML = TEMPLATE;

    this.airportNameEl = this.must(".js-airport-name");
    this.levelEl = this.must(".js-level");
    this.moneyEl = this.must(".js-money");
    this.aircraftEl = this.must(".js-aircraft");
    this.gateEl = this.must(".js-gate");
    this.passengerEl = this.must(".js-passengers");
    this.selectionEl = this.must(".js-selection");

    this.must(".js-zoom-in").addEventListener("click", callbacks.onZoomIn);
    this.must(".js-zoom-out").addEventListener("click", callbacks.onZoomOut);
    this.must(".js-reset").addEventListener("click", callbacks.onReset);
    this.must(".js-grid").addEventListener("click", callbacks.onToggleGrid);
  }

  setStats(stats: HudStats): void {
    this.airportNameEl.textContent = stats.airportName;
    this.levelEl.textContent = String(stats.level);
    this.moneyEl.textContent = `$${stats.money.toLocaleString("en-US")}`;
    this.aircraftEl.textContent = String(stats.aircraftCount);
    this.gateEl.textContent = String(stats.gateCount);
    this.passengerEl.textContent = String(stats.passengerCount);
  }

  setSelection(info: SelectionInfo | null): void {
    const parts = ['<span class="sel-label">SELECTED</span>'];
    if (info) {
      parts.push(`<b class="sel-title">${escapeHtml(info.title)}</b>`);
      for (const line of info.lines ?? []) {
        parts.push(`<span class="sel-line">${escapeHtml(line)}</span>`);
      }
    } else {
      parts.push('<em class="empty">Nothing</em>');
    }
    this.selectionEl.innerHTML = parts.join("");
  }

  private must(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`HUD: missing element "${selector}"`);
    return el;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const TEMPLATE = /* html */ `
  <div class="hud-top">
    <div class="hud-panel hud-title">
      Brick Airport
      <small class="js-airport-name">My Airport</small>
    </div>
    <div class="hud-panel hud-stats">
      <div class="hud-stat"><span>Level</span><b class="js-level">1</b></div>
      <div class="hud-stat"><span>Money</span><b class="js-money">$1,000</b></div>
      <div class="hud-stat"><span>Aircraft</span><b class="js-aircraft">1</b></div>
      <div class="hud-stat"><span>Gate</span><b class="js-gate">1</b></div>
      <div class="hud-stat"><span>Pax</span><b class="js-passengers">0</b></div>
    </div>
  </div>

  <div class="hud-bottom">
    <div class="hud-panel hud-selection js-selection">
      <span class="sel-label">SELECTED</span><em class="empty">Nothing</em>
    </div>
    <div class="hud-controls">
      <button class="brick-btn btn-reset js-grid" title="Toggle grid">GRID</button>
      <button class="brick-btn btn-reset js-reset" title="Reset view">RESET</button>
      <button class="brick-btn js-zoom-out" title="Zoom out">&minus;</button>
      <button class="brick-btn js-zoom-in" title="Zoom in">+</button>
    </div>
  </div>
`;
