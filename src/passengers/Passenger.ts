import * as THREE from "three";
import type { PassengerData } from "../core/GameState";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";

/**
 * Passenger — brick-toy minifig, also a Selectable (V0.4-D; visual variety
 * added V1.3-D).
 *
 * Head + body + arms + legs + a bag, plus a deterministic hair/hat and an
 * optional rolling suitcase, assembled from primitive geometry. Original toy
 * style, no branded/proprietary character design (spec §11/§14). All
 * authoritative values live in the referenced PassengerData; this class only
 * mirrors position / facing onto the group, plus a cosmetic leg-swing while
 * walking that never touches `data` (spec §31). Geometry is created once and
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

/** Hair colours — a second, independent variant axis (spec §14). */
const HAIR_COLORS = [0x2b2118, 0x6b4423, 0xf2c14e, 0x1c1c1c, 0xdedede];

const sharedGeo = {
  head: new THREE.BoxGeometry(0.34, 0.32, 0.34),
  body: new THREE.BoxGeometry(0.42, 0.5, 0.28),
  limb: new THREE.BoxGeometry(0.12, 0.44, 0.12),
  bag: new THREE.BoxGeometry(0.24, 0.26, 0.18),
  hair: new THREE.BoxGeometry(0.36, 0.1, 0.36),
  hat: new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12),
  suitcase: new THREE.BoxGeometry(0.16, 0.3, 0.22),
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
const hatMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
const suitcaseMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5 });
const bodyMats = BODY_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
);
const hairMats = HAIR_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }),
);

/** Radians the legs swing to either side while walking. */
const WALK_SWING = 0.4;
/** Swing cycles per second. */
const WALK_RATE = 4;

export class Passenger implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "PASSENGER";
  readonly object: THREE.Group;
  readonly data: PassengerData;

  private readonly tmpDir = new THREE.Vector3();
  private legL: THREE.Mesh | null = null;
  private legR: THREE.Mesh | null = null;
  private walkClock = 0;
  private walking = false;

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
    const idx = this.data.colorIndex;
    const bodyMat = bodyMats[idx % bodyMats.length];
    const hairMat = hairMats[Math.floor(idx / 2) % hairMats.length];
    const wearsHat = idx % 3 === 0;
    const hasSuitcase = idx % 4 === 0;

    const body = new THREE.Mesh(sharedGeo.body, bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    this.object.add(body);

    const head = new THREE.Mesh(sharedGeo.head, headMat);
    head.position.y = 1.03;
    head.castShadow = true;
    this.object.add(head);

    // Hair or a simple sun hat — deterministic per passenger (spec §14).
    if (wearsHat) {
      const hat = new THREE.Mesh(sharedGeo.hat, hatMat);
      hat.position.y = 1.23;
      this.object.add(hat);
    } else {
      const hair = new THREE.Mesh(sharedGeo.hair, hairMat);
      hair.position.y = 1.22;
      this.object.add(hair);
    }

    const armL = new THREE.Mesh(sharedGeo.limb, bodyMat);
    armL.position.set(-0.29, 0.64, 0);
    this.object.add(armL);
    const armR = new THREE.Mesh(sharedGeo.limb, bodyMat);
    armR.position.set(0.29, 0.64, 0);
    this.object.add(armR);

    const legL = new THREE.Mesh(sharedGeo.limb, limbMat);
    legL.position.set(-0.12, 0.22, 0);
    this.object.add(legL);
    this.legL = legL;
    const legR = new THREE.Mesh(sharedGeo.limb, limbMat);
    legR.position.set(0.12, 0.22, 0);
    this.object.add(legR);
    this.legR = legR;

    const bag = new THREE.Mesh(sharedGeo.bag, bagMat);
    bag.position.set(0.42, 0.5, 0);
    this.object.add(bag);

    // A rolling suitcase for some travellers — a small extra travel prop.
    if (hasSuitcase) {
      const suitcase = new THREE.Mesh(sharedGeo.suitcase, suitcaseMat);
      suitcase.position.set(-0.4, 0.28, 0);
      this.object.add(suitcase);
    }
  }

  /** Mirror data.position onto the group and face the travel direction. */
  syncFromData(): void {
    const p = this.data.position;
    this.object.position.set(p.x, p.y, p.z);

    const t = this.data.targetPosition;
    this.walking = !!t;
    if (t) {
      this.tmpDir.set(t.x - p.x, 0, t.z - p.z);
      if (this.tmpDir.lengthSq() > 1e-4) {
        this.object.rotation.y = Math.atan2(this.tmpDir.x, this.tmpDir.z);
      }
    }
  }

  /** Simple walking leg-swing (spec §14/§23) — cosmetic only, never touches `data`. */
  tickAnimation(deltaTime: number): void {
    if (!this.legL || !this.legR) return;
    if (this.walking) {
      this.walkClock += deltaTime;
      const swing = Math.sin(this.walkClock * WALK_RATE * Math.PI * 2) * WALK_SWING;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
    } else if (this.legL.rotation.x !== 0 || this.legR.rotation.x !== 0) {
      this.walkClock = 0;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
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
  hatMat.dispose();
  suitcaseMat.dispose();
  for (const m of bodyMats) m.dispose();
  for (const m of hairMats) m.dispose();
}
