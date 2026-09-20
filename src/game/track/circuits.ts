import { neonBankAt, neonRoadLiftAt } from './NeonProfile';
import { NEON_POINTS } from './neonData';

export type CircuitId = 'neon';
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
};
/** GridPunk always races Neon, including old links with a circuit query. */
export function selectedCircuit(): CircuitDefinition {
  return CIRCUITS.neon;
}
