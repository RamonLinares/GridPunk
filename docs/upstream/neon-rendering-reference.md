# Neon rendering: source inspection and implementation

Inspected 19 September 2026: Dreamatron's publicly served Neon Signal application bundle and authored scene JSON, reached from https://www.dreamatron.ai/?launch=neon. The reference's public entry point was `https://www.dreamatron.ai/scene-builds/neon-signal/entry-c9c6b68e3be3032a.html?embed=1&portrait=1&backend=webgpu&settings=authored&entry=host`.

Public source inspected: [application bundle](https://www.dreamatron.ai/scene-builds/neon-signal/assets/index-dWUgXuj3.js) and [authored scene](https://www.dreamatron.ai/scene-builds/neon-signal/data/scenes/neon-city.scene.json).

This record distinguishes source facts from interpretation. These are the published scene settings and code paths, not a claim that every visitor's browser runs the same overrides or backend. No reference source, shader body or assets are shipped in Gridbound.

## What the source confirms

- The `CityFog` controls are connected to a custom volumetric implementation, not simply Three.js `FogExp2`. Its WebGL shader and node-renderer equivalents sample along the eye-to-surface ray, integrate extinction and scattering, add height-dependent cloud layers and low mist, and include light from the landmark portrait screen and tower crown. The code has 24 desktop samples, 8 mobile samples, a 260 m integration cap, primitive building exclusion volumes and a rain-density field. Fog tint is `#197ca8`.
- The authored `CityFog` component sets density 0.01, softness 6.5, illumination 1.36, ground mist 2.47, rain 2. These override some bootstrap defaults, which is why reading only the default values would be misleading.
- Tone mapping: AgX, exposure 1. Colour grade: exposure 0.95, contrast 1.025, saturation 1.1, gamma 0.93. The source does **not** support a diagnosis of simply reducing global contrast.
- Bloom: strength 0.83, radius 0.48, threshold 0.85.
- Temporal anti-aliasing enabled; velocity motion blur enabled, eight samples, strength 0.5, maximum velocity 0.035. Tilt shift is disabled in the scene configuration.
- The enabled VHS treatment has strength 0.83, chroma bleed 0.72, scanlines 0.37, noise 0.14, tracking 0.5 and wobble 0.42. The implementation separates colour channels horizontally and modulates scanline/noise/tracking terms. This is an intentional stylized video image, not just realistic PBR shading.
- Lens distortion 0.035; film grain 0.016, size 1.75; radial chromatic aberration 0.25. SSR is enabled with intensity 0.8, max distance 160, roughness cutoff 0.7 and blur.
- Detailed authored models, layered signage, street activity, rain and directed camera movement remain important parts of the result; post-processing cannot reproduce their geometry.

## Changes in Gridbound

`NeonAtmospherePass` is an independently written, bounded screen-space volumetric integration with eight samples at 40% resolution. It reconstructs the visible surface from scene depth and integrates three height regions with slow spatial variation and coloured radiance from actual billboard positions. It stops at the visible surface and leaves the first 12 m clear. Scattering and transmittance are composited without clearing scene colour or writing scene depth. It does not copy Dreamatron's shader, cloud functions, coordinates or building exclusion model.

`NeonFrameDepthPass` preserves packed scene depth in a separate target. This avoids sampling a depth attachment while the composer writes to that same target later. The Neon grade reconstructs world position, projects it through the previous camera matrix and uses that displacement for shutter blur. Nearby car geometry and discontinuities are protected; camera changes, projection resize and large jumps reset history. This is camera-motion blur, not a complete per-object velocity buffer.

Neon now uses AgX and the reference's published bloom parameters. Its grade adds bounded barrel distortion, softer horizontal colour bandwidth, subdued scanlines and slight shadow lift. The HUD remains outside the post pipeline. Reflection distortion and roughness reduce the earlier mirror-like road. Building/window emission is quieter so large displays and practical lights have a clearer hierarchy.

SMAA and the existing low-resolution planar street reflection remain in use. Full TAA, SSR, strong tracking wobble and per-object velocity blur were not imported or claimed. These are deliberate limits for an interactive six-car race; this revision is not a claim of visual parity with the reference.

## Verification

A/B screenshots with atmosphere enabled and disabled, a moving race frame, all four cameras, map-view behaviour and a daylight-circuit regression are recorded under ignored `artifacts/neon/cinematic/` and `artifacts/neon/`. The new regression script is `scripts/verify-neon-cinematic.mjs`.

The first volume implementation cleared the existing colour buffer during compositing. Visual inspection caught the silhouette-only output; the pass now preserves and restores `renderer.autoClear` and blends onto the existing image. Subsequent visual and console checks passed. Camera-cut blur is zero, the map disables the volume, and Montmeló allocates neither the atmosphere nor motion-depth passes.

Performance and final production checks are recorded below after optimization. No reference-equivalence or 10/10 score is claimed.

Final development check at 1600 × 1000, DPR 1, High: volume target 640 × 400, packed-depth target 1600 × 1000, 546 draw calls, approximately 1.34 million triangles. A warmed-up 180-frame sample measured median 30.5 ms / p95 36.5 ms after reducing the volume from ten half-resolution samples to eight at 40% resolution (first measured pass: median 34.6 ms / p95 41.4 ms). This remains heavier than the preceding simpler renderer and is not a 60 FPS guarantee. Separate GPU timing showed roughly 16 ms for a complete rendered frame in one stationary sample; timings varied across sequential tests, so no precise per-effect saving is claimed. Performance mode bypasses the composer and uses ordinary distance fog.

The final cinematic regression passed with no page/console errors: real acceleration reached 42 m/s, motion blur was enabled during movement, camera-cut blur was zero, map fog and blur were disabled, and Montmeló retained its normal fog with neither new pass allocated. All four camera views and Performance mode also rendered without errors. Implementation and game artwork remain original to Gridbound except for the credited libraries; the public reference bundle and scene JSON remain outside the repository.

Production build passed. Production desktop (1440 × 900, Auto) and touch-emulated mobile (390 × 844) passed race entry, acceleration, full stop, pause/resume, visible canvas-content and overflow checks with no console/page errors or failed resources. Desktop Auto sample: median 24.8 ms, p95 31.8 ms, balanced level retained. Touch-emulated sample: median 17.3 ms, p95 24.5 ms; this is not a physical-phone benchmark.
