# Solar signature architecture

`src/game/SolarArchitecture.ts` replaces much of the repeated glass-slab kit on both Solarpunk circuits (Kairo Solar and Neon Solar) with authored procedural forms:

- **Arbor Spire**: a 300 m garden tower placed on the most open ground near the city centre (at least 135 m from any centreline). Eight braided white columns root into a pool around a glass core; four sky-garden canopies carry trees, hanging vines, copper fascias and rings of photovoltaic petals; a waterfall drops from the lowest garden. It closes the long straight around 79% of a Kairo lap and stands beside the Neon Solar layout.
- **Vertical-forest towers**: rounded floor plates that turn 1.6–3.4° per storey, each ringed by planting, with balcony trees, trailing vines and a copper crown under a PV disc. Used on the skyline and, for tall plots, on the street front.
- **Terraced hill blocks**: set-back tiers in limewash, terracotta, ochre, blush and sage with arched, shuttered windows; each step is a planted terrace under a timber pergola.
- **Sail towers**: elliptical curtain-glass towers wrapped in white fins, crowned by a tilted, curved solar sail.
- **Glasshouse domes**: geodesic lattice domes on a plinth, through the background city.

Curtain glass and wall atlases are mapped in world metres (1.5 m mullions, 3.6 m storeys), so every plate size and curvature keeps its scale. Remaining modular blocks gain blush, sage and ochre window tints. The default Solar sun is lower (about 38°) and warmer so the new forms model into light and shade; the mountain ranges are lower and ridged.

All parts are instanced per material in 384 m cells; only the spire's eight columns and waterfall are individual meshes. No external models or images are used.

## Verification — 22 September 2026

Renderer counters at the Quality preset (in-app browser, dev build; frame snapshots, not FPS guarantees):

| View | Before calls / triangles | After calls / triangles |
| --- | --- | --- |
| Kairo Solar 13% | 966 / 2.65M | 757 / 1.63M |
| Kairo Solar 62% | 714 / 2.73M | 547 / 1.79M |
| Kairo Solar 79% | 1,935 / 6.30M (33 fps) | 2,229 / 5.89M (33 fps) |
| Neon Solar 20% | 1,214 / 3.81M (34 fps) | 1,548 / 3.32M (44 fps) |

`npm run build`; 36 production tests covering Solar driving on desktop and mobile, stage selection, grandstands and surfaces; `scripts/verify-solar-landmarks.mjs` and `scripts/verify-solar-sky-life.mjs` all pass with no browser errors. The spire's world matrix is updated at build time so the startup road-clearance pass measures it in place. Physical-phone performance has not been measured.
