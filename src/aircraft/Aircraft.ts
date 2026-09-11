import * as THREE from "three";
import type { AircraftData } from "../core/GameState";
import { disposeObject } from "../core/three-utils";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";
import { brickMaterial, COLORS } from "../world/materials";
import { CURRENT_LOCALE } from "../i18n/strings";

/** Distance (world units) at which a move target counts as reached. */
const ARRIVE_EPSILON = 0.15;

/** Visual size variant, chosen only from AircraftData.capacity (spec §12 — never from `type`). */
type AircraftVariant = "SMALL" | "MEDIUM" | "LARGE";

function variantFor(capacity: number): AircraftVariant {
  if (capacity <= 4) return "SMALL";
  if (capacity <= 8) return "MEDIUM";
  return "LARGE";
}

interface VariantSpec {
  scale: number;
  engineCount: number;
}

const VARIANT_SPEC: Record<AircraftVariant, VariantSpec> = {
  SMALL: { scale: 0.8, engineCount: 1 },
  MEDIUM: { scale: 1.0, engineCount: 2 },
  LARGE: { scale: 1.25, engineCount: 2 },
};

/** Seconds a full blink cycle (on+off) takes for the tail beacon. */
const BLINK_PERIOD = 1.4;
/** Radians/sec the engine fan discs spin — purely cosmetic (spec §13). */
const ENGINE_SPIN_SPEED = 14;

/**
 * Aircraft — brick-toy plane + thin movement helper.
 *
 * The plane faces local +X ("nose" direction). All authoritative values live
 * in the referenced AircraftData; this class writes position/heading back to
 * it each frame and mirrors them onto the Three.js group (unchanged from
 * V0.2 — V1.3 only enriches buildPlaceholder() and adds cosmetic-only
 * animation that never touches `data`, per spec §13/§31).
 */
export class Aircraft implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "AIRCRAFT";
  readonly object: THREE.Group;
  readonly data: AircraftData;

  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  private readonly engines: THREE.Mesh[] = [];
  private readonly gear: THREE.Mesh[] = [];
  private beaconMat: THREE.MeshStandardMaterial | null = null;
  private animClock = 0;
  /** Cosmetic nose pitch (V1.9 §6) — smoothed toward a per-state target each
   * frame; never read anywhere, never written back to `data`. */
  private pitch = 0;

  constructor(data: AircraftData) {
    this.data = data;
    this.id = data.id;

    this.object = new THREE.Group();
    this.object.name = data.id;
    this.buildPlaceholder(this.object);

    this.object.position.set(data.position.x, data.position.y, data.position.z);
    this.object.rotation.y = data.heading;

    tagSelectable(this.object, this);
  }

  /** Brick-built silhouette: fuselage + wings + tail + cockpit + engines + gear. */
  private buildPlaceholder(group: THREE.Group): void {
    const variant = variantFor(this.data.capacity ?? 6);
    const spec = VARIANT_SPEC[variant];
    const s = spec.scale;

    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35 * s, 0.35 * s, 3.4 * s, 12),
      brickMaterial(COLORS.aircraftBody, { roughness: 0.4 }),
    );
    fuselage.rotation.z = Math.PI / 2; // lie along X
    fuselage.position.y = 0.7 * s;
    fuselage.castShadow = true;
    group.add(fuselage);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.35 * s, 0.7 * s, 12),
      brickMaterial(COLORS.aircraftBody, { roughness: 0.4 }),
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(2.05 * s, 0.7 * s, 0);
    group.add(nose);

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.1 * s, 0.12 * s, 4.6 * s),
      brickMaterial(COLORS.aircraftWing, { roughness: 0.5 }),
    );
    wing.position.set(0, 0.7 * s, 0);
    wing.castShadow = true;
    group.add(wing);

    const tailplane = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 * s, 0.1 * s, 1.9 * s),
      brickMaterial(COLORS.aircraftWing, { roughness: 0.5 }),
    );
    tailplane.position.set(-1.5 * s, 0.9 * s, 0);
    group.add(tailplane);

    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 * s, 1.1 * s, 0.12 * s),
      brickMaterial(COLORS.aircraftTail, { roughness: 0.5 }),
    );
    fin.position.set(-1.5 * s, 1.4 * s, 0);
    fin.castShadow = true;
    group.add(fin);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.3 * s, 12, 8),
      brickMaterial(COLORS.aircraftCockpit, { roughness: 0.2, metalness: 0.1 }),
    );
    cockpit.position.set(1.4 * s, 0.95 * s, 0);
    group.add(cockpit);

    // Engine pods under the wings, one fan disc per pod (spec §12/§13).
    const engineMat = brickMaterial(0x2b2f3a, { roughness: 0.4, metalness: 0.3 });
    const fanMat = brickMaterial(0x8d99ae, { roughness: 0.5, metalness: 0.4 });
    const engineZs =
      spec.engineCount === 1
        ? [0]
        : [-1.4 * s, 1.4 * s];
    for (const ez of engineZs) {
      const pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.7 * s, 10),
        engineMat,
      );
      pod.rotation.z = Math.PI / 2;
      pod.position.set(0.1 * s, 0.35 * s, ez);
      group.add(pod);

      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.15 * s, 8), fanMat);
      fan.position.set(0.1 * s + 0.36 * s, 0.35 * s, ez);
      fan.rotation.y = Math.PI / 2;
      group.add(fan);
      this.engines.push(fan);
    }

    // Landing gear — small dark stubs, hidden while FLYING (spec §13's
    // "landing gear transition"). Purely a read of the existing AircraftState
    // for display; it never writes back to `data`.
    const gearMat = brickMaterial(0x22333b, { roughness: 0.6 });
    const gearPositions: [number, number, number][] = [
      [0.9 * s, 0, 0],
      [-0.6 * s, 0, 0.5 * s],
      [-0.6 * s, 0, -0.5 * s],
    ];
    for (const [gx, , gz] of gearPositions) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5 * s, 6), gearMat);
      strut.position.set(gx, 0.25 * s, gz);
      group.add(strut);
      this.gear.push(strut);
    }

    // Tail beacon — blinks (spec §13). Emissive color set once here, never
    // per frame (V1.9 §27 perf pass) — tickAnimation only ever toggles
    // emissiveIntensity on this same Color instance.
    this.beaconMat = brickMaterial(0xe63946, { roughness: 0.3 }).clone();
    this.beaconMat.emissive.setHex(0xe63946);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 6), this.beaconMat);
    beacon.position.set(-1.5 * s, 1.95 * s, 0);
    group.add(beacon);
  }

  /** Point the aircraft at a world position and start taxiing toward it. */
  moveTo(target: THREE.Vector3): void {
    this.data.targetPosition = { x: target.x, y: target.y, z: target.z };
  }

  /**
   * Advance movement AND cosmetic-only animation. `data.position`/`heading`
   * are still the sole output of the movement branch below — animation only
   * ever touches child-mesh local transforms (spec §31).
   */
  update(deltaTime: number): boolean {
    this.tickAnimation(deltaTime);

    const { data } = this;
    if (!data.targetPosition) return false;

    this.tmpTarget.set(
      data.targetPosition.x,
      data.targetPosition.y,
      data.targetPosition.z,
    );
    this.tmpDir.copy(this.tmpTarget).sub(this.object.position);
    const distance = this.tmpDir.length();

    if (distance <= ARRIVE_EPSILON) {
      this.object.position.copy(this.tmpTarget);
      data.position = {
        x: this.tmpTarget.x,
        y: this.tmpTarget.y,
        z: this.tmpTarget.z,
      };
      data.targetPosition = null;
      return true;
    }

    this.tmpDir.normalize();

    // Smoothly turn toward the travel direction.
    const desiredHeading = Math.atan2(this.tmpDir.z, this.tmpDir.x);
    data.heading = approachAngle(data.heading, -desiredHeading, deltaTime * 3);
    this.object.rotation.y = data.heading;

    const step = Math.min(data.speed * deltaTime, distance);
    this.object.position.addScaledVector(this.tmpDir, step);
    data.position = {
      x: this.object.position.x,
      y: this.object.position.y,
      z: this.object.position.z,
    };
    return false;
  }

  /**
   * Engine spin, gear retraction, beacon blink, nose pitch (V1.9 §6) — every
   * line here only reads data.state, never writes it (spec §28).
   */
  private tickAnimation(deltaTime: number): void {
    this.animClock += deltaTime;

    for (const fan of this.engines) fan.rotation.z += ENGINE_SPIN_SPEED * deltaTime;

    const gearDown = this.data.state !== "FLYING";
    for (const strut of this.gear) strut.visible = gearDown;

    if (this.beaconMat) {
      const phase = (this.animClock % BLINK_PERIOD) / BLINK_PERIOD;
      // Reuse the existing Color instance (perf rule §27) — only the
      // intensity actually needs to change frame to frame.
      this.beaconMat.emissiveIntensity = phase < 0.5 ? 1 : 0.15;
    }

    // Nose pitch — a small, purely cosmetic lean, smoothed so it never pops
    // (spec §6's "runway acceleration / 약간의 nose-up" and landing flare).
    const targetPitch =
      this.data.state === "TAKEOFF" ? 0.12 : this.data.state === "LANDING" ? 0.05 : 0;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, deltaTime * 3);
    this.object.rotation.z = this.pitch;
  }

  setHighlighted(highlighted: boolean): void {
    setEmissiveHighlight(this.object, highlighted);
  }

  getSelectionLabel(): string {
    return CURRENT_LOCALE === "ko"
      ? `항공기 ${this.data.type}`
      : `Aircraft ${this.data.type}`;
  }

  dispose(): void {
    disposeHighlight(this.object);
    this.beaconMat?.dispose();
    disposeObject(this.object);
  }
}

/** Move `current` angle toward `target` by at most `maxDelta` radians. */
function approachAngle(current: number, target: number, maxDelta: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}
