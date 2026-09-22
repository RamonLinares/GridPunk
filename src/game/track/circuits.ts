import { neonBankAt, neonRoadLiftAt } from './NeonProfile';
import { KAIRO_POINTS, KAIRO_CORNERS, kairoRoadLiftAt } from './kairoData';
import { NEON_POINTS } from './neonData';

export type CircuitId = 'neon' | 'kairo' | 'solar';
export interface CircuitDefinition {
  id: CircuitId;
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
    id: 'neon', name: 'Neon District', location: 'GridPunk City · After dark', shortName: 'Neon District',
    mapCode: 'GP / NEO', lengthLabel: '3.744', cornerCount: 12, coordinates: 'ORIGINAL FICTIONAL CIRCUIT',
    sectorFractions: [.333, .667], points: NEON_POINTS,
    bankingAt: neonBankAt, surfaceLiftAt: neonRoadLiftAt,
  },
  kairo: {
    id: 'kairo', name: 'Kairo Loop', location: 'GridPunk City · After dark', shortName: 'Kairo Loop',
    mapCode: 'GP / KAI', lengthLabel: '5.807', cornerCount: 18, coordinates: 'FIGURE-EIGHT CITY CIRCUIT',
    sectorFractions: [.37609781298432926, .8110900637162046], points: KAIRO_POINTS,
    surfaceLiftAt: kairoRoadLiftAt, gradeSeparated: true, cornerMarkers: KAIRO_CORNERS,
  },
  // The Kairo layout by day: same centreline, flyover and corners, rebuilt as
  // a solarpunk garden city with a clear afternoon sky.
  solar: {
    id: 'solar', name: 'Kairo Solar', location: 'GridPunk City · Daylight', shortName: 'Kairo Solar',
    mapCode: 'GP / SOL', lengthLabel: '5.807', cornerCount: 18, coordinates: 'FIGURE-EIGHT GARDEN CIRCUIT',
    sectorFractions: [.37609781298432926, .8110900637162046], points: KAIRO_POINTS,
    surfaceLiftAt: kairoRoadLiftAt, gradeSeparated: true, cornerMarkers: KAIRO_CORNERS,
  },
};
/** Circuits whose road is the Kairo figure-eight, including its flyover deck. */
export const isKairoLayout = (id: CircuitId): boolean => id === 'kairo' || id === 'solar';
/** Unknown and legacy circuit links still fall back to Neon District. */
export function selectedCircuit(search = window.location.search): CircuitDefinition {
  const id = new URLSearchParams(search).get('circuit');
  return id === 'kairo' ? CIRCUITS.kairo : id === 'solar' ? CIRCUITS.solar : CIRCUITS.neon;
}
