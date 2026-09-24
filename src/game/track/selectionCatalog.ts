// Keep menu metadata free of track points, Three.js, and race systems. This is
// the only circuit information the first screen needs before game import.
export type SelectionStage = 'cyberpunk' | 'solarpunk' | 'steampunk';
export type SelectionLayout = 'neon' | 'kairo' | 'mirage' | 'cinder' | 'sable' | 'orbit' | 'zenith' | 'talon';

export const STAGE_CHOICES = [
  { id: 'cyberpunk', name: 'Cyberpunk', prefix: 'CYBER', tagline: 'NEON / RAIN', description: 'Neon canyons. Midnight rain.', time: 'MIDNIGHT', weather: 'RAIN', surface: 'WET', code: '01' },
  { id: 'solarpunk', name: 'Solarpunk', prefix: 'SOLAR', tagline: 'GARDENS / SUN', description: 'Glass towers. Streets in bloom.', time: 'MIDDAY', weather: 'CLEAR', surface: 'DRY', code: '02' },
  { id: 'steampunk', name: 'Steampunk', prefix: 'STEAM', tagline: 'COPPER / STEAM', description: 'Copper skylines. Foundry smoke.', time: 'SUNSET', weather: 'SMOKE', surface: 'DRY', code: '03' },
] as const;

export const LAYOUT_CHOICES = [
  { id: 'neon', name: 'Neon District', length: '3.744', corners: 12, description: 'Tight city blocks. Banked turns. A tunnel through the heart of the district.' },
  { id: 'kairo', name: 'Kairo Loop', length: '5.807', corners: 18, description: 'Fast sweepers and a figure-eight flyover. The long way around the city.' },
  { id: 'mirage', name: 'Mirage Streets', length: '3.337', corners: 19, description: 'Walls within reach, a hairpin at walking pace and a 40 m climb through the old town.' },
  { id: 'cinder', name: 'Cinder Bend', length: '3.602', corners: 11, description: 'Short and steep. Climb 50 m to the crest, then plunge down a blind drop.' },
  { id: 'sable', name: 'Sable Ring', length: '4.657', corners: 14, description: 'A long opening straight, flowing mid-speed corners and a tight last sector.' },
  { id: 'orbit', name: 'Orbit Bowl', length: '5.414', corners: 22, description: 'Stop-start streets wrapped around a steeply banked stadium sweep.' },
  { id: 'zenith', name: 'Zenith Park', length: '5.513', corners: 20, description: 'A steep climb into turn one, esses at speed and a long back straight.' },
  { id: 'talon', name: 'Talon Run', length: '7.004', corners: 19, description: 'The long one. Dive into the valley, climb the ridge and hold it flat through the fast sweeps.' },
] as const;

const IMPORTED = ['mirage', 'cinder', 'sable', 'orbit', 'zenith', 'talon'] as const;
const variants = (suffix: string) => Object.fromEntries(IMPORTED.map(id => [id, `${id}${suffix}`])) as Record<typeof IMPORTED[number], string>;
export const SELECTION_CIRCUITS: Record<SelectionStage, Record<SelectionLayout, string>> = {
  cyberpunk: { neon: 'neon', kairo: 'kairo', ...variants('') },
  solarpunk: { neon: 'neon-solar', kairo: 'solar', ...variants('-solar') },
  steampunk: { neon: 'neon-steam', kairo: 'steam', ...variants('-steam') },
};

// Race titles as the game names them, so the loading card is right before the
// race code arrives.
const ROOTS: Record<typeof IMPORTED[number], string> = { mirage: 'Mirage', cinder: 'Cinder', sable: 'Sable', orbit: 'Orbit', zenith: 'Zenith', talon: 'Talon' };
export const CIRCUIT_TITLES: Record<string, string> = {
  neon: 'Neon District', kairo: 'Kairo Loop', solar: 'Kairo Solar', steam: 'Kairo Steam', 'neon-solar': 'Neon Solar', 'neon-steam': 'Neon Steam',
  ...Object.fromEntries(IMPORTED.flatMap(id => [
    [id, LAYOUT_CHOICES.find(option => option.id === id)!.name], [`${id}-solar`, `${ROOTS[id]} Solar`], [`${id}-steam`, `${ROOTS[id]} Steam`],
  ])),
};
