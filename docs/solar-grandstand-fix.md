# Solar grandstand correction

The original grandstand rows were built with their local Z axis along the track while their 26 m width used local X. Spectators were placed using a separate tangent/right frame. The 90-degree mismatch produced the sideways stair walls, unsupported spectators and road intrusion shown in the user's screenshots. The original corner-only clearance check described the intended footprint rather than the rotated geometry.

`src/game/SolarGrandstand.ts` now constructs the entire stand in one local frame: X follows the track, positive Z points away, and seated spectators face negative Z. It provides six seating rows in two banks, open central stairs with three treads per seating rise, individual seats, seated limbs and grounded feet, side/aisle rails and a solar canopy. Repeated parts are instanced. The canopy and deck footprint is checked on a 0.5 m grid against exact road segments with an additional 1 m margin. A stand is moved back or omitted if it cannot fit. `SolarEnvironment.ts` reserves the resulting footprint for buildings and excludes street trees from it.

Source: procedural geometry and the existing Solar material palette. No imported assets. Focused model/readability assessment: before 0/3 (misaligned, intersecting geometry); after 2/3 (recognizable covered seating with supported spectators). This is a focused correction, not a new whole-game visual score.

Validation:

- Production build passed.
- Ten targeted geometry regression tests passed: transformed vertices at multiple headings and both track sides; central aisle clearance; actual circuit return lanes; rejection of an unsafe site.
- Existing desktop Solar driving smoke test passed, including input, braking, restart, recovery, car changes and graphics settings. No console/page errors or missing assets.
- Browser views at turns 2 and 6 checked, plus a 390 × 844 responsive viewport. No rendering errors.
- Smoke-test performance preset sample: 61 FPS, median 16.7 ms / p95 18.3 ms, 873 draw calls, 2,466,044 triangles, 216 geometries, 79 textures. This is a driving snapshot without shadows/post, not a quality-mode performance guarantee.

Evidence: [Turn 2](../artifacts/solar-grandstands/turn-2.png), [Turn 6](../artifacts/solar-grandstands/turn-6.png), [Mobile](../artifacts/solar-grandstands/mobile.png). Regression tests: `tests/solar-grandstands.spec.ts`.
