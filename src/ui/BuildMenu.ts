import type { BuildingType, StaffRole } from "../core/GameState";
import type { BuildModeState } from "../construction/BuildController";
import { formatMoney, t } from "../i18n/strings";
import { STAFF_CONFIG, staffRoleConfig, staffRoleLabel } from "../staff/StaffConfig";

/**
 * BuildMenu — brick-style side panel for build mode.
 *
 * Pure view: a BUILD toggle that reveals the placeable building types (each
 * with its cost, or a lock badge when the airport level is too low) plus a
 * Cancel button. The type list is supplied by Game (from BUILDING_TYPES /
 * BUILDING_CONFIG) so adding a building type never means editing this file.
 * Emits intents via callbacks; the placement + purchase flow lives in
 * BuildController / Game.
 */
export interface BuildMenuCallbacks {
  onSelectType(type: BuildingType): void;
  onCancel(): void;
  /** V1.2-E. */
  onExpand(): void;
  /** V1.8 §17 — hire another staff member of this role. Costs are static
   * (StaffConfig, not level-gated) so unlike building buttons this list
   * never needs a runtime availability refresh. */
  onHireStaff(role: StaffRole): void;
}

/** V1.2-E — the airport-expansion card shown under the building list. */
export interface ExpansionInfo {
  /** False once the airport is at its max tier — the card just says so. */
  available: boolean;
  worldSize: number;
  cost: number;
  requiredLevel: number;
  locked: boolean;
}

/** Per-type availability, pushed from Game when money / level changes. */
export interface BuildMenuItem {
  type: BuildingType;
  cost: number;
  requiredLevel: number;
  locked: boolean;
}

/** One entry in the menu, in display order. */
export interface BuildMenuType {
  type: BuildingType;
  label: string;
}

export class BuildMenu {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly typeButtons = new Map<BuildingType, HTMLButtonElement>();
  private readonly costEls = new Map<BuildingType, HTMLElement>();
  private readonly expansionCard: HTMLElement;
  private readonly expansionBody: HTMLElement;
  private readonly expandBtn: HTMLButtonElement;
  private open = false;

  constructor(
    container: HTMLElement,
    types: readonly BuildMenuType[],
    callbacks: BuildMenuCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.className = "build-menu";
    this.root.innerHTML = template(types);
    container.appendChild(this.root);

    this.toggle = this.must(".js-build-toggle");
    this.list = this.must(".js-build-list");
    this.cancelBtn = this.must(".js-build-cancel");

    for (const { type } of types) {
      const btn = this.must<HTMLButtonElement>(`.js-type-${type}`);
      this.typeButtons.set(type, btn);
      this.costEls.set(type, this.must(`.js-cost-${type}`));
      btn.addEventListener("click", () => callbacks.onSelectType(type));
    }

    this.expansionCard = this.must(".js-expansion");
    this.expansionBody = this.must(".js-expansion-body");
    this.expandBtn = this.must(".js-expand-btn");
    this.expandBtn.addEventListener("click", () => callbacks.onExpand());

    for (const role of STAFF_CONFIG.ROLES) {
      this.must<HTMLButtonElement>(`.js-hire-${role}`).addEventListener("click", () =>
        callbacks.onHireStaff(role),
      );
    }

    this.toggle.addEventListener("click", () => this.setOpen(!this.open));
    this.cancelBtn.addEventListener("click", () => callbacks.onCancel());

    this.setOpen(false);
  }

  /** Open the panel from outside (V1.8 §10 — Action Center "navigate to
   * related UI", never auto-performs the build/hire itself). */
  openMenu(): void {
    this.setOpen(true);
  }

  /** V1.9-D STEP 2 §9 — the left-nav "건설" button now drives this panel
   * directly (its own old toggle button is visually hidden), so it needs
   * open/close-on-second-click like every other nav category. */
  toggleMenu(): void {
    this.setOpen(!this.open);
  }

  closeMenu(): void {
    this.setOpen(false);
  }

  /** Update the airport-expansion card (spec §E.5/§E.6). */
  setExpansion(info: ExpansionInfo): void {
    if (!info.available) {
      this.expansionCard.hidden = true;
      return;
    }
    this.expansionCard.hidden = false;
    this.expandBtn.hidden = info.locked;
    this.expansionBody.innerHTML = info.locked
      ? `<span class="exp-locked">${t("locked")}</span>` +
        `<span class="exp-line">공항 레벨 ${info.requiredLevel} 필요</span>`
      : `<span class="exp-line">${info.worldSize}&times;${info.worldSize}</span>` +
        `<span class="exp-line">비용 ${formatMoney(info.cost)}</span>`;
  }

  /** Reflect BuildController state: highlight active type, show Cancel. */
  setState(state: BuildModeState): void {
    const active = state.mode === "PLACEMENT";
    this.toggle.classList.toggle("is-active", active);
    this.cancelBtn.hidden = !active;

    for (const [type, btn] of this.typeButtons) {
      btn.classList.toggle("is-selected", active && state.type === type);
    }
    if (active) this.setOpen(true);
  }

  /** Update each type's cost / lock badge (call when money or level changes). */
  setAvailability(items: BuildMenuItem[]): void {
    for (const { type, cost, requiredLevel, locked } of items) {
      const btn = this.typeButtons.get(type);
      const costEl = this.costEls.get(type);
      if (!btn || !costEl) continue;
      btn.classList.toggle("is-locked", locked);
      costEl.textContent = locked
        ? `🔒 Lv.${requiredLevel}`
        : formatMoney(cost);
    }
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.list.hidden = !open;
    this.toggle.classList.toggle("is-open", open);
  }

  private must<T extends HTMLElement = HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`BuildMenu: missing element "${selector}"`);
    return el;
  }
}

function template(types: readonly BuildMenuType[]): string {
  const buttons = types
    .map(
      ({ type, label }) => /* html */ `
    <button class="brick-btn build-type js-type-${type}">
      <span class="build-label">${label}</span>
      <span class="build-cost js-cost-${type}"></span>
    </button>`,
    )
    .join("");

  // Staff-hire section (V1.8 §17) — costs are static per role, so they can be
  // baked in directly instead of needing a setAvailability-style refresh.
  const hireButtons = STAFF_CONFIG.ROLES.map((role) => {
    const cfg = staffRoleConfig(role);
    return /* html */ `
    <button class="brick-btn build-type js-hire-${role}">
      <span class="build-label">${staffRoleLabel(role)}</span>
      <span class="build-cost">${formatMoney(cfg.hiringCost)}</span>
    </button>`;
  }).join("");

  return /* html */ `
  <button class="brick-btn build-toggle js-build-toggle" title="${t("build")}">${t("build")}</button>
  <div class="build-list js-build-list" hidden>
    ${buttons}
    <div class="expansion-card js-expansion" hidden>
      <div class="stat-panel-title">${t("airportExpansion")}</div>
      <div class="expansion-body js-expansion-body"></div>
      <button class="brick-btn expand-btn js-expand-btn">${t("expand")}</button>
    </div>
    <div class="stat-panel-title staff-hire-title">${t("staffHire")}</div>
    ${hireButtons}
    <button class="brick-btn build-cancel js-build-cancel" hidden>${t("cancel")}</button>
  </div>
`;
}
