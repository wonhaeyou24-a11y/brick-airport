import * as THREE from "three";

/** Kinds of things the player can click / tap in the world. */
export type SelectionKind =
  | "AIRCRAFT"
  | "BUILDING"
  | "PASSENGER"
  | "GROUND_VEHICLE";

/**
 * Anything selectable exposes a root Object3D (whose `userData.selectable`
 * points back here), plus a way to highlight itself and describe itself to
 * the HUD. Highlighting is deliberately simple for V0.1 (emissive tint).
 */
export interface Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind;
  readonly object: THREE.Object3D;
  setHighlighted(highlighted: boolean): void;
  getSelectionLabel(): string;
}

/** Tag a root object so SelectionManager can map a raycast hit back to it. */
export function tagSelectable(object: THREE.Object3D, target: Selectable): void {
  object.userData.selectable = target;
}

/** Walk up from a raycast hit to the nearest tagged Selectable, if any. */
export function findSelectable(object: THREE.Object3D | null): Selectable | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const found = current.userData.selectable as Selectable | undefined;
    if (found) return found;
    current = current.parent;
  }
  return null;
}
