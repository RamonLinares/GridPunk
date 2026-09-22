# Kairo Steam

Select **Kairo Steam** in the session menu or open `/?circuit=steam`. This is a separate circuit identity using the exact Kairo Solar / Kairo Loop centreline: 5.807 km, 18 corners, identical sector lines and the same grade-separated flyover. Best laps and replay labels use `steam`, independently of Solar. Both existing cars remain selectable.

## World and identity

- Six building families: staggered terraced townhouses with dormers and chimney pots, sawtooth foundries with glazed northlights, barrel-vaulted glass markets, stepped commercial exchanges, copper-domed observatories, and brick mills with stair towers. Limestone sash windows, soot-brick industrial glazing, and redbrick arches cover all elevations.
- Roof and street furnishings include 60 braced water towers, 31 loading cranes with suspended cargo, 60 fire escapes, 61 workshop boiler banks with valve wheels, copper awnings, and six printed business signs. Existing chimney steam, downpipes and gas lanterns remain.
- **Clockworks**, around 20% of the lap: a four-face clock tower with moving hands, giant brass flywheels and supporting structures.
- **Boiler Works**, around 55.2%: copper pressure vessels, manifold pipes, twin banded chimneys and roof steam.
- **Royal Kairo Aerodrome**, around 75.6%: a roofed industrial hangar, mooring gantry and mechanical winches.
- High pipe gantries cross the road, two cargo dirigibles drift above the city, and street-mounted flywheels turn on factory walls.
- Warm sunset lighting, dry worn asphalt, brown shoulders, sandstone barriers, gear-emblem sponsors, a brass-lettered start/finish sign and a brass HUD. The Shinsei wears Kairo Steam wing plates and a warmer metal finish.

The road clearance checks cover the entire loop, including return lanes. The three reserved landmark footprints leave approximately 20 m to the centreline; their approach corridors are kept clear of ordinary buildings. Pipe gantry supports are at least 16 m from any centreline segment, with overhead components above 12 m. Static scenery is cosmetic; the established barriers and driving surface remain the gameplay boundary.

## Source and implementation

All new scenery and textures are authored locally in code. This suits the existing procedural city and avoids external asset downloads, licensing dependencies and runtime generation. Existing owner-authored car models, race audio, track meshes and physics are reused.

- `src/game/SteamEnvironment.ts`: separate environment factory, seeded layout, authored landmarks, gears, dirigibles, steam and lighting.
- `src/game/SteamPlumes.ts`: soft world-sized steam billboards, rising/drifting chimney plumes and staggered workshop pressure releases.
- `src/game/SteamBuildings.ts`: six shared silhouette factories and their rooftop/street prop kit.
- `src/game/SteamMaterials.ts`: shared brick, arched, limestone sash, soot and industrial-glazing atlases, metre-scaled facade UVs, iron/copper/brass/stone/slate material roles.
- `src/entities/SteamLivery.ts`: circuit-specific sponsor plates and finish on the existing Shinsei.
- `src/game/track/circuits.ts`: new circuit definition and shared Kairo/dry-circuit predicates.
- `Environment.ts`, `Game.ts`, `Trackside.ts`, `main.ts`, `Hud.ts`, `styles.css`: routing, dry surface/audio exposure, printed sponsors, selection, title and HUD. The circuit menu is now a two-column grid so all four names fit mobile.

Repeated static parts use instancing in 240 m cells. After the building-variety pass, the measured environment contains 635 buildings, 24,782 static instances, 1,945 mesh objects, 14 unique geometries and 27 materials, with approximately 820k triangles including repeated instances and steam billboards. It has 66 chimney emitters, 21 pressure outlets, 24 moving gear/clock components and two airships. Steam uses a single instanced draw with 2,532 fixed billboards, rather than allocating particles each frame. New textures are disposed with the environment. Thin brass trim, gaslight meshes, glass roof panels and ring/plane details skip shadow casting; structural walls and roof masses still cast shadows. Distant glass halls use fewer roof ribs.

Every building's conservative footprint is checked against every road segment and the landmark approach reservations. The closest footprint edge is 16.038 m from the centreline. All six families occur at the roadside. Crane jibs, cargo, water towers and fire escapes stay within the reserved building footprint.

## Verification evidence

- `scripts/verify-kairo-steam.mjs`: desktop 1440×900 and mobile 390×844, multiple lap positions, all three landmark clearances, every building footprint, presence of six roadside building families and the new prop types, clock/flywheel visibility, gear and airship motion, advancing steam time, zero rain exposure, and no Solar environment mixed in. Both runs report zero console/page/network errors.
- `tests/steam-circuit.spec.ts`: exact equality of every sampled centreline position, length, corner definitions, elevation function and sector fractions; independent circuit identity and URL selection.
- `tests/steam-selection.spec.ts`: switching from Solar through the menu preserves car and URL options, keeps labels unclipped, and loads Steam's own best lap without changing Solar's record.
- Extended `tests/neon.spec.ts`: Steam participates in the existing production driving, braking, AI, audio, camera, pause, restart, car-switching and quality-preset smoke test.
- Production QA: eight tests passed in 2.5 minutes, covering Steam and Solar driving on desktop/mobile, layout equality, menu selection and independent lap records.
- After replacing the remaining cyan start/finish board, both Steam production smoke tests passed again (desktop 32.9 s, mobile 24.1 s); the final active-driving screenshots show the brass-lettered board.
- `npm run build` passes. The existing large-bundle advisory remains; no external assets were added.

Visual evidence is in `artifacts/kairo-steam/`: `desktop-0.182.png` and `mobile-0.182.png` show Clockworks, `desktop-0.100.png` shows an overhead pipe gantry, and other captures cover the factory districts and flyover. Production active-driving images are written to `artifacts/qa/{desktop,mobile}/steam/driving.png`. Full renderer measurements and scene inventory are in `artifacts/kairo-steam/verification.json`.

At the inspected quality setting after the variety pass, renderer counters ranged from 545–2,523 calls and 500k–1.62m triangles per desktop capture; mobile captures ranged from 1,707–2,635 calls and 901k–1.65m triangles. These include shadow/post passes and vary with camera position and cascade update frame. The scene costs more than the original repeated-factory kit. Trimming decorative shadows and simplifying distant ribs reduced the first variety iteration's peak from 3,022 calls / 2.28m triangles. These are not FPS measurements or evidence of physical-phone performance.

## Visual assessment for this addition

New circuit, so there is no previous Steam environment to score. Relevant after-pass scores on the 0–3 graphics rubric: art direction 2, world 2, materials 2, lighting 2, UI 2, performance evidence 2. Player, competitors and racing interactions are inherited; there is no new obstacle/reward system. Ambient motion is decorative steam and machinery, not a new gameplay VFX system. This is a stylized procedural circuit, with repeated factory modules visible at distance; no photorealistic or showcase claim is made.

The review caught and corrected coplanar masonry/facade surfaces, clock details initially outside the useful approach view, and child transforms missing from the startup scenery-clearance pass. The final factory initializes its world matrices before that pass, and verification explicitly checks the clock faces and gears remain visible.


## Building-variety follow-up

Before images are retained in `artifacts/kairo-steam-before-variety/`; matching after images are in `artifacts/kairo-steam/`. At 18.2%, the clock tower is now framed by glass market vaults, staggered townhouses, water towers and machinery. At 42%, soot-glazed sawtooth factories replace the former row of identical redbrick blocks. At 73.8%, mixed-height domes, mills and commercial buildings break the Aerodrome approach skyline. Desktop and mobile inspections caught and corrected stepped fanlight silhouettes and signs intersecting shutter surfaces.

Focused rubric (0–3): world variety 1 → 2; material differentiation 1 → 2; readable silhouettes 1 → 2. This remains a stylized procedural environment. The new features are scenery, with no new driving mechanics or changes to the track layout.

Final variety-pass validation: `npm run build` passed; `node scripts/verify-kairo-steam.mjs` passed on desktop and mobile with no browser errors; `npx playwright test tests/neon.spec.ts --grep 'steam loads'` passed both production driving tests in 1.6 minutes (desktop 45.7 s, mobile 39.9 s).


## Steam and machinery follow-up

Facade flywheels reduced from 61 to 11; landmark gears remain. All 66 roadside chimney/boiler outlets now emit fuller pale steam. Another 21 copper outlets above workshop awnings release pressure for roughly four seconds in staggered fourteen-second cycles, with five-second particle lifetimes. World-sized billboards replace hardware-capped point sprites, giving nearby steam a readable volume. Particles expand, rise, drift, and fade with soft irregular edges; their anchors stay outside the driving surface. No lights, textures or per-frame particle allocations were added. Desktop and mobile lap captures in `artifacts/kairo-steam/` show the result, including the skyline at 0%, 18.2% and 84%.

## Rooftop tank support correction

The mill tank previously used a level support frame positioned from the ridge height, leaving its feet above the sloping roof. `SteamBuildings.ts` now anchors each leg to the actual roof plane, with angled mounting feet and a level platform under the tank. Flat-roof tanks use the same contact treatment. `scripts/verify-steam-rooftops.mjs` checks both Steam circuits and raycasts 72 legs across 18 building size/roof configurations against the generated roof meshes: every leg reaches the roof and the tank, with 0.18 m of intentional roof penetration. Build passes; both circuit views and the isolated roof inspection report no browser errors. Evidence: `artifacts/steam-rooftops/`.
