# Race effects and HUD

Applies to both cars and all six stage/circuit combinations.

## Car effects

`src/systems/CarEffects.ts` drives per-car effects for the player and all five rivals:

- **Rain spray**: rooster tails from both rear tyres, scaled by speed and the circuit's rain exposure (none in tunnels or on the dry Solarpunk and Steampunk circuits). Rivals beyond 170 m emit nothing.
- **Tail-lamp trails** (night Cyberpunk circuits): camera-facing red ribbons from the outer edges of each rival's lamp cluster, found from the brake-lamp geometry. They last about 0.2 s and brighten under braking. The player's own trail is off, because it would stream back through the chase camera.
- **Over-run backfires**: flame pops from the exhaust outlets when the throttle snaps shut at high revs, with occasional crackle on the over-run. The Shinsei and K89 have their own outlet positions.
- **Rival tyre smoke** when a rival slides, plus carbon debris on heavy contacts, alongside the existing sparks.

`src/systems/Vfx.ts` gains spray, flame and debris pools. Particles use a squared radial falloff so overlapping puffs read as mist. Streaked particles (sparks) take their screen direction from two projected points, so motion toward the lens still streaks correctly.

A high-speed air-streak effect was tried and removed at the owner's request. Above about 160 km/h it read as white rectangles on screen.

**Rival liveries**: `ShinseiCarModel.ts` re-hues the crimson paint in the baked body texture to each rival's livery colour in the shader, leaving carbon, metal, decals and wear untouched. The Shinsei rivals (#4 teal, #77 graphite) no longer look identical to the player's car. The model's baked "6" number decal is unchanged.

## HUD

- **Live delta to personal best** under the lap time. The current lap records elapsed time every 10 m (`src/systems/LapDelta.ts`). A valid lap that sets a new best becomes the reference, and it is stored next to the best time so the delta is available from the next session. The delta shows only on a valid lap that started at the line.
- **Running order tower** (desktop): six rows with position, team colour chip, code and number, and the interval to the car ahead. The interval converts race distance to seconds at the trailing car's speed, so it is an estimate. The tower is hidden on phones and short viewports.
- **Position changes**: the position number pulses green or red with a direction chevron.
- **Final lap** banner when lap 3 begins.
- **Shift lights** are green, red, then blue, and flash at redline. Reduced-motion users get no pulse or flash.

## Verification

Desktop and touch-emulated mobile views were checked on Neon, Kairo, Kairo Solar and Kairo Steam with no page errors. Rival liveries were captured headlessly (`artifacts/rival-liveries/`). The live delta was checked against a seeded reference trace. It hides correctly on invalid laps and developer mid-lap starts.
