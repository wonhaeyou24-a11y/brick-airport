import * as THREE from "three";

/**
 * SelectionRing — V3.0 PHASE 4 §1.2's "선택 상태의 바닥 마커": a slowly
 * spinning block-style ring on the ground directly under whatever is
 * currently selected, following it every frame (so it stays correct under
 * a moving aircraft/vehicle/character, not just a one-shot placement).
 *
 * Pure Three.js, no GameState import, no game logic — exactly like the
 * other world/selection visual-only modules. Game owns the single instance,
 * calls setTarget() from onSelectionChange(), and update(deltaTime) from
 * the main loop; nothing here ever reads or writes GameState.
 */
const RING_COLOR = 0xffc800;
/** Full rotation period, seconds — a slow, readable spin. */
const ROTATE_PERIOD = 3;

export class SelectionRing {
  readonly object: THREE.Group;

  private readonly geometry: THREE.TorusGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly ring: THREE.Mesh;
  private target: THREE.Object3D | null = null;
  /** Reused each frame instead of allocating — filled from target.position. */
  private readonly tmpPos = new THREE.Vector3();

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "selection-ring";
    this.object.visible = false;

    this.geometry = new THREE.TorusGeometry(0.9, 0.09, 8, 20);
    this.material = new THREE.MeshStandardMaterial({
      color: RING_COLOR,
      roughness: 0.35,
      metalness: 0.15,
      emissive: RING_COLOR,
      emissiveIntensity: 0.5,
    });
    this.ring = new THREE.Mesh(this.geometry, this.material);
    this.ring.rotation.x = Math.PI / 2; // lie flat on the ground
    this.ring.position.y = 0.03; // clear of z-fighting with the ground/apron
    this.object.add(this.ring);
  }

  /** Show the ring under `target`, or hide it when null (deselected). */
  setTarget(target: THREE.Object3D | null): void {
    this.target = target;
    this.object.visible = target !== null;
    if (target) this.object.position.copy(target.position).setY(0);
  }

  /** Per-frame: track the target's current ground position and spin. */
  update(deltaTime: number): void {
    if (!this.target) return;
    this.tmpPos.copy(this.target.position);
    this.tmpPos.y = 0;
    this.object.position.copy(this.tmpPos);
    this.ring.rotation.z += (Math.PI * 2 * deltaTime) / ROTATE_PERIOD;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
