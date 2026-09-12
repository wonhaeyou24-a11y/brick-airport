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

const studDummy = new THREE.Object3D();

/**
 * A rectangular GRID of roofline studs as ONE InstancedMesh (V3.0 PHASE 1
 * absolute rule §4 — a roof-plate stud grid is exactly the "반복되는 블록
 * 돌기" case: a dense terminal roof can carry 50-150+ studs, and each one as
 * its own Mesh/draw-call would be the "drawcall 폭증" the rule exists to
 * prevent. One geometry + one material + one draw call, however many studs.
 */
export function createStudGrid(
  cols: number,
  rows: number,
  spacingX: number,
  spacingZ: number,
  color: number,
  radius = 0.09,
): THREE.InstancedMesh {
  const count = Math.max(1, cols) * Math.max(1, rows);
  const mesh = new THREE.InstancedMesh(
    cachedCylinder(radius, radius, radius * 0.7, 10),
    brickMaterial(color, { roughness: 0.55 }),
    count,
  );
  mesh.castShadow = true;
  const startX = -((cols - 1) * spacingX) / 2;
  const startZ = -((rows - 1) * spacingZ) / 2;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      studDummy.position.set(startX + c * spacingX, 0, startZ + r * spacingZ);
      studDummy.updateMatrix();
      mesh.setMatrixAt(i++, studDummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * A row of identical small cylindrical roof vents/ducts as ONE InstancedMesh
 * (V3.0 PHASE 1 absolute rule §4 — the same repeated-prop case as the stud
 * grid, applied to rooftop HVAC ductwork).
 */
export function createVentCluster(
  count: number,
  spacing: number,
  color: number,
  radius = 0.14,
  height = 0.3,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    cachedCylinder(radius, radius, height, 10),
    brickMaterial(color, { roughness: 0.5, metalness: 0.15 }),
    Math.max(1, count),
  );
  mesh.castShadow = true;
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    studDummy.position.set(start + i * spacing, 0, 0);
    studDummy.updateMatrix();
    mesh.setMatrixAt(i, studDummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * A rooftop HVAC condenser unit — a vented box on short feet (V3.0 PHASE 1
 * §1.3). One per call (terminals only need 1-2), so plain meshes here are
 * fine; the identical grille slats inside it are what would repeat, and
 * there are only 3, so a Group reads better than instancing 3 items.
 */
export function createHvacUnit(width = 0.9, height = 0.5, depth = 0.7): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = brickMaterial(0xced3d6, { roughness: 0.4, metalness: 0.2 });
  const body = new THREE.Mesh(cachedBox(width, height, depth), bodyMat);
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);

  const slatMat = brickMaterial(0x8a949c, { roughness: 0.5, metalness: 0.15 });
  const slatCount = 3;
  for (let i = 0; i < slatCount; i++) {
    const slat = new THREE.Mesh(cachedBox(width * 0.82, 0.04, depth * 0.9), slatMat);
    slat.position.set(0, height * (0.35 + i * 0.22), 0);
    group.add(slat);
  }
  return group;
}

/** Object name of a radar dish's rotating head, for a caller's per-frame spin. */
export const RADAR_HEAD_NAME = "radar-head";

/**
 * A small rotating rooftop radar/weather antenna (V3.0 PHASE 1 §1.3). Only
 * the returned group's child named RADAR_HEAD_NAME needs to spin — the
 * caller (Terminal.tickAnimation) rotates it locally each frame; this
 * factory never touches the scene graph after construction.
 */
export function createRadarAntenna(): THREE.Group {
  const group = new THREE.Group();
  const postMat = brickMaterial(0x3a4046, { roughness: 0.5, metalness: 0.2 });
  const post = new THREE.Mesh(cachedCylinder(0.04, 0.05, 0.5, 8), postMat);
  post.position.y = 0.25;
  group.add(post);

  const head = new THREE.Group();
  head.name = RADAR_HEAD_NAME;
  head.position.y = 0.5;
  group.add(head);

  const dishMat = brickMaterial(0xe9ecef, { roughness: 0.4, metalness: 0.25 });
  const dish = new THREE.Mesh(cachedCylinder(0.22, 0.22, 0.03, 12), dishMat);
  dish.rotation.z = Math.PI / 2.4;
  dish.castShadow = true;
  head.add(dish);

  const hub = new THREE.Mesh(cachedCylinder(0.04, 0.04, 0.12, 8), postMat);
  hub.rotation.z = Math.PI / 2.4;
  head.add(hub);

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

/**
 * A small airport control tower — shaft, glazed observation cab, radar dish.
 * Visual-only decoration (world/AirportProps.ts), not a placeable BuildingType
 * (spec's own instruction: introduce it as scenery, not a new GameState
 * building this pass).
 */
export function createControlTower(): THREE.Group {
  const group = new THREE.Group();

  // Wide base pad — grounds the tower instead of the shaft just meeting the
  // apron (V2.0 §8's "Base").
  const base = new THREE.Mesh(
    cachedCylinder(1.1, 1.3, 0.6, 10),
    brickMaterial(0xbfc7cc, { roughness: 0.7 }),
  );
  base.position.y = 0.3;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Taller shaft than V1.x, so the tower clearly out-scales the Terminal
  // (V2.0 §8 landmark requirement).
  const shaft = new THREE.Mesh(
    cachedCylinder(0.5, 0.7, 7.4, 8),
    brickMaterial(0xd9dde0, { roughness: 0.6 }),
  );
  shaft.position.y = 4.3;
  shaft.castShadow = true;
  group.add(shaft);

  // A support strut braced against the shaft — real control towers read as
  // structural, not just a stacked cylinder.
  const strut = new THREE.Mesh(
    cachedCylinder(0.09, 0.09, 4.6, 6),
    brickMaterial(0xbfc7cc, { roughness: 0.6 }),
  );
  strut.position.set(0.45, 3.6, 0.45);
  strut.rotation.set(0.28, 0, -0.28);
  group.add(strut);

  // Structural core, slightly smaller than the glazed skin so the glass
  // panels below actually read as windows on every side instead of a solid
  // tinted cylinder (V2.0 STEP 1 REWORK §11 — "관제실은 일반 Box가 아니라
  // 유리로 된 observation cabin처럼 보여야 한다").
  const cabCore = new THREE.Mesh(
    cachedCylinder(1.0, 1.0, 1.3, 12),
    brickMaterial(0x274156, { roughness: 0.4, metalness: 0.1 }),
  );
  cabCore.position.y = 8.75;
  cabCore.castShadow = true;
  group.add(cabCore);

  // 8 outward-facing flat glass panels forming an octagonal glazed cabin —
  // visible as actual windows from any camera angle, not just a color tint.
  const glassMat = brickMaterial(0x8ed3f0, { roughness: 0.15, metalness: 0.1 });
  const mullionMat = brickMaterial(0x1c2b38, { roughness: 0.4, metalness: 0.15 });
  const panelCount = 8;
  for (let i = 0; i < panelCount; i++) {
    const angle = (i / panelCount) * Math.PI * 2;
    const panel = new THREE.Mesh(cachedBox(0.78, 1.15, 0.06), glassMat);
    panel.position.set(Math.cos(angle) * 1.18, 8.75, Math.sin(angle) * 1.18);
    panel.rotation.y = -angle;
    group.add(panel);

    // Mullion post at each panel seam.
    const seamAngle = angle + Math.PI / panelCount;
    const mullion = new THREE.Mesh(cachedBox(0.07, 1.3, 0.07), mullionMat);
    mullion.position.set(Math.cos(seamAngle) * 1.18, 8.75, Math.sin(seamAngle) * 1.18);
    group.add(mullion);
  }

  const deckLip = new THREE.Mesh(
    cachedCylinder(1.35, 1.35, 0.12, 12),
    brickMaterial(0xd9dde0, { roughness: 0.6 }),
  );
  deckLip.position.y = 8.0;
  group.add(deckLip);

  const roof = new THREE.Mesh(
    cachedCylinder(1.3, 1.3, 0.18, 12),
    brickMaterial(0xe63946, { roughness: 0.6 }),
  );
  roof.position.y = 9.6;
  group.add(roof);

  const antenna = new THREE.Mesh(
    cachedCylinder(0.03, 0.03, 1.4, 6),
    brickMaterial(0x3a4046, { roughness: 0.5, metalness: 0.3 }),
  );
  antenna.position.y = 10.4;
  group.add(antenna);

  const beacon = createStud(0xffb703, 0.1);
  beacon.position.y = 11.15;
  group.add(beacon);

  return group;
}

const signTextureCache = new Map<string, THREE.CanvasTexture>();
const signMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * A lit signage panel with `text` baked into a small canvas texture —
 * created once per distinct (text, background, foreground) combination and
 * cached, so N terminals/gates sharing a label cost one canvas render + one
 * GPU upload total (V2.0 STEP 1 REWORK §8/§36: "가능하면 shared
 * geometry/material을 사용한다", no per-frame or per-window mesh explosion).
 * Uses MeshBasicMaterial so the sign still reads clearly at night-dark
 * shadow angles, like real backlit airport signage.
 *
 * `bg`/`fg` default to the original dark-navy/white "AIRPORT" facade sign so
 * every existing call site is unaffected; V3.0 PHASE 1's yellow "A1/A2/A3"
 * gate-number signs (spec §1.4) pass their own colours instead of a new
 * function.
 */
export function createSignboard(
  text: string,
  width: number,
  height: number,
  bg = "#0b1f38",
  fg = "#ffffff",
): THREE.Mesh {
  const cacheKey = `${text}|${bg}|${fg}`;
  let texture = signTextureCache.get(cacheKey);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg;
    ctx.font = "bold 72px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    signTextureCache.set(cacheKey, texture);
  }
  let material = signMaterialCache.get(cacheKey);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: texture });
    signMaterialCache.set(cacheKey, material);
  }
  return new THREE.Mesh(cachedBox(width, height, 0.06), material);
}

export function disposeAssetFactoryCache(): void {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
  signTextureCache.forEach((t) => t.dispose());
  signTextureCache.clear();
  signMaterialCache.forEach((m) => m.dispose());
  signMaterialCache.clear();
}
