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
  /** Total staff (V0.9-E). */
  staffCount: number;
  /** Staff currently on a task. */
  staffActive: number;
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

/** One completed-flight row in the Recent Flights panel (V0.6-E). */
export interface FlightHistoryEntry {
  id: string;
  route: string;
  revenue: number;
  /** Average passenger satisfaction, shown as "★83" when present (V0.7-E). */
  satisfaction?: number;
}

/** One row of the Ground Operations panel (V0.8-E / V0.9-E). */
export interface GroundOpRow {
  flightId: string;
  task: string;
  state: string;
  /** Staff role + name, e.g. "Cleaning Agent · Lee" or "Cleaning Agent". */
  staff?: string;
  /** True when the task is waiting for a free staff member (spec §D.4). */
  needsStaff?: boolean;
}

/** One row of the Missions panel (V1.0-E). Only ACTIVE missions are shown. */
export interface MissionRow {
  title: string;
  description: string;
  /** e.g. "2/3" — progress toward target, already clamped. */
  progressText: string;
  /** 0–1, for the progress bar fill. */
  progressFraction: number;
  /** e.g. "+$500 · +3 rep". */
  rewardText: string;
}

/** One row of the Operational Events panel (V1.0-E). Only ACTIVE events. */
export interface EventRow {
  /** Emoji marker for the event type. */
  icon: string;
  title: string;
  description: string;
  /** e.g. "12/18". */
  progressText: string;
  /** 0–1, for the progress bar fill. */
  progressFraction: number;
  /** e.g. "0:45 left" — game-seconds remaining, mm:ss. */
  timeText: string;
}

/** Live operations metrics shown under the Airport Statistics grid (V0.7 / V0.8). */
export interface OperationsInfo {
  serviceScore: number;
  satisfaction: number;
  onTimeRate: number;
  reputation: number;
  /** Ground operation efficiency 0–100 (V0.8-D). */
  groundEfficiency: number;
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
  private readonly staffEl: HTMLElement;
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
  private readonly opServiceEl: HTMLElement;
  private readonly opSatisfactionEl: HTMLElement;
  private readonly opOnTimeEl: HTMLElement;
  private readonly opReputationEl: HTMLElement;
  private readonly opGroundEl: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly flightHistoryEl: HTMLElement;
  private readonly flightHistoryListEl: HTMLElement;
  private readonly groundOpsEl: HTMLElement;
  private readonly groundOpsListEl: HTMLElement;
  private readonly missionsEl: HTMLElement;
  private readonly missionsListEl: HTMLElement;
  private readonly eventsEl: HTMLElement;
  private readonly eventsListEl: HTMLElement;

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
    this.staffEl = this.must(".js-staff");
    this.revenueEl = this.must(".js-revenue");
    this.selectionEl = this.must(".js-selection");
    this.statisticsEl = this.must(".js-statistics");
    this.statFlightsEl = this.must(".js-stat-flights");
    this.statPassengersEl = this.must(".js-stat-passengers");
    this.statRevenueEl = this.must(".js-stat-revenue");
    this.statBalanceEl = this.must(".js-stat-balance");
    this.statAvgEl = this.must(".js-stat-avg");
    this.statBoardingEl = this.must(".js-stat-boarding");
    this.opServiceEl = this.must(".js-op-service");
    this.opSatisfactionEl = this.must(".js-op-satisfaction");
    this.opOnTimeEl = this.must(".js-op-ontime");
    this.opReputationEl = this.must(".js-op-reputation");
    this.opGroundEl = this.must(".js-op-ground");
    this.noticeEl = this.must(".js-notice");
    this.flightHistoryEl = this.must(".js-flight-history");
    this.flightHistoryListEl = this.must(".js-flight-history-list");
    this.groundOpsEl = this.must(".js-ground-ops");
    this.groundOpsListEl = this.must(".js-ground-ops-list");
    this.missionsEl = this.must(".js-missions");
    this.missionsListEl = this.must(".js-missions-list");
    this.eventsEl = this.must(".js-events");
    this.eventsListEl = this.must(".js-events-list");

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
    this.staffEl.textContent = `${stats.staffActive}/${stats.staffCount}`;
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

  /**
   * Update the Operations metrics row under the Statistics grid (V0.7). A
   * separate block — it never changes the meaning of the stats above (§48, §59).
   */
  setOperations(o: OperationsInfo): void {
    this.opServiceEl.textContent = String(o.serviceScore);
    this.opSatisfactionEl.textContent = String(o.satisfaction);
    this.opOnTimeEl.textContent = `${o.onTimeRate}%`;
    this.opReputationEl.textContent = String(o.reputation);
    this.opGroundEl.textContent = String(o.groundEfficiency);
  }

  /**
   * Render the Recent Flights panel (V0.6-E). A separate panel from Airport
   * Statistics — never replaces it. Hidden until the first flight completes.
   */
  setFlightHistory(entries: FlightHistoryEntry[]): void {
    if (entries.length === 0) {
      this.flightHistoryEl.hidden = true;
      return;
    }
    this.flightHistoryEl.hidden = false;
    this.flightHistoryListEl.innerHTML = entries
      .map((e) => {
        const star =
          e.satisfaction !== undefined
            ? `<span class="fr-sat">★${e.satisfaction}</span>`
            : "";
        return (
          `<div class="flight-row">` +
          `<span class="fr-id">${escapeHtml(e.id)}</span>` +
          `<span class="fr-route">${escapeHtml(e.route)}</span>` +
          star +
          `<span class="fr-rev">$${e.revenue.toLocaleString("en-US")}</span>` +
          `</div>`
        );
      })
      .join("");
  }

  /**
   * Render the Ground Operations panel (V0.8-E, spec §45). A separate panel;
   * hidden until the first turnaround task appears.
   */
  setGroundOperations(rows: GroundOpRow[]): void {
    if (rows.length === 0) {
      this.groundOpsEl.hidden = true;
      return;
    }
    this.groundOpsEl.hidden = false;
    this.groundOpsListEl.innerHTML = rows
      .map((r) => {
        const stateText = r.needsStaff
          ? "STAFF REQ"
          : r.state.replace(/_/g, " ");
        const stateClass = r.needsStaff
          ? "gop-needsstaff"
          : `gop-${r.state.toLowerCase().replace(/_/g, "-")}`;
        const staffLine = r.staff
          ? `<span class="gop-staff">${escapeHtml(r.staff)}</span>`
          : "";
        return (
          `<div class="gop-row">` +
          `<span class="gop-flight">${escapeHtml(r.flightId)}</span>` +
          `<span class="gop-task">${escapeHtml(r.task)}</span>` +
          staffLine +
          `<span class="gop-state ${stateClass}">${escapeHtml(stateText)}</span>` +
          `</div>`
        );
      })
      .join("");
  }

  /**
   * Render the Missions panel (V1.0-E) — up to three ACTIVE objectives. A
   * separate panel in the middle stack; hidden until the first mission is
   * active. Never a full-screen UI (spec §E.1).
   */
  setMissions(rows: MissionRow[]): void {
    if (rows.length === 0) {
      this.missionsEl.hidden = true;
      return;
    }
    this.missionsEl.hidden = false;
    this.missionsListEl.innerHTML = rows
      .map((r) => {
        const pct = Math.round(clamp01(r.progressFraction) * 100);
        return (
          `<div class="mission-row">` +
          `<div class="mrow-head">` +
          `<span class="mrow-title">${escapeHtml(r.title)}</span>` +
          `<span class="mrow-progress">${escapeHtml(r.progressText)}</span>` +
          `</div>` +
          `<div class="mrow-bar"><i style="width:${pct}%"></i></div>` +
          `<div class="mrow-foot">` +
          `<span class="mrow-desc">${escapeHtml(r.description)}</span>` +
          `<span class="mrow-reward">${escapeHtml(r.rewardText)}</span>` +
          `</div>` +
          `</div>`
        );
      })
      .join("");
  }

  /**
   * Render the Operational Events panel (V1.0-E) — the ACTIVE operating
   * prompts. A separate panel; hidden when nothing is running. Fire / resolve /
   * expire are surfaced through showNotice by Game, not here.
   */
  setEvents(rows: EventRow[]): void {
    if (rows.length === 0) {
      this.eventsEl.hidden = true;
      return;
    }
    this.eventsEl.hidden = false;
    this.eventsListEl.innerHTML = rows
      .map((r) => {
        const pct = Math.round(clamp01(r.progressFraction) * 100);
        return (
          `<div class="event-row">` +
          `<div class="erow-head">` +
          `<span class="erow-title">${escapeHtml(r.icon)} ${escapeHtml(r.title)}</span>` +
          `<span class="erow-progress">${escapeHtml(r.progressText)}</span>` +
          `</div>` +
          `<div class="mrow-bar"><i style="width:${pct}%"></i></div>` +
          `<div class="erow-foot">` +
          `<span class="erow-desc">${escapeHtml(r.description)}</span>` +
          `<span class="erow-time">${escapeHtml(r.timeText)}</span>` +
          `</div>` +
          `</div>`
        );
      })
      .join("");
  }

  private must(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`HUD: missing element "${selector}"`);
    return el;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
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
      <div class="hud-stat"><span>Staff</span><b class="js-staff">0/0</b></div>
    </div>
  </div>

  <div class="hud-mid">
    <div class="hud-panel mission-panel js-missions" hidden>
      <div class="stat-panel-title">Missions</div>
      <div class="mission-list js-missions-list"></div>
    </div>
    <div class="hud-panel event-panel js-events" hidden>
      <div class="stat-panel-title">Operational Event</div>
      <div class="event-list js-events-list"></div>
    </div>
    <div class="hud-panel flight-history js-flight-history" hidden>
      <div class="stat-panel-title">Recent Flights</div>
      <div class="flight-history-list js-flight-history-list"></div>
    </div>
    <div class="hud-panel ground-ops js-ground-ops" hidden>
      <div class="stat-panel-title">Ground Operations</div>
      <div class="ground-ops-list js-ground-ops-list"></div>
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
        <div class="stat-panel-title operations-title">Operations</div>
        <div class="operations-grid">
          <div class="stat-card"><span>Service</span><strong class="js-op-service">50</strong></div>
          <div class="stat-card"><span>Satisfaction</span><strong class="js-op-satisfaction">70</strong></div>
          <div class="stat-card"><span>On-time</span><strong class="js-op-ontime">90%</strong></div>
          <div class="stat-card"><span>Ground Eff</span><strong class="js-op-ground">70</strong></div>
          <div class="stat-card"><span>Reputation</span><strong class="js-op-reputation">0</strong></div>
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
