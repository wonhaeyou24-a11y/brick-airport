import * as THREE from "three";

/**
 * hoverEffect — V3.0 PHASE 4 §1.1's "마우스 호버 / 터치 포커스 피드백":
 * a subtle emissive glow + scale bounce on whatever the pointer is currently
 * over, distinct from (and never overriding) the existing gold selection
 * highlight in selection/highlight.ts. Deliberately generic over any
 * THREE.Object3D — it never needs the Selectable interface itself changed,
 * so no entity class (Aircraft/GroundVehicle/Staff/Passenger/Building) has
 * to know hovering exists.
 */
const HOVER_EMISSIVE = 0x00e5ff;
const HOVER_INTENSITY = 0.35;
/** Uniform scale while hovered — subtle, not a cartoonish pop. */
const HOVER_SCALE = 1.05;

export function setHoverEffect(root: THREE.Object3D, on: boolean): void {
  root.scale.setScalar(on ? HOVER_SCALE : 1);

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material) return;
    // Currently selected (gold) takes priority — never swap a mesh already
    // showing the selection tint out for the dimmer hover tint.
    if (mesh.userData.highlightMaterial && mesh.material === mesh.userData.highlightMaterial) {
      return;
    }

    if (on) {
      if (!mesh.userData.hoverMaterial) {
        const base = (mesh.userData.baseMaterial as THREE.MeshStandardMaterial) ?? mesh.material;
        const clone = (base as THREE.MeshStandardMaterial).clone();
        if ("emissive" in clone && clone.emissive) {
          clone.emissive = new THREE.Color(HOVER_EMISSIVE);
          clone.emissiveIntensity = HOVER_INTENSITY;
        }
        mesh.userData.hoverMaterial = clone;
      }
      mesh.material = mesh.userData.hoverMaterial as THREE.Material;
    } else if (mesh.userData.hoverMaterial && mesh.material === mesh.userData.hoverMaterial) {
      mesh.material = (mesh.userData.baseMaterial as THREE.Material | undefined) ?? mesh.material;
    }
  });
}

/** Free the per-mesh hover clones under `root` (mirrors disposeHighlight). */
export function disposeHoverEffect(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const clone = mesh.userData?.hoverMaterial as THREE.Material | undefined;
    if (clone) {
      clone.dispose();
      delete mesh.userData.hoverMaterial;
    }
  });
}
