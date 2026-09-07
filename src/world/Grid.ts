import * as THREE from "three";
import {
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
} from "./cells";

/**
 * Grid — placement reference for functional airport structures.
 *
 * Pure coordinate/key maths live in ./cells (no Three.js). This module adds the
 * Vector3-returning helpers and the visible grid overlay. Everything from
 * ./cells is re-exported here so existing imports of "./Grid" keep working.
 */
export * from "./cells";

/** World-space position of the centre of cell (col, row). */
export function cellCenterToWorld(col: number, row: number): THREE.Vector3 {
  return new THREE.Vector3(
    col * CELL_SIZE + CELL_SIZE / 2,
    0,
    row * CELL_SIZE + CELL_SIZE / 2,
  );
}

/** World-space centre of a rectangular footprint anchored at (col, row). */
export function footprintCenterToWorld(
  col: number,
  row: number,
  cols: number,
  rows: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    col * CELL_SIZE + (cols * CELL_SIZE) / 2,
    0,
    row * CELL_SIZE + (rows * CELL_SIZE) / 2,
  );
}

/** Snap an arbitrary world position to the cell (col, row) that contains it. */
export function worldToCell(position: THREE.Vector3): { col: number; row: number } {
  return {
    col: Math.floor(position.x / CELL_SIZE),
    row: Math.floor(position.z / CELL_SIZE),
  };
}

export class Grid {
  readonly object: THREE.Object3D;
  private readonly helper: THREE.GridHelper;

  constructor() {
    const divisions = Math.max(GRID_COLS, GRID_ROWS);
    const size = divisions * CELL_SIZE;

    this.helper = new THREE.GridHelper(size, divisions, 0x4a6572, 0xb8c9c4);
    const mat = this.helper.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) {
      mat.forEach((m) => ((m.transparent = true), (m.opacity = 0.35)));
    } else {
      mat.transparent = true;
      mat.opacity = 0.35;
    }
    // Lift a hair above the ground plane to avoid z-fighting.
    this.helper.position.y = 0.02;

    this.object = this.helper;
  }

  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  dispose(): void {
    this.helper.geometry.dispose();
    const mat = this.helper.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  }
}
