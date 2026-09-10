import * as THREE from "three";
import type { BuildingType } from "../core/GameState";
import { CELL_SIZE, type CellCoord, type CellSize } from "../world/cells";

/**
 * BuildingPreview — the translucent ghost shown while placing a building.
 *
 * One reused box mesh (scaled to the footprint), never rebuilt per frame
 * (perf rule 30). Colour flips green / red for VALID / INVALID. This is purely
 * visual — nothing here touches GameState (spec §5, §28).
 */
const VALID_COLOR = 0x2a9d8f;
const INVALID_COLOR = 0xe63946;

/** Rough placeholder heights per type, in world units. */
const PREVIEW_HEIGHT: Record<BuildingType, number> = {
  TERMINAL: 4,
  RUNWAY: 0.5,
  GATE: 1.2,
  CHECK_IN: 2,
  SECURITY: 2,
  BAGGAGE: 2.4,
  LOUNGE: 3,
};

export class BuildingPreview {
  readonly object: THREE.Group;

  private readonly mesh: THREE.Mesh;
  private readonly edges: THREE.LineSegments;
  private readonly geometry: THREE.BoxGeometry;
  private readonly edgeGeometry: THREE.EdgesGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly edgeMaterial: THREE.LineBasicMaterial;
  private type: BuildingType | null = null;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "building-preview";
    this.object.visible = false;

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 3;
    this.object.add(this.mesh);

    // Crisp outline so the footprint reads on any ground colour.
    this.edgeGeometry = new THREE.EdgesGeometry(this.geometry);
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.edges = new THREE.LineSegments(this.edgeGeometry, this.edgeMaterial);
    this.edges.renderOrder = 4;
    this.mesh.add(this.edges);
  }

  show(type: BuildingType): void {
    this.type = type;
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
  }

  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  /** Position the ghost over a footprint anchored at `cell`. */
  moveTo(cell: CellCoord, size: CellSize): void {
    if (!this.type) return;
    const w = size.cols * CELL_SIZE;
    const d = size.rows * CELL_SIZE;
    const h = PREVIEW_HEIGHT[this.type];

    this.mesh.scale.set(w, h, d);
    this.mesh.position.set(0, h / 2 + 0.05, 0);
    this.object.position.set(
      cell.col * CELL_SIZE + w / 2,
      0,
      cell.row * CELL_SIZE + d / 2,
    );
  }

  setValid(valid: boolean): void {
    const color = valid ? VALID_COLOR : INVALID_COLOR;
    this.material.color.setHex(color);
    this.material.opacity = valid ? 0.4 : 0.55;
    this.edgeMaterial.color.setHex(color);
  }

  dispose(): void {
    this.geometry.dispose();
    this.edgeGeometry.dispose();
    this.material.dispose();
    this.edgeMaterial.dispose();
  }
}
