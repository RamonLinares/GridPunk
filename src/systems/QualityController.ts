export type QualityPreset = 'auto' | 'performance' | 'quality' | 'extreme';

export interface QualityState {
  preset: QualityPreset;
  /** 0 = performance, 1 = balanced auto step, 2 = full quality, 3 = opt-in Neon cinematic effects. */
  level: number;
  lastSampleFps: number;
}

/**
 * Keeps rendering policy separate from renderer mutations. Auto mode requires
 * sustained evidence before changing level and waits after each change, so a
 * single frame spike cannot rebuild post-processing targets during a corner.
 */
export class QualityController {
  private preset: QualityPreset = 'auto';
  private level = 1;
  private seconds = 0;
  private frames = 0;
  private warmupWindows = 1;
  private lowWindows = 0;
  private highWindows = 0;
  private settleSeconds = 0;
  private lastSampleFps = 60;

  constructor(preset: QualityPreset = 'auto') {
    this.setPreset(preset);
  }

  setPreset(preset: QualityPreset): boolean {
    const previous = this.level;
    this.preset = preset;
    this.level = preset === 'extreme' ? 3 : preset === 'performance' ? 0 : preset === 'quality' ? 2 : 1;
    this.resetEvidence();
    return previous !== this.level;
  }

  recordFrame(deltaSeconds: number): boolean {
    if (this.preset !== 'auto') return false;
    const delta = Math.min(0.25, Math.max(0, deltaSeconds));
    this.settleSeconds = Math.max(0, this.settleSeconds - delta);
    this.seconds += delta;
    this.frames += 1;
    if (this.seconds < 2) return false;

    const fps = this.frames / this.seconds;
    this.lastSampleFps = fps;
    this.seconds = 0;
    this.frames = 0;
    if (this.warmupWindows > 0) {
      this.warmupWindows -= 1;
      return false;
    }
    if (this.settleSeconds > 0) return false;

    const downThreshold = this.level === 2 ? 48 : 38;
    const upThreshold = this.level === 0 ? 56 : 58;
    this.lowWindows = fps < downThreshold ? this.lowWindows + 1 : 0;
    this.highWindows = fps >= upThreshold ? this.highWindows + 1 : 0;

    // Four seconds of low throughput steps down. Recovery is deliberately
    // slower (ten seconds) and uses a separate threshold to prevent ping-pong.
    if (this.level > 0 && this.lowWindows >= 2) {
      this.level -= 1;
      this.afterChange();
      return true;
    }
    if (this.level < 2 && this.highWindows >= 5) {
      this.level += 1;
      this.afterChange();
      return true;
    }
    return false;
  }

  getState(): QualityState {
    return { preset: this.preset, level: this.level, lastSampleFps: this.lastSampleFps };
  }

  private afterChange(): void {
    this.lowWindows = 0;
    this.highWindows = 0;
    this.settleSeconds = 6;
  }

  private resetEvidence(): void {
    this.seconds = 0;
    this.frames = 0;
    this.warmupWindows = 1;
    this.lowWindows = 0;
    this.highWindows = 0;
    this.settleSeconds = 0;
  }
}
