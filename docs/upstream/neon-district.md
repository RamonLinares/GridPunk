# Neon District — original night circuit

## Scope and reference

Added an eighth circuit, `?circuit=neon`: an original 3,743.799 m city loop with 12 corner groups, an 8 m road half-width and walls 12 m from the centreline. It is fictional and is not derived from a real circuit map. Driving physics and the existing seven circuits are unchanged.

Reference inspected: https://www.dreamatron.ai/?launch=neon, its publicly served application bundle and scene description, plus the user's two screenshots dated 2026-09-19. The reference combines authored models with procedural signs, cables, traffic, blue fog, rain and post-processing. No reference code, scene data, geometry, imagery or audio was incorporated.

The first implementation was rejected as too clean and repetitive. The second pass replaces continuous neon rails and uniform glass towers with weathered street fronts, recessed windows, balconies, shutters, air-conditioning units, service pipes, shop awnings, narrow projecting signs, stepped towers and a cylindrical communications landmark. Pavements, commuters with umbrellas, parked scooters, vending cabinets, overhead cables and moving elevated trains establish street scale. Original large advertising images punctuate the smaller signs.

## Rendering

- Instanced facade and street-prop batches; five procedural facade families with separate colour, emission and bump maps. Window size scales with building dimensions.
- Blue distance fog, an original night sky, practical warm lights, gentle steam, animated rain and flying traffic. Bloom and colour treatment are confined to Neon District.
- One 512 × 320 planar reflection of the actual scene, blurred and modulated by procedural puddles and ripples. The circuit is flat; this technique is deliberately specific to this circuit.
- The small reflection uses merged car silhouettes instead of resubmitting every detailed suspension and cockpit mesh. Normal car rendering remains unchanged. The reflection target is disposed with the environment.
- Performance preset omits the planar reflection. Only one near shadow cascade is used in the night city.
- Menu uses a captured game image, not a concept rendering; the 3D engine remains deferred until entering a circuit.

## Original generated artwork

Asset: `public/circuits/neon-billboard-atlas.webp`. Mode: generation with OpenAI image generation. Original output was a 1536 × 1024 PNG, converted to WebP without visual edits. Three equal-width panels are addressed separately by UV offset/repeat.

Prompt brief: Create an original high-end cyberpunk advertising texture atlas for a rainy futuristic racing city, exactly three equal-width vertical posters, with no building/perspective/mockup: a silver-haired Asian adult with a cyan optical implant, ECHO / SYNTHETIC MEMORY; a chrome robotic koi in red-orange liquid, AKARI; an amber perfume cylinder above a silver hand, NOCTILUCA. Premium cinematic realistic details, dark backgrounds with localized highlights, no existing logos or watermarks.

Credits and the public asset manifest identify this artwork. User reference screenshots and private videos remain excluded from source and deployment.

## Validation — 2026-09-19

- Production TypeScript/Vite build passed. Existing large-engine-bundle warning remains; the menu does not eagerly load that bundle.
- Production Chrome: desktop 1440 × 900 and touch-emulated mobile 390 × 844. All eight circuit cards, image loading, race entry, acceleration, full stop, pause/resume and canvas content passed. No page/console errors, failed resource requests or document overflow.
- Four cameras inspected: chase, far, hood and cockpit. Performance preset also rendered. Whole-loop driving-surface check at lateral offsets −7, 0 and +7 m found a maximum 0.04 m road height offset, matching the road mesh lift.
- Six-car, two-lap simulation: every car completed two laps, no wall contacts or stopped cars. Eleven of twelve laps were valid; one rival had a 0.82 s traffic-related excursion beyond track limits. Flying traffic is scenery and does not affect race collisions.
- Final Quality sample at 1600 × 1000, DPR 1, headless Chrome: median 23.3 ms, p95 26.8 ms, 543 draw calls and approximately 1.34 million rendered triangles, including reflections. This is a short local opening-grid sample, not a guarantee for every device, viewpoint or full lap. Production Auto desktop sample: median 18.7 ms, p95 23.1 ms. Mobile emulation is not a physical-device benchmark.
- Daytime regression: Montmeló retained sun intensity 5, fog density 0.00024, and had no neon city or reflection objects.
- Menu keyboard wrap, selection, reduced motion, touch selection, controller navigation and return-to-menu verified. Responsive eight-card grid corrected to avoid clipped long names.

Reproducible checks: `scripts/verify-neon-production.mjs`, `scripts/verify-neon-cameras.mjs`, `scripts/verify-neon-race.mjs`, `scripts/verify-neon.mjs`, `scripts/verify-gridbound-home.mjs`. Local screenshots and raw measurements are in ignored `artifacts/neon/`.

## Honest remaining limits

This is a substantially stronger procedural racing environment, not visual parity with Dreamatron's authored scene. Repeated facade families remain visible; fog is distance fog and sprites rather than volumetric scattering; reflection is intentionally low resolution; there is no cinematic depth-of-field obscuring the driving view. Rain is visual, with the established handling retained. No 10/10 or reference-equivalent score is claimed.


## Subsequent cinematic rendering pass

See `docs/neon-rendering-reference.md` for the later source-driven changes to volumetric fog, AgX tone mapping, motion blur and lens treatment. That pass supersedes the distance-fog-only limitation and the performance measurements in this initial implementation record.
