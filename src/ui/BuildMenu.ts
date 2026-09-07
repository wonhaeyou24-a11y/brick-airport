import type { BuildingType } from "../core/GameState";
import type { BuildModeState } from "../construction/BuildController";

/**
 * BuildMenu — brick-style side panel for build mode.
 *
 * Pure view: a BUILD toggle that reveals the placeable building types plus a
 * Cancel button. Emits intents via callbacks; the actual placement flow lives
 * in BuildController. Positioned out of the HUD flex flow (see style.css) so
 * it does not disturb the existing top/bottom HUD rows (spec §26).
 */
export interface BuildMenuCallbacks {
  onSelectType(type: BuildingType): void;
  onCancel(): void;
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
    <button class="brick-btn build-type js-type-TERMINAL">Terminal</button>
    <button class="brick-btn build-type js-type-GATE">Gate</button>
    <button class="brick-btn build-type js-type-RUNWAY">Runway</button>
    <button class="brick-btn build-cancel js-build-cancel" hidden>Cancel</button>
  </div>
`;
