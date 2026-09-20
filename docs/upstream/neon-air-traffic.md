# Neon District air traffic

`src/game/NeonAirTraffic.ts` replaces the 24 distant moving boxes with 18 original procedural hovercars. The coupe and taller utility body have chamfered hulls, framed windscreens, engine pods, recessed lift fans, skids, vents, headlamps and amber navigation lamps. Six muted paint colours vary the fleet. These are original models inspired by retro-industrial science fiction, with no film assets or downloads.

Three closed, arc-length sampled routes follow the clear street corridor and exclude the tunnel district. Low traffic flies about 12.6 m above the road, below the transit decks; higher traffic uses a further 27 m of altitude. The cars bank into curves and hover slightly. All movement uses scene time, with no per-frame geometry creation. The circuit's common teardown disposes the instanced geometry and materials.

The fleet has 12 instanced batches and 29,664 triangles, without extra lights or shadow passes. The replaced boxes used two batches. Menu renderer snapshots were 932 calls / 2,230,497 triangles before and 929 calls / 2,278,855 after the first pass; animated scene differences mean these are context, not an FPS comparison. Fleet geometry is the stable measured cost.

Verification: production build and whitespace checks pass. Chrome reported no console/page errors. A vehicle moved 99.69 m over ten scene seconds. Sampling 400 points on each route found maximum horizontal centreline offsets of 7.17 m, inside the street corridor. Cockpit views at the start, banked bend and another district, a model close-up, and an 844×390 view were inspected. Evidence is in `artifacts/neon/air-traffic/`. Traffic is decorative and has no gameplay collision.

Local implementation only; not deployed.
