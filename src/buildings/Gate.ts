import * as THREE from "three";
import { Building } from "./Building";
import { brickMaterial, COLORS } from "../world/materials";

/**
 * Gate — placeholder gate structure: a small pad plus a stubby jet bridge.
 * The operational gate state (AVAILABLE / OCCUPIED, aircraftId) lives in
 * GameState.gates; this class is only its visual representation.
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

    // Jet bridge stub, reaching toward +Z (toward the terminal)
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 2.2),
      brickMaterial(COLORS.gateBridge, { roughness: 0.5 }),
    );
    bridge.position.set(0, 1.1, 1.6);
    bridge.castShadow = true;
    group.add(bridge);

    // Marker post
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
