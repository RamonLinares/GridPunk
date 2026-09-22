# Kairo Solar — zeppelins and wind turbines

`src/game/SolarSkyLife.ts` builds three modern electricity-generating wind turbines and three zeppelins exclusively for Kairo Solar. `SolarEnvironment.ts` reserves the turbine plots and approach sightlines before placing buildings, then updates turbine rotors, propellers and flight positions using environment time. Existing distant wind turbines remain.

The turbines have slender tapered 44 m masts, generator nacelles with cooling vents, service doors, and three swept airfoil blades per rotor. Their hubs sit 45 m above ground and each blade reaches 21 m from the shaft. Their centres are at 24.5%, 46% and 84% of the lap, 48 m beside the road. Each reserved 23 m radius leaves at least 25 m to every centreline segment, including return lanes. They are scenery rather than driving obstacles.

The zeppelins use a curved lathed envelope, circumferential ribs, four tail fins, a suspended glazed cabin, dorsal PV panels, curved Kairo Solar branding and two animated propellers. Their bounded drift paths are positioned ahead of the 18.2%, 46% and 79% approach views, with centres at 194–230 m altitude. Sampled motion bounds keep every part above 172 m. This makes them visible in the chase camera while clearing the existing towers.

All models and the two shared canvas textures are authored in the repository; no downloaded or generated external assets are used. Static parts are merged by material and clones share geometry. The six assets together contain 42 mesh objects, 14 unique geometries, seven materials and 38,352 triangles. Airships do not cast shadows; the turbines do. Standard mesh frustum culling applies. Texture disposal is integrated with environment teardown.

## Verification

- `node scripts/verify-solar-sky-life.mjs`: desktop 1440×900 and mobile 390×844; three visible turbines and three visible ships; drift and rotor animation; conservative road clearance; sampled flight altitude; zero browser or shader errors.
- The first visual iteration exposed banner clipping and flight paths directly overhead. Curved strips now interpolate the envelope radius, and ships sit ahead of approach views so they appear above the city while driving.
- Gameplay evidence: `artifacts/solar-sky-life/desktop-0.182.png` (zeppelins over Helios Grove), `desktop-0.220.png` (first turbine approach), `mobile-0.233.png` (both asset types). `zeppelin-detail.png` is a supplementary inspection camera, not the driving view.
- `artifacts/solar-sky-life/verification.json` includes renderer counters at each capture. `baseline.json` retains the previous scene counters. Counters vary with shadow update frames and visible buildings, so they are not an FPS comparison. No frame-rate improvement is claimed.
- `npm run build` passes. The pre-existing large-bundle advisory remains.
- Before the turbine model replacement, `npx playwright test tests/neon.spec.ts --grep 'solar loads'`: both production smoke tests pass (desktop 34.9 s, mobile 32.2 s), covering driving, pause, restart and car switching.

This is a focused scenery addition: familiar silhouettes, secondary functional detail and legibility from the road are the visual criteria. It does not change car physics, HUD layout or race rules.
