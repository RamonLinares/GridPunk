import { neonBankAt, neonRoadLiftAt } from './NeonProfile';
import { KAIRO_POINTS, KAIRO_CORNERS, kairoRoadLiftAt } from './kairoData';
import { NEON_POINTS } from './neonData';
import { IMPORTED_LAYOUTS } from './importedLayouts';

export type StageId = 'cyberpunk' | 'solarpunk' | 'steampunk';
/** Layouts adapted from the owner's reference project, with fictional names. */
export type ImportedLayoutId = keyof typeof IMPORTED_LAYOUTS;
export type LayoutId = 'neon' | 'kairo' | ImportedLayoutId;
export type CircuitId = 'neon' | 'kairo' | 'solar' | 'steam' | 'neon-solar' | 'neon-steam' | ImportedLayoutId | `${ImportedLayoutId}-solar` | `${ImportedLayoutId}-steam`;
export interface CircuitDefinition {
  id: CircuitId;
  stage: StageId;
  layout: LayoutId;
  name: string;
  location: string;
  shortName: string;
  mapCode: string;
  lengthLabel: string;
  cornerCount: number;
  coordinates: string;
  sectorFractions: readonly [number, number];
  /** Standing-start line, when separate from the timing control line. */
  gridStartFraction?: number;
  gradeSeparated?: boolean;
  /** The surveyed climb is kept: the city is built on terrain that follows the road. */
  terrainFollow?: boolean;
  cornerMarkers?: readonly { readonly name: string; readonly progress: number }[];
  surfaceLiftAt?: (progress: number) => number;
  bankingAt?: (progress: number) => number;
  points: readonly (readonly [number, number, number])[];
}
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** Identity, character and optional banking for each imported layout. */
const IMPORTED_IDENTITY: Record<ImportedLayoutId, { name: string; root: string; code: string; lengthLabel: string; cornerCount: number; character: string; bankingAt?: (progress: number) => number }> = {
  sable: { name: 'Sable Ring', root: 'Sable', code: 'SAB', lengthLabel: '4.657', cornerCount: 14, character: 'FLOWING GRAND PRIX CIRCUIT' },
  talon: { name: 'Talon Run', root: 'Talon', code: 'TAL', lengthLabel: '7.004', cornerCount: 19, character: 'LONG HIGH-SPEED CIRCUIT' },
  mirage: { name: 'Mirage Streets', root: 'Mirage', code: 'MIR', lengthLabel: '3.337', cornerCount: 19, character: 'TIGHT STREET CIRCUIT' },
  // A 24% gradient banked sweep through the middle of the lap.
  orbit: { name: 'Orbit Bowl', root: 'Orbit', code: 'ORB', lengthLabel: '5.414', cornerCount: 22, character: 'BANKED STADIUM CIRCUIT',
    bankingAt: progress => Math.atan(.24) * ease((progress - .411) / .017) * ease((.505 - progress) / .017) },
  zenith: { name: 'Zenith Park', root: 'Zenith', code: 'ZEN', lengthLabel: '5.513', cornerCount: 20, character: 'SWEEPING PARKLAND CIRCUIT' },
  cinder: { name: 'Cinder Bend', root: 'Cinder', code: 'CIN', lengthLabel: '3.602', cornerCount: 11, character: 'COMPACT CANYON CIRCUIT' },
};
const STAGE_VARIANTS = [
  { stage: 'cyberpunk', suffix: '', location: 'GridPunk City · After dark', code: '' },
  { stage: 'solarpunk', suffix: '-solar', location: 'GridPunk City · Daylight', code: 'S' },
  { stage: 'steampunk', suffix: '-steam', location: 'GridPunk City · Foundry sunset', code: 'T' },
] as const;
const importedCircuits = Object.fromEntries((Object.keys(IMPORTED_LAYOUTS) as ImportedLayoutId[]).flatMap(layout => {
  const data: { points: readonly (readonly [number, number, number])[]; sectors: readonly [number, number]; corners?: readonly number[]; grid?: number } = IMPORTED_LAYOUTS[layout];
  const identity = IMPORTED_IDENTITY[layout];
  return STAGE_VARIANTS.map(variant => {
    const id = `${layout}${variant.suffix}` as CircuitId;
    const name = variant.stage === 'cyberpunk' ? identity.name : `${identity.root} ${variant.stage === 'solarpunk' ? 'Solar' : 'Steam'}`;
    const definition: CircuitDefinition = {
      id, stage: variant.stage, layout, name, shortName: name, location: variant.location,
      mapCode: `GP / ${identity.code}${variant.code}`, lengthLabel: identity.lengthLabel, cornerCount: identity.cornerCount,
      coordinates: identity.character, sectorFractions: data.sectors, points: data.points, gridStartFraction: data.grid,
      bankingAt: identity.bankingAt, terrainFollow: true, cornerMarkers: data.corners?.map((progress, i) => ({ name: `Turn ${i + 1}`, progress })),
    };
    return [id, definition] as const;
  });
})) as Record<`${ImportedLayoutId}` | `${ImportedLayoutId}-solar` | `${ImportedLayoutId}-steam`, CircuitDefinition>;
export const CIRCUITS: Record<CircuitId, CircuitDefinition> = {
  ...importedCircuits,
  neon: {
    id: 'neon', stage: 'cyberpunk', layout: 'neon', name: 'Neon District', location: 'GridPunk City · After dark', shortName: 'Neon District',
    mapCode: 'GP / NEO', lengthLabel: '3.744', cornerCount: 12, coordinates: 'ORIGINAL FICTIONAL CIRCUIT',
    sectorFractions: [.333, .667], points: NEON_POINTS,
    bankingAt: neonBankAt, surfaceLiftAt: neonRoadLiftAt,
  },
  kairo: {
    id: 'kairo', stage: 'cyberpunk', layout: 'kairo', name: 'Kairo Loop', location: 'GridPunk City · After dark', shortName: 'Kairo Loop',
    mapCode: 'GP / KAI', lengthLabel: '5.807', cornerCount: 18, coordinates: 'FIGURE-EIGHT CITY CIRCUIT',
    sectorFractions: [.37609781298432926, .8110900637162046], points: KAIRO_POINTS,
    surfaceLiftAt: kairoRoadLiftAt, gradeSeparated: true, cornerMarkers: KAIRO_CORNERS,
  },
  // The Kairo layout by day: same centreline, flyover and corners, rebuilt as
  // a solarpunk garden city with a clear afternoon sky.
  solar: {
    id: 'solar', stage: 'solarpunk', layout: 'kairo', name: 'Kairo Solar', location: 'GridPunk City · Daylight', shortName: 'Kairo Solar',
    mapCode: 'GP / SOL', lengthLabel: '5.807', cornerCount: 18, coordinates: 'FIGURE-EIGHT GARDEN CIRCUIT',
    sectorFractions: [.37609781298432926, .8110900637162046], points: KAIRO_POINTS,
    surfaceLiftAt: kairoRoadLiftAt, gradeSeparated: true, cornerMarkers: KAIRO_CORNERS,
  },
  steam: {
    id: 'steam', stage: 'steampunk', layout: 'kairo', name: 'Kairo Steam', location: 'GridPunk City · Foundry sunset', shortName: 'Kairo Steam',
    mapCode: 'GP / STM', lengthLabel: '5.807', cornerCount: 18, coordinates: 'FIGURE-EIGHT FOUNDRY CIRCUIT',
    sectorFractions: [.37609781298432926, .8110900637162046], points: KAIRO_POINTS,
    surfaceLiftAt: kairoRoadLiftAt, gradeSeparated: true, cornerMarkers: KAIRO_CORNERS,
  },
  'neon-solar': {
    id: 'neon-solar', stage: 'solarpunk', layout: 'neon', name: 'Neon Solar', shortName: 'Neon Solar',
    location: 'GridPunk City · Daylight', mapCode: 'GP / NSO', lengthLabel: '3.744', cornerCount: 12,
    coordinates: 'GARDEN DISTRICT CIRCUIT', sectorFractions: [.333, .667], points: NEON_POINTS,
    bankingAt: neonBankAt, surfaceLiftAt: neonRoadLiftAt,
  },
  'neon-steam': {
    id: 'neon-steam', stage: 'steampunk', layout: 'neon', name: 'Neon Steam', shortName: 'Neon Steam',
    location: 'GridPunk City · Foundry sunset', mapCode: 'GP / NST', lengthLabel: '3.744', cornerCount: 12,
    coordinates: 'FOUNDRY DISTRICT CIRCUIT', sectorFractions: [.333, .667], points: NEON_POINTS,
    bankingAt: neonBankAt, surfaceLiftAt: neonRoadLiftAt,
  },
};
export const STAGES: Record<StageId, { id: StageId; name: string; description: string }> = {
  cyberpunk: { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon nights · Rain-soaked streets' },
  solarpunk: { id: 'solarpunk', name: 'Solarpunk', description: 'Garden cities · Clean energy' },
  steampunk: { id: 'steampunk', name: 'Steampunk', description: 'Copper skylines · Steam and machinery' },
};
export const LAYOUT_NAMES: Record<LayoutId, string> = {
  neon: 'Neon District', kairo: 'Kairo Loop',
  ...Object.fromEntries(Object.entries(IMPORTED_IDENTITY).map(([id, identity]) => [id, identity.name])) as Record<ImportedLayoutId, string>,
};
/** Menu order: the originals first, then the imported layouts by length. */
export const LAYOUT_ORDER: readonly LayoutId[] = ['neon', 'kairo', 'mirage', 'cinder', 'sable', 'orbit', 'zenith', 'talon'];
export const circuitsForStage = (stage: StageId): CircuitDefinition[] => Object.values(CIRCUITS).filter(c => c.stage === stage).sort((a, b) => LAYOUT_ORDER.indexOf(a.layout) - LAYOUT_ORDER.indexOf(b.layout));
export const circuitFor = (stage: StageId, layout: LayoutId): CircuitDefinition => circuitsForStage(stage).find(c => c.layout === layout)!;
export const isKairoLayout = (id: CircuitId): boolean => CIRCUITS[id].layout === 'kairo';
export const isNeonLayout = (id: CircuitId): boolean => CIRCUITS[id].layout === 'neon';
export const isDryCircuit = (id: CircuitId): boolean => CIRCUITS[id].stage !== 'cyberpunk';
/** Old circuit links retain their identity. Stage + layout links also resolve to a unique race. */
export function selectedCircuit(search = window.location.search): CircuitDefinition {
  const params = new URLSearchParams(search), id = params.get('circuit'), stage = params.get('stage');
  const circuit = id && Object.hasOwn(CIRCUITS, id) ? CIRCUITS[id as CircuitId] : CIRCUITS.neon;
  return stage && Object.hasOwn(STAGES, stage) ? circuitFor(stage as StageId, circuit.layout) : circuit;
}
