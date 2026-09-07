import * as THREE from "three";
import type { PassengerData } from "../core/GameState";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";

/**
 * Passenger — placeholder brick-toy minifig, also a Selectable (V0.4-D).
 *
 * Head + body + arms + legs + a little bag, assembled from primitive geometry.
 * Original toy style, no branded/proprietary character design (spec §11).
 * All authoritative values live in the referenced PassengerData; this class
 * only mirrors position / facing onto the group. Geometry is created once and
 * reused — PassengerManager just updates the transform (perf rule 25).
 *
 * The body/head/limb materials are module-level and shared between passengers,
 * so highlighting goes through setEmissiveHighlight, which clones a material
 * per mesh on first use and never mutates the shared ones (spec §12, §21).
 */

/** Cosmetic body colours, indexed by PassengerData.colorIndex. */
const BODY_COLORS = [
  0xe63946, 0x2a9d8f, 0xffb703, 0x457b9d, 0x8d5bce, 0xef7d3a,
];

const sharedGeo = {
  head: new THREE.BoxGeometry(0.34, 0.32, 0.34),
  body: new THREE.BoxGeometry(0.42, 0.5, 0.28),
  limb: new THREE.BoxGeometry(0.12, 0.44, 0.12),
  bag: new THREE.BoxGeometry(0.24, 0.26, 0.18),
};

const headMat = new THREE.MeshStandardMaterial({
  color: 0xffcc99,
  roughness: 0.75,
});
const limbMat = new THREE.MeshStandardMaterial({
  color: 0x394050,
  roughness: 0.8,
});
const bagMat = new THREE.MeshStandardMaterial({
  color: 0x6b4f3a,
  roughness: 0.85,
});
const bodyMats = BODY_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
);

export class Passenger implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "PASSENGER";
  readonly object: THREE.Group;
  readonly data: PassengerData;

  private readonly tmpDir = new THREE.Vector3();

  constructor(data: PassengerData) {
    this.data = data;
    this.id = data.id;

    this.object = new THREE.Group();
    this.object.name = data.id;
    this.build();
    tagSelectable(this.object, this);
    this.syncFromData();
  }

  setHighlighted(highlighted: boolean): void {
    setEmissiveHighlight(this.object, highlighted);
  }

  getSelectionLabel(): string {
    return `Passenger ${passengerLabel(this.data.id)}`;
  }

  private build(): void {
    const bodyMat = bodyMats[this.data.colorIndex % bodyMats.length];

    const body = new THREE.Mesh(sharedGeo.body, bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    this.object.add(body);

    const head = new THREE.Mesh(sharedGeo.head, headMat);
    head.position.y = 1.03;
    head.castShadow = true;
    this.object.add(head);

    const armL = new THREE.Mesh(sharedGeo.limb, bodyMat);
    armL.position.set(-0.29, 0.64, 0);
    this.object.add(armL);
    const armR = new THREE.Mesh(sharedGeo.limb, bodyMat);
    armR.position.set(0.29, 0.64, 0);
    this.object.add(armR);

    const legL = new THREE.Mesh(sharedGeo.limb, limbMat);
    legL.position.set(-0.12, 0.22, 0);
    this.object.add(legL);
    const legR = new THREE.Mesh(sharedGeo.limb, limbMat);
    legR.position.set(0.12, 0.22, 0);
    this.object.add(legR);

    const bag = new THREE.Mesh(sharedGeo.bag, bagMat);
    bag.position.set(0.42, 0.5, 0);
    this.object.add(bag);
  }

  /** Mirror data.position onto the group and face the travel direction. */
  syncFromData(): void {
    const p = this.data.position;
    this.object.position.set(p.x, p.y, p.z);

    const t = this.data.targetPosition;
    if (t) {
      this.tmpDir.set(t.x - p.x, 0, t.z - p.z);
      if (this.tmpDir.lengthSq() > 1e-4) {
        this.object.rotation.y = Math.atan2(this.tmpDir.x, this.tmpDir.z);
      }
    }
  }

  dispose(): void {
    // Geometry / materials are module-level shared resources — do not dispose
    // them here. Free only the per-mesh highlight clones, then detach the tree.
    disposeHighlight(this.object);
    this.object.removeFromParent();
    this.object.clear();
  }
}

/** "pax-0001" -> "P-001" */
function passengerLabel(id: string): string {
  const m = /(\d+)$/.exec(id);
  return m ? `P-${String(parseInt(m[1], 10)).padStart(3, "0")}` : id;
}

/** Free the module-level shared passenger resources (called on teardown). */
export function disposePassengerResources(): void {
  for (const g of Object.values(sharedGeo)) g.dispose();
  headMat.dispose();
  limbMat.dispose();
  bagMat.dispose();
  for (const m of bodyMats) m.dispose();
}
