import * as THREE from "three";
import type { GateStatus } from "../core/GameState";
import { Building } from "./Building";
import { brickMaterial, COLORS } from "../world/materials";
import { createSignPost, createStud } from "../assets/AssetFactory";
import { t } from "../i18n/strings";

/**
 * Status-light color per GateStatus (V1.7 §8) — read fresh from GateData each
 * frame by Game's refreshGateVisuals(); this mesh never stores or decides the
 * status itself (spec §2's data-first rule).
 */
const STATUS_LIGHT_COLOR: Record<GateStatus, number> = {
  AVAILABLE: 0x8fd3a8, // soft green — free and ready to receive
  OCCUPIED: 0xf6d02f, // legacy value; treated like BOARDING
  BOARDING: 0xf6d02f, // amber — turnaround under way
  READY: 0x3ec95c, // bright green — cleared for pushback
  DEPARTING: 0x4aa8ff, // blue — pushing back / taxiing out
};
/** AVAILABLE-but-an-aircraft-is-inbound tint (V1.9 §8) — a distinct color
 * reusing the existing AVAILABLE status (no new GateStatus value), the same
 * "접근 중" condition Game.describeSelectable already computes. */
const INBOUND_LIGHT_COLOR = 0x6fb4e0;

/** Jet bridge local Z: home (retracted, toward the terminal) and reaching
 * down toward a parked aircraft (V1.9 §9). Animated, not snapped, via
 * Gate.tickAnimation() — ticked by AirportWorld.update(). */
const BRIDGE_HOME_Z = 1.6;
const BRIDGE_EXTENDED_Z = 0.95;
const BRIDGE_TRAVEL_PER_SECOND = 1.4; // full extend/retract in ~0.5s

/**
 * Gate — brick-toy aircraft stand (V1.3-B upgrade of the V0.1 placeholder):
 * parking pad with painted lead-in markings, a jet bridge, a gate-number
 * sign, and small stand lights.
 *
 * GateData (status / aircraftId) stays entirely in GameState — this mesh
 * only reads the building id once, at construction, to paint a static gate
 * number; it never reads or stores live operational state (spec §10).
 */
/** Object name of the status beacon mesh, looked up via the scene graph
 * rather than a class field — Building's constructor calls build() before
 * Gate's own field initializers run (`useDefineForClassFields`), so a field
 * assigned inside build() would be clobbered back to its initial value the
 * moment construction finished. */
const STATUS_BEACON_NAME = "gate-status-beacon";
const JET_BRIDGE_NAME = "gate-jet-bridge";

export class Gate extends Building {
  /** 0 = retracted, 1 = fully extended. Only ever mutated from
   * setBoardingActive()/tickAnimation() — both called after construction
   * finishes, so this never collides with the build()-clobber issue the
   * beacon comment above describes (spec keeps GameState as the only source
   * of truth; this is purely how far along the cosmetic animation is). */
  private bridgeExtension = 0;
  private bridgeTarget = 0;

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

    // Jet bridge stub, reaching toward +Z (toward the terminal) at rest;
    // Gate.tickAnimation() slides it toward BRIDGE_EXTENDED_Z while boarding
    // is active (V1.9 §9), read fresh from GateStatus each time it changes.
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 2.2),
      brickMaterial(COLORS.gateBridge, { roughness: 0.5 }),
    );
    bridge.name = JET_BRIDGE_NAME;
    bridge.position.set(0, 1.1, BRIDGE_HOME_Z);
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

    // Status beacon (V1.7 §8) — on top of the marker post, recolored each
    // frame from live GateData.status by Game.refreshGateVisuals(). Starts
    // at the AVAILABLE color; this class never reads GameState itself.
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      brickMaterial(STATUS_LIGHT_COLOR.AVAILABLE, { roughness: 0.3 }).clone(),
    );
    beacon.name = STATUS_BEACON_NAME;
    beacon.position.set(0.8, 1.75, 0.8);
    group.add(beacon);
  }

  /**
   * Read-only recolor of the status beacon; never touches GateData.
   * `inbound` (V1.9 §8) is the same "aircraft approaching, not parked yet"
   * condition Game.describeSelectable already computes for the Gate
   * selection panel — reusing it here, not a new GateStatus value.
   */
  setStatusLight(status: GateStatus, inbound = false): void {
    const beacon = this.object.getObjectByName(STATUS_BEACON_NAME) as
      | THREE.Mesh
      | undefined;
    const mat = beacon?.material as THREE.MeshStandardMaterial | undefined;
    if (!mat) return;
    const color =
      inbound && status === "AVAILABLE"
        ? INBOUND_LIGHT_COLOR
        : (STATUS_LIGHT_COLOR[status] ?? STATUS_LIGHT_COLOR.AVAILABLE);
    mat.color.setHex(color);
    mat.emissive.setHex(color);
    mat.emissiveIntensity = 0.9;
  }

  /** Aim the jet-bridge animation at extended/retracted (V1.9 §9); the
   * actual mesh movement happens gradually in tickAnimation(). */
  setBoardingActive(active: boolean): void {
    this.bridgeTarget = active ? 1 : 0;
  }

  /** Cosmetic-only per-frame step, called by AirportWorld.update() for every
   * Gate. No-ops the moment the bridge reaches its target (spec §27 — no
   * per-frame work once an animation settles). */
  tickAnimation(deltaTime: number): void {
    if (this.bridgeExtension === this.bridgeTarget) return;
    const dir = this.bridgeTarget > this.bridgeExtension ? 1 : -1;
    const step = BRIDGE_TRAVEL_PER_SECOND * deltaTime;
    this.bridgeExtension = clamp01(this.bridgeExtension + dir * step);
    if (Math.abs(this.bridgeExtension - this.bridgeTarget) < 0.01) {
      this.bridgeExtension = this.bridgeTarget;
    }
    const bridge = this.object.getObjectByName(JET_BRIDGE_NAME);
    if (bridge) {
      bridge.position.z =
        BRIDGE_HOME_Z + (BRIDGE_EXTENDED_Z - BRIDGE_HOME_Z) * this.bridgeExtension;
    }
  }

  getSelectionLabel(): string {
    return t("gate");
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
