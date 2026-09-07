import type { BuildingData } from "../core/GameState";
import {
  cellKey,
  footprintCells,
  isFootprintInsideGrid,
  type CellCoord,
  type CellSize,
} from "./cells";

/**
 * GridOccupancy — which grid cell is taken by which building.
 *
 * Source of truth is GameState.buildings (data, never meshes). This is a
 * derived lookup index rebuilt from that list, plus the queries the future
 * construction system needs: is a footprint free, what's in this cell.
 */
export class GridOccupancy {
  /** cellKey -> buildingId */
  private readonly map = new Map<string, string>();

  constructor(buildings: BuildingData[] = []) {
    for (const b of buildings) this.add(b);
  }

  add(building: BuildingData): void {
    const keys =
      building.occupiedCells.length > 0
        ? building.occupiedCells
        : footprintCells(building.cell, building.size);
    for (const key of keys) this.map.set(key, building.id);
  }

  remove(building: BuildingData): void {
    for (const [key, id] of this.map) {
      if (id === building.id) this.map.delete(key);
    }
  }

  isOccupied(col: number, row: number): boolean {
    return this.map.has(cellKey(col, row));
  }

  occupantAt(col: number, row: number): string | null {
    return this.map.get(cellKey(col, row)) ?? null;
  }

  /** True when every cell of the footprint is inside the grid and free. */
  isFootprintFree(cell: CellCoord, size: CellSize): boolean {
    if (!isFootprintInsideGrid(cell, size)) return false;
    return footprintCells(cell, size).every((key) => !this.map.has(key));
  }
}
