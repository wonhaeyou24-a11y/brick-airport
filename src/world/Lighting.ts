import * as THREE from "three";

/**
 * Lighting — the airport's toy-plastic lighting rig (V3.0 PHASE 1 §4),
 * extracted from Game.addLights() into its own module so the lighting
 * pipeline (renderer tone mapping + these two lights) lives in one place.
 *
 * Pure Three.js scene setup, no GameState import, no game logic — exactly
 * like the other world/* modules (Ground, Apron, Grid): construct once,
 * `dispose()` on full teardown.
 *
 * Two lights, matching the existing V1.3-E mobile-aware pattern:
 *   - a HemisphereLight for soft sky/ground fill so nothing is ever pure black
 *   - a DirectionalLight ("sun") casting the actual shadows, at a ~60°
 *     elevation for a clear but not harsh toy-diorama shadow, shadow-map
 *     quality/casting still scaled down on `lowPowerDevice` exactly as
 *     before (spec §22/§26 — same gameplay everywhere, cheaper shadows only
 *     on small/touch devices).
 */
export class Lighting {
  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, lowPowerDevice: boolean) {
    // Sky-blue / grass-green hemisphere fill (spec §4.2) — replaces the
    // previous neutral white/grey hemisphere so ambient fill itself reads as
    // "outdoor daylight" even in fully-shadowed areas.
    this.hemisphere = new THREE.HemisphereLight(0x7ac1eb, 0x3a5d28, 0.8);
    scene.add(this.hemisphere);

    // Sun — intensity 1.8 at roughly 60° elevation (spec §4.2). Position
    // keeps the previous rig's azimuth (light arriving from the same general
    // direction as before, matching the camera's fixed isometric viewDir)
    // so existing shadow placement/readability doesn't flip unexpectedly;
    // only the elevation and intensity change.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
    this.sun.position.set(28, 57, 18);
    this.sun.castShadow = !lowPowerDevice; // spec §22/§26 — shadows off on small/touch devices
    // 2048x2048 on capable devices (spec §4.2's explicit ask); half that on
    // low-power devices — still a step up from the previous 512, since a
    // soft PCFSoftShadowMap (set on the renderer) reads noticeably better at
    // this size without the desktop-only 2048 cost.
    const mapSize = lowPowerDevice ? 1024 : 2048;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    // Covers the fully-expanded 80x80 airport (V1.2-D) with a small margin.
    const s = 42;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    // A touch of bias to avoid shadow acne at the higher map resolution
    // without introducing visible peter-panning at this scene's scale.
    this.sun.shadow.bias = -0.0015;
    scene.add(this.sun);
  }

  dispose(): void {
    this.hemisphere.dispose();
    this.sun.dispose();
    this.sun.shadow.map?.dispose();
    this.hemisphere.removeFromParent();
    this.sun.removeFromParent();
  }
}

/**
 * Apply the V3.0 PHASE 1 §4.1 toy-plastic tone-mapping pipeline to the
 * renderer: ACES Filmic tone mapping at exposure 1.25, plus sRGB output
 * (Three.js r152+ default colour space, set explicitly here so the pipeline
 * doesn't silently depend on the library's own default).
 */
export function applyToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
