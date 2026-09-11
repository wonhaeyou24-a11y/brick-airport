import * as THREE from "three";
import { Building } from "./Building";
import { CELL_SIZE } from "../world/Grid";
import { brickMaterial, COLORS } from "../world/materials";
import { createSignPost, createStud } from "../assets/AssetFactory";

/**
 * Runway — placeholder box with simple markings.
 * Long axis runs along local X. Kept as its own class so a future operations
 * system can query / animate it independently.
 */
export class Runway extends Building {
  protected build(group: THREE.Group): void {
    const length = this.data.size.cols * CELL_SIZE;
    const width = this.data.size.rows * CELL_SIZE;

    // Surface
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.3, width),
      brickMaterial(COLORS.runway, { roughness: 0.9 }),
    );
    surface.position.y = 0.15;
    surface.receiveShadow = true;
    group.add(surface);

    const markingMat = brickMaterial(COLORS.runwayMarking, { roughness: 0.6 });

    // Dashed centre line
    const dashLength = 1.6;
    const gap = 1.2;
    const dashGeo = new THREE.BoxGeometry(dashLength, 0.02, 0.25);
    const start = -length / 2 + dashLength;
    for (let x = start; x <= length / 2 - dashLength; x += dashLength + gap) {
      const dash = new THREE.Mesh(dashGeo, markingMat);
      dash.position.set(x, 0.31, 0);
      group.add(dash);
    }

    // Threshold stripes at both ends
    const stripeGeo = new THREE.BoxGeometry(1.4, 0.02, 0.45);
    const stripeCount = 4;
    for (const end of [-1, 1]) {
      for (let i = 0; i < stripeCount; i++) {
        const stripe = new THREE.Mesh(stripeGeo, markingMat);
        const z = (i - (stripeCount - 1) / 2) * 0.8;
        stripe.position.set(end * (length / 2 - 1.2), 0.31, z);
        group.add(stripe);
      }
    }

    // Edge lines along both long sides (spec §11).
    const edgeGeo = new THREE.BoxGeometry(length - 1, 0.02, 0.12);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(edgeGeo, markingMat);
      edge.position.set(0, 0.31, side * (width / 2 - 0.2));
      group.add(edge);
    }

    // Runway edge lights — small studs along both sides, spaced out so they
    // read from the iso view without turning into a dense strip.
    const lightSpacing = 3.2;
    const lightCount = Math.max(2, Math.floor(length / lightSpacing));
    for (let i = 0; i < lightCount; i++) {
      const x = -length / 2 + 1 + i * lightSpacing;
      for (const side of [-1, 1]) {
        const light = createStud(0xfff2b2, 0.06);
        light.position.set(x, 0.33, side * (width / 2 + 0.15));
        group.add(light);
      }
    }

    // Small threshold sign at one end (runway identifier post).
    const sign = createSignPost(1.2, COLORS.runwayMarking, COLORS.terminalDark);
    sign.position.set(-length / 2 - 0.4, 0, -width / 2 - 0.3);
    group.add(sign);
  }
}
