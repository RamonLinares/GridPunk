import type { CircuitId } from '../game/track/circuits';

// Retain the existing Rookie record key. Other handling records are not mixed in.
const key = (circuit: CircuitId) => `gridpunk:${circuit}-sprint-best-v1:easy`;
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Storage is optional: a blocked or full browser store must never end a race. */
export function readPersonalBest(circuit: CircuitId = 'neon'): number | null {
  try {
    const raw = localStorage.getItem(key(circuit));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch { return null; }
}

export function savePersonalBest(time: number, circuit: CircuitId = 'neon'): void {
  if (!valid(time)) return;
  try { localStorage.setItem(key(circuit), JSON.stringify(time)); }
  catch { /* The current session retains the record even without storage. */ }
}
