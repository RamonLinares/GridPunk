# GridPunk extraction verification

Verified 20 September 2026 against the standalone GridPunk working tree.

## Extraction

The original source repository at `montmelo/montmelo-circuit`, commit `0312d45fa9a9b32df149b72f66c1c1e433a14c26`, remained clean and unchanged. GridPunk has a separate Git repository. Dependencies were installed successfully with `npm ci --offline --ignore-scripts` using the local npm cache; no source-directory symlinks are required.

The root page loads the Neon garage directly. Legacy circuit query parameters cannot select another track. The other seven track definitions, scenery modules, map/elevation datasets, menu, and deployment metadata were removed. Shared code was specialized to the existing Neon behavior; vehicle dynamics, race format, city geometry and quality settings were retained. Runtime source/assets fell from approximately 5.2 MB to 856 KB under `src/`; public media is approximately 20 MB. Editable Blender/car sources are retained separately under `assets/`.

All browser preference and personal-best keys use a separate `gridpunk:` namespace. Procedural branding and page identity use GridPunk; original art and provenance records remain intact.

## Checks

- TypeScript and Vite production build: passed.
- Production Chrome tests: **2 passed**, desktop 1440 × 900 and touch mobile 390 × 844.
- Root startup and an old `?circuit=monaco` URL both loaded only Neon.
- Both garage cars loaded, including a real UI car change and persisted preference.
- Actual keyboard/touch acceleration, braking, camera change, recovery, mute, pause/resume and restart passed.
- Audio context unlocked and ran after input. Both viewports reported no JavaScript errors, console errors or HTTP error responses.
- Production exposed diagnostics but not the development `__game` handle.
- Extreme and cinematic graphics selections rendered without errors on both viewports.
- Nonblank active canvas: 157 sampled quantized colors on desktop, 98 on mobile.
- No horizontal viewport overflow; desktop/mobile garage and active-race screenshots visually inspected. The mobile garage scrolls to additional options while the race button stays accessible.
- Full-field simulation: all six cars completed two laps after 184 simulated seconds, with no barrier collisions or stopped time. One rival briefly crossed the track limits on its first lap (0.883 seconds offroad); that lap was correctly marked invalid. Every car completed a valid second lap.
- Original source Git status: clean after extraction.

Active-play diagnostics in performance mode reported 60 FPS on this machine, approximately 614 draw calls / 1.41M triangles desktop and 514 calls / 1.16M triangles in mobile emulation. These are host observations, not physical-phone performance measurements. The retained custom vehicle simulation uses a fixed 1/120-second step with six cars.

## Evidence and reproduction

Run `npm test` for the production checks. With `npm run dev` running, run `npm run verify:race` for the inherited longer race check.

Generated local evidence is ignored by Git:

- `artifacts/qa/desktop/garage.png`, `driving.png`, `extreme.png`, `cinematic.png`, `results.json`
- `artifacts/qa/mobile/garage.png`, `driving.png`, `extreme.png`, `cinematic.png`, `results.json`
- `artifacts/neon/browser-races.json` and race screenshots

## Scope and limitations

No new assets were generated: the circuit, procedural city, models, video, textures and audio come from the owner's original game. Exact media provenance and hashes are in `public/data/asset-manifest.json`; asset rights notices remain in `public/credits.html` and `public/licenses/`. Historical upstream design notes are separately identified under `docs/upstream/`.

The production build retains a large main JavaScript chunk (about 1.08 MB / 323 KB gzip), so Vite reports its existing size warning. The package remains a substantial Three.js scene; no performance redesign was requested. Mobile checks use Chrome touch emulation. Gamepad hardware, full replay export, and physical iOS/Android devices were not tested. Root-relative media paths assume deployment at a website root. The initial extraction was verified locally before publication; see [deployment verification](deployment.md) for the subsequent GitHub Pages setup.
