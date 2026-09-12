import * as THREE from "three";
import { type Selectable, findSelectable } from "./Selectable";

/** Max pointer travel (px) between down and up that still counts as a tap. */
const TAP_SLOP = 6;

export type SelectionListener = (selected: Selectable | null) => void;
export type GroundListener = (worldPoint: THREE.Vector3 | null) => void;

/**
 * SelectionManager — the single pointer-picking entry point.
 *
 * - hover (mouse move, no button): raycast the ground plane -> onHover(point)
 * - tap (press + release, little movement, single pointer):
 *     hit a Selectable  -> select it
 *     hit only ground   -> select(null) + onGroundTap(point)
 *
 * Multi-touch gestures (pinch) are ignored here; the CameraController owns
 * those. Touch has no hover, so hover only fires for a mouse with no buttons
 * pressed — which also keeps the per-move raycast off during drags.
 */
export class SelectionManager {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tmpHit = new THREE.Vector3();

  private readonly selectionListeners: SelectionListener[] = [];
  private readonly hoverListeners: GroundListener[] = [];
  private readonly hoverObjectListeners: SelectionListener[] = [];
  private readonly groundTapListeners: GroundListener[] = [];
  private current: Selectable | null = null;
  /** V3.0 PHASE 4 §1.1 — whatever the mouse is currently over, so the
   * listener only fires ON CHANGE (enter/leave), never every mousemove. */
  private hoveredObject: Selectable | null = null;
  /** Reused scratch array for updateHoverObject()'s raycast roots (V3.0
   * PHASE 4 §2.2 — hover fires on every mousemove, far more often than
   * tapAt()'s own per-click `.map()`, so this one specifically is worth
   * not reallocating every call). */
  private readonly hoverRoots: THREE.Object3D[] = [];

  private downX = 0;
  private downY = 0;
  private activePointerCount = 0;
  private candidatePointerId: number | null = null;
  /** When false, taps skip object picking and always report a ground tap. */
  private pickingEnabled = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    /** Supplier so the list can grow/shrink as the game does. */
    private readonly getSelectables: () => Selectable[],
  ) {
    // pointerdown/pointermove (hover) only make sense while the cursor is
    // actually over the 3D world, so they stay canvas-scoped. pointerup/
    // pointercancel move to window (V1.9-D root-cause fix): a tap/drag that
    // started on canvas commonly ends with the button released over a HUD
    // panel — canvas-only listeners never saw that "up", leaving
    // activePointerCount stuck above 0 forever and every later tap
    // misclassified as part of an in-progress multi-touch gesture, so clicks
    // silently stopped selecting anything. The pointerId check already in
    // onPointerUp/onPointerCancel makes listening on window safe for events
    // unrelated to a canvas-started candidate.
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  onSelectionChange(listener: SelectionListener): void {
    this.selectionListeners.push(listener);
  }

  onHover(listener: GroundListener): void {
    this.hoverListeners.push(listener);
  }

  /**
   * V3.0 PHASE 4 §1.1 — fires only when the hovered SELECTABLE OBJECT
   * changes (enter with the new one, then null on leave), mouse only, same
   * gating as onHover's ground raycast. Distinct from onHover, which always
   * reports the ground point regardless of what's under the cursor.
   */
  onHoverObject(listener: SelectionListener): void {
    this.hoverObjectListeners.push(listener);
  }

  onGroundTap(listener: GroundListener): void {
    this.groundTapListeners.push(listener);
  }

  get selected(): Selectable | null {
    return this.current;
  }

  /** Build mode disables object picking so taps go to placement instead. */
  setPickingEnabled(enabled: boolean): void {
    this.pickingEnabled = enabled;
  }

  select(target: Selectable | null): void {
    if (target === this.current) return;
    this.current?.setHighlighted(false);
    this.current = target;
    this.current?.setHighlighted(true);
    for (const listener of this.selectionListeners) listener(this.current);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.selectionListeners.length = 0;
    this.hoverListeners.length = 0;
    this.hoverObjectListeners.length = 0;
    this.groundTapListeners.length = 0;
  }

  // --------------------------------------------------------------- internals

  private onPointerDown = (event: PointerEvent): void => {
    this.activePointerCount += 1;
    if (this.activePointerCount > 1) {
      this.candidatePointerId = null; // gesture, not a tap
      return;
    }
    this.candidatePointerId = event.pointerId;
    this.downX = event.clientX;
    this.downY = event.clientY;
  };

  private onPointerMove = (event: PointerEvent): void => {
    // Hover: mouse only, nothing pressed, no active gesture.
    if (this.activePointerCount !== 0 || event.pointerType === "touch") return;
    const point = this.raycastGround(event.clientX, event.clientY);
    for (const listener of this.hoverListeners) listener(point);
    this.updateHoverObject(event.clientX, event.clientY);
  };

  /**
   * V3.0 PHASE 4 §1.1 — same object-picking raycast tapAt() already does,
   * reused for hover instead of select. Only notifies listeners on an
   * actual enter/leave change, never every mousemove, so the hover-effect
   * toggle in Game.ts stays cheap regardless of how often the mouse moves.
   */
  private updateHoverObject(clientX: number, clientY: number): void {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let found: Selectable | null = null;
    if (this.pickingEnabled) {
      this.hoverRoots.length = 0;
      for (const s of this.getSelectables()) this.hoverRoots.push(s.object);
      const hits = this.raycaster.intersectObjects(this.hoverRoots, true);
      for (const hit of hits) {
        found = findSelectable(hit.object);
        if (found) break;
      }
    }
    if (found === this.hoveredObject) return;
    this.hoveredObject = found;
    for (const listener of this.hoverObjectListeners) listener(found);
  }

  private onPointerUp = (event: PointerEvent): void => {
    this.activePointerCount = Math.max(0, this.activePointerCount - 1);
    if (event.pointerId !== this.candidatePointerId) return;
    this.candidatePointerId = null;

    const moved = Math.hypot(
      event.clientX - this.downX,
      event.clientY - this.downY,
    );
    if (moved > TAP_SLOP) return;

    this.tapAt(event.clientX, event.clientY);
  };

  private onPointerCancel = (): void => {
    this.activePointerCount = Math.max(0, this.activePointerCount - 1);
    this.candidatePointerId = null;
  };

  private onPointerLeave = (): void => {
    for (const listener of this.hoverListeners) listener(null);
    if (this.hoveredObject) {
      this.hoveredObject = null;
      for (const listener of this.hoverObjectListeners) listener(null);
    }
  };

  private tapAt(clientX: number, clientY: number): void {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (this.pickingEnabled) {
      const roots = this.getSelectables().map((s) => s.object);
      const hits = this.raycaster.intersectObjects(roots, true);
      for (const hit of hits) {
        const found = findSelectable(hit.object);
        if (found) {
          this.select(found);
          return;
        }
      }
    }

    // Nothing pickable (or picking disabled) — treat as a ground / cell tap.
    this.select(null);
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpHit)
      ? this.tmpHit.clone()
      : null;
    for (const listener of this.groundTapListeners) listener(point);
  }

  private raycastGround(clientX: number, clientY: number): THREE.Vector3 | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpHit)
      ? this.tmpHit.clone()
      : null;
  }

  private setPointer(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }
}
