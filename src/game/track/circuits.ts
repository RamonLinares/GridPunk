import { neonBankAt, neonRoadLiftAt } from './NeonProfile';
import { KAIRO_POINTS, KAIRO_CORNERS, kairoRoadLiftAt } from './kairoData';
import { NEON_POINTS } from './neonData';

export type StageId = 'cyberpunk' | 'solarpunk' | 'steampunk';
export type LayoutId = 'neon' | 'kairo';
export type CircuitId = 'neon' | 'kairo' | 'solar' | 'steam' | 'neon-solar' | 'neon-steam';
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
  cornerMarkers?: readonly { readonly name: string; readonly progress: number }[];
  surfaceLiftAt?: (progress: number) => number;
  bankingAt?: (progress: number) => number;
  points: readonly (readonly [number, number, number])[];
}
export const CIRCUITS: Record<CircuitId, CircuitDefinition> = {
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
export const LAYOUT_NAMES: Record<LayoutId, string> = { neon: 'Neon District', kairo: 'Kairo Loop' };
export const circuitsForStage = (stage: StageId): CircuitDefinition[] => Object.values(CIRCUITS).filter(c => c.stage === stage).sort((a, b) => a.layout === b.layout ? 0 : a.layout === 'neon' ? -1 : 1);
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
