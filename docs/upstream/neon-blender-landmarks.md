# Neon District: Blender architecture pass

20 September 2026. Scope: original building models inspired by the owner's cyberpunk concept image, integrated into the playable circuit.

## Authored assets

`assets/neon/neon-landmarks.blend` contains four named collections. Isolate a collection to inspect it; models share an authoring origin. Rebuild using Blender 5.1:

```
blender -b -t 2 -P scripts/blender/build_neon_landmarks.py
```

- **Exchange:** unequal towers, recessed advertising shaft, exposed cross braces, projecting slabs and service risers.
- **Terraces:** three stepped volumes, open loggias, exterior stairs, machinery and roof decks.
- **Split spire:** two unequal shafts separated by an actual open slot and connected by elevated crossheads.
- **Skybridge:** enclosed 72-metre truss walkway, recessed glazing, fixtures and underside pipes. Runs into the adjacent structures at the 30-metre level.

The three buildings have 24,086–34,414 triangles each. The bridge has 1,102 triangles. Four GLBs total about 6.25 MB before transfer compression. Native Blender source is retained for editing but is not deployed.

The reference's specific logos and image pixels are not used. Signs use original fictional labels and the existing original Gridbound billboard atlas. Provenance and file hashes are in the asset manifest and credits.

## Integration

`src/game/NeonLandmarks.ts` places 14 buildings around the circuit, with six paired bridges, 24 suspended service cables and 42 animated steam plumes. The original circular tower has its own exclusion area. Footprint reservations prevent the generic city generator from filling these sites.

Windows are recessed behind slabs and columns. Eight room/curtain/blind treatments, warm/cool occupancy, shutters and different opening proportions break up repeated panes. Side facades also have modeled depth. The smaller surrounding buildings retain the procedural city kit; this pass does not replace every skyline building.

Opaque structural materials are consolidated with vertex colours. Assets share geometry and materials between placements. All connecting cables share one mesh; all new steam shares one instanced draw. Imported buildings and bridges use a 420-metre distance cutoff. They do not add shadow-casting point lights. More geometry still has a rendering cost; these checks are not an M4 FPS benchmark.

Neon loading waits for the models before starting the race and running scenery clearance checks. Other circuits' environments need no additional assets.

## Verification

- `node scripts/verify-neon-landmarks.mjs`: Chrome, high quality, 1440×900; checks imported model completion, actual transformed bridge geometry clearance, bridge endpoints inside adjacent building bounds, lower building vertices outside the track corridor, cable/steam counts, actual acceleration and browser errors.
- Four driving viewpoints plus an oblique building inspection were captured and inspected. Runtime errors: none.
- The mobile harness at 390×844 passed cockpit rendering and actual acceleration with no browser errors.
- TypeScript and the production Vite build passed. The existing large main-bundle warning remains.
- Screenshots and detailed renderer counters: ignored `artifacts/neon/blender-landmarks/`; mobile evidence: `artifacts/neon/architecture/mobile-cockpit.png` and `mobile.json`.

Visual review caught and corrected upside-down glTF sign UVs, uniformly bright window panels, a placement overlapping the original cylindrical tower, and bridges that stopped short of the building interiors. The result has real architectural depth; it is not claimed to match the reference's photorealistic material and lighting fidelity.
