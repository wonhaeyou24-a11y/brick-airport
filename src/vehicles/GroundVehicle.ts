import * as THREE from "three";
import type { GroundVehicleData, GroundVehicleType } from "../core/GameState";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";
import { brickMaterial, COLORS } from "../world/materials";

/**
 * GroundVehicle — placeholder brick-toy service vehicle + Selectable (V0.8-B).
 *
 * Logic ≠ visual (spec §24, §53): every authoritative value lives in the
 * referenced GroundVehicleData; this class only builds the mesh once and mirrors
 * position / facing onto the group. Geometry is created per instance (there are
 * only a handful of vehicles) but built from the shared brick palette. Swapping
 * in a real asset later means replacing only this file.
 */

interface VehicleSpec {
  color: number;
  /** Body box size (x = width, y = height, z = length). */
  body: [number, number, number];
  label: string;
  /** Extra trailing box (baggage cart cargo), or null. */
  trailer: [number, number, number] | null;
}

const SPEC: Record<GroundVehicleType, VehicleSpec> = {
  BAGGAGE_CART: {
    color: COLORS.vehicleBaggage,
    body: [0.8, 0.55, 1.1],
    label: "Baggage Cart",
    trailer: [0.7, 0.4, 0.8],
  },
  CLEANING_VEHICLE: {
    color: COLORS.vehicleCleaning,
    body: [0.9, 0.8, 1.3],
    label: "Cleaning Vehicle",
    trailer: null,
  },
  FUEL_TRUCK: {
    color: COLORS.vehicleFuel,
    body: [1.0, 0.9, 2.4],
    label: "Fuel Truck",
    trailer: null,
  },
  SERVICE_VEHICLE: {
    color: COLORS.vehicleService,
    body: [0.9, 0.85, 1.4],
    label: "Service Vehicle",
    trailer: null,
  },
};

export function vehicleLabel(type: GroundVehicleType): string {
  return SPEC[type].label;
}

export class GroundVehicle implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "GROUND_VEHICLE";
  readonly object: THREE.Group;
  readonly data: GroundVehicleData;

  private readonly tmpDir = new THREE.Vector3();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly lastPos = new THREE.Vector3();
  private wheelSpin = 0;

  constructor(data: GroundVehicleData) {
    this.data = data;
    this.id = data.id;

    this.object = new THREE.Group();
    this.object.name = data.id;
    this.build();
    tagSelectable(this.object, this);
    this.syncFromData();
    this.lastPos.copy(this.object.position);
  }

  private build(): void {
    const spec = SPEC[this.data.type];
    const [w, h, l] = spec.body;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, l),
      brickMaterial(spec.color, { roughness: 0.6 }),
    );
    body.position.y = h / 2 + 0.12;
    body.castShadow = true;
    this.object.add(body);

    // Little cab at the nose (local +Z is "forward").
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.8, h * 0.7, 0.5),
      brickMaterial(COLORS.vehicleCab, { roughness: 0.4 }),
    );
    cab.position.set(0, h * 0.7 + 0.12, l / 2 - 0.2);
    this.object.add(cab);

    if (spec.trailer) {
      const [tw, th, tl] = spec.trailer;
      const trailer = new THREE.Mesh(
        new THREE.BoxGeometry(tw, th, tl),
        brickMaterial(spec.color, { roughness: 0.7 }),
      );
      trailer.position.set(0, th / 2 + 0.12, -l / 2 - tl / 2 - 0.15);
      this.object.add(trailer);
    }

    // Wheels — four dark stubs so it reads as a vehicle from the iso view.
    const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.16, 8);
    const wheelMat = brickMaterial(COLORS.vehicleCab, { roughness: 0.9 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * (w / 2 - 0.05), 0.16, sz * (l / 2 - 0.3));
        this.object.add(wheel);
        this.wheels.push(wheel);
      }
    }

    // Role-specific detail (spec §16), on top of the shared body/cab/wheels.
    const detailMat = brickMaterial(COLORS.terminalDark, { roughness: 0.5, metalness: 0.2 });
    if (this.data.type === "FUEL_TRUCK") {
      // Hose reel + nozzle at the rear.
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 10), detailMat);
      reel.rotation.z = Math.PI / 2;
      reel.position.set(0, h * 0.6 + 0.12, -l / 2 + 0.1);
      this.object.add(reel);
      const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), detailMat);
      hose.rotation.x = Math.PI / 2.6;
      hose.position.set(0, h * 0.35 + 0.12, -l / 2 - 0.3);
      this.object.add(hose);
    } else if (this.data.type === "CLEANING_VEHICLE") {
      const equipment = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.2, 0.3), detailMat);
      equipment.position.set(0, h + 0.12, -l / 4);
      this.object.add(equipment);
    } else if (this.data.type === "SERVICE_VEHICLE") {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.3, 0.4), detailMat);
      box.position.set(0, h + 0.15, -l / 4);
      this.object.add(box);
    }
  }

  /**
   * Cosmetic wheel spin, scaled by how far the vehicle actually moved this
   * frame — purely visual, never touches GroundVehicleData (spec §16/§31).
   */
  tickAnimation(): void {
    const p = this.object.position;
    const moved = p.distanceTo(this.lastPos);
    this.lastPos.copy(p);
    if (moved <= 0) return;
    this.wheelSpin += moved * 4;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin;
  }

  /** Mirror data.position onto the group and face the travel direction. */
  syncFromData(): void {
    const p = this.data.position;
    this.object.position.set(p.x, p.y, p.z);

    const t = this.data.targetPosition;
    if (t) {
      this.tmpDir.set(t.x - p.x, 0, t.z - p.z);
      if (this.tmpDir.lengthSq() > 1e-4) {
        this.object.rotation.y = Math.atan2(this.tmpDir.x, this.tmpDir.z);
      }
    }
  }

  setHighlighted(highlighted: boolean): void {
    setEmissiveHighlight(this.object, highlighted);
  }

  getSelectionLabel(): string {
    return vehicleLabel(this.data.type);
  }

  dispose(): void {
    disposeHighlight(this.object);
    this.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
    });
    this.object.removeFromParent();
    this.object.clear();
  }
}
