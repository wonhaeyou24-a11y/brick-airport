import * as THREE from "three";
import { Building } from "./Building";
import { CELL_SIZE } from "../world/Grid";
import { brickMaterial, COLORS } from "../world/materials";
import { createStudRow, createWindowRow, createSignPost } from "../assets/AssetFactory";

/**
 * Terminal — brick-toy airport terminal (V1.3-B upgrade of the V0.1
 * placeholder): body + glass facade with a window row + roof with a stud
 * accent + entrance canopy/doors + roof equipment + a sign post.
 *
 * LOGIC FOOTPRINT ≠ VISUAL DETAIL (spec §9): every dimension below is still
 * derived from `this.data.size` (the real, unchanged BuildingData footprint)
 * — only the amount of geometry inside that footprint grew, never the
 * footprint itself.
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

    // Window mullions — a row of slightly darker panes over the glass, so the
    // facade reads as individual windows instead of one glass slab (spec §9).
    const paneCount = Math.max(3, Math.round(w / 1.6));
    const windows = createWindowRow(
      paneCount,
      (w * 0.86) / paneCount,
      (w * 0.7) / paneCount,
      h * 0.42,
      0x6fb8d6,
    );
    windows.position.set(0, h * 0.42, -d / 2 - 0.13);
    group.add(windows);

    // Flat roof cap
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
      brickMaterial(COLORS.terminalRoof, { roughness: 0.6 }),
    );
    roof.position.y = h + 0.2;
    roof.castShadow = true;
    group.add(roof);

    // Roofline stud accent — the toy-brick signature detail (spec §8).
    const studCount = Math.max(4, Math.round(w / 1.2));
    const studs = createStudRow(studCount, w / studCount, COLORS.terminalAccent);
    studs.position.set(0, h + 0.47, -d / 2 + 0.35);
    group.add(studs);

    // Small roof-mounted equipment box (AC / vent unit).
    const equipment = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.4, 0.7),
      brickMaterial(COLORS.terminalDark, { roughness: 0.7 }),
    );
    equipment.position.set(w * 0.22, h + 0.65, d * 0.15);
    equipment.castShadow = true;
    group.add(equipment);

    // Entrance canopy
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.3, 1.2, 1.4),
      brickMaterial(COLORS.terminalAccent, { roughness: 0.6 }),
    );
    entrance.position.set(0, 0.6, -d / 2 - 0.7);
    group.add(entrance);

    // Entrance doors — two dark panels under the canopy.
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.09, 1.05, 0.06),
        brickMaterial(COLORS.terminalDark, { roughness: 0.4, metalness: 0.2 }),
      );
      door.position.set(sx * w * 0.06, 0.55, -d / 2 - 0.03);
      group.add(door);
    }

    // Airport sign post beside the entrance.
    const sign = createSignPost(1.6, COLORS.terminalAccent);
    sign.position.set(-w / 2 - 0.5, 0, -d / 2 - 0.3);
    group.add(sign);

    // Rooftop beacon
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8),
      brickMaterial(COLORS.terminalAccent),
    );
    beacon.position.set(w / 2 - 0.8, h + 0.9, -d / 2 + 0.8);
    group.add(beacon);
  }
}
