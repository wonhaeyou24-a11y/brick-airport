import type { BuildingType, BuildingData } from "../core/GameState";
import { makeBuilding } from "../core/GameState";
import type { GridOccupancy } from "../world/GridOccupancy";
import {
  isFootprintInsideGrid,
  isFootprintInsideBounds,
  type CellBounds,
  type CellCoord,
  type CellSize,
} from "../world/cells";

/**
 * PlacementSystem — foundation for the future building-construction flow.
 *
 * Scope for this stage: pointer -> preview cell, and placement validation.
 * The interaction UI (a BuildMenu, drag preview, etc.) comes in a later stage;
 * this class is the seam it will plug into:
 *
 *   begin(type) -> setPointerCell(cell) -> validate() -> confirm() / cancel()
 *
 * confirm() only *produces* a validated BuildingData — the caller is
 * responsible for committing it to GameState / world / occupancy. That keeps
 * this module free of Three.js and of world-mutation side effects.
 */

export type PlacementValidity =
  | { valid: true }
  | { valid: false; reason: PlacementReason };

export type PlacementReason =
  | "OUT_OF_BOUNDS"
  | "CELL_OCCUPIED"
  | "OUTSIDE_EXPANSION";

/** Default footprints per building type (grid cells). */
export const BUILDING_FOOTPRINTS: Record<BuildingType, CellSize> = {
  TERMINAL: { cols: 8, rows: 3 },
  RUNWAY: { cols: 18, rows: 4 },
  GATE: { cols: 1, rows: 1 },
  // Service facilities — small 2x2 pads (V0.7-C).
  CHECK_IN: { cols: 2, rows: 2 },
  SECURITY: { cols: 2, rows: 2 },
  BAGGAGE: { cols: 2, rows: 2 },
  LOUNGE: { cols: 2, rows: 2 },
  // Amenities (V1.1-A) — same small pad as the other service facilities.
  FOOD: { cols: 2, rows: 2 },
  RESTROOM: { cols: 2, rows: 2 },
  SHOP: { cols: 2, rows: 2 },
  // V2.1 content expansion — same small pad as every other service facility.
  PARKING: { cols: 2, rows: 2 },
  VIP_LOUNGE: { cols: 2, rows: 2 },
};

export class PlacementSystem {
  private activeType: BuildingType | null = null;
  private pointerCell: CellCoord | null = null;

  constructor(
    private readonly occupancy: GridOccupancy,
    /** Current buildable rectangle (V1.2-D). Defaults to the whole grid. */
    private readonly getExpansionBounds?: () => CellBounds,
  ) {}

  get isActive(): boolean {
    return this.activeType !== null;
  }

  get previewCell(): CellCoord | null {
    return this.pointerCell;
  }

  get previewSize(): CellSize | null {
    return this.activeType ? BUILDING_FOOTPRINTS[this.activeType] : null;
  }

  begin(type: BuildingType): void {
    this.activeType = type;
    this.pointerCell = null;
  }

  cancel(): void {
    this.activeType = null;
    this.pointerCell = null;
  }

  setPointerCell(cell: CellCoord | null): void {
    this.pointerCell = cell;
  }

  /** Validate the current preview, or an explicit cell/size pair. */
  validate(cell = this.pointerCell, size = this.previewSize): PlacementValidity {
    if (!cell || !size) return { valid: false, reason: "OUT_OF_BOUNDS" };
    if (!isFootprintInsideGrid(cell, size)) {
      return { valid: false, reason: "OUT_OF_BOUNDS" };
    }
    const bounds = this.getExpansionBounds?.();
    if (bounds && !isFootprintInsideBounds(cell, size, bounds)) {
      return { valid: false, reason: "OUTSIDE_EXPANSION" };
    }
    if (!this.occupancy.isFootprintFree(cell, size)) {
      return { valid: false, reason: "CELL_OCCUPIED" };
    }
    return { valid: true };
  }

  /**
   * If the current preview is valid, return a fresh BuildingData for it under
   * the given id. Does NOT mutate game state — the caller commits it.
   */
  confirm(id: string): BuildingData | null {
    if (!this.activeType || !this.pointerCell) return null;
    const size = BUILDING_FOOTPRINTS[this.activeType];
    if (!this.validate(this.pointerCell, size).valid) return null;

    const building = makeBuilding({
      id,
      type: this.activeType,
      cell: { ...this.pointerCell },
      size: { ...size },
      rotationY: 0,
      level: 1,
    });
    this.cancel();
    return building;
  }
}
