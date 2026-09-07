/**
 * cells — pure grid-cell coordinate maths.
 *
 * No Three.js import here on purpose: GameState (and any other logic-only
 * module) can safely depend on this. The Three.js-flavoured helpers that return
 * Vector3 live in world/Grid.ts, which re-exports everything from this file.
 */

export const CELL_SIZE = 2;
export const GRID_COLS = 24;
export const GRID_ROWS = 24;

export const GRID_WIDTH = GRID_COLS * CELL_SIZE;
export const GRID_DEPTH = GRID_ROWS * CELL_SIZE;

/** Grid is centred on the origin, so cols/rows run from -N/2 .. N/2-1. */
export const GRID_MIN_COL = -GRID_COLS / 2;
export const GRID_MAX_COL = GRID_COLS / 2 - 1;
export const GRID_MIN_ROW = -GRID_ROWS / 2;
export const GRID_MAX_ROW = GRID_ROWS / 2 - 1;

export type CellCoord = { col: number; row: number };
export type CellSize = { cols: number; rows: number };

export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

export function sameCell(a: CellCoord | null, b: CellCoord | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.col === b.col && a.row === b.row;
}

export function isCellInsideGrid(col: number, row: number): boolean {
  return (
    col >= GRID_MIN_COL &&
    col <= GRID_MAX_COL &&
    row >= GRID_MIN_ROW &&
    row <= GRID_MAX_ROW
  );
}

export function isFootprintInsideGrid(cell: CellCoord, size: CellSize): boolean {
  return (
    isCellInsideGrid(cell.col, cell.row) &&
    isCellInsideGrid(cell.col + size.cols - 1, cell.row + size.rows - 1)
  );
}

/** Every cell key a rectangular footprint anchored at `cell` occupies. */
export function footprintCells(cell: CellCoord, size: CellSize): string[] {
  const keys: string[] = [];
  for (let c = cell.col; c < cell.col + size.cols; c++) {
    for (let r = cell.row; r < cell.row + size.rows; r++) {
      keys.push(cellKey(c, r));
    }
  }
  return keys;
}
