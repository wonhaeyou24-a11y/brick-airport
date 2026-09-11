import * as THREE from "three";
import { COLORS } from "./materials";

/**
 * Apron — the paved ramp connecting the terminal frontage, the gate stands,
 * and the taxiway (V2.0 STEP 1 REWORK §20/§29). Purely visual ground
 * dressing, exactly like ServiceRoad/Taxiway: not read from GameState, not
 * selectable, not placeable — it just paints the ground under the fixed gate
 * row (x ~ -5..7, z ~ 8..10) and the terminal frontage (z ~ 12..18) so the
 * whole cluster reads as one paved airport complex instead of buildings
 * standing on bare grass, closing the biggest single gap the STEP 1 rework
 * spec calls out ("Terminal과 Runway가 서로 따로 떨어진 테스트 오브젝트처럼
 * 보이지 않아야 한다").
 */
export class Apron {
  readonly object: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "apron";

    const surfaceMat = new THREE.MeshStandardMaterial({
      color: COLORS.apron,
      roughness: 0.95,
    });
    this.materials.push(surfaceMat);

    // Main ramp slab — spans the gate row and reaches up to the terminal
    // frontage, and back down to meet the taxiway's apron turn (~z 4-7).
    const slabGeo = new THREE.PlaneGeometry(24, 15);
    this.geometries.push(slabGeo);
    const slab = new THREE.Mesh(slabGeo, surfaceMat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(1, 0.008, 10.5);
    slab.receiveShadow = true;
    this.object.add(slab);

    // Yellow lead-in centerline down the middle of the ramp, echoing the
    // taxiway's dashed marking style so the two surfaces read as one system.
    const dashMat = new THREE.MeshStandardMaterial({
      color: COLORS.apronMarkingYellow,
      roughness: 0.6,
    });
    this.materials.push(dashMat);
    const dashGeo = new THREE.BoxGeometry(0.14, 0.016, 0.9);
    this.geometries.push(dashGeo);
    for (let z = 6; z <= 16; z += 1.6) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(1, 0.016, z);
      this.object.add(dash);
    }

    // Ground-power / equipment pads beside the outer two stands — small
    // painted squares reading as service equipment zones (spec §20).
    const equipMat = new THREE.MeshStandardMaterial({
      color: COLORS.terminalDark,
      roughness: 0.7,
    });
    this.materials.push(equipMat);
    const equipGeo = new THREE.BoxGeometry(0.5, 0.35, 0.5);
    this.geometries.push(equipGeo);
    for (const gx of [-5, 7]) {
      const equip = new THREE.Mesh(equipGeo, equipMat);
      equip.position.set(gx + 1.4, 0.18, 10.5);
      equip.castShadow = true;
      this.object.add(equip);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
