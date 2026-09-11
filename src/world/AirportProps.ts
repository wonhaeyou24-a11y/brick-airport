import * as THREE from "three";
import {
  createCone,
  createFenceSegment,
  createLampPost,
  createShrub,
} from "../assets/AssetFactory";

/**
 * AirportProps — small decorative scenery so the apron doesn't read as empty
 * (spec §17/§18). Purely visual: not a GameState object, not selectable, not
 * placed through PlacementSystem, never touched by gameplay logic — the same
 * "fixed ground infrastructure" pattern ServiceRoad already uses.
 *
 * Fixed, hand-picked world positions along the airport's outer edges, clear
 * of the runway / terminal / gates / service road / staff room / vehicle
 * depot clusters near the origin, so props never visually collide with a
 * gameplay object. Built once; nothing here changes per frame.
 */
export class AirportProps {
  readonly object: THREE.Group;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "airport-props";

    // Lamp posts along the east boundary.
    for (const z of [-10, -4, 4, 10]) {
      const lamp = createLampPost();
      lamp.position.set(19, 0, z);
      this.object.add(lamp);
    }

    // A short fence line along the south edge, beyond the runway.
    for (let i = 0; i < 4; i++) {
      const fence = createFenceSegment();
      fence.position.set(-9 + i * 1.5, 0, -9.5);
      this.object.add(fence);
    }

    // A few safety cones near the apron edge.
    for (const x of [15, 16.5, 18]) {
      const cone = createCone();
      cone.position.set(x, 0, 6);
      this.object.add(cone);
    }

    // Shrubs softening the terminal frontage corners.
    for (const x of [-9, 9]) {
      const shrub = createShrub();
      shrub.position.set(x, 0.3, 17);
      this.object.add(shrub);
    }
  }

  dispose(): void {
    // Geometry/materials all come from AssetFactory's shared caches — do not
    // dispose them here (they may still be in use elsewhere); just drop refs.
    this.object.clear();
  }
}
