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
  flightCount: number;
}

/** What to show in the "SELECTED" panel. */
export interface SelectionInfo {
  title: string;
  lines?: string[];
}

/**
 * Airport-wide statistics shown in the bottom-left panel while nothing is
 * selected. All values are read from GameState by Game; the HUD just renders.
 */
export interface AirportStats {
  /** airport.totalFlights ?? 0 */
  flights: number;
  /** airport.totalPassengers ?? 0 */
  passengers: number;
  /** airport.totalRevenue ?? 0 */
  revenue: number;
  /** airport.money (same value as the top HUD) */
  balance: number;
  /** totalPassengers / totalFlights, 0 when no flights yet */
  avgPaxPerFlight: number;
  /** boarded departure pax / departure pax * 100, rounded; 0 when none */
  boardingRate: number;
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
  private readonly flightEl: HTMLElement;
  private readonly revenueEl: HTMLElement;
  private readonly airportNameEl: HTMLElement;
  private readonly selectionEl: HTMLElement;
  private readonly statisticsEl: HTMLElement;
  private readonly statFlightsEl: HTMLElement;
  private readonly statPassengersEl: HTMLElement;
  private readonly statRevenueEl: HTMLElement;
  private readonly statBalanceEl: HTMLElement;
  private readonly statAvgEl: HTMLElement;
  private readonly statBoardingEl: HTMLElement;
  private readonly noticeEl: HTMLElement;

  private revenueTimer = 0;
  private noticeTimer = 0;
  private noticeHideTimer = 0;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.root = container;
    this.root.innerHTML = TEMPLATE;

    this.airportNameEl = this.must(".js-airport-name");
    this.levelEl = this.must(".js-level");
    this.moneyEl = this.must(".js-money");
    this.aircraftEl = this.must(".js-aircraft");
    this.gateEl = this.must(".js-gate");
    this.passengerEl = this.must(".js-passengers");
    this.flightEl = this.must(".js-flights");
    this.revenueEl = this.must(".js-revenue");
    this.selectionEl = this.must(".js-selection");
    this.statisticsEl = this.must(".js-statistics");
    this.statFlightsEl = this.must(".js-stat-flights");
    this.statPassengersEl = this.must(".js-stat-passengers");
    this.statRevenueEl = this.must(".js-stat-revenue");
    this.statBalanceEl = this.must(".js-stat-balance");
    this.statAvgEl = this.must(".js-stat-avg");
    this.statBoardingEl = this.must(".js-stat-boarding");
    this.noticeEl = this.must(".js-notice");

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
    this.flightEl.textContent = String(stats.flightCount);
  }

  /** Brief "+$N" pop next to the money stat when ticket revenue lands. */
  showRevenue(amount: number): void {
    this.flashMoney(`+$${amount.toLocaleString("en-US")}`, "gain", 1200);
  }

  /** Brief "−$N" pop when a building is bought. */
  showSpend(amount: number): void {
    this.flashMoney(`−$${amount.toLocaleString("en-US")}`, "spend", 1500);
  }

  private flashMoney(text: string, kind: "gain" | "spend", ms: number): void {
    this.revenueEl.textContent = text;
    this.revenueEl.classList.remove("fade");
    this.revenueEl.classList.toggle("spend", kind === "spend");
    this.revenueEl.style.opacity = "1";

    window.clearTimeout(this.revenueTimer);
    this.revenueTimer = window.setTimeout(() => {
      this.revenueEl.classList.add("fade");
      this.revenueEl.style.opacity = "0";
    }, ms);
  }

  /** Temporary centred toast — level-up, "requires level N", "not enough money". */
  showNotice(text: string, ms = 2600): void {
    this.noticeEl.textContent = text;
    this.noticeEl.hidden = false;
    // Force reflow so the fade-in transition restarts even on a rapid re-show.
    void this.noticeEl.offsetWidth;
    this.noticeEl.classList.add("show");

    window.clearTimeout(this.noticeTimer);
    window.clearTimeout(this.noticeHideTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.noticeEl.classList.remove("show");
      this.noticeHideTimer = window.setTimeout(() => {
        this.noticeEl.hidden = true;
      }, 300);
    }, ms);
  }

  /**
   * Show the SELECTED panel (info) or, when nothing is selected (null), fall
   * back to the Airport Statistics panel — the two swap in the same slot.
   */
  setSelection(info: SelectionInfo | null): void {
    if (info) {
      const parts = ['<span class="sel-label">SELECTED</span>'];
      parts.push(`<b class="sel-title">${escapeHtml(info.title)}</b>`);
      for (const line of info.lines ?? []) {
        parts.push(`<span class="sel-line">${escapeHtml(line)}</span>`);
      }
      this.selectionEl.innerHTML = parts.join("");
    }
    this.selectionEl.hidden = info === null;
    this.statisticsEl.hidden = info !== null;
  }

  /** Update the Airport Statistics card values (call only when they change). */
  setStatistics(s: AirportStats): void {
    this.statFlightsEl.textContent = String(s.flights);
    this.statPassengersEl.textContent = String(s.passengers);
    this.statRevenueEl.textContent = `$${s.revenue.toLocaleString("en-US")}`;
    this.statBalanceEl.textContent = `$${s.balance.toLocaleString("en-US")}`;
    this.statAvgEl.textContent = s.avgPaxPerFlight.toFixed(1);
    this.statBoardingEl.textContent = `${s.boardingRate}%`;
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
  <div class="hud-notice js-notice" hidden></div>

  <div class="hud-top">
    <div class="hud-panel hud-title">
      Brick Airport
      <small class="js-airport-name">My Airport</small>
    </div>
    <div class="hud-panel hud-stats">
      <div class="hud-stat"><span>Level</span><b class="js-level">1</b></div>
      <div class="hud-stat hud-stat-money">
        <span>Money</span><b class="js-money">$10,000</b>
        <b class="hud-revenue js-revenue" aria-hidden="true"></b>
      </div>
      <div class="hud-stat"><span>Aircraft</span><b class="js-aircraft">1</b></div>
      <div class="hud-stat"><span>Gate</span><b class="js-gate">1</b></div>
      <div class="hud-stat"><span>Pax</span><b class="js-passengers">0</b></div>
      <div class="hud-stat"><span>Flights</span><b class="js-flights">0</b></div>
    </div>
  </div>

  <div class="hud-bottom">
    <div class="hud-panel hud-context">
      <div class="hud-statistics js-statistics">
        <div class="stat-panel-title">Airport Statistics</div>
        <div class="statistics-grid">
          <div class="stat-card"><span>Flights</span><strong class="js-stat-flights">0</strong></div>
          <div class="stat-card"><span>Passengers</span><strong class="js-stat-passengers">0</strong></div>
          <div class="stat-card"><span>Revenue</span><strong class="js-stat-revenue">$0</strong></div>
          <div class="stat-card"><span>Balance</span><strong class="js-stat-balance">$10,000</strong></div>
          <div class="stat-card"><span>Avg Pax / Flight</span><strong class="js-stat-avg">0.0</strong></div>
          <div class="stat-card"><span>Boarding Rate</span><strong class="js-stat-boarding">0%</strong></div>
        </div>
      </div>
      <div class="hud-selection js-selection" hidden>
        <span class="sel-label">SELECTED</span><em class="empty">Nothing</em>
      </div>
    </div>
    <div class="hud-controls">
      <button class="brick-btn btn-reset js-grid" title="Toggle grid">GRID</button>
      <button class="brick-btn btn-reset js-reset" title="Reset view">RESET</button>
      <button class="brick-btn js-zoom-out" title="Zoom out">&minus;</button>
      <button class="brick-btn js-zoom-in" title="Zoom in">+</button>
    </div>
  </div>
`;
