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

`node scripts/import-layouts.mjs [path]` regenerates `src/game/track/importedLayouts.ts` and the menu outlines from the source project. It keeps the surveyed elevation (rebased so the control line is at 0 m) and rescales only the plan so GridPunk's closed centripetal spline keeps each 3D lap length. Sector splits, corner apexes (labelled `Turn N`), the standing-start line and the banked sweep carry over. The source's street-join refinements are applied before sampling. Horizontal plans are © OpenStreetMap contributors (ODbL); see `public/credits.html`. No venue names appear in the game data or UI.

## Cities on hills

These circuits set `terrainFollow`. `TrackBuilder` builds a 16 m height field instead of the flat city floor: within 26 m of the centreline the ground sits just below the road's lowest banked edge, blends over 90 m into a smooth field interpolated from the whole lap, and eases to a level plain at the grid edge. `builder.groundAt(x, z, radius)` returns the lowest terrain point under a footprint (0 on flat circuits). Every stage seats its buildings, landmarks, trees, lamps, street furniture and far ranges with it, so buildings cut into slopes instead of floating. Solarpunk's sea-level bay is omitted on hilly layouts. Neon District and Kairo keep their flat city unchanged.
