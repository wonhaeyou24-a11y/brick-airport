import * as THREE from "three";
import type { GroundVehicleData, GroundVehicleType } from "../core/GameState";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";
import { brickMaterial, COLORS } from "../world/materials";
import { CURRENT_LOCALE, type Locale } from "../i18n/strings";

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

/** Korean player-facing names (V1.4-i18n) — kept beside SPEC[type].label (English). */
const VEHICLE_LABEL_KO: Record<GroundVehicleType, string> = {
  BAGGAGE_CART: "수하물 카트",
  CLEANING_VEHICLE: "청소 차량",
  FUEL_TRUCK: "급유차",
  SERVICE_VEHICLE: "서비스 차량",
};

export function vehicleLabel(
  type: GroundVehicleType,
  locale: Locale = CURRENT_LOCALE,
): string {
  return locale === "ko" ? VEHICLE_LABEL_KO[type] : SPEC[type].label;
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
  /** V2.0 STEP 1 §15 — rooftop amber beacon, blinks only while actually
   * moving so an idle-parked vehicle doesn't read as "in an emergency". */
  private beaconMat: THREE.MeshStandardMaterial | null = null;
  private beaconClock = 0;

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
    const type = this.data.type;
    const bodyMat = brickMaterial(spec.color, { roughness: 0.6 });

    // FUEL_TRUCK gets a real cylindrical tank instead of the shared box body
    // (spec: "유조 탱크 모듈 탑재") — every other type keeps the box body.
    if (type === "FUEL_TRUCK") {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(h / 2, h / 2, l, 12), bodyMat);
      tank.rotation.z = Math.PI / 2;
      tank.position.y = h / 2 + 0.12;
      tank.castShadow = true;
      this.object.add(tank);
      // End caps so the cylinder doesn't read as an open pipe.
      const capMat = brickMaterial(0xdfe4ea, { roughness: 0.4, metalness: 0.2 });
      for (const sz of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(h / 2, 12), capMat);
        cap.rotation.y = Math.PI / 2;
        cap.position.set(0, h / 2 + 0.12, (sz * l) / 2);
        this.object.add(cap);
      }
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), bodyMat);
      body.position.y = h / 2 + 0.12;
      body.castShadow = true;
      this.object.add(body);
    }

    // BAGGAGE_CART has an open tug seat (no cab/windshield) since it tows a
    // train of carts, not a closed truck cab (spec: "오픈형 운전석").
    if (type === "BAGGAGE_CART") {
      const seatMat = brickMaterial(COLORS.vehicleCab, { roughness: 0.5 });
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.5, 0.08), seatMat);
      seatBack.position.set(0, h * 0.85 + 0.12, l / 2 - 0.1);
      this.object.add(seatBack);
      const steeringPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, h * 0.4, 6),
        seatMat,
      );
      steeringPost.position.set(0, h * 0.9 + 0.12, l / 2 - 0.02);
      this.object.add(steeringPost);
    } else {
      // Little cab at the nose (local +Z is "forward").
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.8, h * 0.7, 0.5),
        brickMaterial(COLORS.vehicleCab, { roughness: 0.4 }),
      );
      cab.position.set(0, h * 0.7 + 0.12, l / 2 - 0.2);
      this.object.add(cab);

      // Windshield — reads as an actual driver's cab rather than a plain box
      // (V2.0 §16's "Cab" detail).
      const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, h * 0.32, 0.06),
        brickMaterial(COLORS.terminalGlass, { roughness: 0.2, metalness: 0.15 }),
      );
      windshield.position.set(0, h * 0.85 + 0.12, l / 2 + 0.04);
      this.object.add(windshield);

      // CLEANING_VEHICLE additionally gets a side window band, nudging it
      // toward a small utility-van silhouette rather than a bare box body.
      if (type === "CLEANING_VEHICLE") {
        for (const sx of [-1, 1]) {
          const sideWindow = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, h * 0.28, l * 0.5),
            brickMaterial(COLORS.terminalGlass, { roughness: 0.2, metalness: 0.15 }),
          );
          sideWindow.position.set((sx * w) / 2, h * 0.62 + 0.12, -l * 0.05);
          this.object.add(sideWindow);
        }
      }
    }

    // Rooftop amber beacon — a common airport-service-vehicle cue (spec §16).
    this.beaconMat = brickMaterial(0xffb703, { roughness: 0.3 }).clone();
    this.beaconMat.emissive.setHex(0xffb703);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.beaconMat);
    beacon.position.set(0, h * 1.15 + 0.12, l / 2 - 0.2);
    this.object.add(beacon);

    // BAGGAGE_CART tows two chained trailer cars (a real "cart train"
    // silhouette) instead of one; every other type keeps no trailer.
    if (spec.trailer) {
      const [tw, th, tl] = spec.trailer;
      const trailerCount = type === "BAGGAGE_CART" ? 2 : 1;
      for (let i = 0; i < trailerCount; i++) {
        const trailer = new THREE.Mesh(
          new THREE.BoxGeometry(tw, th, tl),
          brickMaterial(spec.color, { roughness: 0.7 }),
        );
        const gap = 0.12;
        trailer.position.set(0, th / 2 + 0.12, -l / 2 - tl / 2 - gap - i * (tl + gap));
        this.object.add(trailer);
      }
    }

    // Wheels — dark stubs with a fender arch so it reads as a vehicle from
    // the iso view; extra rear pair under each baggage trailer.
    const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.16, 8);
    const wheelMat = brickMaterial(COLORS.vehicleCab, { roughness: 0.9 });
    const fenderMat = brickMaterial(0x2b2f3a, { roughness: 0.6 });
    const addWheelPair = (wz: number) => {
      for (const sx of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * (w / 2 - 0.05), 0.16, wz);
        this.object.add(wheel);
        this.wheels.push(wheel);

        const fender = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.24), fenderMat);
        fender.position.set(sx * (w / 2 - 0.05), 0.27, wz);
        this.object.add(fender);
      }
    };
    addWheelPair(l / 2 - 0.3);
    addWheelPair(-(l / 2 - 0.3));

    // Role-specific detail (spec §16), on top of the shared body/cab/wheels.
    const detailMat = brickMaterial(COLORS.terminalDark, { roughness: 0.5, metalness: 0.2 });
    if (type === "FUEL_TRUCK") {
      // Hose reel + nozzle at the rear.
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 10), detailMat);
      reel.rotation.z = Math.PI / 2;
      reel.position.set(0, h * 0.6 + 0.12, -l / 2 + 0.1);
      this.object.add(reel);
      const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), detailMat);
      hose.rotation.x = Math.PI / 2.6;
      hose.position.set(0, h * 0.35 + 0.12, -l / 2 - 0.3);
      this.object.add(hose);
    } else if (type === "CLEANING_VEHICLE") {
      const equipment = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.2, 0.3), detailMat);
      equipment.position.set(0, h + 0.12, -l / 4);
      this.object.add(equipment);
    } else if (type === "SERVICE_VEHICLE") {
      // Heavier, low-slung tow-tug read: a wide front bumper block plus a
      // toolbox, instead of just a roof box (spec: "낮고 묵직한 중장비 형태").
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h * 0.35, 0.18), detailMat);
      bumper.position.set(0, h * 0.2 + 0.12, l / 2 + 0.08);
      this.object.add(bumper);
      const toolbox = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.3, 0.4), detailMat);
      toolbox.position.set(0, h + 0.15, -l / 4);
      this.object.add(toolbox);
    }
  }

  /**
   * Cosmetic wheel spin, scaled by how far the vehicle actually moved this
   * frame — purely visual, never touches GroundVehicleData (spec §16/§31).
   */
  tickAnimation(deltaTime: number): void {
    const p = this.object.position;
    const moved = p.distanceTo(this.lastPos);
    this.lastPos.copy(p);

    if (this.beaconMat) {
      if (moved > 0) {
        this.beaconClock += deltaTime;
        const phase = (this.beaconClock % 0.6) / 0.6;
        this.beaconMat.emissiveIntensity = phase < 0.5 ? 1 : 0.15;
      } else {
        this.beaconClock = 0;
        this.beaconMat.emissiveIntensity = 0.15;
      }
    }

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
    this.beaconMat?.dispose();
    this.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
    });
    this.object.removeFromParent();
    this.object.clear();
  }
}
