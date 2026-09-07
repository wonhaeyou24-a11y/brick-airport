import type { BuildingType } from "../core/GameState";
import type { BuildModeState } from "../construction/BuildController";

/**
 * BuildMenu — brick-style side panel for build mode.
 *
 * Pure view: a BUILD toggle that reveals the placeable building types (each
 * with its cost, or a lock badge when the airport level is too low) plus a
 * Cancel button. Emits intents via callbacks; the placement + purchase flow
 * lives in BuildController / Game.
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

const TYPES: { type: BuildingType; label: string }[] = [
  { type: "TERMINAL", label: "Terminal" },
  { type: "GATE", label: "Gate" },
  { type: "RUNWAY", label: "Runway" },
];

export class BuildMenu {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly typeButtons = new Map<BuildingType, HTMLButtonElement>();
  private readonly costEls = new Map<BuildingType, HTMLElement>();
  private open = false;

  constructor(container: HTMLElement, callbacks: BuildMenuCallbacks) {
    this.root = document.createElement("div");
    this.root.className = "build-menu";
    this.root.innerHTML = TEMPLATE;
    container.appendChild(this.root);

    this.toggle = this.must(".js-build-toggle");
    this.list = this.must(".js-build-list");
    this.cancelBtn = this.must(".js-build-cancel");

    for (const { type } of TYPES) {
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

const TEMPLATE = /* html */ `
  <button class="brick-btn build-toggle js-build-toggle" title="Build">BUILD</button>
  <div class="build-list js-build-list" hidden>
    <button class="brick-btn build-type js-type-TERMINAL">
      <span class="build-label">Terminal</span>
      <span class="build-cost js-cost-TERMINAL">$4,000</span>
    </button>
    <button class="brick-btn build-type js-type-GATE">
      <span class="build-label">Gate</span>
      <span class="build-cost js-cost-GATE">$1,000</span>
    </button>
    <button class="brick-btn build-type js-type-RUNWAY">
      <span class="build-label">Runway</span>
      <span class="build-cost js-cost-RUNWAY">$8,000</span>
    </button>
    <button class="brick-btn build-cancel js-build-cancel" hidden>Cancel</button>
  </div>
`;
