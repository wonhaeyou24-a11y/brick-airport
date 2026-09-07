import type { BuildingData, BuildingType } from "../core/GameState";
import type { GridOccupancy } from "../world/GridOccupancy";
import type { CellCoord } from "../world/cells";
import { PlacementSystem, type PlacementValidity } from "./PlacementSystem";
import type { BuildingPreview } from "./BuildingPreview";

/**
 * BuildController — the IDLE / PLACEMENT state machine for build mode.
 *
 * Owns its own PlacementSystem (sharing the shared GridOccupancy) so it never
 * fights the rest of the app for placement state. It drives only the preview
 * ghost and reports mode changes; actual GameState / world mutation happens in
 * the `commit` hook (Game.commitBuilding), keeping the "PlacementSystem does
 * not change game state" rule from spec §7.
 */

export type BuildMode = "IDLE" | "PLACEMENT";

export interface BuildModeState {
  mode: BuildMode;
  type: BuildingType | null;
  cell: CellCoord | null;
  validity: PlacementValidity | null;
}

export interface BuildControllerHooks {
  /** Fresh, collision-free id for a new building of this type. */
  nextId(type: BuildingType): string;
  /** Commit a validated building to GameState + world + occupancy. */
  commit(data: BuildingData): void;
  /** Called whenever build-mode state changes (for HUD / menu / selection). */
  onModeChange(state: BuildModeState): void;
}

export class BuildController {
  private readonly placement: PlacementSystem;
  private mode: BuildMode = "IDLE";
  private type: BuildingType | null = null;
  private cell: CellCoord | null = null;
  private validity: PlacementValidity | null = null;

  constructor(
    occupancy: GridOccupancy,
    private readonly preview: BuildingPreview,
    private readonly hooks: BuildControllerHooks,
  ) {
    this.placement = new PlacementSystem(occupancy);
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
    this.placement.cancel();
    this.preview.hide();
    this.emit();
  }

  /** Pointer moved to `cell` (null = off the grid). */
  updateHover(cell: CellCoord | null): void {
    if (!this.isActive) return;
    this.cell = cell;
    this.placement.setPointerCell(cell);

    const size = this.placement.previewSize;
    if (cell && size) {
      this.validity = this.placement.validate();
      this.preview.moveTo(cell, size);
      this.preview.setValid(this.validity.valid);
      this.preview.setVisible(true);
    } else {
      this.validity = null;
      this.preview.setVisible(false);
    }
    this.emit();
  }

  /** Pointer tapped at `cell` — place the building if the spot is valid. */
  confirmAt(cell: CellCoord | null): void {
    if (!this.isActive || !this.type || !cell) return;

    this.placement.setPointerCell(cell);
    const data = this.placement.confirm(this.hooks.nextId(this.type));
    if (!data) {
      this.emit();
      return;
    }

    this.hooks.commit(data);

    // Stay in placement mode for repeated placement; re-arm and re-validate.
    const type = this.type;
    this.placement.begin(type);
    this.placement.setPointerCell(cell);
    this.validity = this.placement.validate();
    this.preview.setValid(this.validity.valid);
    this.emit();
  }

  private emit(): void {
    this.hooks.onModeChange({
      mode: this.mode,
      type: this.type,
      cell: this.cell,
      validity: this.validity,
    });
  }
}
