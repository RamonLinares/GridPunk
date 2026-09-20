# Neon street lighting and tyre reflections

## Root cause and fix
The wet-road reflector builds one merged proxy per car to avoid rendering every vehicle detail twice. It copied `material.color` but discarded the base map. Tyres have a white material tint multiplied by a nearly black rubber texture, so the proxy incorrectly rendered white tyres. Proxy colours now include the mean linear-space base-map reflectance, sampled once per material during proxy creation. No added per-frame texture reads or extra reflection draw calls. Main car materials and other circuits are untouched.

The regression check measures actual merged vertices at the lowest tyre tread, below the bright sidewall stripes. All six proxies have a mean linear reflectance of 0.00748 instead of white (1.0). Initial wider measurement regions accidentally included coloured sidewall stripes and body geometry; the final region isolates tread.

## Streets
408 ground-floor bays, 161 lit (39.5%). Four recessed room kits: noodle bars, record/book shops, electronics repair shops and late cafés. Shared instanced props include counters, stools, bowls, menus, shelving, books/products, benches, pendants and dim monitors. Closed bays mix slatted shutters and dark fronts. Ground-floor facade slabs were replaced with real openings and enclosing walls so interior depth remains visible at oblique angles. The seeded city placement is unchanged.

Warm/cool light fixtures and muted self-lit interior surfaces are complemented by soft window-shaped additive light washes on the sidewalk. Two non-shadow-casting point lights are reassigned to nearby lit fronts, rather than adding hundreds of dynamic lights. Washes retain depth testing and stop behind the race barrier. At low camera heights the concrete barrier correctly hides some sidewalk illumination; elevated inspection confirms the actual light pool. Screen emission was reduced after visual inspection to avoid blown-out rectangles; pendant-lit cafés/bars do not all have fluorescent strips.

## Verification
`npx tsc --noEmit`, production build, focused Chrome `scripts/verify-neon-streets.mjs`: passed. Actual chase-driving view, two shopfront inspections, six reflection proxies, open/closed ratio, light-pool count, two-light budget, acceleration and console/page errors checked. Evidence: `artifacts/neon/streets/`.

Representative 1440×900 Quality scene: about 310–317 draw calls versus baseline 287, ~1.12M triangles versus .97M, 288 geometries versus 286, 115 textures (unchanged). Frame timings varied considerably between runs with other browser/GPU activity (roughly 19–36ms medians); these are not an isolated benchmark or a 60fps guarantee. Shared geometry, instancing and a fixed light budget bound the added cost. Production desktop/mobile smoke checks also passed: menu selection, acceleration, braking, pause/resume, rendered canvas, no overflow or failed requests. The final light-pool intensity was reduced after elevated visual inspection. Original game handling, hologram and non-Neon environments are unchanged.

## Ground-floor continuity and brighter shops
The initial shop kit used a single pale stone material for all external side walls. Blank sides therefore showed an unintended bright belt. Each façade now preserves a small 256×256 copy of its own weathered plaster before windows are painted. Matching non-emissive base materials share the upper façade's tint, roughness and metalness. Side/rear walls and shop piers use the matching material, and their tops meet the upper shell exactly at 4.2 m.

In response to dim shop lighting, warm/cool interior-wall emission and floor fill were raised, nearby practical lights increased from 8–13 to 16–24, and pavement wash increased from .26 to .38. Monitors retain their restrained brightness. No extra lights or changes to the 161/408 lit ratio. TypeScript, production build and focused six-car/shops/driving checks passed without console errors; road-level oblique screenshots inspected in `artifacts/neon/streets/`.
