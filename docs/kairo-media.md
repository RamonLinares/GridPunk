# Kairo video and audio integration

Kairo uses the owner's `external_assets/ramen.mp4` and `external_assets/bonsai.mp4` for two pairs of floating projections. The ramen appears at 4% and 48% of a lap; the bonsai at 27% and 75%. Black footage backgrounds disappear through additive blending. Each subject shares one video decoder across its two projections. Neon retains its original geisha and koi films and soundtracks.

The owner's `external_assets/video_billboard_mars.mp4` plays on a 56 × 37.77 m display on a dedicated media building beyond Turn 1, facing the opening straight. The original 688:464 aspect ratio is preserved. A dark cabinet, metal perimeter, wall brackets and two public-address horns attach it to the facade. Its sampled horizontal clearance to the road centerline is 34.42 m. The display uses an opaque emissive material, with reduced brightness to preserve the bright footage's details.

## Media and sound

- All three videos: H.264, 688 × 464, 24 fps, about 10 seconds, CRF 22, fast-start MP4, silent video track. WebP poster frames display until playback starts.
- Ramen: original supplied audio, extracted as 128 kb/s MP3 and spatialized near the projection.
- Bonsai: first 10 seconds of the owner-supplied `external_assets/Shamisen Solo.mp3`, normalized to −17 LUFS and a −2 dBTP target. It repeats independently of the visual loop. Runtime gain is 0.58, with 280 m range, 100 m reference distance and a gentle 110 m departure fade to remain audible during a drive-by.
- Mars: the supplied voice track, processed through 420–3200 Hz speaker bandwidth, +5 dB presence at 1.6 kHz, drive and tanh saturation, then 135/310/570 ms echoes. Normalized to −18 LUFS with −2 dBTP target; trimmed/padded to the video duration. Runtime spatial filtering, panning, departure fade, reverb and Doppler add the sense of an amplified announcement passing overhead. Gain is 0.85, with a 220 m range and 75 m reference distance.

The browser fetches no provider APIs. Sound sources use the existing audio master, user-gesture unlock, mute/pause behavior and teardown. Nearby video decoders pause outside their radius (550 m for projections, 800 m for the billboard) and when the document is hidden. Each audio scene fades at its own range and stops its source. Neon retains its original 170 m range. All three audio scenes are included in replay/export mixing.

## Bonsai source and processing

The current music is the owner's `external_assets/Shamisen Solo.mp3` (173.56 seconds, stereo, 48 kHz). Only its first 10 seconds are exported to `public/circuits/kairo-bonsai-music.mp3`, as 128 kb/s stereo MP3 at 48 kHz. Embedded cover artwork and metadata are stripped from the runtime file. Processing normalizes the excerpt to a −17 LUFS / −2 dBTP target, with a 15 ms fade-in and 150 ms fade-out to soften the loop boundary. Runtime gain remains 0.58.

`scripts/audio/prepare-kairo-media.sh` reproduces the excerpt directly from the supplied song. No provider API or generation is required. This replaces the earlier ElevenLabs-generated soundtrack; the historical generator is retained only as a record of that previous asset.

## Verification

`node scripts/verify-kairo-videos.mjs` runs against the development server on port 5198. It checks desktop 1440 × 900 and touch-emulated 390 × 844 playback, decoded frames, active audio emitters, source selection, aspect ratio, billboard placement, distance pausing and audio mute/pause. A Neon load checks that its original videos remain selected and that no Mars billboard is created. Evidence is under `artifacts/kairo-videos/`.

Physical-device performance and subjective listening on speakers/headphones have not been verified by the automated checks.

Before the shamisen replacement, verified on 21 September 2026: production build passed; all four production circuit smoke tests passed on desktop/mobile; final media checks passed with every audio source ready and active and zero browser/HTTP errors. Road views were visually reviewed, including the unobstructed billboard after its bracket adjustment. Shipped Kairo media totals 6,836,764 bytes across nine files. Audio decodes cleanly without clipped samples; the generated ambience has 24.0 s of decoded audio. The existing large-bundle build warning remains. Full replay exports and subjective listening were not audited.

## Drive-by visibility and audibility correction

The initial side-mounted screen was difficult to read at racing speed. It has been replaced with a dedicated 62 m media building beyond Turn 1: the screen faces directly down the opening straight, above a recessed concourse. The complete podium footprint clears the road centerline by 34.42 m. Nearby low buildings preserve the view into the turn. The footage retains its aspect ratio and the billboard's voice remains spatialized.

The bonsai's original −21 LUFS file, 0.28 gain and 32 m departure fade made it easy for engines to mask the music. At that stage, the file was normalized to −17 LUFS; its own audio scene used 1.15 gain, a 280 m range, 100 m reference distance and 110 m departure fade. This raises the closest approach by approximately 17 dB and preserves music as the car passes. These settings also feed replay audio; Neon keeps its original defaults.

`node scripts/verify-kairo-driveby.mjs` checks three approach positions on desktop/mobile in Performance and Quality modes. It also moves a 45 m/s listener past both bonsai placements and measures the actual Web Audio output, with samples before, beneath and after each tree. The final run measured approximately −25 to −17 dBFS RMS beneath the trees, with nonzero output still present 100 m afterward. Pause and out-of-range source shutdown passed, and no browser/HTTP errors were recorded. Visual evidence and numeric readings are in `artifacts/kairo-fixes/`.

After the drive-by correction, `npm run build` and all four `tests/neon.spec.ts` production checks passed for Neon/Kairo on desktop/mobile. The new drive-by script passed in Performance and Quality modes. The mix remains unclipped at the file level (maximum −7.5 dBFS); subjective speaker/headphone listening remains outside this automated verification.

## Relaxing shamisen replacement

The previous 22-second loop replaced the previous layered ambience with the owner-requested solo shamisen Sound Effects generation. The same spatial mix is retained. Local processing targets −17 LUFS / −2 dBTP and applies 15 ms edge fades to reduce the loop boundary discontinuity. The decoded stereo peak is 0.789 (below clipping); the boundary step is about 0.002.

The production build passed. Targeted desktop and touch-emulated mobile Chrome checks verified decoding, active sound at both bonsai placements during drive-bys, continuous source looping for longer than one complete cycle, pause and out-of-range shutdown, and no browser/HTTP errors. Natural pauses in the plucked phrases create lower instantaneous levels than the previous sustained ambience; complete-cycle RMS is checked separately. The final edge-smoothed file also passed a fresh browser decode check. Evidence and generation settings are under `artifacts/kairo-shamisen/`. Automated measurements do not assess subjective musical quality.

## Bonsai volume adjustment

After the shamisen replacement, the owner requested a lower volume. Kairo's bonsai runtime gain is now 0.58 instead of 1.15 (−5.95 dB). Both projections and replay mixing use this same scene gain. The audio file, 280 m range and departure fade are unchanged. Browser inspection confirmed the new gain on desktop and touch-emulated mobile.

## Uploaded song excerpt verification

The owner-supplied replacement decodes to exactly 10.000 seconds. Its waveform correlation with the beginning of the supplied song is 0.9993 after processing; decoded stereo peak is 0.760 and the loop-boundary sample step is below 0.0001. The production build passed. Desktop and touch-emulated mobile Chrome checks confirmed 10-second decoding, audible output beneath both bonsai projections, looping, pause/resume and out-of-range shutdown, with no browser/HTTP errors. Runtime gain remains 0.58. Evidence is under `artifacts/kairo-bonsai-upload/`; the full source stays in `external_assets/`, while only the 161 KB excerpt ships in the game.
