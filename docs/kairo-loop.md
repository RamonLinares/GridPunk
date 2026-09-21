# Kairo Loop

Choose **Kairo Loop** in the session menu, or open `/?circuit=kairo`. Neon District remains the default; unknown legacy circuit IDs fall back to Neon. Changing circuit starts a fresh sprint and preserves other URL options. Lap bests and replay records use the circuit ID.

The centerline and 18 corner markers were adapted from the owner’s `montmelo/montmelo-circuit` reference project. That reference credits OpenStreetMap contributors (ODbL) for the mapped horizontal centerline. The derived coordinates are included in this repository, and runtime attribution is in `public/credits.html`.

This is a city adaptation of the layout. Survey elevations are flattened to the city floor, with a smooth 8 m flyover at the figure-eight’s upper crossing. Horizontal coordinates are uniformly scaled by 1.000437333351 to retain the game’s 5.807 km timing convention. The reference’s sector fractions and corner order are retained. The flyover has approximately 180 m approach ramps, a concrete underside, and piers outside both racing corridors.

Both circuits reuse the existing arcade vehicle physics and fixed-step race loop. Kairo enables route-height selection for tyres, surface effects and shadows, and separate-deck filtering for car contacts and AI traffic. Neon’s authored banks and tunnel remain exclusive to Neon District. City buildings follow the entire new loop, and the skyline bounds expand to encompass it.

## Verification — 21 September 2026

- `npm test`: production build and all six Chrome tests passed. Both circuits were checked at 1440 × 900 and 390 × 844 with keyboard/touch acceleration, braking, camera, recovery, pause, restart, car changes, and extreme/cinematic settings. No browser or HTTP errors.
- `node scripts/verify-kairo-loop.mjs` with the dev server running: circuit switching preserves car selection; both viewports render a varied canvas without horizontal overflow. The geometric crossing has 8 m deck separation; repeated tyre contact stays at 0.04 m and 8.04 m, with no inter-deck car contact or timing jump.
- Six-car simulation using `CIRCUIT=kairo npm run verify:race`: the layout completed two valid laps per car in 280.63 simulated seconds, with no wall strikes, off-road time or stopped time. This run uses the fixed Rookie handling setup and Sport rival pace.
- Visual review: desktop/mobile garage and driving frames, flyover approach, and top-down road layout. Generated evidence lives in `artifacts/kairo/` and `artifacts/qa/{desktop,mobile}/kairo/` (ignored by Git).
- The source, public files, documentation, filenames and production bundle were checked for the excluded venue name, with no matches.

Mobile validation uses Chrome touch emulation. The existing Vite large-chunk warning remains; no physical-phone performance or full replay-export audit was performed.
