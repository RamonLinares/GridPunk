import type { CircuitId } from '../game/track/circuits';
import type { AssistLevel } from './VehiclePhysics';

const key = (assist: AssistLevel, circuit: CircuitId) => `gridpunk:${circuit}-sprint-best-v1:${assist}`;
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Storage is optional: a blocked or full browser store must never end a race. */
export function readPersonalBest(assist: AssistLevel, circuit: CircuitId = 'neon'): number | null {
  try {
    const raw = localStorage.getItem(key(assist, circuit));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch { return null; }
}

export function savePersonalBest(assist: AssistLevel, time: number, circuit: CircuitId = 'neon'): void {
  if (!valid(time)) return;
  try { localStorage.setItem(key(assist, circuit), JSON.stringify(time)); }
  catch { /* The current session retains the record even without storage. */ }
}
