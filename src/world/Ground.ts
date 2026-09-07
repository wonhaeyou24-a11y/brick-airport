import * as THREE from "three";
import { GRID_WIDTH, GRID_DEPTH } from "./Grid";

/** Extra apron beyond the buildable grid, in world units. */
const GROUND_MARGIN = 12;

/**
 * Ground — the flat airport apron everything sits on.
 * A single large plane with a bright, clean colour. Extends a little beyond
 * the grid so the buildable area has visible margin.
 */
export class Ground {
  readonly object: THREE.Object3D;
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshStandardMaterial;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(
      GRID_WIDTH + GROUND_MARGIN,
      GRID_DEPTH + GROUND_MARGIN,
    );
    this.material = new THREE.MeshStandardMaterial({
      color: 0x9bce8f, // toy-grass green apron
      roughness: 0.95,
      metalness: 0,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0;
    this.mesh.receiveShadow = true;
    this.mesh.name = "ground";

    this.object = this.mesh;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
