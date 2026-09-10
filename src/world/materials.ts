import * as THREE from "three";

/**
 * Shared brick-toy material palette.
 *
 * Materials are cached by colour so the whole airport reuses a small set of
 * MeshStandardMaterials instead of allocating one per mesh (perf rule 21).
 * Do NOT mutate a material returned here for a single mesh — clone it first.
 */
const cache = new Map<number, THREE.MeshStandardMaterial>();

export function brickMaterial(
  color: number,
  opts: { roughness?: number; metalness?: number } = {},
): THREE.MeshStandardMaterial {
  const key = color;
  const existing = cache.get(key);
  if (existing) return existing;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.0,
  });
  cache.set(key, material);
  return material;
}

/** Named colours for the toy world. */
export const COLORS = {
  runway: 0x4a4e57,
  runwayMarking: 0xf7f7f7,
  terminalBody: 0xf4f4f4,
  terminalRoof: 0xe63946,
  terminalGlass: 0x9ad4e6,
  terminalAccent: 0xffb703,
  gate: 0x2a9d8f,
  gateBridge: 0xbfc7cc,
  // Service facilities (V0.7-C) — one bright brick colour each.
  facilityCheckIn: 0x4d9de0,
  facilitySecurity: 0x6a4c93,
  facilityBaggage: 0xe0913a,
  facilityLounge: 0xe15554,
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
} as const;

export function disposePaletteCache(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
