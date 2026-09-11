/**
 * HUD — HTML/CSS overlay. Pure view: it renders values it is handed and
 * emits button intents via callbacks. It holds no game state and never
 * touches Three.js.
 */
import { formatMoney, formatMoneyDelta, stateLabel, t } from "../i18n/strings";

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

/** Airport-wide operating status at a glance (V1.5 §6) — computed by Game
 *  from existing GroundOperation/Staff/Flight/Event state, never a new
 *  persisted value. */
export interface AirportStatusInfo {
  label: string;
  /** "good" = normal, "warn" = something needs attention, "alert" = an event is active. */
  tone: "good" | "warn" | "alert";
}

export interface HudCallbacks {
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  onToggleGrid(): void;
  /** V1.2-E. */
  onSave(): void;
  onLoad(): void;
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
  private readonly saveStatusEl: HTMLElement;
  private readonly airportStatusEl: HTMLElement;

  private revenueTimer = 0;
  private noticeTimer = 0;
  private noticeHideTimer = 0;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.root = container;
    this.root.innerHTML = buildTemplate();

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
    this.saveStatusEl = this.must(".js-save-status");
    this.airportStatusEl = this.must(".js-airport-status");

    this.must(".js-zoom-in").addEventListener("click", callbacks.onZoomIn);
    this.must(".js-zoom-out").addEventListener("click", callbacks.onZoomOut);
    this.must(".js-reset").addEventListener("click", callbacks.onReset);
    this.must(".js-grid").addEventListener("click", callbacks.onToggleGrid);
    this.must(".js-save").addEventListener("click", callbacks.onSave);
    this.must(".js-load").addEventListener("click", callbacks.onLoad);
  }

  /** Save-status badge next to the airport title (spec §E.1). */
  setSaveStatus(status: "IDLE" | "SAVED" | "ERROR"): void {
    this.saveStatusEl.hidden = status === "IDLE";
    this.saveStatusEl.textContent =
      status === "SAVED" ? `● ${t("saved")}` : status === "ERROR" ? `● ${t("saveError")}` : "";
    this.saveStatusEl.classList.toggle("save-error", status === "ERROR");
  }

  /** Airport-wide status badge next to the title (spec §6). */
  setAirportStatus(info: AirportStatusInfo): void {
    this.airportStatusEl.textContent = `● ${info.label}`;
    this.airportStatusEl.className = `airport-status js-airport-status tone-${info.tone}`;
  }

  setStats(stats: HudStats): void {
    this.airportNameEl.textContent = stats.airportName;
    this.levelEl.textContent = String(stats.level);
    this.moneyEl.textContent = formatMoney(stats.money);
    this.aircraftEl.textContent = String(stats.aircraftCount);
    this.gateEl.textContent = String(stats.gateCount);
    this.passengerEl.textContent = String(stats.passengerCount);
    this.flightEl.textContent = String(stats.flightCount);
    this.staffEl.textContent = `${stats.staffActive}/${stats.staffCount}`;
  }

  /** Brief "+12,480원" pop next to the money stat when ticket revenue lands. */
  showRevenue(amount: number): void {
    this.flashMoney(formatMoneyDelta(amount), "gain", 1200);
  }

  /** Brief "-12,480원" pop when a building is bought. */
  showSpend(amount: number): void {
    this.flashMoney(formatMoneyDelta(-amount), "spend", 1500);
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
      const parts = [`<span class="sel-label">${escapeHtml(t("selected"))}</span>`];
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
    this.statRevenueEl.textContent = formatMoney(s.revenue);
    this.statBalanceEl.textContent = formatMoney(s.balance);
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
          `<span class="fr-rev">${escapeHtml(formatMoney(e.revenue))}</span>` +
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
        const stateText = r.needsStaff ? "직원 필요" : stateLabel(r.state);
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

function buildTemplate(): string {
  return /* html */ `
  <div class="hud-notice js-notice" hidden></div>

  <div class="hud-top">
    <div class="hud-panel hud-title">
      Brick Airport
      <small class="js-airport-name">My Airport</small>
      <b class="airport-status js-airport-status tone-good">● ${t("statusNormal")}</b>
      <b class="save-status js-save-status" hidden></b>
    </div>
    <div class="hud-panel hud-stats">
      <div class="hud-stat"><span>${t("level")}</span><b class="js-level">1</b></div>
      <div class="hud-stat hud-stat-money">
        <span>${t("balance")}</span><b class="js-money">${escapeHtml(formatMoney(10000))}</b>
        <b class="hud-revenue js-revenue" aria-hidden="true"></b>
      </div>
      <div class="hud-stat"><span>${t("aircraft")}</span><b class="js-aircraft">1</b></div>
      <div class="hud-stat"><span>${t("gate")}</span><b class="js-gate">1</b></div>
      <div class="hud-stat"><span>${t("passengers")}</span><b class="js-passengers">0</b></div>
      <div class="hud-stat"><span>${t("flights")}</span><b class="js-flights">0</b></div>
      <div class="hud-stat"><span>${t("staff")}</span><b class="js-staff">0/0</b></div>
    </div>
  </div>

  <div class="hud-mid">
    <div class="hud-panel mission-panel js-missions" hidden>
      <div class="stat-panel-title">${t("missions")}</div>
      <div class="mission-list js-missions-list"></div>
    </div>
    <div class="hud-panel event-panel js-events" hidden>
      <div class="stat-panel-title">${t("operationalEvent")}</div>
      <div class="event-list js-events-list"></div>
    </div>
    <div class="hud-panel flight-history js-flight-history" hidden>
      <div class="stat-panel-title">${t("recentFlights")}</div>
      <div class="flight-history-list js-flight-history-list"></div>
    </div>
    <div class="hud-panel ground-ops js-ground-ops" hidden>
      <div class="stat-panel-title">${t("groundOperations")}</div>
      <div class="ground-ops-list js-ground-ops-list"></div>
    </div>
  </div>

  <div class="hud-bottom">
    <div class="hud-panel hud-context">
      <div class="hud-statistics js-statistics">
        <div class="stat-panel-title">${t("airportStatistics")}</div>
        <div class="statistics-grid">
          <div class="stat-card"><span>${t("statFlights")}</span><strong class="js-stat-flights">0</strong></div>
          <div class="stat-card"><span>${t("statPassengers")}</span><strong class="js-stat-passengers">0</strong></div>
          <div class="stat-card"><span>${t("statRevenue")}</span><strong class="js-stat-revenue">${escapeHtml(formatMoney(0))}</strong></div>
          <div class="stat-card"><span>${t("statBalance")}</span><strong class="js-stat-balance">${escapeHtml(formatMoney(10000))}</strong></div>
          <div class="stat-card"><span>${t("statAvg")}</span><strong class="js-stat-avg">0.0</strong></div>
          <div class="stat-card"><span>${t("statBoarding")}</span><strong class="js-stat-boarding">0%</strong></div>
        </div>
        <div class="stat-panel-title operations-title">${t("operations")}</div>
        <div class="operations-grid">
          <div class="stat-card"><span>${t("opService")}</span><strong class="js-op-service">50</strong></div>
          <div class="stat-card"><span>${t("opSatisfaction")}</span><strong class="js-op-satisfaction">70</strong></div>
          <div class="stat-card"><span>${t("opOnTime")}</span><strong class="js-op-ontime">90%</strong></div>
          <div class="stat-card"><span>${t("opGround")}</span><strong class="js-op-ground">70</strong></div>
          <div class="stat-card"><span>${t("opReputation")}</span><strong class="js-op-reputation">0</strong></div>
        </div>
      </div>
      <div class="hud-selection js-selection" hidden>
        <span class="sel-label">${t("selected")}</span><em class="empty">-</em>
      </div>
    </div>
    <div class="hud-controls">
      <button class="brick-btn btn-reset js-save" title="${t("save")}">${t("save")}</button>
      <button class="brick-btn btn-reset js-load" title="${t("load")}">${t("load")}</button>
      <button class="brick-btn btn-reset js-grid" title="${t("grid")}">${t("grid")}</button>
      <button class="brick-btn btn-reset js-reset" title="${t("reset")}">${t("reset")}</button>
      <button class="brick-btn js-zoom-out" title="Zoom out">&minus;</button>
      <button class="brick-btn js-zoom-in" title="Zoom in">+</button>
    </div>
  </div>
`;
}
