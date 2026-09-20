# Neon LED signboards

20 September 2026. Replaces the flat printed-looking text signs highlighted in the owner's screenshots with luminous dot-matrix displays inspired by the supplied Dreamatron image. No reference pixels or third-party code are included.

## Changed surfaces

- Barrier advertising: an original 5×7 alphabet, cyan/magenta LEDs, directional chevrons, a small secondary line, and solid dark cabinets fitted to each existing barrier segment. Long boards use a 512×32 matrix; short boards on tighter bends use a 208×32 layout to preserve the physical LED pitch.
- Both faces of the start/finish gantry: `START / FINISH` and `NEON DISTRICT / RACE CONTROL`, in a thicker dark housing. The race-start light bank remains functional and separate.
- Text-only vertical city signs, Blender landmark signs, skybridge text, and the tunnel's three sign designs use the same LED material process. Image advertising, holograms and the HUD remain separate.

`src/game/NeonLedSigns.ts` bakes shared albedo/emission pairs once per design. The housing albedo contains only inactive lenses so moving content leaves no stationary duplicate. A shared time uniform drives GPU animation without canvas redraws, texture uploads, additional geometry, or additional draw calls. Individual diode lenses have round luminous centres, dark gaps, restrained deterministic brightness variation and rare dim cells. Cabinet seams lie between cells, avoiding erased lines through lettering. Separate emission maps keep the dark housing unlit.

Mipmaps and anisotropic filtering integrate the small LEDs at distance rather than leaving a sparkling nearest-neighbour grid. The display signal now animates in the material shader while the physical grid and housing remain fixed: continuous secondary tickers and chasing chevrons, with staggered hold-and-roll transitions on larger lettering. Start/finish keeps its main label stationary. Motion advances in whole LED cells at 24 updates per second. There is no full-board flashing, tracking wobble, added point light or post-processing pass. Barrier cabinet geometry is merged into one draw; designs share their materials across the circuit.

## Verification

- `npm run build`: TypeScript and production bundle pass; existing large-chunk advisory remains.
- `node scripts/verify-neon-led-signs.mjs`: actual Neon load, Quality and Extreme gantry views, close barrier inspection, city approach, acceleration through the start area, and Montmeló isolation. No console/page errors.
- Screenshots inspected under `artifacts/neon/led-signs/`: `gantry-quality.png`, `gantry-extreme.png`, `barrier-close.png`, `city-text-extreme.png`, `driving.png`.
- Isolated rendered-pixel checks verify ticker movement, vertical page movement, unchanged start/finish title pixels, and identical frames when the animation clock is held. Two fixed-camera in-game frames capture the barrier motion.
- Runtime checks confirm LED materials, a mix of dark/lit emission texels, physical barrier cabinets, and that Montmeló keeps its original sign materials. See `results.json` in the same artifact folder.

Available locally after refresh at `http://localhost:5195/?circuit=neon`. Not published. Earlier local tunnel and Extreme refinements are preserved.
