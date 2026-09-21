# GridPunk

A cyberpunk racing game set in **Neon District**. Three laps, six cars, and two rain-soaked street circuits: Neon District (3.744 km) and Kairo Loop (5.807 km).

[Play GridPunk](https://gridpunk.smallweblab.com/) · [GitHub repository](https://github.com/RamonLinares/GridPunk)

![Neon District](public/circuits/neon.webp)

## Play

[Open GridPunk in your browser](https://gridpunk.smallweblab.com/), choose your circuit and car, then press **Start race**.

## What's included

- Kairo Loop: An 18-corner layout adapted to the city, including a grade-separated figure-eight flyover. Open directly with `?circuit=kairo`.
- Shinsei ND-01 and Kurogane K89-R, with a mixed grid of five AI rivals.
- Neon city, skyways, elevated/banked road sections, tunnel, wet surfaces, animated signs, flying traffic and video holograms.
- Rain, engine and spatial hologram audio.
- Fixed Rookie driver assists, independent rival difficulty, automatic/performance/quality/extreme/cinematic graphics.
- Keyboard, gamepad and touch controls, multiple cameras, recovery, pause and restart.
- Lap/sector timing, personal bests and lap replay/export.
- Original Blender models, car source and asset build scripts.

## Controls

| Action | Keyboard |
| --- | --- |
| Accelerate / steer | W / A / D or arrow keys |
| Brake | Space or S / Down |
| Reverse at rest | S / Down |
| Camera | C |
| Recover to track | R |
| Pause / resume | Escape |

Gamepad: left stick and triggers; Start pauses, X changes camera, Y recovers. Touch buttons appear on touch devices.

## Development

To run the game locally, install Node.js 22.12+ and npm, then run these commands from the project folder:

```sh
npm ci
npm run dev
```

Open the local address printed in the terminal.

### Build and test

```sh
npm run build       # TypeScript + production bundle in dist/
npm run preview     # http://127.0.0.1:4198/
npm test            # Builds and tests production in Chrome, desktop + touch mobile
npm run verify:race # With dev server running: six cars complete two simulated laps
```

Browser tests require Google Chrome. See [verification](docs/verification.md) for test details.

Pushes to `main` deploy automatically to GitHub Pages. See [deployment notes](docs/deployment.md) for hosting and domain configuration.

## Source and assets

- `src/game/track/neonData.ts`, `NeonProfile.ts`: layout, banking and elevated road.
- `src/game/Neon*.ts`: city and night effects.
- `src/entities/`: both cars and their runtime models.
- `src/systems/`: driving, rivals, audio, cameras, timing and replay.
- `public/circuits/`, `public/cars/`: self-contained runtime media/models.
- `assets/`, `scripts/blender/`: authoring sources; Blender is only needed to rebuild models.
- [Credits](public/credits.html) and [asset manifest](public/data/asset-manifest.json): asset sources and licences.

Third-party asset notices are in [credits](public/credits.html) and `public/licenses/`.
