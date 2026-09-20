# Neon Extreme graphics preset

20 September 2026. Opt-in preset available only in Neon District's session/pause menu. Its saved preference is separate from the daylight circuits. Auto never selects Extreme. Existing Performance, Auto and Quality settings remain available.

## Source and scope

Based on the publicly inspected Dreamatron configuration recorded in [neon-rendering-reference.md](neon-rendering-reference.md). A fresh web-tool request for its authored scene was unavailable in this turn; no claim of a fresh successful source retrieval. All new shaders are independently implemented, with no copied reference code or assets. This adds the major deferred rendering techniques, not the reference's scene geometry or a claim of identical output.

| Effect | Quality | Extreme |
| --- | --- | --- |
| Tone mapping | AgX | AgX, plus display-space exposure/contrast/saturation/gamma grade |
| Volumetric fog | 8 samples, 40% resolution, 4 nearby emitters | 24 samples, 65% resolution, 8 emitters, additional spatial density detail |
| Antialiasing | SMAA | Eight-position Halton jitter with motion reprojection, neighborhood clipping and depth-based history rejection |
| Motion blur | Camera-derived velocity, protects near geometry | Camera plus rigid car-part/skytrain motion; 8 taps, frame-time-normalized shutter, silhouette rejection, 0.035 UV velocity cap |
| Street reflections | 512×320 planar fallback | 1024×640 planar fallback with facade detail, plus half-resolution screen-space wet-road ray tracing (32 steps, 5 hit refinement steps, 160 m limit); shared world-space puddles and rough patches break up reflections |
| Ambient occlusion | Half resolution | 75% resolution |
| Video treatment | Subtle linear-space colour bleed/grain | Display-space YIQ chroma bleed, subdued scanlines, exposure-dependent fine/coarse grain, gentle peripheral softness, radial chromatic aberration and static barrel distortion; no tracking wobble or travelling band |
| DPR cap | 1.25 | 1.5 |

The HUD is DOM-rendered and remains crisp. Reflections use the road's existing wetness mask, including banks; the tunnel stays dry. Offscreen reflection rays fade to the planar fallback. Moving particles and instanced flying traffic use camera reprojection, not individual velocity history. This is selective road SSR, not path tracing or reflections on every city material. Fog remains bounded screen-space integration rather than a full world-volume simulation with building exclusion volumes.

Extreme resources are allocated lazily and disposed when leaving the preset. Camera switching, resize, recovery, large jumps, pause/resume and preset changes reset history. Map view disables temporal jitter, motion, SSR, tape and volume effects and uses SMAA. Switching away restores the previous reflection dimensions, fog sampling and antialiasing policy.

## Stable optics and surface refinement

Removed all animated image-coordinate distortion and the travelling tracking stripe at the user’s request. Film grain still animates, but does not displace the picture. Reduced regular scanlines, used two grain scales with exposure-dependent strength, and reused existing chroma samples for slight peripheral softness. A modest static corner falloff retains the clear centre and DOM HUD.

Extreme’s planar and screen-space reflections now share metre-scale irregular puddle coverage. Rough areas scatter highlights more broadly, while small irregular motion disturbs only reflected light. The geometry, handling and tunnel wetness mask are unchanged. No extra render targets or passes were added. These refinements do not solve the remaining repetition in city geometry or establish visual parity with the reference.

## Verification

- Isolated optical shader check: a fixed striped image retained identical edge positions across five rows at four different animation times (maximum displacement 0 pixels).
- Production TypeScript/Vite build passed; existing large-bundle advisory remains.
- `node scripts/verify-neon-extreme.mjs`: passes real acceleration (41.71 m/s), active moving-object buffer (198 mesh proxies), camera-cut zero blur/zero history weight, map exclusions, resize and 390×844 menu access, preset resource disposal, persisted Neon preference and Montmeló isolation. No console/page errors.
- Inspected matched Quality/Extreme frames, a moving frame, bank, tunnel, koi approach and mobile menu under `artifacts/neon/extreme/`.
- Browser checks found and fixed a depth-lifetime issue: SSR's composer swap cleared an attachment still used by fog. Fog now reads the preserved packed scene depth, independent of composer target reuse.
- Reflection target readback: 35,939 contributing pixels at lap fraction .07 (maximum weight .379); zero contributing pixels at tunnel fraction .35.
- Short local Chrome 1440×900 DPR 1 stationary comparison, 90 measured frames after warmup: Quality median 33.4 ms / p95 50.1 ms, 485 draws, 1.20M triangles; Extreme median 50 ms / p95 66.7 ms, 748 draws, 1.65M triangles. Textures 133 → 138, geometries unchanged at 321. Other browser/GPU activity was not isolated; these are not a full-lap or physical-device performance guarantee. Extreme is intentionally a substantially heavier option.

## Delivery

Available in the local development build. Publication remains pending the explicit upload approval requested after the previous billboard/koi change; no retry or alternate upload path was used to bypass that rejection.
