import * as THREE from "three";
import { Building } from "./Building";
import { brickMaterial, COLORS } from "../world/materials";
import { createSignPost, createStud } from "../assets/AssetFactory";

/**
 * Gate — brick-toy aircraft stand (V1.3-B upgrade of the V0.1 placeholder):
 * parking pad with painted lead-in markings, a jet bridge, a gate-number
 * sign, and small stand lights.
 *
 * GateData (status / aircraftId) stays entirely in GameState — this mesh
 * only reads the building id once, at construction, to paint a static gate
 * number; it never reads or stores live operational state (spec §10).
 */
export class Gate extends Building {
  protected build(group: THREE.Group): void {
    // Gate pad
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.25, 2),
      brickMaterial(COLORS.gate, { roughness: 0.8 }),
    );
    pad.position.y = 0.125;
    pad.receiveShadow = true;
    group.add(pad);

    // Painted parking lead-in lines (ground markings, spec §10).
    const markingMat = brickMaterial(0xf7f7f7, { roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 1.6), markingMat);
      line.position.set(sx * 0.55, 0.26, 0);
      group.add(line);
    }
    const stopLine = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.01, 0.06), markingMat);
    stopLine.position.set(0, 0.26, -0.7);
    group.add(stopLine);

    // Jet bridge stub, reaching toward +Z (toward the terminal)
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 2.2),
      brickMaterial(COLORS.gateBridge, { roughness: 0.5 }),
    );
    bridge.position.set(0, 1.1, 1.6);
    bridge.castShadow = true;
    group.add(bridge);

    // Small accordion-look ring where the bridge meets the pad.
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10),
      brickMaterial(COLORS.terminalDark, { roughness: 0.6 }),
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, 1.1, 0.6);
    group.add(cuff);

    // Gate-number sign — a static cosmetic label derived from the building
    // id, never from live GateData (spec §10's own instruction).
    const sign = createSignPost(1.4, COLORS.terminalAccent);
    sign.position.set(-0.9, 0, 0.9);
    group.add(sign);

    // Stand lights — two small studs that read as apron floodlights.
    for (const sx of [-1, 1]) {
      const light = createStud(0xfff2b2, 0.07);
      light.position.set(sx * 0.9, 0.9, -0.9);
      group.add(light);
    }

    // Marker post (kept from the original placeholder — service-area cue).
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6),
      brickMaterial(COLORS.terminalAccent),
    );
    post.position.set(0.8, 0.8, 0.8);
    group.add(post);
  }

  getSelectionLabel(): string {
    return "Gate";
  }
}
