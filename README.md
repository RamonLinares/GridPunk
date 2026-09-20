# GridPunk

A standalone cyberpunk racing game set entirely in **Neon District**, extracted from the owner's Gridbound / montmelo-circuit game. Three laps, six cars, 3.744 km of rain-soaked streets.

[Play GridPunk](https://gridpunk.smallweblab.com/) · [GitHub repository](https://github.com/RamonLinares/GridPunk)

![Neon District](public/circuits/neon.webp)

## Run

Use Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5198/**. The garage loads directly; choose your car and press **Lights out. Let’s race.** No circuit parameter is required. Old links containing `?circuit=...` also load Neon.

## What's included

- Shinsei ND-01 and Kurogane K89-R, with a mixed grid of five AI rivals.
- Neon city, skyways, elevated/banked road sections, tunnel, wet surfaces, animated signs, flying traffic and video holograms.
- Rain, engine and spatial hologram audio.
- Driver assists, rival difficulty, automatic/performance/quality/extreme graphics.
- Keyboard, gamepad and touch controls, multiple cameras, recovery, pause and restart.
- Lap/sector timing, personal bests and lap replay/export.
- Original Blender models, car source and asset build scripts.

The other seven circuits, multi-circuit selector, real-world map/elevation data and deployment configuration from the original game are excluded. GridPunk has its own `gridpunk:` browser storage keys and independent Git history.

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

## Build and verify

```sh
npm run build       # TypeScript + production bundle in dist/
npm run preview     # http://127.0.0.1:4198/
npm test            # Builds and tests production in Chrome, desktop + touch mobile
npm run verify:race # With dev server running: six cars complete two simulated laps
```

The browser checks use installed Google Chrome. `BASE_URL` can override the development URL for `verify:race`. Test screenshots and diagnostics go under `artifacts/`; see [verification](docs/verification.md).

GitHub Actions builds and deploys `dist/` to GitHub Pages after every push to `main`. The custom domain is **gridpunk.smallweblab.com**, configured in GitHub Pages settings. Cloudflare DNS uses a DNS-only CNAME named `gridpunk` pointing to `ramonlinares.github.io`. GitHub Pages serves the site and manages its HTTPS certificate.

The standard GitHub Pages URL redirects to the custom domain. Runtime media uses root-relative URLs, so deploying under a subdirectory instead would require URL changes. To redeploy without a code change, run the **Deploy GridPunk to GitHub Pages** workflow manually from the repository's Actions tab.

## Source and assets

- `src/game/track/neonData.ts`, `NeonProfile.ts`: layout, banking and elevated road.
- `src/game/Neon*.ts`: city and night effects.
- `src/entities/`: both cars and their runtime models.
- `src/systems/`: driving, rivals, audio, cameras, timing and replay.
- `public/circuits/`, `public/cars/`: self-contained runtime media/models.
- `assets/`, `scripts/blender/`: authoring sources; Blender is only needed to rebuild models.
- [Credits](public/credits.html) and [asset manifest](public/data/asset-manifest.json): retained provenance. Asset hashes regenerate before builds.
- [Archived design notes](docs/upstream/README.md): original Neon development documentation.

Extracted on 20 September 2026 from local `montmelo/montmelo-circuit` at commit `0312d45fa9a9b32df149b72f66c1c1e433a14c26`. The source repository was not modified. Runtime and build do not depend on that folder. No new blanket licence is assigned to the owner's code or assets; existing third-party notices remain in `public/licenses/`.
