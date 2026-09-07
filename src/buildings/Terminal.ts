import * as THREE from "three";
import { Building } from "./Building";
import { CELL_SIZE } from "../world/Grid";
import { brickMaterial, COLORS } from "../world/materials";

/**
 * Terminal — placeholder building assembled from basic geometry:
 * body + glass frontage + roof + entrance + a small beacon.
 * Swap-ready for a brick-style model later; game logic lives in GameState.
 */
export class Terminal extends Building {
  protected build(group: THREE.Group): void {
    const w = this.data.size.cols * CELL_SIZE; // along X
    const d = this.data.size.rows * CELL_SIZE; // along Z
    const h = 4;

    // Main body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      brickMaterial(COLORS.terminalBody, { roughness: 0.75 }),
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Glass frontage (facing -Z, toward the apron / gates / runway)
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.86, h * 0.6, 0.2),
      brickMaterial(COLORS.terminalGlass, { roughness: 0.2, metalness: 0.1 }),
    );
    glass.position.set(0, h * 0.42, -d / 2 - 0.02);
    group.add(glass);

    // Flat roof cap
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
      brickMaterial(COLORS.terminalRoof, { roughness: 0.6 }),
    );
    roof.position.y = h + 0.2;
    roof.castShadow = true;
    group.add(roof);

    // Entrance canopy
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.3, 1.2, 1.4),
      brickMaterial(COLORS.terminalAccent, { roughness: 0.6 }),
    );
    entrance.position.set(0, 0.6, -d / 2 - 0.7);
    group.add(entrance);

    // Rooftop beacon
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8),
      brickMaterial(COLORS.terminalAccent),
    );
    beacon.position.set(w / 2 - 0.8, h + 0.9, -d / 2 + 0.8);
    group.add(beacon);
  }
}
