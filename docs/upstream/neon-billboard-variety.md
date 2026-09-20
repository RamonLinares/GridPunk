# Neon billboard variety and koi visibility

Six original posters generated with the built-in OpenAI image generation tool on 20 September 2026. No reference artwork was copied into these assets.

## Saved artwork

Runtime atlas: `public/circuits/neon-billboard-atlas-v2.webp` (1536 × 3072, nine 512 × 1024 cells with four-pixel gutters). Keeps the original ECHO, AKARI and NOCTILUCA artwork, adds MIDNIGHT, ORBITAL, PULSE, SYNAPSE, NIGHTSHIFT and AERIAL. Generated originals and review images are retained locally under `artifacts/neon/billboards/` and excluded from deployment. The existing atlas remains intact.

## Implementation

- Shared campaign palette for procedural billboards and Blender landmark signs. One compressed atlas, shared textures per upload orientation. Sign count and dynamic light count are unchanged.
- Campaign selection balances overall usage and penalizes nearby repeats within 180 metres. Imported building clones receive their own campaign, instead of inheriting the same one from the model template.
- Billboard light scattering follows the selected campaign's palette.
- Koi projection RGB output is multiplied by 1.85 and its existing fog-scattered glow by 1.3. Geisha brightness, audio, hologram count, positions and media decoders are unchanged.

## Generation prompts

### midnight-noodles

Use case: ads-marketing. Create one original fictional cyberpunk advertising poster as a game billboard texture, flat artwork edge to edge, no photographed billboard, no frame, no surrounding city. Tall portrait 1:2 aspect ratio. Cinematic photorealistic product advertising, dark charcoal negative space, very crisp central subject visible from a racing car, restrained luminous highlights, sophisticated commercial composition. No real brands or copyrighted characters. Exact short text only as specified. Subject: a steaming bowl of ramen suspended with chopsticks, glossy black bowl and sumptuous amber broth, a tiny robotic hand serving it; food is the hero, not a human portrait. Warm amber and vermilion palette, dramatic studio lighting, curls of steam. Large top text: 'MIDNIGHT'. Bottom text: 'NOODLES / OPEN ALL NIGHT'.

### orbital

Use case: ads-marketing. Create one original fictional cyberpunk advertising poster as a game billboard texture, flat artwork edge to edge, no photographed billboard, no frame, no surrounding city. Tall portrait 1:2 aspect ratio. Cinematic photorealistic product advertising, dark charcoal negative space, very crisp central subject visible from a racing car, restrained luminous highlights, sophisticated commercial composition. No real brands or copyrighted characters. Exact short text only as specified. Subject: an elegant passenger spacecraft flying above the curved blue limb of a planet, a luminous crescent and tiny distant space station; evocative retrofuturist luxury travel advertisement. Deep indigo, ice blue, white, a little warm gold. Large top text: 'ORBITAL'. Bottom text: 'LEAVE THE NOISE BELOW'.

### pulse

Use case: ads-marketing. Create one original fictional cyberpunk advertising poster as a game billboard texture, flat artwork edge to edge, no photographed billboard, no frame, no surrounding city. Tall portrait 1:2 aspect ratio. Cinematic photorealistic product advertising, dark charcoal negative space, very crisp central subject visible from a racing car, restrained luminous highlights, sophisticated commercial composition. No real brands or copyrighted characters. Exact short text only as specified. Subject: a brushed titanium beverage can with magenta condensation and black angular typography, floating diagonally among fluid ribbons and electric droplets; premium product macro photograph. Punchy crimson and hot pink against almost black. Large text: 'PULSE'. Smaller text: 'AFTER DARK ENERGY'.

### synapse

Use case: ads-marketing. Create one original fictional cyberpunk advertising poster as a game billboard texture, flat artwork edge to edge, no photographed billboard, no frame, no surrounding city. Tall portrait 1:2 aspect ratio. Cinematic photorealistic product advertising, dark charcoal negative space, very crisp central subject visible from a racing car, restrained luminous highlights, sophisticated commercial composition. No real brands or copyrighted characters. Exact short text only as specified. Subject: a translucent glass human head in profile containing delicate glowing violet and cyan neural fibres, luxury technology advertisement with realistic glass caustics and subtle haze. The face is sculpture, not a real person. Large text: 'SYNAPSE'. Smaller text: 'MAKE ROOM FOR TOMORROW'.

### nightshift

Use case: ads-marketing. Create one original fictional cyberpunk advertising poster as a game billboard texture, flat artwork edge to edge, no photographed billboard, no frame, no surrounding city. Tall portrait 1:2 aspect ratio. Cinematic photorealistic product advertising, dark charcoal negative space, very crisp central subject visible from a racing car, restrained luminous highlights, sophisticated commercial composition. No real brands or copyrighted characters. Exact short text only as specified. Subject: chrome over-ear headphones floating over a luminous vinyl disc and layered soundwave rings, vivid purple and electric lime accent lighting; premium futuristic underground music campaign. Realistic brushed metal and rubber, strong graphic silhouette. Large text: 'NIGHTSHIFT'. Smaller text: 'FEEL THE FREQUENCY'.

### aerial

Use case: ads-marketing. Create one original fictional cyberpunk advertising poster as a game billboard texture, flat artwork edge to edge, no photographed billboard, no frame, no surrounding city. Tall portrait 1:2 aspect ratio. Cinematic photorealistic product advertising, dark charcoal negative space, very crisp central subject visible from a racing car, restrained luminous highlights, sophisticated commercial composition. No real brands or copyrighted characters. Exact short text only as specified. Subject: a compact amber robotic delivery drone carrying a sealed white parcel, beautifully detailed articulated motors, rimlit orange against dark petrol blue, a few motion trails behind it; witty premium future courier advertisement. Large text: 'AERIAL'. Smaller text: 'YOUR CITY. DELIVERED.'.


## Verification

TypeScript and production build; local Chrome gameplay with acceleration; checks that all nine campaigns are used, all nine occur across the 18 imported landmarks, and campaign screens match their building assignment. Driving screenshots at six positions include both koi approaches. Review results: `artifacts/neon/billboards/results.json`.

Passed: 97 ad placements, 10–11 uses of each campaign, nearest repeated placement 180.14 m, all 18 landmark screens matched their assigned artwork, no console/page errors. Koi RGB multiplier verified as 1.85 relative to the unchanged geisha material. The nine-campaign WebP is approximately 1 MB. Build emits the existing large-JavaScript-chunk advisory.
