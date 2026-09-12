import * as THREE from "three";

/**
 * Shared brick-toy material palette.
 *
 * Materials are cached by colour so the whole airport reuses a small set of
 * MeshStandardMaterials instead of allocating one per mesh (perf rule 21).
 * Do NOT mutate a material returned here for a single mesh — clone it first.
 *
 * V3.0 PHASE 1 — default roughness/metalness tuned down from the flat-plastic
 * 0.7/0.0 defaults to 0.25/0.08 (spec's "토이 플라스틱 라이팅 파이프라인": the
 * sharp, slightly-glossy highlight real injection-molded brick toys catch
 * under a strong key light). Only affects call sites that don't already pass
 * their own roughness/metalness (most do, for a specific surface) — existing
 * explicit values are unchanged.
 */
const cache = new Map<string, THREE.MeshStandardMaterial>();

export function brickMaterial(
  color: number,
  opts: { roughness?: number; metalness?: number } = {},
): THREE.MeshStandardMaterial {
  const roughness = opts.roughness ?? 0.25;
  const metalness = opts.metalness ?? 0.08;
  // Cache key includes roughness/metalness (V3.0 fix): previously keyed by
  // colour alone, so the FIRST call for a given colour silently won every
  // later call with different roughness/metalness options for that same
  // colour — a latent material-sharing bug the PHASE 1 rewrite would have
  // hit immediately (many new call sites reuse existing COLORS.* values with
  // different finishes).
  const key = `${color}:${roughness}:${metalness}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
  cache.set(key, material);
  return material;
}

/**
 * Cached MeshPhysicalMaterial for a real glass curtain wall (V3.0 PHASE 1
 * §1) — `brickMaterial`'s MeshStandardMaterial has no `transmission`, so a
 * genuinely see-through/refractive facade needs its own cache, keyed the
 * same way (colour + every option that changes the resulting material).
 */
const glassCache = new Map<string, THREE.MeshPhysicalMaterial>();

export function glassMaterial(
  color: number,
  opts: { roughness?: number; metalness?: number; transmission?: number } = {},
): THREE.MeshPhysicalMaterial {
  const roughness = opts.roughness ?? 0.1;
  const metalness = opts.metalness ?? 0.0;
  const transmission = opts.transmission ?? 0.6;
  const key = `${color}:${roughness}:${metalness}:${transmission}`;
  const existing = glassCache.get(key);
  if (existing) return existing;

  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    transmission,
    thickness: 0.4,
    ior: 1.4,
    // A fully-transmissive facade with nothing behind it reads as invisible
    // in this scene (no interior geometry) — a little reflectivity keeps the
    // glass legible as glass from every camera angle, same as real
    // architectural low-E glazing.
    reflectivity: 0.4,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  });
  glassCache.set(key, material);
  return material;
}

/** Named colours for the toy world. */
export const COLORS = {
  runway: 0x4a4e57,
  runwayMarking: 0xf7f7f7,
  terminalBody: 0xf4f4f4,
  terminalRoof: 0xe63946,
  terminalGlass: 0x9ad4e6,
  /** Deep cyan-blue curtain-wall glass (V3.0 PHASE 1 §1) — used with
   * glassMaterial(), distinct from the lighter terminalGlass tint still used
   * by the jet bridge / control tower windows. */
  terminalGlassDeep: 0x0f3a4d,
  terminalAccent: 0xffb703,
  /** Gate-number signboard background (V3.0 PHASE 1 §1.4) — the reference
   * image's yellow "A1/A2/A3" facade signs. */
  gateSignYellow: 0xffc93c,
  /** Dark accent for doors / roof equipment / signage frames (V1.3-B). */
  terminalDark: 0x3a4046,
  gate: 0x2a9d8f,
  gateBridge: 0xbfc7cc,
  // Service facilities (V0.7-C) — one bright brick colour each.
  facilityCheckIn: 0x4d9de0,
  facilitySecurity: 0x6a4c93,
  facilityBaggage: 0xe0913a,
  facilityLounge: 0xe15554,
  // Amenities (V1.1-A).
  facilityShop: 0x8ecae6,
  facilityFood: 0xffb703,
  facilityRestroom: 0x52b788,
  // V2.1 content expansion — Lv.4/Lv.5 facilities.
  facilityParking: 0x7a828c,
  facilityVipLounge: 0xb8860b,
  facilityRoof: 0xf4f4f4,
  aircraftBody: 0xffffff,
  aircraftWing: 0xd7dde2,
  aircraftTail: 0xe63946,
  aircraftCockpit: 0x22333b,
  // Ground service vehicles (V0.8-B) — one toy colour each.
  vehicleBaggage: 0xf4a259,
  vehicleCleaning: 0x4cc9a4,
  vehicleFuel: 0xd7263d,
  vehicleService: 0x3a86c8,
  vehicleCab: 0x2b2d42,
  serviceRoad: 0x6b7079,
  staffArea: 0x8a949c,
  // Taxiway (V1.7 §7) — sits between the runway and the apron/service lanes.
  taxiway: 0x585c64,
  taxiwayMarking: 0xf6c945,
  // Apron (V2.0 STEP 1 REWORK §20) — the paved ramp connecting terminal,
  // gates, and taxiway; lighter than the taxiway/runway so it still reads as
  // a distinct "gate ramp" surface in the isometric view.
  apron: 0xc3c9cd,
  apronMarking: 0xf7f7f7,
  apronMarkingYellow: 0xf6c945,
} as const;

export function disposePaletteCache(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
  glassCache.forEach((m) => m.dispose());
  glassCache.clear();
}
