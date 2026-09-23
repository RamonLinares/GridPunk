/**
 * Live delta to the personal-best lap. The current lap records its elapsed
 * time every 10 m of distance from the line; a valid lap that sets a new best
 * becomes the reference and is stored beside the best time, so the delta is
 * available from the first lap of the next session.
 */
const STEP = 10;

export class LapDelta {
  private reference: Float32Array | null = null;
  private referenceTime: number | null = null;
  private current: number[] = [];
  private readonly key: string;

  constructor(private readonly lapLength: number, circuitId: string, storedBest: number | null) {
    this.key = `gridpunk:pb-trace:${circuitId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? 'null') as { time: number; trace: number[] } | null;
      // Only trust a trace that belongs to the stored personal best.
      if (saved && storedBest !== null && Math.abs(saved.time - storedBest) < .002 && saved.trace.length > 4) {
        this.reference = Float32Array.from(saved.trace); this.referenceTime = saved.time;
      }
    } catch { /* Storage can be unavailable in private browsing. */ }
  }

  /** Call every frame with distance from the line and elapsed lap time. */
  record(distance: number, lapTime: number): void {
    const slot = Math.floor(Math.max(0, distance) / STEP);
    while (this.current.length <= slot && this.current.length * STEP < this.lapLength + STEP) this.current.push(lapTime);
  }

  /** Seconds ahead (negative) or behind (positive) the reference at this distance; null without a reference. */
  delta(distance: number, lapTime: number): number | null {
    const ref = this.reference;
    if (!ref || distance < STEP * 2) return null;
    const f = Math.min(ref.length - 1.001, Math.max(0, distance / STEP));
    const i = Math.floor(f), t = f - i;
    const referenceTime = ref[i] + (ref[Math.min(ref.length - 1, i + 1)] - ref[i]) * t;
    return lapTime - referenceTime;
  }

  /** Closes the lap; adopts it as the reference when it is a valid new best. */
  completeLap(time: number | null, valid: boolean): void {
    if (valid && time !== null && (this.referenceTime === null || time < this.referenceTime) && this.current.length > 4) {
      this.current.push(time);
      this.reference = Float32Array.from(this.current); this.referenceTime = time;
      try { localStorage.setItem(this.key, JSON.stringify({ time, trace: this.current.map(v => Math.round(v * 1000) / 1000) })); } catch { /* ignore */ }
    }
    this.current = [];
  }

  /** A restart or invalidation discards the partial lap. */
  reset(): void { this.current = []; }
}
