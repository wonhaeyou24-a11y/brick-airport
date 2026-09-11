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
import { createStudRow } from "../assets/AssetFactory";
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

/**
 * V2.0 STEP 1 §25 — a MEDIUM aircraft's fuselage diameter (0.7 units) used to
 * be narrower than a standing Passenger is tall (~1.3 units), so a minifig
 * next to a plane read as roughly the same size as the plane itself. This
 * uniformly enlarges every offset in buildPlaceholder() (all of which are
 * already `* s`) without touching AircraftData, movement, or animation
 * targets — purely a bigger `s`.
 */
const SIZE_BOOST = 1.45;

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
  /** Each entry is the strut+wheel Group for one leg (spec: visible wheel +
   * axle), toggled as a unit by tickAnimation's gear-retraction check. */
  private readonly gear: THREE.Object3D[] = [];
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
    const s = spec.scale * SIZE_BOOST;
    // Stretches only the length axis (fuselage/nose/cockpit/tail/gear X
    // offsets) so the plane reads as a lean real-aircraft silhouette instead
    // of "short and thick" (V2.0 STEP 1 REWORK §13), without touching the
    // wingspan or fuselage diameter set above.
    const L = 1.25;
    const fuselageRadius = 0.35 * s;
    const fuselageLength = 3.4 * s * L;
    const halfFuselage = fuselageLength / 2;

    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(fuselageRadius, fuselageRadius, fuselageLength, 12),
      brickMaterial(COLORS.aircraftBody, { roughness: 0.4 }),
    );
    fuselage.rotation.z = Math.PI / 2; // lie along X
    fuselage.position.y = 0.7 * s;
    fuselage.castShadow = true;
    group.add(fuselage);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(fuselageRadius, 0.75 * s, 12),
      brickMaterial(COLORS.aircraftBody, { roughness: 0.4 }),
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(halfFuselage + fuselageRadius, 0.7 * s, 0);
    group.add(nose);

    // Cabin window stripe along both sides of the fuselage — a single thin
    // decal-like band per side rather than dozens of individual window
    // meshes (spec §14's "각 창문을 무수히 많은 독립 Mesh로 만들지 않는다").
    const windowStripeMat = brickMaterial(0x1c2b38, { roughness: 0.25, metalness: 0.1 });
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(fuselageLength * 0.62, 0.1 * s, 0.03 * s),
        windowStripeMat,
      );
      stripe.position.set(-0.05 * s, 0.78 * s, side * fuselageRadius * 0.99);
      group.add(stripe);
    }

    // Cockpit windshield — a small dark flat panel on the nose.
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * s, 0.18 * s, fuselageRadius * 1.9),
      brickMaterial(0x1c2b38, { roughness: 0.2, metalness: 0.15 }),
    );
    windshield.position.set(halfFuselage - 0.35 * s, 0.85 * s, 0);
    group.add(windshield);

    // Livery stripe — a single accent-color band under the window line,
    // reading as an airline paint scheme without a texture/decal system.
    const liveryMat = brickMaterial(COLORS.aircraftTail, { roughness: 0.35 });
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(fuselageLength * 0.7, 0.06 * s, 0.03 * s),
        liveryMat,
      );
      stripe.position.set(-0.02 * s, 0.62 * s, side * fuselageRadius * 0.99);
      group.add(stripe);
    }

    // Spine stud line — the toy-brick signature detail, running along the
    // top of the fuselage (spec: "상단 블록 스터드 라인").
    const studCount = Math.max(4, Math.round((fuselageLength * 0.7) / (0.4 * s)));
    const studs = createStudRow(studCount, (fuselageLength * 0.7) / studCount, 0xd7dde2);
    studs.position.set(-0.05 * s, 0.7 * s + fuselageRadius * 0.92, 0);
    group.add(studs);

    const wingMat = brickMaterial(COLORS.aircraftWing, { roughness: 0.5 });

    // Main wing, narrower chord + longer span than the old single slab —
    // reads as a real wing instead of a plank (spec §12).
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.0 * s, 0.12 * s, 5.0 * s),
      wingMat,
    );
    wing.position.set(0, 0.7 * s, 0);
    wing.castShadow = true;
    group.add(wing);

    // Tapered outer wing panels + upturned winglets at each tip (spec §12's
    // "real aircraft silhouette + block toy material") — purely decorative,
    // not part of `engines`/`gear` so tickAnimation never touches them.
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 * s, 0.09 * s, 0.9 * s),
        wingMat,
      );
      tip.position.set(-0.08 * s, 0.7 * s, side * 2.7 * s);
      tip.castShadow = true;
      group.add(tip);

      const winglet = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * s, 0.5 * s, 0.32 * s),
        brickMaterial(COLORS.aircraftTail, { roughness: 0.45 }),
      );
      winglet.position.set(-0.08 * s, 0.95 * s, side * 3.05 * s);
      winglet.rotation.z = side * 0.32;
      group.add(winglet);
    }

    const tailplane = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 * s, 0.1 * s, 1.9 * s),
      brickMaterial(COLORS.aircraftWing, { roughness: 0.5 }),
    );
    tailplane.position.set(-halfFuselage + 0.2 * s, 0.9 * s, 0);
    group.add(tailplane);

    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 * s, 1.1 * s, 0.12 * s),
      brickMaterial(COLORS.aircraftTail, { roughness: 0.5 }),
    );
    fin.position.set(-halfFuselage + 0.2 * s, 1.4 * s, 0);
    fin.castShadow = true;
    group.add(fin);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.3 * s, 12, 8),
      brickMaterial(COLORS.aircraftCockpit, { roughness: 0.2, metalness: 0.1 }),
    );
    cockpit.position.set(halfFuselage - 0.55 * s, 0.95 * s, 0);
    group.add(cockpit);

    // Engine pods under the wings, one fan disc per pod (spec §12/§13).
    const engineMat = brickMaterial(0x2b2f3a, { roughness: 0.4, metalness: 0.3 });
    const fanMat = brickMaterial(0x8d99ae, { roughness: 0.5, metalness: 0.4 });
    const engineZs =
      spec.engineCount === 1
        ? [0]
        : [-1.4 * s, 1.4 * s];
    const intakeMat = brickMaterial(0x14171d, { roughness: 0.35, metalness: 0.2 });
    for (const ez of engineZs) {
      const pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.7 * s, 10),
        engineMat,
      );
      pod.rotation.z = Math.PI / 2;
      pod.position.set(0.1 * s, 0.35 * s, ez);
      pod.castShadow = true;
      group.add(pod);

      // Intake ring — a dark rim in front of the fan, so the pod reads as a
      // jet engine (air intake) rather than a plain cylinder.
      const intake = new THREE.Mesh(
        new THREE.RingGeometry(0.1 * s, 0.165 * s, 12),
        intakeMat,
      );
      intake.position.set(0.1 * s + 0.351 * s, 0.35 * s, ez);
      intake.rotation.y = Math.PI / 2;
      group.add(intake);

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
      [halfFuselage - 0.8 * s, 0, 0],
      [-halfFuselage + 1.1 * s, 0, 0.5 * s],
      [-halfFuselage + 1.1 * s, 0, -0.5 * s],
    ];
    const wheelMat = brickMaterial(0x1a1a1e, { roughness: 0.8 });
    for (const [gx, , gz] of gearPositions) {
      const legGroup = new THREE.Group();
      legGroup.position.set(gx, 0, gz);
      group.add(legGroup);

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.5 * s, 6), gearMat);
      strut.position.y = 0.25 * s;
      legGroup.add(strut);

      // Wheel + axle at the foot of the strut, so gear reads as a real
      // undercarriage assembly (spec: "바퀴 휠과 서스펜션 축이 보이는").
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09 * s, 0.09 * s, 0.07 * s, 12),
        wheelMat,
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 0.03 * s;
      legGroup.add(wheel);

      this.gear.push(legGroup);
    }

    // Tail beacon — blinks (spec §13). Emissive color set once here, never
    // per frame (V1.9 §27 perf pass) — tickAnimation only ever toggles
    // emissiveIntensity on this same Color instance.
    this.beaconMat = brickMaterial(0xe63946, { roughness: 0.3 }).clone();
    this.beaconMat.emissive.setHex(0xe63946);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 6), this.beaconMat);
    beacon.position.set(-halfFuselage + 0.2 * s, 1.95 * s, 0);
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
