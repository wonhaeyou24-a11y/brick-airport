import * as THREE from "three";
import { brickMaterial } from "../world/materials";

/**
 * AssetFactory — small, reusable procedural "brick toy" building blocks
 * (V1.3-A). Pure Three.js geometry assembly, no GameState import, no game
 * logic — every function just returns a Mesh/Group a Building/Aircraft/
 * Passenger/Vehicle class can add to its own group in local space.
 *
 * This is the seam spec §32 asks for: a caller only ever does
 * `group.add(createX(...))`. Swapping a function's body for a GLTF loader
 * later means nothing outside this file has to change.
 *
 * Geometries are cached by their exact size/param key so many identical brick
 * studs/windows across a terminal (or across many terminals) share one
 * BufferGeometry — materials already do this via world/materials.brickMaterial
 * (spec §24's "Geometry 공유 / Material 공유").
 */

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `box:${w}:${h}:${d}`;
  let g = geoCache.get(key) as THREE.BoxGeometry | undefined;
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}
function cachedCylinder(rt: number, rb: number, h: number, seg: number): THREE.CylinderGeometry {
  const key = `cyl:${rt}:${rb}:${h}:${seg}`;
  let g = geoCache.get(key) as THREE.CylinderGeometry | undefined;
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.set(key, g);
  }
  return g;
}

/** One small round brick stud — the signature toy-brick accent. */
export function createStud(color: number, radius = 0.09): THREE.Mesh {
  const mesh = new THREE.Mesh(
    cachedCylinder(radius, radius, radius * 0.7, 10),
    brickMaterial(color, { roughness: 0.55 }),
  );
  return mesh;
}

/** A row of evenly-spaced studs along local X, for a roofline / wall accent. */
export function createStudRow(
  count: number,
  spacing: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const stud = createStud(color);
    stud.position.x = start + i * spacing;
    group.add(stud);
  }
  return group;
}

/** A flat rectangular panel — glass, signage, or a plain accent wall. */
export function createPanel(
  width: number,
  height: number,
  color: number,
  opts: { roughness?: number; metalness?: number } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    cachedBox(width, height, 0.08),
    brickMaterial(color, opts),
  );
  return mesh;
}

/** A row of window panes, evenly spaced along local X, sunk slightly into the wall. */
export function createWindowRow(
  count: number,
  spacing: number,
  width: number,
  height: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const pane = createPanel(width, height, color, { roughness: 0.2, metalness: 0.15 });
    pane.position.x = start + i * spacing;
    group.add(pane);
  }
  return group;
}

/** A simple gabled or flat roof cap sitting on top of a body of size (w, d). */
export function createRoofCap(
  w: number,
  d: number,
  color: number,
  thickness = 0.4,
): THREE.Mesh {
  return new THREE.Mesh(
    cachedBox(w, thickness, d),
    brickMaterial(color, { roughness: 0.6 }),
  );
}

/** A vertical sign post topped with a small board — airport signage, gate numbers. */
export function createSignPost(
  height: number,
  boardColor: number,
  postColor = 0x8a949c,
): THREE.Group {
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    cachedCylinder(0.05, 0.05, height, 6),
    brickMaterial(postColor, { roughness: 0.5, metalness: 0.2 }),
  );
  post.position.y = height / 2;
  group.add(post);

  const board = new THREE.Mesh(
    cachedBox(0.6, 0.32, 0.05),
    brickMaterial(boardColor, { roughness: 0.4 }),
  );
  board.position.y = height * 0.82;
  group.add(board);
  return group;
}

/** A small traffic/safety cone — a common airport-apron prop. */
export function createCone(color = 0xf77f00): THREE.Mesh {
  return new THREE.Mesh(
    cachedCylinder(0.03, 0.14, 0.4, 8),
    brickMaterial(color, { roughness: 0.6 }),
  );
}

/** A lamp post — a cylinder pole with a glowing-looking head. */
export function createLampPost(height = 2.4, poleColor = 0x6b7079): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    cachedCylinder(0.06, 0.08, height, 8),
    brickMaterial(poleColor, { roughness: 0.5, metalness: 0.3 }),
  );
  pole.position.y = height / 2;
  group.add(pole);

  const head = new THREE.Mesh(
    cachedCylinder(0.14, 0.1, 0.2, 8),
    brickMaterial(0xfff2b2, { roughness: 0.3 }),
  );
  head.position.y = height + 0.05;
  group.add(head);
  return group;
}

/** One fence post + rail segment, repeatable along a boundary. */
export function createFenceSegment(
  length = 1.4,
  height = 0.9,
  color = 0xbfc7cc,
): THREE.Group {
  const group = new THREE.Group();
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      cachedCylinder(0.04, 0.04, height, 6),
      brickMaterial(color, { roughness: 0.6 }),
    );
    post.position.set((sx * length) / 2, height / 2, 0);
    group.add(post);
  }
  const rail = new THREE.Mesh(
    cachedBox(length, 0.05, 0.05),
    brickMaterial(color, { roughness: 0.6 }),
  );
  rail.position.y = height * 0.75;
  group.add(rail);
  const railLow = rail.clone();
  railLow.position.y = height * 0.35;
  group.add(railLow);
  return group;
}

/** A small round-topped shrub — cheap greenery for World Decoration. */
export function createShrub(color = 0x5aa469): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    brickMaterial(color, { roughness: 0.85 }),
  );
}

export function disposeAssetFactoryCache(): void {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
}
