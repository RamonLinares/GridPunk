"""Generate the owner-requested bonsai music with ElevenLabs Sound Generation (one paid call)."""
import json, os, pathlib, urllib.request, urllib.error
out = pathlib.Path('artifacts/kairo-videos')
out.mkdir(parents=True, exist_ok=True)
body = {
    'text': 'Seamless meditative cyberpunk bonsai instrumental loop. Sparse delicate koto plucks in a slow pentatonic melody, breathy bamboo flute answers, warm sustained analog synth drone, tiny shimmering bell harmonics and quiet granular texture. An organic tree made of green light. Gentle, intimate, mysterious and soothing. No vocals, speech, drums or environmental noises. Steady harmony, no sudden transitions, matching start and end.',
    'duration_seconds': 24, 'loop': True, 'prompt_influence': 0.5,
    'model_id': 'eleven_text_to_sound_v2',
}
key = os.environ.get('ELEVENLABS_API_KEY')
if not key: raise SystemExit('ELEVENLABS_API_KEY=MISSING')
request = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', data=json.dumps(body).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(request, timeout=240) as response:
        audio = response.read()
        metadata = {**body, 'provider': 'ElevenLabs', 'endpoint': '/v1/sound-generation', 'output_format': 'mp3_44100_128', 'song_id': response.headers.get('song-id'), 'bytes': len(audio)}
except urllib.error.HTTPError as error:
    raise SystemExit(f'ElevenLabs HTTP {error.code}: {error.read().decode()[:1200]}')
(out / 'bonsai-eleven-loop.mp3').write_bytes(audio)
(out / 'bonsai-music-generation.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps({'provider':'ElevenLabs', 'bytes':len(audio), 'song_id':metadata['song_id']}))
