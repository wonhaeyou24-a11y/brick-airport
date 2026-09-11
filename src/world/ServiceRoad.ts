import * as THREE from "three";
import { COLORS } from "./materials";
import { SERVICE_LANE_Z } from "../vehicles/vehicleWaypoints";
import { STAFF_LANE_Z } from "../staff/staffWaypoints";

/**
 * ServiceRoad — fixed ground infrastructure the ground crew uses (V0.8-B /
 * V0.9-B). Purely decorative: the ramp-side vehicle lane + depot pad, and the
 * apron-side staff walkway + a small staff-room pad. Not a placeable building
 * and not selectable (spec §51).
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

    const staffMat = new THREE.MeshStandardMaterial({
      color: COLORS.staffArea,
      roughness: 0.95,
    });

    // Staff walkway across the apron, and the staff-room pad east of the gates.
    const walkGeo = new THREE.PlaneGeometry(34, 1.1);
    this.geometries.push(walkGeo);
    const walk = new THREE.Mesh(walkGeo, staffMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(-2, 0.012, STAFF_LANE_Z);
    walk.receiveShadow = true;
    this.object.add(walk);

    const roomGeo = new THREE.PlaneGeometry(4.6, 4.6);
    this.geometries.push(roomGeo);
    const room = new THREE.Mesh(roomGeo, staffMat);
    room.rotation.x = -Math.PI / 2;
    room.position.set(12.8, 0.012, 8.8);
    room.receiveShadow = true;
    this.object.add(room);

    this.materials.push(roadMat, staffMat);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
