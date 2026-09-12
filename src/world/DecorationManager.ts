import * as THREE from "three";

/**
 * DecorationManager — pure background diorama dressing (V2.0 Phase D).
 *
 * Exactly like AirportProps/ServiceRoad/Taxiway: not read from GameState,
 * not selectable, not placed through PlacementSystem, never touched by
 * gameplay logic. The one difference is scale — this adds *many* small
 * objects (a parking lot, tree lines, a long fence), so every repeated part
 * uses THREE.InstancedMesh (one draw call per part type, however many
 * instances) instead of one Mesh per object, per spec's explicit "반드시
 * InstancedMesh를 사용" performance requirement.
 *
 * Everything here is placed well outside the buildable grid and every other
 * fixed-position layer (runway/taxiway/apron/service road/gates/tower), so
 * it can never visually collide with a gameplay object: the parking lot
 * sits behind the terminal (z > 20, terminal's own footprint ends at
 * z = 18), and the tree lines run along the far outer edge of the ground
 * plane (|x| or |z| >= 34), inside the world's 46-unit ground margin.
 */

/** Small deterministic PRNG (mulberry32) so the scatter is reproducible
 * across reloads without needing to store anything in GameState/SaveData. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAR_COLORS = [0xe63946, 0x4361ee, 0xffb703, 0x2a9d8f, 0xf1f5f9, 0x22333b, 0x8d5bce];

export class DecorationManager {
  readonly object: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly instancedMeshes: THREE.InstancedMesh[] = [];

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "decorations";

    this.buildParkingLot();
    this.buildParkingLines();
    this.buildTreeLines();
    this.buildPerimeterFence();
    this.buildRunwayFence();
    this.buildWindsock();
    this.buildLightTower();
    this.buildConeCluster();
  }

  // ------------------------------------------------------------- parking lot --

  private buildParkingLot(): void {
    // One shared box geometry per car "part" (body + cabin), colored per
    // instance via InstancedMesh.setColorAt — a single draw call each for
    // however many cars are placed.
    const bodyGeo = new THREE.BoxGeometry(0.9, 0.4, 1.7);
    const cabinGeo = new THREE.BoxGeometry(0.7, 0.32, 0.9);
    this.geometries.push(bodyGeo, cabinGeo);

    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x9fd3e8,
      roughness: 0.25,
      metalness: 0.1,
    });
    this.materials.push(bodyMat, cabinMat);

    // A simple parking grid: 2 rows x 10 spaces, behind the terminal.
    const cols = 10;
    const rows = 2;
    const spacingX = 2.0;
    const spacingZ = 2.3;
    const startX = -((cols - 1) * spacingX) / 2;
    const startZ = 22;
    const count = cols * rows;

    const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, count);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.instancedMeshes.push(bodyMesh, cabinMesh);

    const rand = mulberry32(20260101);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacingX;
        const z = startZ + r * spacingZ;
        const facing = r === 0 ? 0 : Math.PI;

        m.makeRotationY(facing);
        m.setPosition(x, 0.32, z);
        bodyMesh.setMatrixAt(i, m);
        color.setHex(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
        bodyMesh.setColorAt(i, color);

        m.makeRotationY(facing);
        m.setPosition(x, 0.58, z - (r === 0 ? 0.25 : -0.25));
        cabinMesh.setMatrixAt(i, m);

        i++;
      }
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    cabinMesh.instanceMatrix.needsUpdate = true;

    this.object.add(bodyMesh, cabinMesh);

    // A pale ground slab under the lot so cars don't float on green grass.
    const lotGeo = new THREE.PlaneGeometry(cols * spacingX + 2, rows * spacingZ + 2);
    this.geometries.push(lotGeo);
    const lotMat = new THREE.MeshStandardMaterial({ color: 0xb9bec3, roughness: 0.95 });
    this.materials.push(lotMat);
    const lot = new THREE.Mesh(lotGeo, lotMat);
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(0, 0.01, startZ + (spacingZ * (rows - 1)) / 2);
    lot.receiveShadow = true;
    this.object.add(lot);
  }

  /**
   * White parking-space divider lines under the car grid (V3.0 PHASE 2 §4.1
   * — "흰색 주차선"), one InstancedMesh for every line regardless of how many
   * spaces the lot has.
   */
  private buildParkingLines(): void {
    const cols = 10;
    const rows = 2;
    const spacingX = 2.0;
    const spacingZ = 2.3;
    const startX = -((cols - 1) * spacingX) / 2;
    const startZ = 22;

    const lineGeo = new THREE.BoxGeometry(0.05, 0.01, spacingZ * rows + 0.4);
    this.geometries.push(lineGeo);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.5 });
    this.materials.push(lineMat);

    // One divider line between every pair of adjacent spaces, plus the two
    // outer boundary lines — cols + 1 lines total.
    const count = cols + 1;
    const lines = new THREE.InstancedMesh(lineGeo, lineMat, count);
    this.instancedMeshes.push(lines);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const x = startX - spacingX / 2 + i * spacingX;
      m.makeTranslation(x, 0.018, startZ + (spacingZ * (rows - 1)) / 2);
      lines.setMatrixAt(i, m);
    }
    lines.instanceMatrix.needsUpdate = true;
    this.object.add(lines);
  }

  // -------------------------------------------------------------- tree lines --

  private buildTreeLines(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.9, 6);
    const pineCanopyGeo = new THREE.ConeGeometry(0.55, 1.5, 8);
    const roundCanopyGeo = new THREE.SphereGeometry(0.6, 8, 6);
    this.geometries.push(trunkGeo, pineCanopyGeo, roundCanopyGeo);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4d, roughness: 0.85 });
    const roundMat = new THREE.MeshStandardMaterial({ color: 0x5aa469, roughness: 0.85 });
    this.materials.push(trunkMat, pineMat, roundMat);

    // Scatter points along the far outer edge of the ground plane, well
    // beyond the buildable grid and every fixed lane/apron/runway.
    const rand = mulberry32(20260202);
    const points: { x: number; z: number; pine: boolean }[] = [];
    for (let x = -38; x <= 38; x += 4) {
      points.push({ x: x + (rand() - 0.5) * 1.5, z: 38 + (rand() - 0.5) * 3, pine: rand() > 0.5 });
    }
    for (let z = -38; z <= 30; z += 4) {
      points.push({ x: -38 + (rand() - 0.5) * 3, z: z + (rand() - 0.5) * 1.5, pine: rand() > 0.5 });
    }

    const count = points.length;
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const pineMesh = new THREE.InstancedMesh(pineCanopyGeo, pineMat, count);
    const roundMesh = new THREE.InstancedMesh(roundCanopyGeo, roundMat, count);
    trunkMesh.castShadow = true;
    pineMesh.castShadow = true;
    roundMesh.castShadow = true;
    this.instancedMeshes.push(trunkMesh, pineMesh, roundMesh);

    const m = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    let pineCount = 0;
    let roundCount = 0;
    points.forEach((p, i) => {
      const scale = 0.85 + rand() * 0.4;
      m.compose(
        new THREE.Vector3(p.x, 0.45 * scale, p.z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale),
      );
      trunkMesh.setMatrixAt(i, m);

      if (p.pine) {
        m.compose(
          new THREE.Vector3(p.x, (0.9 + 0.75) * scale, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(scale, scale, scale),
        );
        pineMesh.setMatrixAt(i, m);
        roundMesh.setMatrixAt(i, hidden);
        pineCount++;
      } else {
        m.compose(
          new THREE.Vector3(p.x, (0.9 + 0.5) * scale, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(scale, scale, scale),
        );
        roundMesh.setMatrixAt(i, m);
        pineMesh.setMatrixAt(i, hidden);
        roundCount++;
      }
    });
    void pineCount;
    void roundCount;

    trunkMesh.instanceMatrix.needsUpdate = true;
    pineMesh.instanceMatrix.needsUpdate = true;
    roundMesh.instanceMatrix.needsUpdate = true;

    this.object.add(trunkMesh, pineMesh, roundMesh);
  }

  // ---------------------------------------------------------- perimeter fence --

  private buildPerimeterFence(): void {
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6);
    const railGeo = new THREE.BoxGeometry(1.4, 0.05, 0.05);
    this.geometries.push(postGeo, railGeo);

    const fenceMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.6 });
    this.materials.push(fenceMat);

    // A line of posts + two rail heights along the parking lot's back edge.
    const segCount = 14;
    const spacing = 1.5;
    const startX = -((segCount - 1) * spacing) / 2;
    const z = 30;

    const postMesh = new THREE.InstancedMesh(postGeo, fenceMat, segCount);
    const railLowMesh = new THREE.InstancedMesh(railGeo, fenceMat, segCount - 1);
    const railHighMesh = new THREE.InstancedMesh(railGeo, fenceMat, segCount - 1);
    this.instancedMeshes.push(postMesh, railLowMesh, railHighMesh);

    const m = new THREE.Matrix4();
    for (let i = 0; i < segCount; i++) {
      m.makeTranslation(startX + i * spacing, 0.45, z);
      postMesh.setMatrixAt(i, m);
      if (i < segCount - 1) {
        m.makeTranslation(startX + i * spacing + spacing / 2, 0.65, z);
        railHighMesh.setMatrixAt(i, m);
        m.makeTranslation(startX + i * spacing + spacing / 2, 0.3, z);
        railLowMesh.setMatrixAt(i, m);
      }
    }
    postMesh.instanceMatrix.needsUpdate = true;
    railHighMesh.instanceMatrix.needsUpdate = true;
    railLowMesh.instanceMatrix.needsUpdate = true;

    this.object.add(postMesh, railHighMesh, railLowMesh);
  }

  /**
   * A separate white block fence line along the runway's outer boundary
   * (V3.0 PHASE 2 §4.2 — "활주로 경계선을 따라 이어지는 흰색 블록 펜스"),
   * distinct from the parking-lot fence above. The runway spans roughly
   * x:[-18,18] z:[-4,4] (the same footprint the windsock placement below
   * already reasons from); this line runs along z = -6, the far outer edge
   * away from the terminal/taxiway/apron cluster, so it never crosses any
   * gameplay lane.
   */
  private buildRunwayFence(): void {
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6);
    const railGeo = new THREE.BoxGeometry(1.6, 0.045, 0.045);
    this.geometries.push(postGeo, railGeo);

    const fenceMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.6 });
    this.materials.push(fenceMat);

    const segCount = 18;
    const spacing = 1.9;
    const startX = -((segCount - 1) * spacing) / 2;
    const z = -6;

    const postMesh = new THREE.InstancedMesh(postGeo, fenceMat, segCount);
    const railMesh = new THREE.InstancedMesh(railGeo, fenceMat, segCount - 1);
    this.instancedMeshes.push(postMesh, railMesh);

    const m = new THREE.Matrix4();
    for (let i = 0; i < segCount; i++) {
      m.makeTranslation(startX + i * spacing, 0.4, z);
      postMesh.setMatrixAt(i, m);
      if (i < segCount - 1) {
        m.makeTranslation(startX + i * spacing + spacing / 2, 0.55, z);
        railMesh.setMatrixAt(i, m);
      }
    }
    postMesh.instanceMatrix.needsUpdate = true;
    railMesh.instanceMatrix.needsUpdate = true;

    this.object.add(postMesh, railMesh);
  }

  // -------------------------------------------------------------- windsock --

  private buildWindsock(): void {
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8);
    const sockGeo = new THREE.ConeGeometry(0.16, 0.7, 10, 1, true);
    this.geometries.push(poleGeo, sockGeo);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.6 });
    const sockMat = new THREE.MeshStandardMaterial({
      color: 0xf7f7f7,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    this.materials.push(poleMat, sockMat);

    const group = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.3;
    pole.castShadow = true;
    group.add(pole);

    // Two alternating bands (white/orange) — the classic windsock stripe.
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xf25c1f,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    this.materials.push(stripeMat);
    const sock = new THREE.Mesh(sockGeo, sockMat);
    sock.rotation.z = Math.PI / 2;
    sock.position.set(0.35, 2.5, 0);
    group.add(sock);
    const stripeGeo = new THREE.ConeGeometry(0.1, 0.35, 10, 1, true);
    this.geometries.push(stripeGeo);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.z = Math.PI / 2;
    stripe.position.set(0.62, 2.5, 0);
    group.add(stripe);

    // Placed just past the runway's east threshold, clear of the taxiway
    // corridor and every gameplay lane (runway spans x:[-18,18], z:[-4,4]).
    group.position.set(21, 0, -2);
    this.object.add(group);
  }

  /**
   * A runway floodlight tower beside the windsock (V3.0 PHASE 2 §4.3's
   * "조명 타워") — a tall mast with a small cluster of angled floodlight
   * heads. Only one exists, but the floodlight heads within it are a
   * repeated small part, so they're still one InstancedMesh rather than one
   * Mesh per head.
   */
  private buildLightTower(): void {
    const mastGeo = new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8);
    this.geometries.push(mastGeo);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xbfc7cc, roughness: 0.55, metalness: 0.2 });
    this.materials.push(mastMat);

    const group = new THREE.Group();
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = 2.1;
    mast.castShadow = true;
    group.add(mast);

    const rigGeo = new THREE.BoxGeometry(0.9, 0.06, 0.06);
    this.geometries.push(rigGeo);
    const rig = new THREE.Mesh(rigGeo, mastMat);
    rig.position.y = 4.15;
    group.add(rig);

    const headGeo = new THREE.BoxGeometry(0.22, 0.16, 0.12);
    this.geometries.push(headGeo);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff2b2,
      roughness: 0.3,
      emissive: 0xfff2b2,
      emissiveIntensity: 0.4,
    });
    this.materials.push(headMat);
    const headCount = 4;
    const heads = new THREE.InstancedMesh(headGeo, headMat, headCount);
    this.instancedMeshes.push(heads);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < headCount; i++) {
      const x = -0.33 + i * 0.22;
      q.setFromEuler(new THREE.Euler(-0.5, 0, 0));
      m.compose(new THREE.Vector3(x, 4.05, 0.08), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m);
    }
    heads.instanceMatrix.needsUpdate = true;
    group.add(heads);

    // Beside the windsock, clear of every gameplay lane (same reasoning as
    // the windsock's own placement comment above).
    group.position.set(23, 0, -2);
    this.object.add(group);
  }

  // ---------------------------------------------------------------- cones --

  private buildConeCluster(): void {
    const coneGeo = new THREE.CylinderGeometry(0.03, 0.14, 0.4, 8);
    this.geometries.push(coneGeo);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xf77f00, roughness: 0.6 });
    this.materials.push(coneMat);

    const positions: [number, number][] = [
      [-12, 21], [-11.3, 21.4], [-10.6, 21],
      [12, 21], [11.3, 21.4], [10.6, 21],
    ];
    const mesh = new THREE.InstancedMesh(coneGeo, coneMat, positions.length);
    this.instancedMeshes.push(mesh);
    const m = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.2, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.object.add(mesh);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const im of this.instancedMeshes) im.dispose();
  }
}
