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

## Higher Still observation wheel

Kairo alone has a 198 m diameter Ferris wheel beyond the opening straight’s first turn. Dark steel A-frame supports, crossed tension spokes, twin pink illuminated rims, 32 enclosed gondolas and a stationary HIGHER STILL hub sign take visual cues from the owner-provided city reference. The model is authored in Three.js; no pixels from the reference image are shipped.

The wheel turns once every nine minutes, with gondolas counter-levelled to stay upright. Its 120 m site reservation leaves 108.7 m to the nearest road centerline. Nearby tower placements and building heights preserve the approach view. Repeated parts use instancing and merged geometry: 27 meshes and 76,704 rendered triangles, with no additional model downloads or point lights. Neon District does not instantiate this landmark.

With the development server on port 5198, run `node scripts/verify-kairo-wheel.mjs` for desktop/mobile screenshots, rotation and upright-cabin checks, road clearance, geometry budgets and absence on Neon. Evidence is saved to `artifacts/kairo-wheel/`.

Wheel validation passed on 21 September 2026: `npm run build`, both production Kairo Chrome tests (`npx playwright test --grep kairo`), and the wheel-specific desktop/mobile checks. Road views and a structure overview were visually reviewed; no browser errors were recorded. The existing large-bundle build warning remains.

## Circuit media

Kairo has ramen and bonsai floating holograms, a new ElevenLabs bonsai ambience loop, and a Mars travel billboard mounted on an opening-straight building with a processed public-address voice. See [media sources, processing and verification](kairo-media.md).

The wheel’s pink rim is thicker and brighter, with sixteen illuminated radial spokes per face. Its skyline fog density is capped independently of street fog, including Performance mode. The 198 m diameter fits the early approach view; the media building beyond Turn 1 is lower to preserve the wheel’s silhouette.
