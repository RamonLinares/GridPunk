# Imported layouts

Six more layouts are raced in all three stages (Cyberpunk, Solarpunk, Steampunk), for 18 new races. Each comes from the owner's `montmelo/montmelo-circuit` project and has a fictional name:

| Layout | Cyberpunk / Solarpunk / Steampunk IDs | Lap | Corners | Climb | Character |
|---|---|---|---|---|---|
| Mirage Streets | `mirage`, `mirage-solar`, `mirage-steam` | 3.337 km | 19 | 40 m | Tight streets, a walking-pace hairpin |
| Cinder Bend | `cinder`, `cinder-solar`, `cinder-steam` | 3.602 km | 11 | 55 m | Short and steep, a blind plunge from the crest |
| Sable Ring | `sable`, `sable-solar`, `sable-steam` | 4.657 km | 14 | 33 m | Long opening straight, flowing mid-speed corners |
| Orbit Bowl | `orbit`, `orbit-solar`, `orbit-steam` | 5.414 km | 22 | 26 m | Stop-start streets and a 24% banked sweep |
| Zenith Park | `zenith`, `zenith-solar`, `zenith-steam` | 5.513 km | 20 | 31 m | Steep climb into turn one, fast esses |
| Talon Run | `talon`, `talon-solar`, `talon-steam` | 7.004 km | 19 | 96 m | Valley dive, ridge climb, high-speed sweeps |

## Data

`node scripts/import-layouts.mjs [path]` regenerates `src/game/track/importedLayouts.ts` and the menu outlines from the source project. It keeps the surveyed elevation (rebased so the control line is at 0 m) and rescales only the plan so GridPunk's closed centripetal spline keeps each 3D lap length. Sector splits, corner apexes (labelled `Turn N`), the standing-start line and the banked sweep carry over. The source's street-join refinements are applied before sampling. Corners tighter than 16.5 m are eased: the curve is resampled every 4 m, the direction change per metre is capped at 1/16.5 m, any excess turn is spread onto the neighbouring stretch (so the total turn is kept), and the small closure drift is spread over the lap. Barriers sit 12 m either side of the centreline, so a tighter corner would fold the inner wall across the road; the original data had hairpins down to 5.9 m. Every layout now has a minimum radius of at least 14.6 m (Mirage) and about 16 m elsewhere. Horizontal plans are © OpenStreetMap contributors (ODbL); see `public/credits.html`. No venue names appear in the game data or UI.

## Cities on hills

These circuits set `terrainFollow`, and `TrackBuilder` builds a 12 m height field instead of the flat city floor:

- **Near the road.** Within 32 m of the centreline the ground sits just below the road's lowest banked edge, then blends over 120 m into a local field. The local field is a Gaussian blend of nearby road heights, clamped to 1-in-4 slope cones from every road sample, so it never climbs into a cliff beside a lower road.
- **Carving.** Every grid vertex of a cell the road or its 16 m verge touches is carved below that road point, so the terrain can never cover the road, including on banking and where sections pass close by.
- **Edges.** The height field eases to a level plain at the grid edge. The plain is a frame around the grid, never a sheet through it.
- **Steep faces.** Slopes steeper than about 1 in 3 are shaded as coursed masonry.

Where a higher section of the lap passes close by, the barrier continues up as a capped **retaining wall** to the top of the rise. Barrier walls also reach down to the ground wherever the road is above it.

`builder.groundAt(x, z, radius)` returns the exact lowest terrain vertex under a footprint's bounding square, minus 0.3 m (0 on flat circuits). Every stage uses it to seat buildings, landmarks, grandstands, trees, lamps, flags, pavement props, verges and street furniture, so buildings cut into slopes instead of floating. Gantry, portal and skybridge legs extend below grade. In Cyberpunk, transit portals become column-to-column gantries with no skytrain, and are skipped where another part of the lap passes within their footprint. Long utility cables are skipped, and landmark skybridges are only built where both buildings' decks match and every road beneath has at least 12 m clearance. The two fixed-position Neon landmarks (orbital tower and screen block) are kept only where the track leaves room. Solarpunk's sea-level bay is omitted on hilly layouts, and its city fills in only near the track beyond the original ±950 m square. The follow camera is clamped above the terrain. Neon District and Kairo keep their flat city unchanged.

### Verification

Every one of the 18 races was checked by raycasting onto the driving surface against both the track (barriers, walls, caps) and the scenery, including any overpass lower than 5.5 m. The only hits are the start/finish gantry and Solar tree canopies. All 18 laps were reviewed from the driving camera at 20 points each, with aerial checks at the steepest climbs. Six-car AI races complete two valid laps with no wall hits on all six layouts. Scene totals match the committed versions on Neon and Kairo; hilly Solarpunk layouts that now have city cover add 4–10%.
