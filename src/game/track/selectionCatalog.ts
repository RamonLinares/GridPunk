// Keep menu metadata free of track points, Three.js, and race systems. This is
// the only circuit information the first screen needs before game import.
export type SelectionStage = 'cyberpunk' | 'solarpunk' | 'steampunk';
export type SelectionLayout = 'neon' | 'kairo';

export const STAGE_CHOICES = [
  { id: 'cyberpunk', name: 'Cyberpunk', prefix: 'CYBER', tagline: 'NEON / RAIN', description: 'Neon canyons. Midnight rain.', conditions: 'NIGHT RACE / WET ASPHALT', code: '01' },
  { id: 'solarpunk', name: 'Solarpunk', prefix: 'SOLAR', tagline: 'GARDENS / SUN', description: 'Glass towers. Streets in bloom.', conditions: 'DAY RACE / DRY ASPHALT', code: '02' },
  { id: 'steampunk', name: 'Steampunk', prefix: 'STEAM', tagline: 'COPPER / STEAM', description: 'Copper skylines. Foundry smoke.', conditions: 'SUNSET RACE / DRY ASPHALT', code: '03' },
] as const;

export const LAYOUT_CHOICES = [
  { id: 'neon', name: 'Neon District', length: '3.744', corners: 12, description: 'Tight city blocks. Banked turns. A tunnel through the heart of the district.' },
  { id: 'kairo', name: 'Kairo Loop', length: '5.807', corners: 18, description: 'Fast sweepers and a figure-eight flyover. The long way around the city.' },
] as const;

export const SELECTION_CIRCUITS: Record<SelectionStage, Record<SelectionLayout, string>> = {
  cyberpunk: { neon: 'neon', kairo: 'kairo' },
  solarpunk: { neon: 'neon-solar', kairo: 'solar' },
  steampunk: { neon: 'neon-steam', kairo: 'steam' },
};
