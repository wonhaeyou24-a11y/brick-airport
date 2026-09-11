import * as THREE from "three";
import { Building } from "./Building";
import { CELL_SIZE } from "../world/Grid";
import { brickMaterial, COLORS } from "../world/materials";
import { createStudRow, createWindowRow, createSignPost, createSignboard } from "../assets/AssetFactory";

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

    // Glass curtain wall (facing -Z, toward the apron / gates / runway) —
    // now spans nearly the full height and width of the body, reading as a
    // real curtain-wall frontage rather than a strip window (V2.0 STEP 1
    // REWORK §6/§7's "Glass Curtain Wall").
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, h * 0.82, 0.2),
      brickMaterial(COLORS.terminalGlass, { roughness: 0.2, metalness: 0.1 }),
    );
    glass.position.set(0, h * 0.46, -d / 2 - 0.02);
    group.add(glass);

    // Two floors of window mullions — a ground floor row plus an upper floor
    // row divided by a dark spandrel band, so the facade reads as a
    // multi-story building instead of one glass slab (spec §7/§9).
    const paneCount = Math.max(3, Math.round(w / 1.6));
    const lowerWindows = createWindowRow(
      paneCount,
      (w * 0.92) / paneCount,
      (w * 0.78) / paneCount,
      h * 0.36,
      0x6fb8d6,
    );
    lowerWindows.position.set(0, h * 0.24, -d / 2 - 0.13);
    group.add(lowerWindows);

    const spandrel = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 0.16, 0.24),
      brickMaterial(COLORS.terminalDark, { roughness: 0.5, metalness: 0.15 }),
    );
    spandrel.position.set(0, h * 0.46, -d / 2 - 0.05);
    group.add(spandrel);

    const upperWindows = createWindowRow(
      paneCount,
      (w * 0.92) / paneCount,
      (w * 0.78) / paneCount,
      h * 0.32,
      0x6fb8d6,
    );
    upperWindows.position.set(0, h * 0.66, -d / 2 - 0.13);
    group.add(upperWindows);

    // "AIRPORT" signboard on the facade above the entrance — a single
    // shared canvas-texture mesh (spec §36: no per-window mesh explosion),
    // the clearest single cue that this is a terminal, not a generic block.
    const signboard = createSignboard("AIRPORT", Math.min(w * 0.45, 4.5), 0.6);
    signboard.position.set(0, h * 0.82, -d / 2 - 0.14);
    group.add(signboard);

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

    // Low side wings at both ends — breaks the terminal up into a layered
    // building mass instead of one long slab (spec §7's "layered building
    // mass"), still fully inside the same BuildingData footprint.
    const wingH = h * 0.55;
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.16, wingH, d * 0.92),
        brickMaterial(COLORS.terminalBody, { roughness: 0.75 }),
      );
      wing.position.set(sx * (w / 2 - w * 0.08), wingH / 2, 0);
      wing.castShadow = true;
      wing.receiveShadow = true;
      group.add(wing);

      const wingRoof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.18, 0.3, d * 0.98),
        brickMaterial(COLORS.facilityRoof, { roughness: 0.6 }),
      );
      wingRoof.position.set(sx * (w / 2 - w * 0.08), wingH + 0.15, 0);
      group.add(wingRoof);
    }

    // Raised central roof block carrying the terminal name — the reference
    // image's blue upper-deck massing above the main entrance.
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.34, h * 0.5, d * 0.6),
      brickMaterial(COLORS.terminalGlass, { roughness: 0.3, metalness: 0.1 }),
    );
    crown.position.set(0, h + 0.2 + (h * 0.5) / 2, 0);
    crown.castShadow = true;
    group.add(crown);
    const crownRoof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.38, 0.3, d * 0.66),
      brickMaterial(COLORS.terminalRoof, { roughness: 0.6 }),
    );
    crownRoof.position.set(0, h + 0.2 + h * 0.5 + 0.15, 0);
    group.add(crownRoof);

    // Entrance canopy
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.3, 1.2, 1.4),
      brickMaterial(COLORS.terminalAccent, { roughness: 0.6 }),
    );
    entrance.position.set(0, 0.6, -d / 2 - 0.7);
    group.add(entrance);

    // Canopy support columns — the reference image's covered drop-off walk.
    const columnMat = brickMaterial(COLORS.terminalDark, { roughness: 0.5, metalness: 0.2 });
    for (const cx of [-1, 1]) {
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8),
        columnMat,
      );
      column.position.set(cx * w * 0.13, 0.6, -d / 2 - 1.3);
      group.add(column);
    }

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
