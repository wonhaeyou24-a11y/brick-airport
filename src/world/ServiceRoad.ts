import * as THREE from "three";
import { COLORS } from "./materials";
import { SERVICE_LANE_Z } from "../vehicles/vehicleWaypoints";

/**
 * ServiceRoad — fixed ramp-side infrastructure the ground vehicles drive on
 * (V0.8-B). Purely decorative: a thin strip along the service lane plus a small
 * depot pad. Not a placeable building and not selectable (spec §51).
 */
export class ServiceRoad {
  readonly object: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "service-road";

    const roadMat = new THREE.MeshStandardMaterial({
      color: COLORS.serviceRoad,
      roughness: 0.95,
    });

    // The perimeter lane along the north edge of the runway.
    const laneGeo = new THREE.PlaneGeometry(38, 1.6);
    this.geometries.push(laneGeo);
    const lane = new THREE.Mesh(laneGeo, roadMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(-3, 0.015, SERVICE_LANE_Z);
    lane.receiveShadow = true;
    this.object.add(lane);

    // Depot pad the vehicles park on (just west of the runway).
    const padGeo = new THREE.PlaneGeometry(6, 5);
    this.geometries.push(padGeo);
    const pad = new THREE.Mesh(padGeo, roadMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(-22, 0.015, 1.8);
    pad.receiveShadow = true;
    this.object.add(pad);

    this.materials.push(roadMat);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
