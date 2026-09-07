import * as THREE from "three";

/**
 * Recursively dispose geometries under an object.
 *
 * Materials are intentionally NOT disposed here: most meshes use the shared
 * palette from world/materials.ts. Palette lifetime is managed centrally by
 * disposePaletteCache().
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.dispose();
    }
  });
  root.removeFromParent();
}
