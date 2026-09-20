import type { TrackSpline } from '../game/track/TrackSpline';

export interface LapRecord {
  lap: number;
  time: number;
  sectors: [number, number, number];
  valid: boolean;
}

export class Timing {
  currentLapTime = 0;
  lastLap: number | null = null;
  bestLap: number | null = null;
  lap = 1;
  sectors: [number | null, number | null, number | null] = [null, null, null];
  bestSectors: [number | null, number | null, number | null] = [null, null, null];
  lapValid = true;
  private sectorStart = 0;
  private currentSector = 0;
  private previousProgress = 0;
  private readonly lapLength: number;
  private readonly sectorFractions: readonly number[];
  private readonly history: LapRecord[] = [];
  private started = false;
  private distanceSinceLine = 0;
  private lapArmed = false;

  constructor(spline: TrackSpline) {
    this.lapLength = spline.length;
    this.sectorFractions = spline.circuit.sectorFractions;
  }

  reset(): void {
    this.currentLapTime = 0;
    this.lastLap = null;
    this.bestLap = null;
    this.lap = 1;
    this.sectors = [null, null, null];
    this.bestSectors = [null, null, null];
    this.currentSector = 0;
    this.sectorStart = 0;
    this.previousProgress = 0;
    this.history.length = 0;
    this.started = false;
    this.distanceSinceLine = 0;
    this.lapArmed = false;
    this.lapValid = true;
  }

  start(progress = 0): void {
    this.started = true;
    this.currentLapTime = 0;
    this.sectorStart = 0;
    this.currentSector = 0;
    this.sectors = [null, null, null];
    this.previousProgress = progress;
    this.distanceSinceLine = 0;
    this.lapArmed = progress < this.lapLength * 0.05;
    this.lapValid = true;
  }

  /** Recovery may finish a race lap, but cannot create a personal best. */
  invalidateLap(progress?: number): void {
    this.lapValid = false;
    if (progress !== undefined) this.previousProgress = progress;
  }

  /** progress is the arc-length position along the lap in metres. */
  update(dt: number, progress: number, _cache: { index: number }): { lapCompleted: number | null; sectorCompleted: number | null } {
    const result = { lapCompleted: null as number | null, sectorCompleted: null as number | null };
    if (!this.started || !(dt > 0)) return result;
    this.currentLapTime += dt;

    let delta = progress - this.previousProgress;
    if (delta > this.lapLength * 0.5) delta -= this.lapLength;
    else if (delta < -this.lapLength * 0.5) delta += this.lapLength;
    // A teleport cannot stand in for driving through the sector checkpoints.
    if (Math.abs(delta) > Math.max(30, dt * 140)) this.lapValid = false;
    this.distanceSinceLine += delta;
    const forwardWrap = delta > 0 && progress < this.previousProgress - this.lapLength * 0.5;

    if (forwardWrap) {
      const remaining = this.lapLength - this.previousProgress;
      const afterCrossing = dt * (1 - Math.min(1, remaining / Math.max(0.001, delta)));
      const crossingTime = this.currentLapTime - afterCrossing;
      if (this.lapArmed && this.distanceSinceLine > this.lapLength * 0.85 && this.currentSector === 2) {
        this.sectors[2] = crossingTime - this.sectorStart;
        this.lastLap = crossingTime;
        if (this.lapValid) {
          if (this.bestLap === null || crossingTime < this.bestLap) this.bestLap = crossingTime;
          for (let sector = 0; sector < 3; sector++) {
            const value = this.sectors[sector]!;
            if (this.bestSectors[sector] === null || value < this.bestSectors[sector]!) this.bestSectors[sector] = value;
          }
        }
        this.history.push({ lap: this.lap, time: crossingTime, sectors: [...this.sectors] as [number, number, number], valid: this.lapValid });
        result.lapCompleted = this.lap++;
      }
      // The grid-to-line segment is excluded from the first timed lap.
      this.currentLapTime = afterCrossing;
      this.sectorStart = 0;
      this.sectors = [null, null, null];
      this.currentSector = 0;
      this.distanceSinceLine = progress;
      this.lapArmed = true;
      this.lapValid = true;
    } else if (delta > 0 && this.lapArmed) {
      for (let sector = this.currentSector; sector < this.sectorFractions.length; sector++) {
        const boundary = this.sectorFractions[sector] * this.lapLength;
        if (this.previousProgress < boundary && progress >= boundary) {
          const crossingTime = this.currentLapTime - dt * (progress - boundary) / delta;
          this.sectors[sector] = crossingTime - this.sectorStart;
          this.sectorStart = crossingTime;
          this.currentSector = sector + 1;
          result.sectorCompleted = sector;
        }
      }
    }
    this.previousProgress = progress;
    return result;
  }

  getHistory(): LapRecord[] {
    return this.history;
  }
}

export function formatTime(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return '--:--.---';
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor(totalMs / 1000) % 60;
  const ms = totalMs % 1000;
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
