import * as THREE from "three";
import { Building } from "./Building";
import { CELL_SIZE } from "../world/Grid";
import { brickMaterial, glassMaterial, COLORS } from "../world/materials";
import {
  createStudGrid,
  createWindowRow,
  createSignPost,
  createSignboard,
  createHvacUnit,
  createVentCluster,
  createRadarAntenna,
  RADAR_HEAD_NAME,
} from "../assets/AssetFactory";

/** Object name of the radar group, looked up via the scene graph rather than
 * a class field for the same reason Gate.ts documents on its own beacon: a
 * subclass field initializer runs AFTER Building's constructor already
 * called build(), so a field written inside build() would be clobbered back
 * to its declared initial value the moment construction finishes. */
const RADAR_NAME = "terminal-radar";
/** Full rotation period, seconds — a slow, readable sweep, not a blur. */
const RADAR_PERIOD = 6;

/**
 * Terminal — brick-toy airport terminal (V3.0 PHASE 1 modular reconstruction
 * of the V1.3-B upgrade): a layered two-story frame with a real transmissive
 * glass curtain wall, an InstancedMesh roof-stud grid, rooftop HVAC/vent/
 * radar equipment, gate-number signage, and terminal-side jet-bridge
 * connector stubs.
 *
 * LOGIC FOOTPRINT ≠ VISUAL DETAIL (spec §9, carried over unchanged): every
 * dimension below is still derived from `this.data.size` (the real,
 * unchanged BuildingData footprint) — only the amount of geometry inside
 * that footprint grew, never the footprint, the Building group's pivot, or
 * the Selectable tagging (both handled by the Building base class this
 * subclass never touches).
 */
export class Terminal extends Building {
  protected build(group: THREE.Group): void {
    const w = this.data.size.cols * CELL_SIZE; // along X
    const d = this.data.size.rows * CELL_SIZE; // along Z
    const h = 4;

    this.buildFrameAndGlass(group, w, d, h);
    this.buildSideWings(group, w, d, h);
    this.buildCrown(group, w, d, h);
    this.buildRoofAndStuds(group, w, d, h);
    this.buildRoofEquipment(group, w, d, h);
    this.buildEntrance(group, w, d);
    this.buildGateSignsAndBridgeStubs(group, w, d, h);
    this.buildSignageAndBeacon(group, w, d, h);
  }

  /**
   * Per-frame cosmetic tick (V3.0 PHASE 1 §1.3) — spins the rooftop radar
   * head. Called by AirportWorld.update() for every Terminal, mirroring the
   * existing Gate.tickAnimation() wiring; no GameState read or write.
   */
  tickAnimation(deltaTime: number): void {
    const radar = this.object.getObjectByName(RADAR_NAME);
    const head = radar?.getObjectByName(RADAR_HEAD_NAME);
    if (!head) return;
    head.rotation.y += (Math.PI * 2 * deltaTime) / RADAR_PERIOD;
  }

  // --------------------------------------------------------------- internals

  /**
   * §1.1 — the 1-2 story white/grey block frame plus the full-height,
   * full-width transmissive glass curtain wall facing -Z (the apron side).
   */
  private buildFrameAndGlass(group: THREE.Group, w: number, d: number, h: number): void {
    // Ground floor
    const groundFloor = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.56, d),
      brickMaterial(COLORS.terminalBody, { roughness: 0.3 }),
    );
    groundFloor.position.y = (h * 0.56) / 2;
    groundFloor.castShadow = true;
    groundFloor.receiveShadow = true;
    group.add(groundFloor);

    // Upper floor — a slightly lighter grey block frame set on top, reading
    // as a genuine second story rather than a taller repeat of the ground
    // floor (spec §1.1's "1~2층 복층 구조").
    const upperFloor = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.97, h * 0.44, d * 0.94),
      brickMaterial(0xdfe3e6, { roughness: 0.3 }),
    );
    upperFloor.position.y = h * 0.56 + (h * 0.44) / 2;
    upperFloor.castShadow = true;
    upperFloor.receiveShadow = true;
    group.add(upperFloor);

    // Real transmissive glass curtain wall (spec §1.1: MeshPhysicalMaterial,
    // transmission 0.6, roughness 0.1, deep cyan-blue) spanning nearly the
    // full height and width of the two-story frame.
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, h * 0.86, 0.2),
      glassMaterial(COLORS.terminalGlassDeep, {
        transmission: 0.6,
        roughness: 0.1,
        metalness: 0.0,
      }),
    );
    glass.position.set(0, h * 0.46, -d / 2 - 0.02);
    group.add(glass);

    // Ground-floor and upper-floor mullion window rows, divided by a dark
    // spandrel band, so the facade still reads as individually-glazed floors
    // in front of the deep glass box rather than one flat slab.
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
      brickMaterial(COLORS.terminalDark, { roughness: 0.35, metalness: 0.2 }),
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
  }

  /** Low side wings at both ends — layered building mass either side of the
   * central glass block, unchanged in spirit from the V2.0 rework. */
  private buildSideWings(group: THREE.Group, w: number, d: number, h: number): void {
    const wingH = h * 0.55;
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.16, wingH, d * 0.92),
        brickMaterial(COLORS.terminalBody, { roughness: 0.3 }),
      );
      wing.position.set(sx * (w / 2 - w * 0.08), wingH / 2, 0);
      wing.castShadow = true;
      wing.receiveShadow = true;
      group.add(wing);

      const wingRoof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.18, 0.3, d * 0.98),
        brickMaterial(COLORS.facilityRoof, { roughness: 0.3 }),
      );
      wingRoof.position.set(sx * (w / 2 - w * 0.08), wingH + 0.15, 0);
      group.add(wingRoof);
    }
  }

  /** Raised central roof block carrying the terminal name — the reference
   * image's blue upper-deck massing above the main entrance. */
  private buildCrown(group: THREE.Group, w: number, d: number, h: number): void {
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.34, h * 0.5, d * 0.6),
      glassMaterial(COLORS.terminalGlass, { transmission: 0.35, roughness: 0.2 }),
    );
    crown.position.set(0, h + 0.2 + (h * 0.5) / 2, 0);
    crown.castShadow = true;
    group.add(crown);

    const crownRoof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.38, 0.3, d * 0.66),
      brickMaterial(COLORS.terminalRoof, { roughness: 0.3 }),
    );
    crownRoof.position.set(0, h + 0.2 + h * 0.5 + 0.15, 0);
    group.add(crownRoof);
  }

  /** §1.2 — flat roof cap plus an InstancedMesh grid of roofline block
   * studs (the toy-brick signature detail, now drawcall-cheap at any
   * density per the absolute InstancedMesh rule). */
  private buildRoofAndStuds(group: THREE.Group, w: number, d: number, h: number): void {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
      brickMaterial(COLORS.terminalRoof, { roughness: 0.3 }),
    );
    roof.position.y = h + 0.2;
    roof.castShadow = true;
    group.add(roof);

    // Grid spacing tuned so a stud sits roughly every 0.6 world units in
    // both directions — dense enough to read as a genuine brick-plate top
    // even up close, cheap because it is exactly one InstancedMesh draw call
    // regardless of how many hundred studs that density produces.
    const studSpacing = 0.6;
    const studCols = Math.max(4, Math.round((w * 0.9) / studSpacing));
    const studRows = Math.max(2, Math.round((d * 0.9) / studSpacing));
    const studs = createStudGrid(
      studCols,
      studRows,
      (w * 0.9) / studCols,
      (d * 0.9) / studRows,
      COLORS.terminalAccent,
    );
    studs.position.set(0, h + 0.46, 0);
    group.add(studs);
  }

  /** §1.3 — HVAC condenser, vent-duct cluster, rotating radar antenna. */
  private buildRoofEquipment(group: THREE.Group, w: number, d: number, h: number): void {
    const hvac = createHvacUnit(0.9, 0.5, 0.7);
    hvac.position.set(w * 0.24, h + 0.47, d * 0.16);
    group.add(hvac);

    const hvac2 = createHvacUnit(0.6, 0.35, 0.5);
    hvac2.position.set(w * 0.24, h + 0.47, -d * 0.16);
    group.add(hvac2);

    const vents = createVentCluster(4, 0.32, 0xbfc7cc, 0.11, 0.26);
    vents.position.set(-w * 0.22, h + 0.6, d * 0.1);
    group.add(vents);

    const radar = createRadarAntenna();
    radar.name = RADAR_NAME;
    radar.position.set(-w * 0.34, h + 0.46, -d * 0.22);
    group.add(radar);
  }

  /** Entrance canopy, support columns, doors, matching the V1.3-B massing. */
  private buildEntrance(group: THREE.Group, w: number, d: number): void {
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.3, 1.2, 1.4),
      brickMaterial(COLORS.terminalAccent, { roughness: 0.3 }),
    );
    entrance.position.set(0, 0.6, -d / 2 - 0.7);
    group.add(entrance);

    const columnMat = brickMaterial(COLORS.terminalDark, { roughness: 0.3, metalness: 0.25 });
    for (const cx of [-1, 1]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), columnMat);
      column.position.set(cx * w * 0.13, 0.6, -d / 2 - 1.3);
      group.add(column);
    }

    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.09, 1.05, 0.06),
        brickMaterial(COLORS.terminalDark, { roughness: 0.25, metalness: 0.2 }),
      );
      door.position.set(sx * w * 0.06, 0.55, -d / 2 - 0.03);
      group.add(door);
    }
  }

  /**
   * §1.4 — three yellow "A1/A2/A3" gate-number signboards along the facade
   * plus a matching two-segment articulated jet-bridge connector stub under
   * each one.
   *
   * These are the TERMINAL's own building-side fixtures — cosmetic only,
   * fixed relative to this building's footprint. The functional, animated
   * jet bridge that actually reaches a parked aircraft already exists on
   * each Gate object (Gate.ts's JET_BRIDGE_NAME group, driven by live
   * GateData): a real Gate can be placed anywhere the player likes, so the
   * Terminal — which knows nothing about GameState beyond its own
   * BuildingData — cannot aim a bridge at one. Rule 3 (pivots/selection
   * IDs/gate coordinates must stay untouched) means this stays purely
   * decorative rather than reaching into Gate/GameState.
   */
  private buildGateSignsAndBridgeStubs(group: THREE.Group, w: number, d: number, h: number): void {
    const labels = ["A1", "A2", "A3"] as const;
    const count = labels.length;
    const spacing = (w * 0.7) / count;
    const start = -((count - 1) * spacing) / 2;

    for (let i = 0; i < count; i++) {
      const x = start + i * spacing;

      const sign = createSignboard(labels[i], 0.85, 0.42, "#ffc93c", "#1c2b38");
      sign.position.set(x, h * 0.86, -d / 2 - 0.14);
      group.add(sign);

      // Two-segment articulated bridge stub: a wider connector cuff at the
      // facade, then a narrower, slightly downward-angled corridor segment
      // reaching out toward the apron (spec §1.4's "2단 관절형").
      const stub = new THREE.Group();
      stub.position.set(x, h * 0.32, -d / 2);
      group.add(stub);

      const cuffMat = brickMaterial(COLORS.terminalDark, { roughness: 0.35, metalness: 0.2 });
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 10), cuffMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = -0.3;
      cuff.castShadow = true;
      stub.add(cuff);

      const segmentMat = brickMaterial(COLORS.gateBridge, { roughness: 0.3, metalness: 0.05 });
      const segment = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.1), segmentMat);
      segment.position.set(0, -0.12, -1.0);
      segment.rotation.x = -0.06;
      segment.castShadow = true;
      stub.add(segment);

      const segmentWindow = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.3, 1.0),
        brickMaterial(COLORS.terminalGlass, { roughness: 0.2, metalness: 0.1 }),
      );
      segmentWindow.position.set(0, 0.02, -1.0);
      segmentWindow.rotation.x = -0.06;
      stub.add(segmentWindow);
    }
  }

  /** "AIRPORT" facade signboard, sign post, and rooftop beacon. */
  private buildSignageAndBeacon(group: THREE.Group, w: number, d: number, h: number): void {
    const signboard = createSignboard("AIRPORT", Math.min(w * 0.45, 4.5), 0.6);
    signboard.position.set(0, h * 0.82, -d / 2 - 0.14);
    group.add(signboard);

    const sign = createSignPost(1.6, COLORS.terminalAccent);
    sign.position.set(-w / 2 - 0.5, 0, -d / 2 - 0.3);
    group.add(sign);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8),
      brickMaterial(COLORS.terminalAccent),
    );
    beacon.position.set(w / 2 - 0.8, h + 0.9, -d / 2 + 0.8);
    group.add(beacon);
  }
}
