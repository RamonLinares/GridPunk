# Neon K89-R — Blender replacement

20 September 2026. Replaces the rejected procedural K-89 body. The earlier design looked like a kit car with a roll cage; it has been removed from the active factory. This pass focuses on the car, not a broader claim about the game's visual quality.

## Authored asset

- Editable Blender source: `assets/neon-car/k89-r.blend`.
- Reproducible authoring script: `scripts/blender/build_neon_car.py`.
- Runtime asset: `public/cars/neon/k89-r.glb`, about 1.40 MB, 41,442 body triangles, 12 meshes.
- Original geometry and fictional branding based on the owner's written brief. No third-party model or texture assets.

The body has continuous compound surfaces from radiator shoulders through rear wheel haunches, boolean wheel wells, recessed radiator inlets, a long wedge nose, an elliptical cockpit cut into the tub with a low rolled rim and short wind deflector and shaped rear airfoil with braced pylons. It removes the exposed cockpit scaffold and flat roof. Headlights are inset into wing shoulders. The rear bay contains gearbox, supported exhausts, coolant plumbing and diffuser vanes. Service panels, Dzus fittings, louvers and muted status lights provide industrial detail.

Side works markings are projected onto the compound body with DecalGeometry, rather than floating plane cards. Shared mottling and streak textures give the crimson, graphite and alloy materials surface variation. The cockpit has a closed recessed floor, dark inner lining, padded headrest and lowered driver and steering wheel. The short smoked-glass deflector rises only about 11 cm from the forward lip; there is no bubble canopy. The Neon cockpit camera sits behind the wheel at the revised driver position. Headlamps are emissive fixtures, without additional dynamic spotlights.

## Runtime and scope

`Game.init` awaits one Neon-only GLB load before creating cars. Six cars clone the scene and share authored geometries, with independent materials for muted liveries and brake-light control. Runtime steering wheels, tyre support geometry, steering/spin groups and the wing trim hinge retain the existing interfaces. The Formula model remains in use on other circuits. Grip, steering, brake, engine and AI settings are unchanged.

The tyre centres/radii and rendered footprint remain within the existing corridor envelope. Static body details are merged by material in Blender. The replacement spends more triangles on body curvature than the rejected version, with fewer body draw calls; no new lights, shadow maps or post effects are added. Asset metadata is in `public/cars/neon/k89-r.json`; final runtime counters are in `artifacts/neon/car-rebuild/results.json`. These are counts, not an isolated FPS benchmark.

## Review and verification

Neutral-light front, side, rear and overhead images were inspected before the final marking/material pass. Real game captures cover chase, far, hood, cockpit, Extreme chase, acceleration/braking and mobile cockpit. Central hood/cockpit rays must remain clear, all six cars must use the Blender model, brake emission must respond to real key input, and Montmeló must retain its Formula model. The script checks for console/page errors and bounds the rendered collision footprint. It also rejects the former canopy, bounds the windscreen height and ray-tests the recessed cockpit floor.

- `npm run build`: TypeScript and Vite production build.
- `node scripts/verify-neon-car.mjs`: browser checks and screenshots.
- `git diff --check`: whitespace check.
- Evidence: `artifacts/neon/car-rebuild/`.

Both rearview mirrors and their supports are removed from the Neon body at the owner's request.

The model is locally playable. It has not been published. Surface wear remains stylized; this is not a photoreal or 10/10 claim.
