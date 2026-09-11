import * as THREE from "three";

/**
 * CameraController — fixed isometric view with zoom + smooth focus.
 *
 * An OrthographicCamera looking down at the airport from a fixed 3/4 angle
 * (SimCity style). Supports mouse-wheel zoom (PC), two-finger pinch zoom
 * (mobile), reset to the default framing, and focusOn() which glides the
 * look-at point toward a selected object. No rotation, no free pan.
 */
const DEFAULT_VIEW_SIZE = 46;
const MIN_VIEW_SIZE = 14;
const MAX_VIEW_SIZE = 95;
const CAMERA_DISTANCE = 120;
/** Default look-at point: biased toward the apron so terminal + runway frame well. */
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 5);
/** Fraction of the remaining focus distance covered per second (via pow). */
const FOCUS_RESPONSE = 0.0025;
/** Stop the glide once this close to the goal (world units). */
const FOCUS_SNAP = 0.04;
/** Screen px a single pointer must travel before it counts as a pan, not a tap. */
const PAN_SLOP = 6;
/** How far past the default pan bound the target may still be dragged (world units). */
const DEFAULT_PAN_MARGIN = 22;

export class CameraController {
  readonly camera: THREE.OrthographicCamera;

  private readonly canvas: HTMLElement;
  private readonly target = DEFAULT_TARGET.clone();
  // Isometric 3/4 view from the apron side, looking toward the terminal.
  private readonly viewDir = new THREE.Vector3(1, 0.92, -1).normalize();

  private viewSize = DEFAULT_VIEW_SIZE;
  /** The size `reset()` returns to — normally DEFAULT_VIEW_SIZE, widened after an airport expansion (V1.2-D). */
  private homeViewSize = DEFAULT_VIEW_SIZE;
  private aspect = 1;

  /** Non-null while a focus glide is in progress. */
  private focusGoal: THREE.Vector3 | null = null;
  /** Non-null while the camera is continuously tracking an object. */
  private followObject: THREE.Object3D | null = null;
  private readonly tmpFollow = new THREE.Vector3();

  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 0;
  private pinchStartViewSize = 0;

  /** Ground-plane axes matching the fixed isometric viewDir — precomputed once,
   *  since this project never rotates the camera (spec §11). */
  private readonly panRight: THREE.Vector3;
  private readonly panForward: THREE.Vector3;
  /** How far the target may be dragged from the origin (world units); grows
   *  with airport expansion via setPanBounds() (spec §10). */
  private panBoundHalf = DEFAULT_VIEW_SIZE / 2 + DEFAULT_PAN_MARGIN;

  /** Single-pointer drag-to-pan state (spec §9-2/§9-4). */
  private panPointerId: number | null = null;
  private panLastX = 0;
  private panLastY = 0;
  private panMoved = 0;

  constructor(canvas: HTMLElement, width: number, height: number) {
    this.canvas = canvas;
    this.aspect = width / Math.max(1, height);

    // Ground-plane pan basis derived from the fixed viewDir (spec §9-2): drag
    // right/left slides the target along `panRight`, drag up/down slides it
    // along `panForward` — both already lie flat on the XZ plane because
    // viewDir has no roll relative to world-up.
    const forward = this.viewDir.clone().negate();
    this.panRight = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    this.panForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.updateFrustum();
    this.applyTransform();

    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  /** Called on window resize. */
  setViewportSize(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.updateFrustum();
  }

  /** Multiply the visible area by `factor` (>1 zooms out, <1 zooms in). */
  zoomBy(factor: number): void {
    this.viewSize = THREE.MathUtils.clamp(
      this.viewSize * factor,
      MIN_VIEW_SIZE,
      MAX_VIEW_SIZE,
    );
    this.updateFrustum();
  }

  /** Return to the default framing and zoom (cancels focus / follow). */
  reset(): void {
    this.focusGoal = null;
    this.followObject = null;
    this.viewSize = this.homeViewSize;
    this.target.copy(DEFAULT_TARGET);
    this.clampTarget();
    this.updateFrustum();
    this.applyTransform();
  }

  /**
   * Widen (or restore) the framing `reset()` returns to, e.g. after an
   * airport expansion so "reset view" still shows the whole airport
   * (spec §D.9). Reuses reset()/focusOn() as the only camera entry points —
   * no new camera mode.
   */
  setHomeViewSize(viewSize: number): void {
    this.homeViewSize = THREE.MathUtils.clamp(
      viewSize,
      MIN_VIEW_SIZE,
      MAX_VIEW_SIZE,
    );
  }

  /**
   * How far the target may be panned from the origin (spec §10) — grows with
   * airport expansion. Never hard-coded to the starting 48x48 grid; Game
   * calls this with the current expansion tier's half-size whenever it
   * changes (same call site as setHomeViewSize).
   */
  setPanBounds(halfExtent: number): void {
    this.panBoundHalf = Math.max(0, halfExtent) + DEFAULT_PAN_MARGIN;
    this.clampTarget();
  }

  /** Start gliding the view so `position` moves toward screen centre. */
  focusOn(position: THREE.Vector3): void {
    this.followObject = null;
    this.focusGoal = new THREE.Vector3(position.x, 0, position.z);
  }

  /**
   * Continuously keep `object` near screen centre (e.g. a selected aircraft).
   * Pass null to stop following. Foundation for a full follow mode (spec §23).
   */
  followTarget(object: THREE.Object3D | null): void {
    this.followObject = object;
    if (!object) this.focusGoal = null;
  }

  /** Per-frame: advance focus glide / follow tracking. Called from the loop. */
  update(deltaTime: number): void {
    const t = 1 - Math.pow(FOCUS_RESPONSE, deltaTime);

    if (this.followObject) {
      this.tmpFollow.set(
        this.followObject.position.x,
        0,
        this.followObject.position.z,
      );
      this.target.lerp(this.tmpFollow, t);
      this.applyTransform();
      return;
    }

    if (!this.focusGoal) return;
    this.target.lerp(this.focusGoal, t);
    if (this.target.distanceTo(this.focusGoal) < FOCUS_SNAP) {
      this.target.copy(this.focusGoal);
      this.focusGoal = null;
    }
    this.applyTransform();
  }

  dispose(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.activePointers.clear();
  }

  // --------------------------------------------------------------- internals

  private updateFrustum(): void {
    // Keep a consistent span visible on the *shorter* screen axis, so the
    // airport stays framed in both landscape and portrait.
    const half = this.viewSize / 2;
    const halfW = this.aspect >= 1 ? half * this.aspect : half;
    const halfH = this.aspect >= 1 ? half : half / this.aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private applyTransform(): void {
    this.camera.position
      .copy(this.target)
      .addScaledVector(this.viewDir, CAMERA_DISTANCE);
    this.camera.lookAt(this.target);
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // A horizontal component is essentially unique to a trackpad two-finger
    // swipe (a physical mouse wheel never reports deltaX) — route it to pan
    // (spec §9-5) without touching the vertical zoom behaviour at all.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.panByPixels(event.deltaX, 0);
      return;
    }
    const factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
    this.zoomBy(factor);
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2) {
      this.pinchStartDistance = this.currentPinchDistance();
      this.pinchStartViewSize = this.viewSize;
      // A second pointer landed — this is now a pinch, not a pan.
      this.panPointerId = null;
      return;
    }

    // One pointer down: a candidate for drag-pan. Mouse only pans on the
    // left button (spec §9-2); touch always qualifies (spec §9-4). The
    // actual pan only starts once movement clears PAN_SLOP, so a plain
    // tap/click still reaches SelectionManager untouched (spec §9-2's own
    // click-vs-drag requirement — already satisfied by SelectionManager's
    // existing TAP_SLOP logic; this just avoids nudging the camera on a tap).
    if (event.pointerType !== "touch" && event.button !== 0) return;
    this.panPointerId = event.pointerId;
    this.panLastX = event.clientX;
    this.panLastY = event.clientY;
    this.panMoved = 0;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2 && this.pinchStartDistance > 0) {
      const distance = this.currentPinchDistance();
      if (distance > 0) {
        const scale = this.pinchStartDistance / distance;
        this.viewSize = THREE.MathUtils.clamp(
          this.pinchStartViewSize * scale,
          MIN_VIEW_SIZE,
          MAX_VIEW_SIZE,
        );
        this.updateFrustum();
      }
      return;
    }

    if (this.panPointerId !== event.pointerId) return;
    const dx = event.clientX - this.panLastX;
    const dy = event.clientY - this.panLastY;
    this.panLastX = event.clientX;
    this.panLastY = event.clientY;
    this.panMoved += Math.hypot(dx, dy);
    if (this.panMoved <= PAN_SLOP) return; // still within tap tolerance
    this.followObject = null;
    this.focusGoal = null;
    this.panByPixels(dx, dy);
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) this.pinchStartDistance = 0;
    if (event.pointerId === this.panPointerId) this.panPointerId = null;
  };

  private currentPinchDistance(): number {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  /** Translate the target by a screen-space pixel delta (drag or trackpad swipe). */
  private panByPixels(dxPixels: number, dyPixels: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const worldPerPixelX = (this.camera.right - this.camera.left) / Math.max(1, rect.width);
    const worldPerPixelY = (this.camera.top - this.camera.bottom) / Math.max(1, rect.height);
    // "Grab the ground and drag" feel: the point under the cursor follows it.
    this.target
      .addScaledVector(this.panRight, -dxPixels * worldPerPixelX)
      .addScaledVector(this.panForward, dyPixels * worldPerPixelY);
    this.clampTarget();
    this.applyTransform();
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -this.panBoundHalf, this.panBoundHalf);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -this.panBoundHalf, this.panBoundHalf);
  }
}
