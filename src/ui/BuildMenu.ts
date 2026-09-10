import type { BuildingType } from "../core/GameState";
import type { BuildModeState } from "../construction/BuildController";

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

    this.toggle.addEventListener("click", () => this.setOpen(!this.open));
    this.cancelBtn.addEventListener("click", () => callbacks.onCancel());

    this.setOpen(false);
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
        : `$${cost.toLocaleString("en-US")}`;
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

  return /* html */ `
  <button class="brick-btn build-toggle js-build-toggle" title="Build">BUILD</button>
  <div class="build-list js-build-list" hidden>
    ${buttons}
    <button class="brick-btn build-cancel js-build-cancel" hidden>Cancel</button>
  </div>
`;
}
