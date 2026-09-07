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

/** Distance (world units) at which a move target counts as reached. */
const ARRIVE_EPSILON = 0.15;

/**
 * Aircraft — placeholder plane + thin movement helper.
 *
 * The plane faces local +X ("nose" direction). All authoritative values live
 * in the referenced AircraftData; this class writes position/heading back to
 * it each frame and mirrors them onto the Three.js group.
 */
export class Aircraft implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "AIRCRAFT";
  readonly object: THREE.Group;
  readonly data: AircraftData;

  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

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

  /** Simple brick-built silhouette: fuselage + wings + tail + cockpit. */
  private buildPlaceholder(group: THREE.Group): void {
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 3.4, 12),
      brickMaterial(COLORS.aircraftBody, { roughness: 0.4 }),
    );
    fuselage.rotation.z = Math.PI / 2; // lie along X
    fuselage.position.y = 0.7;
    fuselage.castShadow = true;
    group.add(fuselage);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.7, 12),
      brickMaterial(COLORS.aircraftBody, { roughness: 0.4 }),
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(2.05, 0.7, 0);
    group.add(nose);

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.12, 4.6),
      brickMaterial(COLORS.aircraftWing, { roughness: 0.5 }),
    );
    wing.position.set(0, 0.7, 0);
    wing.castShadow = true;
    group.add(wing);

    const tailplane = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.1, 1.9),
      brickMaterial(COLORS.aircraftWing, { roughness: 0.5 }),
    );
    tailplane.position.set(-1.5, 0.9, 0);
    group.add(tailplane);

    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.12),
      brickMaterial(COLORS.aircraftTail, { roughness: 0.5 }),
    );
    fin.position.set(-1.5, 1.4, 0);
    fin.castShadow = true;
    group.add(fin);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 8),
      brickMaterial(COLORS.aircraftCockpit, { roughness: 0.2, metalness: 0.1 }),
    );
    cockpit.position.set(1.4, 0.95, 0);
    group.add(cockpit);
  }

  /** Point the aircraft at a world position and start taxiing toward it. */
  moveTo(target: THREE.Vector3): void {
    this.data.targetPosition = { x: target.x, y: target.y, z: target.z };
  }

  /** Advance movement. Returns true on the frame the target is reached. */
  update(deltaTime: number): boolean {
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

  setHighlighted(highlighted: boolean): void {
    setEmissiveHighlight(this.object, highlighted);
  }

  getSelectionLabel(): string {
    return `Aircraft ${this.data.type}`;
  }

  dispose(): void {
    disposeHighlight(this.object);
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
