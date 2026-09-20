# Neon city coverage and tunnel acoustics

20 September 2026. Follow-up to the owner's comparison of plain filler buildings with a dense cyberpunk city reference.

## Visual changes

The previous detailed facade kit covered only a third of the street buildings. This pass applies modeled galleries to all qualifying street-facing building sections, including side and rear elevations. Nearby background sections also receive the kit at a coarser scale. The distant city uses multi-part masses, asymmetric shafts, stepped roofs, projecting structural bands, equipment and utility spines.

Window bay width, floor spacing, opening height, occupancy, shutters and interior treatments vary. Occupancy and emission were reduced after review to avoid giant bright office panels dominating the street. Larger advertisements now face the circuit from selected middle-distance towers, with frames mounted to the appropriate section.

The existing Blender kit is retained and placed at both banked turns as well: 18 buildings, eight connected bridges, 32 service cables and 54 vent plumes. No new third-party assets or reference-image pixels were imported. Native models remain in `assets/neon/neon-landmarks.blend`.

Street fixtures have poles, brackets, luminous heads and low marker lights. The two existing moving point lights now occupy the nearest real fixtures outdoors, while retaining their tunnel-light positions indoors. Local fog scattering was reduced to preserve facade contrast, with denser haze farther down the street.

Sources: `NeonEnvironment.ts`, `NeonArchitecture.ts`, `NeonCityMaterials.ts`, `NeonLandmarks.ts`, `NeonStreetLife.ts`, `NeonAtmospherePass.ts`, `NeonWetRoad.ts`.

## Rendering cost and limits

The first broad pass contained 61,438 room planes and 149,865 detail instances. Coarser middle-distance bays reduced this to 18,404 room planes and 63,409 instances. Structural colours share a material; spatial batches allow frustum rejection. The kit's `buildings` diagnostic counts facade sections, not separate addresses (481 sections).

The wet reflection retains building masses, landmark models, signs and lights, and omits the tiny facade fittings from its second scene submission. No new dynamic point lights or shadows were added. The final landmark regression views reported approximately 1.69–2.02 million submitted triangles and 774–920 calls across the full rendering pipeline. The added architecture costs more than the previous sparse city; these are headless Chrome counters, not a claimed M4 frame-rate benchmark.

This is a broader modeled city, not a claim of matching the concept image's photorealistic materials, scale or lighting. Selected large signs, repeated kit parts and simple far-distance surfaces remain visible. Focused visual assessment: world coverage 1→2, material variety 1→2, lighting composition 1→2 on the 0–3 graphics skill scale. No full-game premium/showcase claim is made.

## Tunnel engine audio

The previous tunnel response was a quiet 0.24-second convolution applied to the common spatial bus. The new engine-only send preserves the direct engine while adding four early reflections at 52, 107, 176 and 263 milliseconds, with a 9-millisecond stereo offset and a damped 1.35-second impulse. A 170 Hz high-pass and existing 3.9 kHz low-pass keep the effect from becoming boomy or hissy. The wet gain approaches 0.32 only inside the tunnel, and the send/return fade smoothly through portals.

The shared Neon/Monaco tunnel envelope drives the effect. Weather, hologram and music sources are not fed into the new engine reverb. Pause and mute retain the master controls. No generated or downloaded audio asset was required.

## Verification

- `node scripts/verify-neon-city.mjs`: seven hood-camera views (including both banked turns), actual keyboard acceleration, no browser errors; actual game updates before/inside/after the tunnel; audio diagnostics; offline impulse rendering; mute and pause.
- Wet return: 0 outdoors, 0.319 in the tunnel, 0.00079 after leaving. Rain exposure: 1 → 0 → 1. Loop source count remains 20 throughout.
- Offline reverb impulse: 1.35 seconds, peak 0.522, non-zero tail energy after 0.4 seconds and no energy after 1.5 seconds.
- `node scripts/verify-neon-landmarks.mjs`: all 16 bridge endpoints enter adjacent building bounds; minimum measured road clearance 24.22 metres; minimum lower-building vertex distance from track centre 15.16 metres. Actual acceleration and console checks pass.
- Mobile production-preview cockpit rendering and acceleration checked at 390×844.
- TypeScript and production Vite build pass; the existing main-bundle size warning remains.

Evidence: `artifacts/neon/city-coverage/` for driving views, diagnostics and audio results; `artifacts/neon/blender-landmarks/` for geometry checks; `artifacts/neon/architecture/mobile-cockpit.png` and `mobile.json` for mobile. These local QA artifacts are ignored by Git.
