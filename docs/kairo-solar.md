# Kairo Solar

Choose **Kairo Solar** in the session menu, or open `/?circuit=solar`. It shares the Kairo Loop centreline, corner markers, sector fractions, 8 m flyover and figure-eight contact handling (see `kairo-loop.md`). Lap bests and replays are keyed by the `solar` circuit id.

The reference-directed garden city is seeded and built in `src/game/SolarEnvironment.ts`:

- Recessed, textured glazing, rounded plaster terraces, projecting floor slabs, mullions, handrails, planter troughs, rooftop solar arrays and hanging leaf sprays replace the original solid green wall blocks.
- `SolarVegetation.ts` builds branching trunks and alpha-tested individual leaf clusters, shrub beds and balcony vines. Vegetation shares one leaf atlas and is batched into 128 m cells. Buildings use 192 m cells. Flowers and spectator heads preserve their authored elevations instead of being resnapped to ground.
- `SolarGrandstand.ts` aligns decks, seated spectators, seats, steps and railings in a shared local frame. The full canopy/seating footprint is checked against every road segment; nearby trees are kept out of the stands. The seating banks leave open central access stairs and a solar-panel canopy shades the rows.
- Three planted pedestrian bridges carry the PEOPLE / PLANET / PROGRESS identity. Street flags, facade slogans and matte barrier graphics echo the reference.
- Layered, triangulated mountain slopes frame the city. Wind turbines have tapered blades; three sit closer to the track so they can appear above the garden districts. The shader sky and its reflection probe use a blue daylight palette.
- Solar uses ACES tone mapping, cascaded warm sun shadows, neutral sky fill and restrained bloom. `SolarSurfaces.ts` adds world-scaled aggregate to the dry asphalt without changing the night circuits.
- `SolarLivery.ts` adds Solar branding and material adjustments to the existing owner-authored Shinsei prototype. The player car's driving geometry and physics stay with the original model.
- The HUD has the leaf mark, green accents and gold lap timing, with responsive desktop and mobile layouts.

Development visual-review URLs support `?circuit=solar&car=shinsei&hq&go&at=0.13`. The development start-location option now survives entering the race. Production still starts races on the normal grid.

See `solar-reference-review.md` for visual evidence, validation and remaining fidelity limitations.
