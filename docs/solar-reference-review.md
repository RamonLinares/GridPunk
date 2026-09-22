# Solar reference visual review

The circuit was iterated against the user-supplied Kairo Solar racing reference. This is an implemented, playable visual revision, with a remaining fidelity gap to the reference's photorealism. No generated background image substitutes for the 3D circuit.

## Source and integration evidence

- Existing owner-authored `public/cars/shinsei/shinsei-nd01.glb` retained. `src/entities/SolarLivery.ts` adds wing sponsors, rear number panels and lamps, and adjusts the Solar player's materials.
- `src/game/SolarVegetation.ts`: new seeded canvas leaf atlas, individual cut-out leaf sprays, branching trunks, shrubs and hanging vines. Shared resources with 128 m spatial batches.
- `src/game/SolarEnvironment.ts`: glazed and planted buildings, rounded plaster slabs, balcony rails and mullions, small flowers, spectator bodies/heads, three planted pedestrian links, tapered turbine blades, triangulated and procedurally textured mountain ranges. 192 m architecture batches; authored flower/head elevations are protected from generic ground snapping.
- `src/game/SolarSurfaces.ts`: world-scaled asphalt grain, aggregate and surface variation composed with the existing cascade shadow shader.
- Solar-only ACES lighting/grade, shadow fill, restrained bloom, leaf identity, gold timing and green HUD accents. Night circuit appearance is not intentionally changed.
- No external assets were downloaded or generated through paid providers. Existing geometry, procedural assets and printed graphics were selected for editability and compatibility with the current runtime.

## Iteration evidence

Initial browser inspection showed solid polygon crowns, green wall rectangles, block flowers, plain facades and excessively dark road shadows. Subsequent browser checks drove the leaf-card replacement, balcony depth, smaller flower clusters, protected head elevations, warm daylight tuning, bridge composition, and mountain surface detail.

- [Corner, quality rendering](../artifacts/solar-reference/desktop-corner.png)
- [Second district, final quality rendering](../artifacts/solar-reference/desktop-garden-district.png)
- [Desktop driving test](../artifacts/qa/desktop/solar/driving.png)
- [Mobile driving test](../artifacts/qa/mobile/solar/driving.png)
- [Desktop diagnostics](../artifacts/qa/desktop/solar/results.json)
- [Mobile diagnostics](../artifacts/qa/mobile/solar/results.json)

## Validation

- `npm run build`: passed. Existing large JavaScript bundle warning remains.
- `npx playwright test tests/neon.spec.ts --grep 'solar loads'`: both desktop and mobile passed. Real driving input, braking, pause/resume, restart, recovery, car switching, graphic modes, nonblank canvas and responsive bounds were checked. Reports contain no console/page errors or missing assets.
- Final decorative rear panels and mountain shader were subsequently built and inspected in the live quality render, with no browser errors.
- `git diff --check`: passed.

The measurements below come from the smoke test's **performance preset**, at DPR cap 0.8, without shadows or post-processing. Mobile is a desktop browser's touch viewport emulation, not a physical phone. Quality screenshots were visually inspected; these figures do not establish quality-preset frame rate.

| Viewport | FPS sample | Median / p95 frame time | Draw calls | Triangles | Geometries / textures |
|---|---:|---:|---:|---:|---:|
| desktop | 55 | 16.7 / 20.5 ms | 833 | 2,362,768 | 204 / 78 |
| mobile | 60 | 16.6 / 18.2 ms | 749 | 2,173,108 | 205 / 78 |

Solar quality rendering uses three cascades at 2048 resolution and the shared tiered shadow caster system. Final decorative lamps/panels add six visible meshes and one texture to the recorded test snapshot. All generated leaf and glazing textures participate in environment disposal; car textures participate in the existing model disposal.

## Visual scorecard

Scores describe the current browser game, not equivalence to a photographic reference.

- Art direction: before 1 / after 2 — coherent Solar architecture, vegetation, sponsors and HUD.
- Hero/player: before 2 / after 2 — existing authored prototype with Solar wing and rear branding; underlying mesh remains visibly stylized.
- Obstacles/enemies: before 2 / after 2 — existing rival cars, kerbs and barriers retained; driving verified.
- Rewards/interactables: N/A — this circuit task has no collectible system.
- World/environment: before 1 / after 2 — planted terraces, leaf silhouettes, bridges and layered skyline; repeated facade modules remain apparent.
- Materials/textures: before 1 / after 2 — glazing, leaf cutouts, road aggregate, sponsor graphics and mountain grain.
- Lighting/render: before 1 / after 2 — cascaded sunlight, neutral fill, blue sky, distance haze, restrained bloom.
- VFX/motion: before 2 / after 2 — existing driving feedback retained, turbines animated.
- UI/HUD: before 2 / after 2 — responsive racing HUD with Solar identity and gold timing.
- Performance evidence: before 1 / after 2 — build, desktop/mobile active-driving captures, diagnostics and browser errors checked; quality frame-time profiling remains outstanding.

Average: 2.0 over nine applicable categories. No premium/AAA/showcase or photoreal-match claim.

Remaining reference gaps: building silhouettes are still modular; spectator detail is simplified; the existing prototype's body geometry and baked material detail differ substantially from the reference; vegetation is procedural cutout foliage rather than scanned assets. The next fidelity pass would require distinct authored architectural modules and a higher-detail hero vehicle/material pass, plus quality-mode performance profiling. The present revision reproduces more of the reference's visual language but is not a pixel or photorealistic match.
