import * as THREE from "three";

/** Colour used for the "selected" emissive tint across all entities. */
const HIGHLIGHT_EMISSIVE = 0xffb703;
const HIGHLIGHT_INTENSITY = 0.55;

/**
 * Toggle a simple selection highlight on every mesh under `root`.
 *
 * Materials in the world are shared (world/materials.ts palette cache), so we
 * must NOT mutate them in place — that would tint every other mesh using the
 * same colour. Instead each mesh gets its own highlight clone on first use and
 * swaps between base / highlight material. Selectables are few, so the handful
 * of clones is negligible.
 */
export function setEmissiveHighlight(root: THREE.Object3D, on: boolean): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material) return;

    if (on) {
      if (!mesh.userData.highlightMaterial) {
        const base = mesh.material as THREE.MeshStandardMaterial;
        mesh.userData.baseMaterial = base;

        const clone = base.clone();
        if ("emissive" in clone && clone.emissive) {
          clone.emissive = new THREE.Color(HIGHLIGHT_EMISSIVE);
          clone.emissiveIntensity = HIGHLIGHT_INTENSITY;
        }
        mesh.userData.highlightMaterial = clone;
      }
      mesh.material = mesh.userData.highlightMaterial as THREE.Material;
    } else if (mesh.userData.baseMaterial) {
      mesh.material = mesh.userData.baseMaterial as THREE.Material;
    }
  });
}

/** Free the per-mesh highlight clones under `root`. */
export function disposeHighlight(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const clone = mesh.userData?.highlightMaterial as THREE.Material | undefined;
    if (clone) {
      clone.dispose();
      delete mesh.userData.highlightMaterial;
      delete mesh.userData.baseMaterial;
    }
  });
}
