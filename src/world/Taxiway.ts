import * as THREE from "three";
import { COLORS } from "./materials";

/**
 * Taxiway — fixed decorative strip connecting the runway threshold to the
 * gate apron (V1.7 §7). Purely visual ground dressing, like ServiceRoad: it
 * does not read GameState and is not selectable or placeable.
 *
 * Deliberately NOT a new path-data system (spec §7/§37) — it just paints the
 * ground under the corridor AircraftRoute's TAXI_OUT/TAXI_IN legs already fly
 * through (runway threshold ~x=-16..-18, out through x=-6,z=2, into the apron
 * around the gates at z~7). The strip is a little wider than that corridor so
 * it reads clearly without having to trace the exact diagonal waypoints.
 */
export class Taxiway {
  readonly object: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "taxiway";

    const surfaceMat = new THREE.MeshStandardMaterial({
      color: COLORS.taxiway,
      roughness: 0.92,
    });
    this.materials.push(surfaceMat);

    // Straight leg alongside the runway's south edge, from the threshold
    // toward the apron turn.
    const legGeo = new THREE.PlaneGeometry(14, 2.4);
    this.geometries.push(legGeo);
    const leg = new THREE.Mesh(legGeo, surfaceMat);
    leg.rotation.x = -Math.PI / 2;
    leg.position.set(-11, 0.011, 1.4);
    leg.receiveShadow = true;
    this.object.add(leg);

    // Turn onto the apron, toward the gates.
    const turnGeo = new THREE.PlaneGeometry(2.4, 6.5);
    this.geometries.push(turnGeo);
    const turn = new THREE.Mesh(turnGeo, surfaceMat);
    turn.rotation.x = -Math.PI / 2;
    turn.position.set(-5, 0.011, 4.5);
    turn.receiveShadow = true;
    this.object.add(turn);

    // Dashed yellow centerline (standard taxiway marking), matching the two
    // segments above.
    const markMat = new THREE.MeshStandardMaterial({
      color: COLORS.taxiwayMarking,
      roughness: 0.6,
    });
    this.materials.push(markMat);
    const dashGeo = new THREE.BoxGeometry(0.9, 0.02, 0.14);
    this.geometries.push(dashGeo);
    for (let x = -17; x <= -5; x += 1.6) {
      const dash = new THREE.Mesh(dashGeo, markMat);
      dash.position.set(x, 0.02, 1.4);
      this.object.add(dash);
    }
    const dashGeoV = new THREE.BoxGeometry(0.14, 0.02, 0.9);
    this.geometries.push(dashGeoV);
    for (let z = 1.6; z <= 7.4; z += 1.6) {
      const dash = new THREE.Mesh(dashGeoV, markMat);
      dash.position.set(-5, 0.02, z);
      this.object.add(dash);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
