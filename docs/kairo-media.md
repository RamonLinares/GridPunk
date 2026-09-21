# Kairo video and audio integration

Kairo uses the owner's `external_assets/ramen.mp4` and `external_assets/bonsai.mp4` for two pairs of floating projections. The ramen appears at 4% and 48% of a lap; the bonsai at 27% and 75%. Black footage backgrounds disappear through additive blending. Each subject shares one video decoder across its two projections. Neon retains its original geisha and koi films and soundtracks.

The owner's `external_assets/video_billboard_mars.mp4` plays on a 56 × 37.77 m display on a dedicated media building beyond Turn 1, facing the opening straight. The original 688:464 aspect ratio is preserved. A dark cabinet, metal perimeter, wall brackets and two public-address horns attach it to the facade. Its sampled horizontal clearance to the road centerline is 34.42 m. The display uses an opaque emissive material, with reduced brightness to preserve the bright footage's details.

## Media and sound

- All three videos: H.264, 688 × 464, 24 fps, about 10 seconds, CRF 22, fast-start MP4, silent video track. WebP poster frames display until playback starts.
- Ramen: original supplied audio, extracted as 128 kb/s MP3 and spatialized near the projection.
- Bonsai: new 24-second ElevenLabs instrumental ambience loop, normalized to −17 LUFS and a −2 dBTP target. It repeats independently of the shorter visual loop. Runtime gain is 1.15, with 280 m range, 100 m reference distance and a gentle 110 m departure fade to remain audible during a drive-by.
- Mars: the supplied voice track, processed through 420–3200 Hz speaker bandwidth, +5 dB presence at 1.6 kHz, drive and tanh saturation, then 135/310/570 ms echoes. Normalized to −18 LUFS with −2 dBTP target; trimmed/padded to the video duration. Runtime spatial filtering, panning, departure fade, reverb and Doppler add the sense of an amplified announcement passing overhead. Gain is 0.85, with a 220 m range and 75 m reference distance.

The browser fetches no provider APIs. Sound sources use the existing audio master, user-gesture unlock, mute/pause behavior and teardown. Nearby video decoders pause outside their radius (550 m for projections, 800 m for the billboard) and when the document is hidden. Each audio scene fades at its own range and stops its source. Neon retains its original 170 m range. All three audio scenes are included in replay/export mixing.

## ElevenLabs generation record

Credential probe: `ELEVENLABS_API_KEY=SET`. No credential is stored in the repository or browser.

The first request to the [ElevenLabs Music endpoint](https://elevenlabs.io/docs/api-reference/music/compose) returned HTTP 401 with `missing_permissions`: this account key lacks `music_generation`. The final audio was generated successfully through `/v1/sound-generation`, model `eleven_text_to_sound_v2`, duration 24 s, `loop=true`, prompt influence 0.5, output `mp3_44100_128`. This is a musical ambience asset generated with Sound Generation, not an output of Eleven Music. No voice ID or voice conversion was used. The provider request uses the owner's configured account; no plan or rights assertion is inferred from the credential's presence.

Prompt:

> Seamless meditative cyberpunk bonsai instrumental loop. Sparse delicate koto plucks in a slow pentatonic melody, breathy bamboo flute answers, warm sustained analog synth drone, tiny shimmering bell harmonics and quiet granular texture. An organic tree made of green light. Gentle, intimate, mysterious and soothing. No vocals, speech, drums or environmental noises. Steady harmony, no sudden transitions, matching start and end.

The successful source is `artifacts/kairo-videos/bonsai-eleven-loop.mp3`; the shipped result is `public/circuits/kairo-bonsai-music.mp3`. `scripts/audio/generate-kairo-bonsai.py` reproduces the provider request (a paid generation when explicitly run). `scripts/audio/prepare-kairo-media.sh` reproduces local optimization and audio processing from the source clips and generated loop.

## Verification

`node scripts/verify-kairo-videos.mjs` runs against the development server on port 5198. It checks desktop 1440 × 900 and touch-emulated 390 × 844 playback, decoded frames, active audio emitters, source selection, aspect ratio, billboard placement, distance pausing and audio mute/pause. A Neon load checks that its original videos remain selected and that no Mars billboard is created. Evidence is under `artifacts/kairo-videos/`.

Physical-device performance and subjective listening on speakers/headphones have not been verified by the automated checks.

Verified on 21 September 2026: production build passed; all four production circuit smoke tests passed on desktop/mobile; final media checks passed with every audio source ready and active and zero browser/HTTP errors. Road views were visually reviewed, including the unobstructed billboard after its bracket adjustment. Shipped Kairo media totals 6,836,764 bytes across nine files. Audio decodes cleanly without clipped samples; the generated ambience has 24.0 s of decoded audio. The existing large-bundle build warning remains. Full replay exports and subjective listening were not audited.

## Drive-by visibility and audibility correction

The initial side-mounted screen was difficult to read at racing speed. It has been replaced with a dedicated 62 m media building beyond Turn 1: the screen faces directly down the opening straight, above a recessed concourse. The complete podium footprint clears the road centerline by 34.42 m. Nearby low buildings preserve the view into the turn. The footage retains its aspect ratio and the billboard's voice remains spatialized.

The bonsai's original −21 LUFS file, 0.28 gain and 32 m departure fade made it easy for engines to mask the music. The file is now normalized to −17 LUFS; its own audio scene uses 1.15 gain, a 280 m range, 100 m reference distance and 110 m departure fade. This raises the closest approach by approximately 17 dB and preserves music as the car passes. These settings also feed replay audio; Neon keeps its original defaults.

`node scripts/verify-kairo-driveby.mjs` checks three approach positions on desktop/mobile in Performance and Quality modes. It also moves a 45 m/s listener past both bonsai placements and measures the actual Web Audio output, with samples before, beneath and after each tree. The final run measured approximately −25 to −17 dBFS RMS beneath the trees, with nonzero output still present 100 m afterward. Pause and out-of-range source shutdown passed, and no browser/HTTP errors were recorded. Visual evidence and numeric readings are in `artifacts/kairo-fixes/`.

After the drive-by correction, `npm run build` and all four `tests/neon.spec.ts` production checks passed for Neon/Kairo on desktop/mobile. The new drive-by script passed in Performance and Quality modes. The mix remains unclipped at the file level (maximum −7.5 dBFS); subjective speaker/headphone listening remains outside this automated verification.
