import * as THREE from "three";
import { expansionTier, MAX_EXPANSION_LEVEL } from "../progression/Expansion";

/**
 * ExpansionOverlay — dims the not-yet-unlocked part of the airport (spec
 * §D.6). Ground/Grid are built once at the maximum expansion size (see
 * world/cells.ts); this draws a square "frame" of dim panels over whatever
 * part of that area the player hasn't unlocked yet, so the boundary reads
 * clearly without ever rebuilding Ground or Grid.
 *
 * Four plain PlaneGeometry bands (north/south/east/west) — no decoration
 * beyond that (spec §D.6 "장식용 그래픽을 과도하게 만들지 않는다"). Only
 * rebuilt when the expansion level actually changes, never per frame.
 */
export class ExpansionOverlay {
  readonly object: THREE.Group;
  private readonly bands: THREE.Mesh[] = [];
  private readonly material: THREE.MeshStandardMaterial;
  private level = -1; // force the first setLevel() to rebuild

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "expansion-overlay";
    this.material = new THREE.MeshStandardMaterial({
      color: 0x445059,
      roughness: 1,
      transparent: true,
      opacity: 0.55,
    });
  }

  setLevel(level: number): void {
    if (level === this.level) return;
    this.level = level;
    this.rebuild();
  }

  private rebuild(): void {
    for (const band of this.bands) {
      this.object.remove(band);
      band.geometry.dispose();
    }
    this.bands.length = 0;

    const maxSize = expansionTier(MAX_EXPANSION_LEVEL).worldSize;
    const size = expansionTier(this.level).worldSize;
    if (size >= maxSize) return; // fully expanded — nothing to dim

    const frameWidth = (maxSize - size) / 2;
    const half = maxSize / 2;
    const innerHalf = size / 2;

    // [width, depth, centerX, centerZ]
    const specs: [number, number, number, number][] = [
      [maxSize, frameWidth, 0, (innerHalf + half) / 2], // north
      [maxSize, frameWidth, 0, -(innerHalf + half) / 2], // south
      [frameWidth, size, (innerHalf + half) / 2, 0], // east
      [frameWidth, size, -(innerHalf + half) / 2, 0], // west
    ];

    for (const [width, depth, x, z] of specs) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        this.material,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.03, z); // just above Ground, below the grid lines
      mesh.receiveShadow = false;
      this.bands.push(mesh);
      this.object.add(mesh);
    }
  }

  dispose(): void {
    for (const band of this.bands) band.geometry.dispose();
    this.material.dispose();
  }
}
