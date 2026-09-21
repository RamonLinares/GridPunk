"""Historical generator for the replaced bonsai ambience (one paid call).
The game now uses the owner-supplied song through prepare-kairo-media.sh."""
import json, os, pathlib, urllib.request, urllib.error
out = pathlib.Path('artifacts/kairo-shamisen')
out.mkdir(parents=True, exist_ok=True)
body = {
    'text': 'Relaxing solo acoustic Japanese shamisen, gently plucking a simple warm pentatonic phrase. Slow, sparse notes, soft attacks, natural wooden resonance and delicate decays. Peaceful bonsai garden mood, comfortable pauses between phrases, consistent gentle volume. Clean intimate recording, subtle room reverb. Only shamisen: no voices, drums, synthesizers, drones, bells, flute or background noise. Seamless loop, calm throughout.',
    'duration_seconds': 22, 'loop': True, 'prompt_influence': 0.65,
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
