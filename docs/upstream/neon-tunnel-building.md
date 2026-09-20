# Undercity tunnel building — Blender replacement

20 September 2026. Local implementation for the owner's industrial tunnel-building reference. This is a focused architectural replacement, not a claim of matching the reference's photoreal rendering.

## Reference and construction

The supplied comparison showed repeated shallow window bands around an otherwise plain rectangular mass. Its target uses a large framed NEXUS sign, a smaller district sign, pipes with elbows and collars, elevated maintenance decks, ventilation fans, rooftop plant, warm task lamps and blue portal lights.

The new source is `scripts/blender/build_neon_tunnel.py`, executed in Blender 5.1.2. The editable native scene is `assets/neon/neon-tunnel.blend`. It exports two original models:

| Asset | Triangles | GLB bytes | Material meshes |
| --- | ---: | ---: | ---: |
| `tunnel-portal.glb` | 11,974 | 884,448 | 10 |
| `tunnel-service-bay.glb` | 4,828 | 349,764 | 7 |

The native scene retains model collections and materials. Signs and tiled weathering are assigned by the game, so the standalone GLB has blank sign placeholders until integration.

## Integration

- Both portal ends receive the authored entrance, including recessed windows with blinds/curtains, framed signs, rounded copper pipe bundles, flanges, fans, braces, railings and an asymmetric roofline.
- Thirty service bays follow the curved exterior, replacing continuous flat window strips with actual projecting floors, recessed loggias and maintenance equipment.
- The existing load-bearing curved shell, road, 7.2m interior clearance and outside-only rain/reflection mask are retained. Grounded columns support the side overhang.
- Original procedural metal wear, streaks and bump detail use metre-scaled Blender UVs. The NEXUS, district and Gridbound signs are original code-drawn graphics based on the supplied composition.
- One non-shadowing warm/cool spotlight pair is reused at the nearer portal; eight small steam particles sit outside the carriageway and render in one instanced draw.
- Imported structural geometry is merged after placement by material: 168,788 triangles, ten draws per ordinary scene pass. The steam adds one draw. The full game's multipass frame cost is higher; this is not a total renderer draw count or a frame-rate guarantee.
- Model loading participates in environment readiness. Export metadata and asset-manifest hashes are retained. No external image assets or reference image pixels were copied into the building.

## Verification

`node scripts/verify-neon-tunnel.mjs` inspects approach, close portal, interior, exit, Quality and Extreme, plus a 390×844 viewport. It checks asset loading, console/page errors, lane-width vertical clearance sweeps along the tunnel and explicit samples at both thresholds. Screenshots and JSON are in `artifacts/neon/tunnel/`.

The threshold checks measured 7.40m to the new entrance structure; the existing interior soffit remains 7.2m. No new geometry was found below the 7m clearance test threshold across the sampled driving corridor. The dry interior remained visually intact. Desktop and mobile screenshots were inspected; the mobile capture waits for the resize/render lifecycle before capture.

Production TypeScript/Vite build passes with the existing large-bundle advisory. The complete city still has repeated architecture and differs from the reference's materials/lighting; this change specifically addresses the tunnel complex.

## Delivery

Available locally at `http://localhost:5195/?circuit=neon` after refresh. Not deployed; no upload was attempted. Previous uncommitted Extreme refinements are preserved.
