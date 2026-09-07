import * as THREE from "three";
import { cellCenterToWorld } from "./Grid";
import { CELL_SIZE, sameCell, type CellCoord } from "./cells";

/**
 * GridCursor — the hover + selected cell markers.
 *
 * Two reusable flat quads, repositioned as the pointer moves. No geometry or
 * material is created per frame (perf rule 18). The hover marker can also show
 * a valid / invalid tint for the future placement system.
 *
 * Deliberately separate from object-selection highlight (different meshes,
 * different colours) — see spec §4.
 */
const HOVER_COLOR = 0xffffff;
const HOVER_VALID_COLOR = 0x2a9d8f;
const HOVER_INVALID_COLOR = 0xe63946;
const SELECT_COLOR = 0xffb703;

export class GridCursor {
  readonly object: THREE.Group;

  private readonly hoverMesh: THREE.Mesh;
  private readonly selectMesh: THREE.Mesh;
  private readonly hoverMat: THREE.MeshBasicMaterial;
  private readonly selectMat: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.PlaneGeometry;

  private hoverCell: CellCoord | null = null;
  private selectedCell: CellCoord | null = null;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "grid-cursor";

    // Slightly smaller than a cell so grid lines stay visible around it.
    this.geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);

    this.selectMat = new THREE.MeshBasicMaterial({
      color: SELECT_COLOR,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.selectMesh = new THREE.Mesh(this.geometry, this.selectMat);
    this.selectMesh.rotation.x = -Math.PI / 2;
    this.selectMesh.position.y = 0.03;
    this.selectMesh.visible = false;
    this.selectMesh.renderOrder = 1;
    this.object.add(this.selectMesh);

    this.hoverMat = new THREE.MeshBasicMaterial({
      color: HOVER_COLOR,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.hoverMesh = new THREE.Mesh(this.geometry, this.hoverMat);
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.position.y = 0.04;
    this.hoverMesh.visible = false;
    this.hoverMesh.renderOrder = 2;
    this.object.add(this.hoverMesh);
  }

  setHover(cell: CellCoord | null): void {
    if (sameCell(cell, this.hoverCell)) return;
    this.hoverCell = cell;
    if (cell) {
      const p = cellCenterToWorld(cell.col, cell.row);
      this.hoverMesh.position.set(p.x, this.hoverMesh.position.y, p.z);
      this.hoverMesh.visible = true;
    } else {
      this.hoverMesh.visible = false;
    }
  }

  /** null = neutral, true = valid placement, false = invalid placement. */
  setHoverValidity(valid: boolean | null): void {
    const color =
      valid === null
        ? HOVER_COLOR
        : valid
          ? HOVER_VALID_COLOR
          : HOVER_INVALID_COLOR;
    this.hoverMat.color.setHex(color);
    this.hoverMat.opacity = valid === null ? 0.22 : 0.34;
  }

  setSelected(cell: CellCoord | null): void {
    if (sameCell(cell, this.selectedCell)) return;
    this.selectedCell = cell;
    if (cell) {
      const p = cellCenterToWorld(cell.col, cell.row);
      this.selectMesh.position.set(p.x, this.selectMesh.position.y, p.z);
      this.selectMesh.visible = true;
    } else {
      this.selectMesh.visible = false;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.hoverMat.dispose();
    this.selectMat.dispose();
  }
}
