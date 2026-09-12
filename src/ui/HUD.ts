/**
 * HUD — HTML/CSS overlay. Pure view: it renders values it is handed and
 * emits button intents via callbacks. It holds no game state and never
 * touches Three.js. The one exception (V1.9 §24-25) is a synthesized-tone
 * AudioManager, which is presentation feedback in exactly the same sense as
 * the CSS fade this class already drives — it carries no game logic either.
 */
import { formatMoney, formatMoneyDelta, stateLabel, t } from "../i18n/strings";
import type { AudioManager, NoticeTone } from "../audio/AudioManager";

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

/**
 * One row of the "현재 운항" (Flight Status Board) panel (V1.7 §19-20) — a
 * flight that has not reached COMPLETED/CANCELLED yet. A sibling of the
 * Recent Flights panel above it, never a replacement: Recent Flights still
 * shows only finished flights, unchanged.
 */
export interface ActiveFlightEntry {
  id: string;
  route: string;
  /** Localized flight-state label, e.g. "탑승 중". */
  statusText: string;
}

/**
 * Notice priority tiers (V1.7 §23): 1 = important (takeoff/arrival, level up,
 * expansion, mission/event), 2 = operations (boarding, task complete, staff
 * shortage, gate ready), 3 = general (build confirmations, minor changes).
 * A lower-numbered notice already on screen is not interrupted by an
 * equal-or-lower-priority one — this is the only new logic; the toast itself
 * is still the single existing `.js-notice` element (no new UI/queue).
 */
export type NoticePriority = 1 | 2 | 3;

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

/**
 * "다음 목표" panel (V1.6 §23-25) — Progression guidance, distinct from
 * Mission (spec §26): the airport's own OR-condition growth thresholds, read
 * straight from AirportProgression.LEVEL_REQUIREMENTS. Hidden once the
 * airport is at its max level (nothing left to show).
 */
export interface GrowthGoalInfo {
  nextLevel: number;
  flights: { current: number; target: number };
  passengers: { current: number; target: number };
}

/** Live operations metrics shown under the Airport Statistics grid (V0.7 / V0.8). */
export interface OperationsInfo {
  serviceScore: number;
  satisfaction: number;
  onTimeRate: number;
  reputation: number;
  /** Ground operation efficiency 0–100 (V0.8-D). */
  groundEfficiency: number;
  /** Gates currently AVAILABLE — "Airport Management Summary" (V1.8 §4). */
  availableGates: number;
  /** Ground operations not yet COMPLETED/CANCELLED (V1.8 §4). */
  activeOperations: number;
}

/** Airport-wide operating status at a glance (V1.5 §6, extended V1.8 §6-7) —
 *  computed by Game from existing GroundOperation/Staff/Flight/Event state,
 *  never a new persisted value. Four tiers: "good" (NORMAL), "attention"
 *  (ATTENTION — a soft precursor signal), "warn" (WARNING — a real shortage
 *  or backlog), "critical" (CRITICAL — an operation is genuinely stuck). */
export interface AirportStatusInfo {
  label: string;
  tone: "good" | "attention" | "warn" | "critical";
}

/**
 * One row of the "확인 필요" Action Center (V1.8 §8-11) — a real, currently
 * true condition read from existing GameState, never a fabricated one (§28).
 * Priority 1 = an actual operating problem, 2 = a growth opportunity worth
 * mentioning, 3 = general information. Clicking a row with a `kind` other
 * than "INFO" navigates to the related UI (§10) — it never performs the
 * action itself (§11's "no automatic player action").
 */
export type ActionKind = "AIRCRAFT" | "BUILD_GATE" | "STAFF" | "EXPAND" | "INFO";
export interface ActionItem {
  icon: string;
  text: string;
  detail?: string;
  priority: 1 | 2 | 3;
  kind: ActionKind;
  /** Aircraft id to focus, only meaningful when kind === "AIRCRAFT". */
  targetId?: string;
}

/** Left-nav category ids (V1.9-D STEP 2 §8) — each opens the drawer section
 * that already-existing panel data renders into. "build" is handled
 * separately (it just opens the existing BuildMenu, per spec §9's own
 * "건설 → 기존 BuildMenu" instruction — no drawer section for it). */
export type NavCategory =
  | "flights"
  | "passengers"
  | "staff"
  | "facility"
  | "mission"
  | "event"
  | "stats";

/**
 * One "Live Activity" card (V1.9-D STEP 2 §14-20) — always a REAL selectable
 * GameState object, never a placeholder (§29). Game computes at most one per
 * kind (the categories the reference image itself uses) from the same
 * managers Selection already reads; clicking a card reuses the existing
 * SelectionManager/CameraController, never a new selection path (§19).
 */
export type ActivityKind =
  | "AIRCRAFT"
  | "PASSENGER"
  | "VEHICLE"
  | "STAFF"
  | "GATE"
  | "GROUND_OP";
export interface ActivityCard {
  kind: ActivityKind;
  targetId: string;
  icon: string;
  title: string;
  subtitle: string;
  lines: string[];
  /** 0-1, shown as a progress bar (V2.0 Phase G — ground-op turnaround %).
   * Omitted entirely for kinds that have no meaningful progress. */
  progress?: number;
  /**
   * V3.0 PHASE 3 §3 — a second, genuinely different object this card can
   * jump to (a Gate's parked aircraft, a Staff member's assigned gate),
   * rendered as its own labelled footer button. Reuses the exact same
   * onActivityCardClick(kind, targetId) select path as the card's primary
   * button — no new callback, no new selection mechanism. Omitted when no
   * such related object currently exists (the button then renders disabled
   * rather than being silently removed, so the card's footer layout stays
   * stable frame to frame).
   */
  related?: { kind: ActivityKind; targetId: string; label: string };
}

export interface HudCallbacks {
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  onToggleGrid(): void;
  /** V1.2-E. */
  onSave(): void;
  onLoad(): void;
  /** V1.8 §10 — navigate to whatever an Action Center row points at. */
  onActionClick(item: ActionItem): void;
  /** V1.9-D STEP 2 §9 — open the existing BuildMenu from the left nav. */
  onOpenBuild(): void;
  /** V1.9-D STEP 2 §19 — select the real object an Activity Card represents. */
  onActivityCardClick(kind: ActivityKind, targetId: string): void;
  /** A drawer section just opened — let Game close the (separate) BuildMenu
   * panel so only one nav-triggered panel is ever visible at once. */
  onDrawerOpen(): void;
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
  private readonly clockEl: HTMLElement;
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
  private readonly opAvailableGatesEl: HTMLElement;
  private readonly opActiveOperationsEl: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly flightHistoryEl: HTMLElement;
  private readonly flightHistoryListEl: HTMLElement;
  private readonly activeFlightsEl: HTMLElement;
  private readonly activeFlightsListEl: HTMLElement;
  private readonly groundOpsEl: HTMLElement;
  private readonly groundOpsListEl: HTMLElement;
  private readonly missionsEl: HTMLElement;
  private readonly missionsListEl: HTMLElement;
  private readonly eventsEl: HTMLElement;
  private readonly eventsListEl: HTMLElement;
  private readonly growthGoalEl: HTMLElement;
  private readonly growthGoalBodyEl: HTMLElement;
  private readonly saveStatusEl: HTMLElement;
  private readonly airportStatusEl: HTMLElement;
  private readonly actionCenterEl: HTMLElement;
  private readonly actionCenterListEl: HTMLElement;
  private readonly actionCenterTitleEl: HTMLElement;
  /** V1.8 §34-35 / V1.9-D STEP 2 §11 — user-collapsible so it never has to
   * permanently cover the 3D view; defaults COLLAPSED now (reference image
   * treats it as a small "확인 필요 N" indicator, expanded on click). */
  private actionCenterCollapsed = true;

  // ---- V1.9-D STEP 2: top bar level progress, left nav + drawer, activity
  // cards, action badge. All of the above panels move INTO the drawer (see
  // buildTemplate) — their own setX() methods are unchanged, only where they
  // render moved, so this section only adds the new chrome around them.
  private readonly levelBarEl: HTMLElement;
  private readonly levelProgressTextEl: HTMLElement;
  private readonly statRevenueTopEl: HTMLElement;
  private readonly drawerEl: HTMLElement;
  private readonly drawerTitleEl: HTMLElement;
  private readonly navButtons: HTMLButtonElement[];
  private readonly drawerSections: Record<NavCategory, HTMLElement>;
  private readonly drawerLabels: Record<NavCategory, string> = {
    flights: "항공편",
    passengers: "승객",
    staff: "직원",
    facility: "시설",
    mission: t("missions"),
    event: t("operationalEvent"),
    stats: t("airportStatistics"),
  };
  private openCategory: NavCategory | null = null;
  private readonly activityCardsEl: HTMLElement;
  private readonly drawerPaxCountEl: HTMLElement;
  private readonly drawerPaxAvgEl: HTMLElement;
  private readonly drawerPaxBoardingEl: HTMLElement;
  private readonly drawerStaffCountEl: HTMLElement;
  private readonly drawerStaffActiveEl: HTMLElement;
  private readonly drawerGatesEl: HTMLElement;
  private readonly drawerOpsEl: HTMLElement;
  private readonly helpBarEl: HTMLElement;
  /** Kept so a click on an activity card can be mapped back to its target
   * (same event-delegation pattern as the Action Center list above). */
  private activityCards: ActivityCard[] = [];
  /** The currently-selected object's id (from ANY source — a direct 3D
   * click, or a card click), so the matching bottom card can highlight even
   * when selection happened elsewhere. */
  private selectedTargetId: string | null = null;

  private revenueTimer = 0;
  private noticeTimer = 0;
  private noticeHideTimer = 0;
  /** Priority of the notice currently on screen, and when it stops guarding. */
  private noticePriority: NoticePriority = 3;
  private noticeGuardUntil = 0;
  /** Current Action Center rows, kept so the click-delegation handler below
   * can map a clicked row index back to its item (V1.8 §10). */
  private actionItems: ActionItem[] = [];

  constructor(
    container: HTMLElement,
    private readonly callbacks: HudCallbacks,
    private readonly audio: AudioManager,
  ) {
    this.root = container;
    this.root.innerHTML = buildTemplate();

    this.airportNameEl = this.must(".js-airport-name");
    this.levelEl = this.must(".js-level");
    this.moneyEl = this.must(".js-money");
    this.aircraftEl = this.must(".js-aircraft");
    this.gateEl = this.must(".js-gate");
    this.passengerEl = this.must(".js-passengers");
    this.flightEl = this.must(".js-flights");
    this.revenueEl = this.must(".js-revenue");
    this.selectionEl = this.must(".js-selection");
    this.clockEl = this.must(".js-clock");
    this.must(".js-statistics"); // validated to exist; content lives in the 통계 drawer section
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
    this.opAvailableGatesEl = this.must(".js-op-available-gates");
    this.opActiveOperationsEl = this.must(".js-op-active-operations");
    this.noticeEl = this.must(".js-notice");
    this.flightHistoryEl = this.must(".js-flight-history");
    this.flightHistoryListEl = this.must(".js-flight-history-list");
    this.activeFlightsEl = this.must(".js-active-flights");
    this.activeFlightsListEl = this.must(".js-active-flights-list");
    this.groundOpsEl = this.must(".js-ground-ops");
    this.groundOpsListEl = this.must(".js-ground-ops-list");
    this.missionsEl = this.must(".js-missions");
    this.missionsListEl = this.must(".js-missions-list");
    this.eventsEl = this.must(".js-events");
    this.eventsListEl = this.must(".js-events-list");
    this.growthGoalEl = this.must(".js-growth-goal");
    this.growthGoalBodyEl = this.must(".js-growth-goal-body");
    this.saveStatusEl = this.must(".js-save-status");
    this.airportStatusEl = this.must(".js-airport-status");
    this.actionCenterEl = this.must(".js-action-center");
    this.actionCenterListEl = this.must(".js-action-center-list");
    this.actionCenterTitleEl = this.must(".js-action-center-title");
    this.actionCenterTitleEl.addEventListener("click", () => {
      this.actionCenterCollapsed = !this.actionCenterCollapsed;
      this.renderActionCenter();
    });

    // V1.9-D STEP 2: top bar level progress + left nav / drawer + activity
    // cards + action badge.
    this.levelBarEl = this.must(".js-level-bar");
    this.levelProgressTextEl = this.must(".js-level-progress-text");
    this.statRevenueTopEl = this.must(".js-stat-revenue-top");
    this.drawerEl = this.must(".js-drawer");
    this.drawerTitleEl = this.must(".js-drawer-title");
    this.activityCardsEl = this.must(".js-activity-cards");
    this.drawerPaxCountEl = this.must(".js-drawer-pax-count");
    this.drawerPaxAvgEl = this.must(".js-drawer-pax-avg");
    this.drawerPaxBoardingEl = this.must(".js-drawer-pax-boarding");
    this.drawerStaffCountEl = this.must(".js-drawer-staff-count");
    this.drawerStaffActiveEl = this.must(".js-drawer-staff-active");
    this.drawerGatesEl = this.must(".js-drawer-gates");
    this.drawerOpsEl = this.must(".js-drawer-ops");
    this.helpBarEl = this.must(".js-help-bar");

    this.drawerSections = {
      flights: this.must(".js-drawer-flights"),
      passengers: this.must(".js-drawer-passengers"),
      staff: this.must(".js-drawer-staff"),
      facility: this.must(".js-drawer-facility"),
      mission: this.must(".js-drawer-mission"),
      event: this.must(".js-drawer-event"),
      stats: this.must(".js-drawer-stats"),
    };

    this.navButtons = [...this.root.querySelectorAll<HTMLButtonElement>(".js-nav-cat")];
    for (const btn of this.navButtons) {
      const cat = btn.dataset.cat as NavCategory;
      btn.addEventListener("click", () => this.toggleDrawer(cat));
    }
    this.must(".js-nav-build").addEventListener("click", callbacks.onOpenBuild);
    this.must(".js-drawer-close").addEventListener("click", () => this.closeDrawer());

    // Event delegation for activity cards — same pattern as Action Center.
    // V3.0 PHASE 3 §3 extends this to the card's own footer buttons: a
    // secondary "related object" button (data-action="related") selects
    // THAT object instead of the card's own; an "info" button
    // (data-action="info") just opens this same category's drawer, a
    // HUD-internal affordance that never needs to reach Game at all. A
    // click anywhere else on the card (or its primary button) keeps the
    // original select-this-card behaviour unchanged.
    this.activityCardsEl.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      const card = target.closest<HTMLElement>(".activity-card");
      const idx = card ? Number(card.dataset.index) : NaN;
      const item = Number.isInteger(idx) ? this.activityCards[idx] : undefined;
      if (!item) return;

      const relatedBtn = target.closest<HTMLElement>('[data-action="related"]');
      if (relatedBtn) {
        if (relatedBtn.getAttribute("aria-disabled") === "true") return;
        if (item.related) callbacks.onActivityCardClick(item.related.kind, item.related.targetId);
        return;
      }

      const infoBtn = target.closest<HTMLElement>('[data-action="info"]');
      if (infoBtn) {
        const cat = infoBtn.dataset.infoCat as NavCategory | undefined;
        if (cat) this.toggleDrawer(cat);
        return;
      }

      callbacks.onActivityCardClick(item.kind, item.targetId);
    });

    this.must(".js-zoom-in").addEventListener("click", callbacks.onZoomIn);
    this.must(".js-zoom-out").addEventListener("click", callbacks.onZoomOut);
    this.must(".js-reset").addEventListener("click", callbacks.onReset);
    this.must(".js-grid").addEventListener("click", callbacks.onToggleGrid);
    this.must(".js-save").addEventListener("click", callbacks.onSave);
    this.must(".js-load").addEventListener("click", callbacks.onLoad);

    // Event delegation (V1.8 §10): rows are re-rendered wholesale on every
    // setActionItems() call, so one listener on the list container — rather
    // than one per row — is both simpler and avoids leaking listeners.
    this.actionCenterListEl.addEventListener("click", (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>(".action-row");
      const idx = row ? Number(row.dataset.index) : NaN;
      const item = Number.isInteger(idx) ? this.actionItems[idx] : undefined;
      if (item && item.kind !== "INFO") callbacks.onActionClick(item);
    });

    // UI click tone (V1.9 §24) — one delegated listener catches every
    // brick-style button in the shared HUD container, including BuildMenu's
    // (its panel is appended into this same container — see Game's
    // construction order), so no per-button wiring is needed anywhere else.
    this.root.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest(".brick-btn, .nav-item, .util-btn, .zoom-btn")) {
        this.audio.playClick();
      }
    });

    // Top-bar clock (V2.0 Phase G) — the real device time, purely cosmetic
    // chrome like the reference's "10:24 맑음" badge; no weather system
    // exists so the sun icon is fixed rather than fabricating live data.
    this.updateClock();
    setInterval(() => this.updateClock(), 30_000);
  }

  private updateClock(): void {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    this.clockEl.textContent = `${hh}:${mm}`;
  }

  // --------------------------------------------- V1.9-D STEP 2: nav + drawer

  /**
   * Open `category`'s drawer section, or close the drawer if that category
   * is already open (spec §10 — one drawer at a time, closed by default).
   * Every section's own content still comes from its existing setX() method;
   * this only switches which section is visible inside the shared drawer.
   */
  private toggleDrawer(category: NavCategory): void {
    if (this.openCategory === category) {
      this.closeDrawer();
      return;
    }
    this.openCategory = category;
    this.drawerEl.hidden = false;
    this.drawerTitleEl.textContent = this.drawerLabels[category];
    for (const [cat, el] of Object.entries(this.drawerSections)) {
      el.hidden = cat !== category;
    }
    for (const btn of this.navButtons) {
      btn.classList.toggle("is-active", btn.dataset.cat === category);
    }
    this.callbacks.onDrawerOpen();
  }

  /** Public so Game can close the drawer when the separate BuildMenu panel
   * opens (V1.9-D STEP 2 §10 — only one nav-triggered panel at a time). */
  closeDrawer(): void {
    this.openCategory = null;
    this.drawerEl.hidden = true;
    for (const btn of this.navButtons) btn.classList.remove("is-active");
  }

  /**
   * Top-bar level progress (V1.9-D STEP 2 §6) — reuses the exact same
   * AirportProgression data as the "다음 목표" drawer panel (GrowthGoalInfo),
   * just condensed to one bar + the metric closest to its threshold. No new
   * progression calculation, no new persisted field.
   */
  setLevelProgress(info: GrowthGoalInfo | null): void {
    if (!info) {
      this.levelBarEl.style.width = "100%";
      this.levelProgressTextEl.textContent = "MAX";
      return;
    }
    const flightsFrac = info.flights.target > 0 ? info.flights.current / info.flights.target : 0;
    const paxFrac = info.passengers.target > 0 ? info.passengers.current / info.passengers.target : 0;
    const useFlights = flightsFrac >= paxFrac;
    const pct = Math.round(clamp01(useFlights ? flightsFrac : paxFrac) * 100);
    this.levelBarEl.style.width = `${pct}%`;
    this.levelProgressTextEl.textContent = useFlights
      ? `${info.flights.current} / ${info.flights.target}`
      : `${info.passengers.current} / ${info.passengers.target}`;
  }

  /**
   * Bottom "Live Activity" cards (V1.9-D STEP 2 §14-20) — up to one real
   * object per kind, computed by Game from the same managers Selection
   * already reads. Hidden entirely (not zero placeholder cards) when the
   * airport has nothing of any kind yet (spec §29 — never a fake card).
   */
  setActivityCards(cards: ActivityCard[]): void {
    this.activityCards = cards;
    if (cards.length === 0) {
      this.activityCardsEl.hidden = true;
      return;
    }
    this.activityCardsEl.hidden = false;
    this.activityCardsEl.innerHTML = cards
      .map(
        (c, i) =>
          `<div class="activity-card ac-kind-${c.kind.toLowerCase()}" data-index="${i}">` +
          `<div class="ac-card-image"><span>${escapeHtml(c.icon)}</span></div>` +
          `<div class="ac-card-body">` +
          `<div class="ac-card-head">` +
          `<span class="ac-status-dot" aria-hidden="true"></span>` +
          `<span class="ac-card-icon">${escapeHtml(c.icon)}</span>` +
          `<span class="ac-card-title">${escapeHtml(c.title)}</span>` +
          `</div>` +
          `<div class="ac-card-subtitle">${escapeHtml(c.subtitle)}</div>` +
          c.lines.map((l) => `<div class="ac-card-line">${escapeHtml(l)}</div>`).join("") +
          (c.progress != null
            ? `<div class="ac-progress"><i style="width:${Math.round(
                clamp01(c.progress) * 100,
              )}%"></i></div>`
            : "") +
          buildCardFooter(c) +
          `</div>` +
          `</div>`,
      )
      .join("");
    this.applySelectedCardHighlight();
  }

  /**
   * The currently-selected object's id, from ANY source (a direct 3D click
   * or a card click) — so the matching bottom card highlights even when
   * selection happened outside the card row (spec: "3D 객체 클릭 시 ...
   * 하단 카드 하이라이트"). Cheap class toggle, never a re-render.
   */
  setSelectedTarget(targetId: string | null): void {
    this.selectedTargetId = targetId;
    this.applySelectedCardHighlight();
  }

  private applySelectedCardHighlight(): void {
    const els = this.activityCardsEl.querySelectorAll<HTMLElement>(".activity-card");
    els.forEach((el, i) => {
      const card = this.activityCards[i];
      el.classList.toggle(
        "is-selected",
        !!card && this.selectedTargetId != null && card.targetId === this.selectedTargetId,
      );
    });
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
    // Same numbers, duplicated into the 직원 drawer's compact summary
    // (V1.9-D STEP 2 §9) — no new data, just a second real place to read it.
    this.drawerStaffCountEl.textContent = String(stats.staffCount);
    this.drawerStaffActiveEl.textContent = String(stats.staffActive);
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

  /**
   * Temporary centred toast — level-up, "requires level N", "not enough
   * money", ground-op progress, etc. `priority` (V1.7 §23, default 2 =
   * operations) guards against noise: while a strictly more important notice
   * is still showing, an equal-or-lower priority one is dropped instead of
   * cutting it off. Same-or-higher priority always shows (so a second
   * important notice, or the same tier, still gets through as before).
   *
   * `tone` (V1.9 §25, optional) picks the audio cue; when omitted it derives
   * from `priority` (1→"important", 2→"warning", 3→"info") so the ~15
   * existing call sites across Game.ts need no change to get a sound. A
   * handful of clearly-positive milestones (level up, expansion, mission
   * complete) pass "success" explicitly instead. The tone only ever plays
   * when the notice actually shows — never for one the guard above drops —
   * so audio never fires for a toast the player didn't see.
   */
  showNotice(
    text: string,
    ms = 2600,
    priority: NoticePriority = 2,
    tone?: NoticeTone,
  ): boolean {
    const now = performance.now();
    if (now < this.noticeGuardUntil && priority > this.noticePriority) return false;

    this.noticePriority = priority;
    this.noticeGuardUntil = now + ms;

    const defaultTone: NoticeTone =
      priority === 1 ? "important" : priority === 2 ? "warning" : "info";
    const resolvedTone = tone ?? defaultTone;

    // V3.0 PHASE 3 §4 — the "우측 하단 시스템 알림 토스트 (녹색 체크 뱃지)"
    // is this same existing notice element, now tone-colored and carrying a
    // small badge icon instead of always rendering as a plain yellow banner
    // (`tone` previously only ever picked the audio cue, never the visual
    // style). No new notice component, no new call sites — every existing
    // showNotice() caller across Game.ts gets this for free.
    this.noticeEl.textContent = text;
    this.noticeEl.dataset.tone = resolvedTone;
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

    this.audio.playNotice(resolvedTone);
    return true;
  }

  /**
   * Show the SELECTED panel, or hide it when nothing is selected (V1.9-D
   * STEP 2: no longer swaps with Statistics — Statistics now lives in the
   * 통계 drawer, opened independently from the left nav). Floats just above
   * the Activity Cards row so a selection's detail sits right next to the
   * live objects it came from.
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
    this.helpBarEl.hidden = info !== null;
  }

  /** Update the Airport Statistics card values (call only when they change). */
  setStatistics(s: AirportStats): void {
    this.statFlightsEl.textContent = String(s.flights);
    this.statPassengersEl.textContent = String(s.passengers);
    this.statRevenueEl.textContent = formatMoney(s.revenue);
    this.statBalanceEl.textContent = formatMoney(s.balance);
    this.statAvgEl.textContent = s.avgPaxPerFlight.toFixed(1);
    this.statBoardingEl.textContent = `${s.boardingRate}%`;
    // Top bar's 수익 pill (V1.9-D STEP 2 §6) — same lifetime revenue value,
    // never confused with Balance (spec §22's own explicit distinction).
    this.statRevenueTopEl.textContent = formatMoney(s.revenue);
    // 승객 drawer's compact summary — same numbers as the Statistics grid.
    this.drawerPaxCountEl.textContent = String(s.passengers);
    this.drawerPaxAvgEl.textContent = s.avgPaxPerFlight.toFixed(1);
    this.drawerPaxBoardingEl.textContent = `${s.boardingRate}%`;
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
    this.opAvailableGatesEl.textContent = String(o.availableGates);
    this.opActiveOperationsEl.textContent = String(o.activeOperations);
    // 시설 drawer's compact summary — same numbers as the Operations grid.
    this.drawerGatesEl.textContent = String(o.availableGates);
    this.drawerOpsEl.textContent = String(o.activeOperations);
  }

  /**
   * Render the "확인 필요" Action Center (V1.8 §8-11) — a short, priority-
   * ordered list of real conditions read from GameState by Game. Hidden when
   * there is genuinely nothing to flag (§28 — never show a fabricated row).
   */
  setActionItems(items: ActionItem[]): void {
    this.actionItems = items;
    this.renderActionCenter();
  }

  /** Shared by setActionItems() and the collapse-toggle click handler so
   * neither path can fall out of sync with the other (V1.8 §34-35). */
  private renderActionCenter(): void {
    const items = this.actionItems;
    if (items.length === 0) {
      this.actionCenterEl.hidden = true;
      return;
    }
    this.actionCenterEl.hidden = false;
    this.actionCenterTitleEl.textContent = this.actionCenterCollapsed
      ? `${t("actionCenter")} (${items.length})`
      : t("actionCenter");
    this.actionCenterListEl.hidden = this.actionCenterCollapsed;
    if (this.actionCenterCollapsed) return;

    this.actionCenterListEl.innerHTML = items
      .map((item, i) => {
        const clickable = item.kind !== "INFO";
        return (
          `<div class="action-row ac-p${item.priority}${clickable ? " ac-clickable" : ""}" data-index="${i}">` +
          `<span class="ac-icon">${escapeHtml(item.icon)}</span>` +
          `<span class="ac-body">` +
          `<span class="ac-text">${escapeHtml(item.text)}</span>` +
          (item.detail ? `<span class="ac-detail">${escapeHtml(item.detail)}</span>` : "") +
          `</span>` +
          `</div>`
        );
      })
      .join("");
  }

  /**
   * Render the "현재 운항" Flight Status Board (V1.7 §19-20) — flights that
   * have not finished yet. Sits above Recent Flights, which is untouched and
   * still shows only completed ones. Hidden while nothing is currently flying.
   */
  setActiveFlights(entries: ActiveFlightEntry[]): void {
    if (entries.length === 0) {
      this.activeFlightsEl.hidden = true;
      return;
    }
    this.activeFlightsEl.hidden = false;
    this.activeFlightsListEl.innerHTML = entries
      .map(
        (e) =>
          `<div class="flight-row">` +
          `<span class="fr-id">${escapeHtml(e.id)}</span>` +
          `<span class="fr-route">${escapeHtml(e.route)}</span>` +
          `<span class="fr-status">${escapeHtml(e.statusText)}</span>` +
          `</div>`,
      )
      .join("");
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

  /**
   * "다음 목표" panel (V1.6 §23-25) — shows the airport's own OR-condition
   * growth thresholds. Pass null once the airport is at its max level (no
   * next level to work toward) to hide the panel.
   */
  setGrowthGoal(info: GrowthGoalInfo | null): void {
    if (!info) {
      this.growthGoalEl.hidden = true;
      return;
    }
    this.growthGoalEl.hidden = false;
    const row = (label: string, cur: number, target: number) => {
      const pct = Math.round(clamp01(target > 0 ? cur / target : 0) * 100);
      return (
        `<div class="growth-row">` +
        `<div class="mrow-head">` +
        `<span class="mrow-title">${escapeHtml(label)}</span>` +
        `<span class="mrow-progress">${cur} / ${target}</span>` +
        `</div>` +
        `<div class="mrow-bar"><i style="width:${pct}%"></i></div>` +
        `</div>`
      );
    };
    this.growthGoalBodyEl.innerHTML =
      `<div class="growth-target">Lv.${info.nextLevel} 달성 (둘 중 하나)</div>` +
      row(t("statFlights"), info.flights.current, info.flights.target) +
      row(t("statPassengers"), info.passengers.current, info.passengers.target);
  }

  private must(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`HUD: missing element "${selector}"`);
    return el;
  }
}

/**
 * V3.0 PHASE 3 §3 — per-kind footer button config: the card's primary-button
 * label (always does the existing select action), which drawer category its
 * "정보"/"상세보기" info button opens, and whether it also gets a second
 * "추적" button (aircraft only — selecting an aircraft already makes the
 * camera follow it, per Game.onSelectionChange(), so this button performs
 * the exact same select action under a label that describes what it does).
 */
const CARD_FOOTER_CONFIG: Record<
  ActivityKind,
  {
    primaryLabel: string;
    infoLabel: string;
    infoCat: NavCategory;
    showTrack: boolean;
    /** Fallback button label when this kind has a `related` concept
     * (Gate -> parked aircraft, Staff -> assigned gate) but the card's
     * current `related` value is unset — kept visible and disabled instead
     * of removed, so the footer's button count never jumps frame to frame. */
    relatedFallback?: string;
  }
> = {
  AIRCRAFT: { primaryLabel: "선택", infoLabel: "정보", infoCat: "flights", showTrack: true },
  GATE: {
    primaryLabel: "상세보기",
    infoLabel: "정보",
    infoCat: "facility",
    showTrack: false,
    relatedFallback: "연결 항공기",
  },
  GROUND_OP: { primaryLabel: "상세보기", infoLabel: "정보", infoCat: "flights", showTrack: false },
  STAFF: {
    primaryLabel: "상세보기",
    infoLabel: "정보",
    infoCat: "staff",
    showTrack: false,
    relatedFallback: "담당 구역",
  },
  PASSENGER: { primaryLabel: "상세보기", infoLabel: "정보", infoCat: "passengers", showTrack: false },
  VEHICLE: { primaryLabel: "상세보기", infoLabel: "정보", infoCat: "facility", showTrack: false },
};

/**
 * Renders an activity card's footer: the primary select button, an optional
 * "추적" duplicate for aircraft, an optional labelled button to the card's
 * `related` object (e.g. a Gate's parked aircraft — disabled when the kind
 * supports one but none currently exists), and an "정보" button that opens
 * the matching drawer category. Every button is a real, already-existing
 * action (select or open-drawer) — no new callback surface.
 */
function buildCardFooter(c: ActivityCard): string {
  const cfg = CARD_FOOTER_CONFIG[c.kind];
  const buttons: string[] = [
    `<button class="ac-btn ac-btn-primary" type="button">🖐 ${escapeHtml(cfg.primaryLabel)}</button>`,
  ];
  if (cfg.showTrack) {
    buttons.push(`<button class="ac-btn" type="button">📍 추적</button>`);
  }
  if (c.related) {
    buttons.push(
      `<button class="ac-btn" type="button" data-action="related">${escapeHtml(c.related.label)}</button>`,
    );
  } else if (cfg.relatedFallback) {
    buttons.push(
      `<button class="ac-btn" type="button" data-action="related" aria-disabled="true">${escapeHtml(cfg.relatedFallback)}</button>`,
    );
  }
  buttons.push(
    `<button class="ac-btn ac-btn-ghost" type="button" data-action="info" data-info-cat="${cfg.infoCat}">${escapeHtml(cfg.infoLabel)}</button>`,
  );
  return `<div class="ac-card-footer">${buttons.join("")}</div>`;
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

/**
 * V1.9-D STEP 2 — reference-image-based layout (docs/reference/
 * brick-airport-ui-reference.png): unified top bar, left category nav +
 * drawer, bottom Live Activity Cards, standalone right zoom cluster, bottom
 * help. Every existing panel's own render method (setMissions, setEvents,
 * setStatistics, setOperations, setGroundOperations, setFlightHistory,
 * setActiveFlights, setGrowthGoal, setActionItems) is UNCHANGED — only where
 * their markup lives in the DOM moved, into a `.js-drawer-*` section.
 */
function buildTemplate(): string {
  return /* html */ `
  <div class="hud-notice js-notice" hidden></div>

  <div class="topbar">
    <div class="hud-panel topbar-identity">
      <span class="topbar-icon">✈</span>
      <div class="topbar-name">
        <b class="js-airport-name">브릭 공항</b>
        <small>BRICK AIRPORT</small>
      </div>
      <div class="topbar-level">
        <span class="topbar-level-label">Lv. <b class="js-level">1</b></span>
        <div class="topbar-progress-track"><i class="js-level-bar" style="width:0%"></i></div>
        <small class="js-level-progress-text">0 / 0</small>
      </div>
      <b class="save-status js-save-status" hidden></b>
    </div>
    <div class="hud-panel topbar-stats">
      <div class="topbar-stat stat-money">
        <span class="ts-icon">💰</span>
        <span class="ts-body"><small>${t("balance")}</small><b class="js-money">${escapeHtml(formatMoney(10000))}</b></span>
        <b class="hud-revenue js-revenue" aria-hidden="true"></b>
      </div>
      <div class="topbar-stat">
        <span class="ts-icon">📈</span>
        <span class="ts-body"><small>수익</small><b class="js-stat-revenue-top">${escapeHtml(formatMoney(0))}</b></span>
      </div>
      <div class="topbar-stat">
        <span class="ts-icon">✈</span>
        <span class="ts-body"><small>${t("flights")}</small><b class="js-flights">0</b></span>
      </div>
      <div class="topbar-stat">
        <span class="ts-icon">👥</span>
        <span class="ts-body"><small>${t("passengers")}</small><b class="js-passengers">0</b></span>
      </div>
      <div class="topbar-stat stat-status">
        <b class="airport-status js-airport-status tone-good">● ${t("statusNormal")}</b>
      </div>
      <div class="topbar-stat stat-clock">
        <span class="ts-icon">🕐</span>
        <span class="ts-body"><b class="js-clock">--:--</b><small>☀ 맑음</small></span>
      </div>
    </div>
  </div>

  <div class="navrail">
    <button class="nav-item js-nav-build" data-cat="build" title="${t("build")}">
      <span class="nav-icon">🛠</span><span class="nav-label">${t("build")}</span>
    </button>
    <button class="nav-item js-nav-cat" data-cat="flights"><span class="nav-icon">✈</span><span class="nav-label">항공편</span></button>
    <button class="nav-item js-nav-cat" data-cat="passengers"><span class="nav-icon">👥</span><span class="nav-label">승객</span></button>
    <button class="nav-item js-nav-cat" data-cat="staff"><span class="nav-icon">👤</span><span class="nav-label">직원</span></button>
    <button class="nav-item js-nav-cat" data-cat="facility"><span class="nav-icon">🏢</span><span class="nav-label">시설</span></button>
    <button class="nav-item js-nav-cat" data-cat="mission"><span class="nav-icon">🎯</span><span class="nav-label">임무</span></button>
    <button class="nav-item js-nav-cat" data-cat="event"><span class="nav-icon">📅</span><span class="nav-label">이벤트</span></button>
    <button class="nav-item js-nav-cat" data-cat="stats"><span class="nav-icon">📊</span><span class="nav-label">통계</span></button>
  </div>

  <div class="hud-panel action-center js-action-center" hidden>
    <div class="stat-panel-title action-center-title js-action-center-title">${t("actionCenter")}</div>
    <div class="action-center-list js-action-center-list" hidden></div>
  </div>

  <div class="hud-panel drawer js-drawer" hidden>
    <div class="drawer-head">
      <span class="drawer-title js-drawer-title">항공편</span>
      <button class="drawer-close js-drawer-close" title="${t("cancel")}">✕</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-section js-drawer-flights" hidden>
        <div class="drawer-mini-row">
          <span>${t("aircraft")} <b class="js-aircraft">0</b></span>
          <span>${t("gate")} <b class="js-gate">0</b></span>
        </div>
        <div class="hud-panel flight-history js-active-flights" hidden>
          <div class="stat-panel-title">${t("activeFlights")}</div>
          <div class="flight-history-list js-active-flights-list"></div>
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

      <div class="drawer-section js-drawer-passengers" hidden>
        <div class="statistics-grid">
          <div class="stat-card"><span>${t("passengers")}</span><strong class="js-drawer-pax-count">0</strong></div>
          <div class="stat-card"><span>${t("statAvg")}</span><strong class="js-drawer-pax-avg">0.0</strong></div>
          <div class="stat-card"><span>${t("statBoarding")}</span><strong class="js-drawer-pax-boarding">0%</strong></div>
        </div>
      </div>

      <div class="drawer-section js-drawer-staff" hidden>
        <div class="statistics-grid">
          <div class="stat-card"><span>전체</span><strong class="js-drawer-staff-count">0</strong></div>
          <div class="stat-card"><span>작업 중</span><strong class="js-drawer-staff-active">0</strong></div>
        </div>
      </div>

      <div class="drawer-section js-drawer-facility" hidden>
        <div class="statistics-grid">
          <div class="stat-card"><span>${t("opAvailableGates")}</span><strong class="js-drawer-gates">0</strong></div>
          <div class="stat-card"><span>${t("opActiveOperations")}</span><strong class="js-drawer-ops">0</strong></div>
        </div>
      </div>

      <div class="drawer-section js-drawer-mission" hidden>
        <div class="hud-panel mission-panel js-missions" hidden>
          <div class="mission-list js-missions-list"></div>
        </div>
        <div class="hud-panel growth-goal-panel js-growth-goal" hidden>
          <div class="stat-panel-title">다음 목표</div>
          <div class="growth-goal-body js-growth-goal-body"></div>
        </div>
      </div>

      <div class="drawer-section js-drawer-event" hidden>
        <div class="hud-panel event-panel js-events" hidden>
          <div class="event-list js-events-list"></div>
        </div>
      </div>

      <div class="drawer-section js-drawer-stats" hidden>
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
            <div class="stat-card"><span>${t("opAvailableGates")}</span><strong class="js-op-available-gates">0</strong></div>
            <div class="stat-card"><span>${t("opActiveOperations")}</span><strong class="js-op-active-operations">0</strong></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="utility-cluster">
    <button class="util-btn js-save" title="${t("save")}">💾</button>
    <button class="util-btn js-load" title="${t("load")}">📂</button>
    <button class="util-btn js-grid" title="${t("grid")}">▦</button>
    <button class="util-btn js-reset" title="${t("reset")}">↺</button>
  </div>

  <div class="zoom-dock">
    <span class="zoom-hint">휠 스크롤로 확대/축소</span>
    <div class="zoom-cluster">
      <button class="zoom-btn js-zoom-out" title="축소">−</button>
      <span class="zoom-icon">🔍</span>
      <button class="zoom-btn js-zoom-in" title="확대">+</button>
    </div>
  </div>

  <div class="info-slot">
    <div class="hud-panel help-bar js-help-bar">
      <span class="help-icon">💡</span>
      <span class="help-text">클릭·터치: 선택 · 드래그: 화면 이동 · 휠·핀치: 확대·축소</span>
    </div>
    <div class="hud-panel selection-panel js-selection" hidden>
      <span class="sel-label">${t("selected")}</span><em class="empty">-</em>
    </div>
  </div>

  <div class="activity-cards js-activity-cards" hidden></div>
`;
}
