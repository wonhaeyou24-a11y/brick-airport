import * as THREE from "three";
import type { StaffData, StaffRole } from "../core/GameState";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";
import { staffRoleLabel } from "./StaffConfig";

/**
 * Staff — placeholder brick-toy worker + Selectable (V0.9-B).
 *
 * Built the same way as the passenger minifig (head + body + limbs) but given a
 * hi-vis vest, a cap and a small role prop so the player can tell staff from
 * passengers at a glance. Geometry / base materials are module-level and shared;
 * highlighting goes through setEmissiveHighlight which clones per-mesh and never
 * mutates the shared ones (spec §9, §53).
 */

const geo = {
  head: new THREE.BoxGeometry(0.34, 0.32, 0.34),
  cap: new THREE.BoxGeometry(0.38, 0.12, 0.38),
  body: new THREE.BoxGeometry(0.42, 0.5, 0.28),
  vest: new THREE.BoxGeometry(0.46, 0.4, 0.32),
  limb: new THREE.BoxGeometry(0.12, 0.44, 0.12),
  broom: new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6),
  crate: new THREE.BoxGeometry(0.3, 0.26, 0.24),
  hat: new THREE.BoxGeometry(0.4, 0.18, 0.4),
};

const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.75 });
const limbMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.8 });
const capMat = new THREE.MeshStandardMaterial({ color: 0x22333b, roughness: 0.8 });
const propMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.85 });
const hatMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 });

/** Hi-vis vest colour per role. */
const VEST_COLOR: Record<StaffRole, number> = {
  GROUND_AGENT: 0xf17d23,
  CLEANING_AGENT: 0x2ec4b6,
  FUEL_OPERATOR: 0xf6d02f,
  BAGGAGE_AGENT: 0x3a86c8,
};
const vestMats: Record<StaffRole, THREE.MeshStandardMaterial> = {
  GROUND_AGENT: new THREE.MeshStandardMaterial({ color: VEST_COLOR.GROUND_AGENT, roughness: 0.65 }),
  CLEANING_AGENT: new THREE.MeshStandardMaterial({ color: VEST_COLOR.CLEANING_AGENT, roughness: 0.65 }),
  FUEL_OPERATOR: new THREE.MeshStandardMaterial({ color: VEST_COLOR.FUEL_OPERATOR, roughness: 0.65 }),
  BAGGAGE_AGENT: new THREE.MeshStandardMaterial({ color: VEST_COLOR.BAGGAGE_AGENT, roughness: 0.65 }),
};
const shirtMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.8 });

/** Radians the legs swing to either side while walking (matches Passenger). */
const WALK_SWING = 0.4;
const WALK_RATE = 4;

export class Staff implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "GROUND_STAFF";
  readonly object: THREE.Group;
  readonly data: StaffData;

  private readonly tmpDir = new THREE.Vector3();
  private legL: THREE.Mesh | null = null;
  private legR: THREE.Mesh | null = null;
  private walkClock = 0;
  private walking = false;

  constructor(data: StaffData) {
    this.data = data;
    this.id = data.id;

    this.object = new THREE.Group();
    this.object.name = data.id;
    this.build();
    tagSelectable(this.object, this);
    this.syncFromData();
  }

  private build(): void {
    const role = this.data.role;

    const body = new THREE.Mesh(geo.body, shirtMat);
    body.position.y = 0.62;
    body.castShadow = true;
    this.object.add(body);

    const vest = new THREE.Mesh(geo.vest, vestMats[role]);
    vest.position.y = 0.66;
    this.object.add(vest);

    const head = new THREE.Mesh(geo.head, headMat);
    head.position.y = 1.03;
    head.castShadow = true;
    this.object.add(head);

    if (role === "FUEL_OPERATOR") {
      const hat = new THREE.Mesh(geo.hat, hatMat);
      hat.position.y = 1.24;
      this.object.add(hat);
    } else {
      const cap = new THREE.Mesh(geo.cap, capMat);
      cap.position.y = 1.22;
      this.object.add(cap);
    }

    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(geo.limb, vestMats[role]);
      arm.position.set(sx * 0.29, 0.64, 0);
      this.object.add(arm);
      const leg = new THREE.Mesh(geo.limb, limbMat);
      leg.position.set(sx * 0.12, 0.22, 0);
      this.object.add(leg);
      if (sx < 0) this.legL = leg;
      else this.legR = leg;
    }

    if (role === "CLEANING_AGENT") {
      const broom = new THREE.Mesh(geo.broom, propMat);
      broom.position.set(0.34, 0.5, 0.05);
      broom.rotation.z = 0.25;
      this.object.add(broom);
    } else if (role === "BAGGAGE_AGENT") {
      const crate = new THREE.Mesh(geo.crate, propMat);
      crate.position.set(0.4, 0.55, 0);
      this.object.add(crate);
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

  /** Simple walking leg-swing (spec §15/§23) — cosmetic only, never touches `data`. */
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

  setHighlighted(highlighted: boolean): void {
    setEmissiveHighlight(this.object, highlighted);
  }

  getSelectionLabel(): string {
    return `${this.data.name} · ${staffRoleLabel(this.data.role)}`;
  }

  dispose(): void {
    disposeHighlight(this.object);
    this.object.removeFromParent();
    this.object.clear();
  }
}

/** Free the module-level shared staff resources (called on teardown). */
export function disposeStaffResources(): void {
  for (const g of Object.values(geo)) g.dispose();
  headMat.dispose();
  limbMat.dispose();
  capMat.dispose();
  propMat.dispose();
  hatMat.dispose();
  shirtMat.dispose();
  for (const m of Object.values(vestMats)) m.dispose();
}
