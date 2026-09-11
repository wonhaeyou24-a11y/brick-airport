import type { BuildingData, BuildingType } from "../core/GameState";
import type { GridOccupancy } from "../world/GridOccupancy";
import type { CellBounds, CellCoord } from "../world/cells";
import type { PurchaseResult } from "../buildings/BuildingConfig";
import { PlacementSystem, type PlacementValidity } from "./PlacementSystem";
import type { BuildingPreview } from "./BuildingPreview";

/**
 * BuildController — the IDLE / PLACEMENT state machine for build mode.
 *
 * Owns its own PlacementSystem (sharing the shared GridOccupancy) so it never
 * fights the rest of the app for placement state. Two independent checks gate a
 * build (spec §5, §31):
 *   - placement validity  — is the space free?  (PlacementSystem)
 *   - purchase validity   — affordable / unlocked?  (canPurchase hook)
 * Both must pass for the preview to read VALID and for confirm to commit.
 *
 * Actual GameState / world mutation + money deduction happen in the `commit`
 * hook (Game.commitBuilding), which re-checks the purchase atomically.
 */

export type BuildMode = "IDLE" | "PLACEMENT";

export interface BuildModeState {
  mode: BuildMode;
  type: BuildingType | null;
  cell: CellCoord | null;
  validity: PlacementValidity | null;
  purchase: PurchaseResult | null;
}

export interface BuildControllerHooks {
  /** Fresh, collision-free id for a new building of this type. */
  nextId(type: BuildingType): string;
  /** Money / level check for the active type (spec §6). */
  canPurchase(type: BuildingType): PurchaseResult;
  /** Commit a validated building: deduct money + add to state/world. */
  commit(data: BuildingData): boolean;
  /** Called whenever build-mode state changes (for HUD / menu / selection). */
  onModeChange(state: BuildModeState): void;
}

export class BuildController {
  private readonly placement: PlacementSystem;
  private mode: BuildMode = "IDLE";
  private type: BuildingType | null = null;
  private cell: CellCoord | null = null;
  private validity: PlacementValidity | null = null;
  private purchase: PurchaseResult | null = null;

  constructor(
    occupancy: GridOccupancy,
    private readonly preview: BuildingPreview,
    private readonly hooks: BuildControllerHooks,
    getExpansionBounds?: () => CellBounds,
  ) {
    this.placement = new PlacementSystem(occupancy, getExpansionBounds);
  }

  get isActive(): boolean {
    return this.mode === "PLACEMENT";
  }

  get activeType(): BuildingType | null {
    return this.type;
  }

  begin(type: BuildingType): void {
    this.mode = "PLACEMENT";
    this.type = type;
    this.cell = null;
    this.validity = null;
    this.purchase = this.hooks.canPurchase(type);
    this.placement.begin(type);
    this.preview.show(type);
    this.preview.setVisible(false);
    this.emit();
  }

  cancel(): void {
    if (this.mode === "IDLE") return;
    this.mode = "IDLE";
    this.type = null;
    this.cell = null;
    this.validity = null;
    this.purchase = null;
    this.placement.cancel();
    this.preview.hide();
    this.emit();
  }

  /** Pointer moved to `cell` (null = off the grid). */
  updateHover(cell: CellCoord | null): void {
    if (!this.isActive || !this.type) return;
    const type = this.type;
    this.cell = cell;
    this.placement.setPointerCell(cell);
    this.purchase = this.hooks.canPurchase(type);

    const size = this.placement.previewSize;
    if (cell && size) {
      this.validity = this.placement.validate();
      const canBuild = this.validity.valid && this.purchase.ok;
      this.preview.moveTo(cell, size);
      this.preview.setValid(canBuild);
      this.preview.setVisible(true);
    } else {
      this.validity = null;
      this.preview.setVisible(false);
    }
    this.emit();
  }

  /** Pointer tapped at `cell` — place the building if space + purchase pass. */
  confirmAt(cell: CellCoord | null): void {
    if (!this.isActive || !this.type || !cell) return;
    const type = this.type;

    this.placement.setPointerCell(cell);
    this.purchase = this.hooks.canPurchase(type);

    // A valid space still produces BuildingData even if the player can't
    // afford it — commit() does the final purchase check and shows the
    // denial toast, so the failure feedback is not swallowed here.
    const data = this.placement.confirm(this.hooks.nextId(type));
    if (data) this.hooks.commit(data); // re-checks purchase + deducts atomically

    // Stay in placement mode for repeated placement; re-arm and re-validate.
    this.placement.begin(type);
    this.placement.setPointerCell(cell);
    this.purchase = this.hooks.canPurchase(type);
    this.validity = this.placement.validate();
    this.preview.setValid(this.validity.valid && this.purchase.ok);
    this.emit();
  }

  private emit(): void {
    this.hooks.onModeChange({
      mode: this.mode,
      type: this.type,
      cell: this.cell,
      validity: this.validity,
      purchase: this.purchase,
    });
  }
}
