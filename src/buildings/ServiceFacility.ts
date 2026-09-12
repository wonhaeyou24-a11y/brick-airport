import * as THREE from "three";
import type { ServiceFacilityType } from "../core/GameState";
import { Building } from "./Building";
import { CELL_SIZE } from "../world/Grid";
import { brickMaterial, COLORS } from "../world/materials";
import { buildingLabel } from "./BuildingConfig";

/**
 * ServiceFacility — one placeholder class for every small service / amenity
 * building (check-in, security, baggage, lounge, and the V1.1-A amenities
 * shop / food / restroom). The type only changes the brick colour and
 * height; the operational effect lives entirely in the operations layer,
 * never on this mesh (spec §54).
 */
const BODY_COLOR: Record<ServiceFacilityType, number> = {
  CHECK_IN: COLORS.facilityCheckIn,
  SECURITY: COLORS.facilitySecurity,
  BAGGAGE: COLORS.facilityBaggage,
  LOUNGE: COLORS.facilityLounge,
  SHOP: COLORS.facilityShop,
  FOOD: COLORS.facilityFood,
  RESTROOM: COLORS.facilityRestroom,
  // V2.1 content expansion.
  PARKING: COLORS.facilityParking,
  VIP_LOUNGE: COLORS.facilityVipLounge,
};

const BODY_HEIGHT: Record<ServiceFacilityType, number> = {
  CHECK_IN: 1.8,
  SECURITY: 1.8,
  BAGGAGE: 2.2,
  LOUNGE: 2.8,
  SHOP: 2.0,
  FOOD: 2.0,
  RESTROOM: 1.6,
  // Low flat structure for a parking facility; a grander premium lounge.
  PARKING: 1.2,
  VIP_LOUNGE: 3.2,
};

export class ServiceFacility extends Building {
  protected build(group: THREE.Group): void {
    const type = this.data.type as ServiceFacilityType;
    const w = this.data.size.cols * CELL_SIZE;
    const d = this.data.size.rows * CELL_SIZE;
    const h = BODY_HEIGHT[type];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.8, h, d * 0.8),
      brickMaterial(BODY_COLOR[type], { roughness: 0.7 }),
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, 0.35, d * 0.9),
      brickMaterial(COLORS.facilityRoof, { roughness: 0.6 }),
    );
    roof.position.y = h + 0.1;
    roof.castShadow = true;
    group.add(roof);

    // Small sign post so the facility reads on the apron.
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6),
      brickMaterial(COLORS.terminalAccent),
    );
    post.position.set(w * 0.3, 0.65, d * 0.3);
    group.add(post);
  }

  getSelectionLabel(): string {
    return buildingLabel(this.data.type);
  }
}
