# Stages and circuits

The menu now separates the world theme (stage) from the road layout (circuit). All three stages contain both layouts. Changing stage keeps the layout and selected car; changing circuit selects the other layout in that stage. Either action starts a new sprint and preserves the other URL options.

| Stage | Circuit card | Race identity / existing-compatible URL |
| --- | --- | --- |
| Cyberpunk | Neon District | Neon District / `?circuit=neon` |
| Cyberpunk | Kairo Loop | Kairo Loop / `?circuit=kairo` |
| Solarpunk | Neon District | Neon Solar / `?circuit=neon-solar` |
| Solarpunk | Kairo Loop | Kairo Solar / `?circuit=solar` |
| Steampunk | Neon District | Neon Steam / `?circuit=neon-steam` |
| Steampunk | Kairo Loop | Kairo Steam / `?circuit=steam` |

Links such as `?stage=solarpunk&circuit=neon` and `?stage=steampunk&circuit=kairo` also work. An explicit valid stage selects the corresponding version of the circuit's layout. Unknown circuit IDs retain the original Neon fallback; unknown stages leave circuit selection alone. Each combination keeps its own circuit ID for personal bests and replay/export filenames, preserving the existing four IDs and storage keys.

## Ported scenery and geometry

Neon Solar uses the Solar garden city, glazed and planted buildings, turbines, dirigibles, civic landmarks, bright sky and dry roads. Neon Steam uses the Steam city kit, foundries, copper domes, market halls, gas lanterns, machinery, dirigibles and visible chimney/pressure steam. The ports reuse locally authored procedural geometry, materials, and existing car assets; no generated/downloaded assets were needed.

Both District ports share the original authored points, banking function, elevation function and sector fractions. Their complete sampled position/normal/right vectors must match the original District, including the banked turns. Kairo retains its figure-eight crossing and flyover; those structures are never placed on the District layout.

The District tunnel remains at 30.5–39.3% of the lap with 7.2 m clearance. Solar has a planted-roof garden underpass and pale fixtures. Steam has copper service mains, iron support ribs and warm lighting in the foundry passage. The shell participates in camera obstruction handling and road ambient occlusion; tunnel audio transitions also apply to both ports. The ports are dry, including their open sections. Raised Kairo bridge planters are excluded from District banking, and roadside trees/lamps sit on the city ground there.

HUD identity, atmospheric fog, tone mapping, road/wall materials, weather, Shinsei sponsor plates, race boards and trackside signs follow stage plus circuit. The two circuit cards show layout names, distance and corner count; stage and circuit controls have explicit selected states and work with mouse, keyboard and touch. The start/resume footer remains sticky in the menu scroll container.

## Implementation

- `src/game/track/circuits.ts`: stage/layout metadata, all six circuit definitions, registry helpers, compatible URL resolution.
- `src/main.ts`, `src/styles.css`: stage selector above the two circuit cards, shared navigation and responsive states.
- `src/game/Environment.ts`, `src/game/Game.ts`: route world, weather, lighting and materials by stage; route bridge/tunnel behavior by layout.
- `src/game/StageTunnel.ts`: two themed District tunnels, using the original clearance/profile.
- `src/game/track/TrackBuilder.ts`, `Trackside.ts`, `src/systems/Hud.ts`, `src/entities/SolarLivery.ts`, `SteamLivery.ts`: themed race surfaces, signage and vehicle/HUD identity.
- Solar/Steam environment and sky-life factories: layout-aware placement and circuit-specific branding.

## Verification

- `scripts/verify-stages.mjs`: desktop 1440×900 and touch mobile 390×844; both new ports; stage/card count and text fit; environment identity; 12 corners and 3.744 km; correct tunnel shell, 7.2 m clearance and audio transition; dry weather; no Kairo flyover; screenshots at start, banked turns, tunnel approaches/interior and later sectors. First full run passed all four combinations with no browser errors.
- `tests/stages.spec.ts`: all six definitions, exact layout/profile/sample equality, old and stage-aware links, stage switching that preserves car/layout/options, within-stage circuit switching, independent lap records, desktop/mobile menu fit and selection states.
- `tests/steam-selection.spec.ts`: updates existing Solar-to-Steam navigation coverage to use the stage selector.
- `tests/neon.spec.ts`: both ports join the existing real-input driving, braking, AI/audio, camera, pause, restart, vehicle-switch and quality-preset checks.
- `npm run build` passes with the existing large-bundle advisory.

Screenshots and scene/renderer observations: `artifacts/stages/`. New port menu files show stage/circuit hierarchy; `desktop-neon-solar-0.12.png` shows the banked garden-city turn; `desktop-neon-steam-0.34.png` shows the foundry tunnel. Active driving evidence is under `artifacts/qa/{desktop,mobile}/{neon-solar,neon-steam}/` after production QA. Browser mobile emulation is not a physical-device FPS measurement.

Visual assessment for this scope: theme consistency 2/3, world integration 2/3, UI hierarchy 2/3, responsive fit 2/3. Established stylized procedural assets are reused; no photorealistic/premium claim. The additional tunnel architecture is intentionally simpler than the original night megablock, while preserving the playable underpass.

Renderer counters from the multi-position visual run (including shadow/post passes):

| Port | Desktop calls / triangles | Mobile calls / triangles |
| --- | --- | --- |
| Neon Solar | 814–1,873 / 2.34–6.33m | 689–2,654 / 2.07–9.40m |
| Neon Steam | 590–1,308 / 0.48–1.08m | 649–1,255 / 0.49–1.21m |

These camera-dependent counts are observational, not FPS targets. The Solar environment remains the heavier existing foliage kit; physical-phone performance has not been measured.

Production QA completed: 12 tests passed in 7.4 minutes with `npx playwright test tests/neon.spec.ts tests/stages.spec.ts tests/steam-selection.spec.ts --grep 'neon-solar loads|neon-steam loads|neon loads|each stage|stage navigation|Steam can'`. This covers the original District and both ports on desktop/mobile, exact layout equality, stage/circuit selection, car/URL preservation, independent best laps, and compatibility of the existing Solar/Steam routes. A final cosmetic follow-up replaces the remaining fixed Kairo wording on Solar landmark signs with the selected circuit name.

Final build and refreshed visual verification passed after the sign/prop corrections. All four desktop/mobile port combinations reported zero browser errors. `git diff --check` passed.
