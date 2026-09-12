import * as THREE from "three";
import { COLORS } from "./materials";

/**
 * Apron — the paved ramp connecting the terminal frontage, the gate stands,
 * and the taxiway (V2.0 STEP 1 REWORK §20/§29, high-density remaster in V3.0
 * PHASE 1 §2). Purely visual ground dressing, exactly like ServiceRoad/
 * Taxiway: not read from GameState, not selectable, not placeable — it
 * paints the ground under the FIXED starting gate row (x ~ -5..7, z ~ 8..10)
 * and the terminal frontage (z ~ 12..18) so the whole cluster reads as one
 * paved airport complex instead of buildings standing on bare grass.
 *
 * V3.0 rebuild: every repeated marking element (dashes, stop-marker bars,
 * hazard-stripe segments, crosswalk bars) is drawn as ONE InstancedMesh per
 * (shape, colour) combination instead of one Mesh per element — the absolute
 * rule against drawcall explosion from repeated small props. Positions are
 * plain world-space box placements (not a baked canvas texture) so every
 * marking's exact location is a readable, verifiable number here rather than
 * pixel math that would need to be reverse-engineered against the plane's
 * UV/rotation to get right.
 */
export class Apron {
  readonly object: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly dummy = new THREE.Object3D();

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "apron";

    this.buildSurface();
    this.buildTaxiGuideLines();
    this.buildStopMarkers();
    this.buildSafetyZones();
    this.buildVehicleLanesAndCrosswalk();
    this.buildEquipmentPads();
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }

  // --------------------------------------------------------------- internals

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  /** Main paved ramp slab spanning the gate row up to the terminal frontage,
   * back down to the taxiway apron turn. */
  private buildSurface(): void {
    const surfaceMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: COLORS.apron, roughness: 0.28, metalness: 0.06 }),
    );
    const slabGeo = this.trackGeo(new THREE.PlaneGeometry(24, 15));
    const slab = new THREE.Mesh(slabGeo, surfaceMat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(1, 0.008, 10.5);
    slab.receiveShadow = true;
    this.object.add(slab);
  }

  /**
   * §2.1 — a yellow dashed taxi-guide-line NETWORK: the existing ramp
   * centerline plus one dashed lead-in line per gate stand (x = -5, 1, 7)
   * connecting the taxiway edge (z ≈ 6) up to each stand (z ≈ 10), so the
   * three stands read as fed by a real guide-line grid rather than one
   * central stripe.
   */
  private buildTaxiGuideLines(): void {
    const dashMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: COLORS.apronMarkingYellow, roughness: 0.35 }),
    );
    const dashGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.016, 0.9));

    const positions: THREE.Vector3[] = [];
    // Central ramp lead-in (unchanged span from the previous version).
    for (let z = 6; z <= 16; z += 1.6) positions.push(new THREE.Vector3(1, 0.016, z));
    // One dashed guide line per gate stand, taxiway edge (z=6.4) to the
    // stand itself (z=9.6) — the "network" the reference image shows
    // branching off the main lead-in toward each parking position.
    for (const gx of [-5, 1, 7]) {
      for (let z = 6.4; z <= 9.6; z += 1.4) {
        positions.push(new THREE.Vector3(gx, 0.016, z));
      }
    }

    const mesh = new THREE.InstancedMesh(dashGeo, dashMat, positions.length);
    mesh.receiveShadow = true;
    positions.forEach((p, i) => {
      this.dummy.position.copy(p);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.object.add(mesh);
  }

  /**
   * §2.2 — a T-shaped aircraft stop marker at each gate stand: a stem
   * pointing back down the lead-in line plus a crossbar where the aircraft's
   * nose should stop, in the bright white apron-marking colour.
   */
  private buildStopMarkers(): void {
    const markMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: COLORS.apronMarking, roughness: 0.3 }),
    );
    const stemGeo = this.trackGeo(new THREE.BoxGeometry(0.1, 0.018, 1.6));
    const barGeo = this.trackGeo(new THREE.BoxGeometry(1.1, 0.018, 0.1));

    const stems = new THREE.InstancedMesh(stemGeo, markMat, 3);
    const bars = new THREE.InstancedMesh(barGeo, markMat, 3);
    stems.receiveShadow = true;
    bars.receiveShadow = true;

    const gateXs = [-5, 1, 7];
    gateXs.forEach((gx, i) => {
      this.dummy.position.set(gx, 0.018, 8.3);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      stems.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(gx, 0.018, 7.5);
      this.dummy.updateMatrix();
      bars.setMatrixAt(i, this.dummy.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    this.object.add(stems);
    this.object.add(bars);
  }

  /**
   * §2.3 — red/white hazard-stripe safety-zone boxes ringing each ground-
   * equipment pad, plus a small waiting-line box beside them.
   */
  private buildSafetyZones(): void {
    const redMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xc23b3b, roughness: 0.35 }),
    );
    const whiteMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: COLORS.apronMarking, roughness: 0.3 }),
    );
    // One thin segment per side of a small square border; 4 sides x 2
    // equipment pads = 8 segments, alternating colour per side.
    const segGeo = this.trackGeo(new THREE.BoxGeometry(0.62, 0.02, 0.09));

    const padCenters = [
      new THREE.Vector3(-5 + 1.4, 0.02, 10.5),
      new THREE.Vector3(7 + 1.4, 0.02, 10.5),
    ];
    const sideOffsets: { pos: THREE.Vector3; rotY: number; red: boolean }[] = [
      { pos: new THREE.Vector3(0, 0, 0.35), rotY: 0, red: true },
      { pos: new THREE.Vector3(0, 0, -0.35), rotY: 0, red: false },
      { pos: new THREE.Vector3(0.35, 0, 0), rotY: Math.PI / 2, red: false },
      { pos: new THREE.Vector3(-0.35, 0, 0), rotY: Math.PI / 2, red: true },
    ];

    const redInstances: THREE.Matrix4[] = [];
    const whiteInstances: THREE.Matrix4[] = [];
    for (const center of padCenters) {
      for (const side of sideOffsets) {
        this.dummy.position.set(
          center.x + side.pos.x,
          center.y,
          center.z + side.pos.z,
        );
        this.dummy.rotation.set(0, side.rotY, 0);
        this.dummy.updateMatrix();
        (side.red ? redInstances : whiteInstances).push(this.dummy.matrix.clone());
      }
    }

    const redMesh = new THREE.InstancedMesh(segGeo, redMat, redInstances.length);
    redInstances.forEach((m, i) => redMesh.setMatrixAt(i, m));
    redMesh.instanceMatrix.needsUpdate = true;
    redMesh.receiveShadow = true;
    this.object.add(redMesh);

    const whiteMesh = new THREE.InstancedMesh(segGeo, whiteMat, whiteInstances.length);
    whiteInstances.forEach((m, i) => whiteMesh.setMatrixAt(i, m));
    whiteMesh.instanceMatrix.needsUpdate = true;
    whiteMesh.receiveShadow = true;
    this.object.add(whiteMesh);
  }

  /**
   * §2.4 — a white double lane line along the service-road side of the ramp
   * plus a zebra-striped crosswalk where the staff walkway (STAFF_LANE_Z =
   * 9.4, staff/staffWaypoints.ts) crosses the apron.
   */
  private buildVehicleLanesAndCrosswalk(): void {
    const laneMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: COLORS.apronMarking, roughness: 0.3 }),
    );
    const laneGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 0.016, 9));
    for (const x of [-10.4, -10.1]) {
      const lane = new THREE.Mesh(laneGeo, laneMat);
      lane.position.set(x, 0.016, 11);
      lane.receiveShadow = true;
      this.object.add(lane);
    }

    // Crosswalk — a row of zebra bars crossing the staff lane at x ~ -1..3,
    // z = STAFF_LANE_Z, between the terminal doors and the gate row.
    const barGeo = this.trackGeo(new THREE.BoxGeometry(0.35, 0.018, 1.1));
    const count = 6;
    const start = -1.6;
    const spacing = 0.7;
    const crosswalk = new THREE.InstancedMesh(barGeo, laneMat, count);
    crosswalk.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      this.dummy.position.set(start + i * spacing, 0.018, 9.4);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      crosswalk.setMatrixAt(i, this.dummy.matrix);
    }
    crosswalk.instanceMatrix.needsUpdate = true;
    this.object.add(crosswalk);
  }

  /** Ground-power / equipment pads beside the outer two stands (unchanged
   * from the previous version — only 2 of them, not worth instancing). */
  private buildEquipmentPads(): void {
    const equipMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: COLORS.terminalDark, roughness: 0.3, metalness: 0.15 }),
    );
    const equipGeo = this.trackGeo(new THREE.BoxGeometry(0.5, 0.35, 0.5));
    for (const gx of [-5, 7]) {
      const equip = new THREE.Mesh(equipGeo, equipMat);
      equip.position.set(gx + 1.4, 0.18, 10.5);
      equip.castShadow = true;
      this.object.add(equip);
    }
  }
}
