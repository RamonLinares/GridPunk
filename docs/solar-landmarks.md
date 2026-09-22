# Solar civic districts

Kairo Solar now has three unique, procedural landmarks. Their design makes food,
water, energy and shared public space visible alongside the race.

| District | Architecture and items | Lap location | Review start |
| --- | --- | --- | --- |
| Helios Grove | Three copper branching towers with photovoltaic petal canopies, climbing plants, water gardens and cisterns | 20.0% | `?circuit=solar&car=shinsei&hq&go&at=.182` |
| The Glasshouse | Ribbed glass conservatory, tropical trees, growing beds, roof drainage and rainwater tanks | 55.2% | `?circuit=solar&car=shinsei&hq&go&at=.534` |
| Harvest Commons | Eight stepped crop terraces, a rooftop greenhouse, irrigation and a growers' market | 75.6% | `?circuit=solar&car=shinsei&hq&go&at=.738` |

All three plazas include benches, bicycles and district nameplates. These are scenic
buildings and props; they do not introduce a farming or energy-management mechanic.

## References and source choices

Solarpunk is an imaginative design direction, not a prescribed architectural style.
This pass takes real environmental infrastructure and gives it an optimistic civic form:

- [Gardens by the Bay sustainability](https://www.gardensbythebay.com.sg/en/about-us/our-gardens-story/sustainability-efforts.html): glass conservatories, planted structures with photovoltaic or ventilation functions, and water filtering/reuse. Inspiration for the grove, conservatory and water gardens; no copied models.
- [Australian Institute of Architects: Our Solarpunk future](https://www.architecture.com.au/archives/reading-architecture/our-solarpunk-future): passive building systems as part of solarpunk architecture (search excerpt; full page returned 403).
- [Vincent Callebaut: Dragonfly](https://vincent.callebaut.org/object/090429_dragonfly/dragonfly/projects): a conceptual vertical agricultural building, informing the food-growing tower direction (search excerpt; full page could not be retrieved).

`src/game/SolarLandmarks.ts` owns the models, material roles, solar-cell texture,
nameplates and placement. Existing procedural foliage is reused through
`SolarVegetation.ts`. This keeps the assets editable and consistent with the game;
no external model/image files, paid generation calls or runtime network dependencies
were added. Glass uses ordinary transparent standard materials, not an extra
transmission render pass.

## Placement and iteration

`SolarEnvironment.ts` reserves plots before ordinary buildings are generated. Exact
track-segment clearance protects every nearby return lane. Conservative plot circles
cover the architecture; reserved approach corridors exclude tall trees and ordinary
buildings. The first placement pass put landmarks inside bends, where they left the
camera view early. Moving the grove to the outside of its bend and relocating the
other districts gave clear race-camera views. Oversized rail profiles were thinned,
solid canopy placeholders were replaced with the existing leaf sprays, and the farm
received continuous planting around its terraces.

No road, car, collision, timing or night-circuit systems were changed. Vegetation
continues to use spatial batches. Repeated structural details are instanced per
landmark; all 36 photovoltaic petals share one merged draw. Each district owns
13–18 mesh batches, with 50,458 / 49,502 / 82,354 structural triangles respectively
(excludes foliage shared with the city's spatial batches). New generated textures
are disposed through the environment lifecycle.

## Verification and measurements

- `npm run build`: passed; the pre-existing large bundle warning remains.
- `npx playwright test tests/neon.spec.ts --grep 'solar loads'`: desktop and
  mobile passed (40.1 s / 34.5 s), including real throttle/brake input, pause,
  restart, recovery, camera and car changes, quality settings and canvas checks.
- `node scripts/verify-solar-landmarks.mjs`: passed for 1440 × 900 desktop and
  390 × 844 touch viewport emulation. All actual structural vertices fit the
  reserved circles. Conservative minimum distances to any track centreline were
  20.38 m, 18.74 m and 20.22 m; all exceed the 15 m scenery-clearance requirement.
- Both near and far approach screenshots were inspected for each district.
  Browser captures had no console errors, page errors or failed HTTP responses.
- Geometry allocations changed from 284 to 293; textures from 115 to 119.

Representative quality-preset renderer snapshots (includes shadow/post passes):

| Lap fraction | Draw calls before / after | Triangles before / after |
| --- | --- | --- |
| .18 | 2308 / 2072 | 7,757,555 / 6,577,671 |
| .42 | 1990 / 1557 | 7,764,808 / 6,866,004 |
| .70 | 1771 / 1353 | 7,083,451 / 5,342,045 |

Open sightlines replace some repeated city blocks and trees. These are frame
snapshots, not a quality-mode frame-rate benchmark; shadow updates and visibility
also affect counts. Mobile captures are emulated on desktop hardware.

Scoped visual assessment: world identity and silhouette variety improved while
maintaining the existing stylized materials and daytime lighting. Main limitations
remain simplified small props and the repeated architecture outside these districts.
No photorealistic or AAA-quality claim is made.

Evidence: `artifacts/solar-landmarks/verification.json`, `baseline.json`, and
`desktop-*.png` / `mobile-*.png`. The check script recreates the final captures.
