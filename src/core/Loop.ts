export class Loop {
  private frameId = 0;
  private lastTime = -1;
  private running = false;
  private elapsedSeconds = 0;

  constructor(
    private readonly update: (deltaSeconds: number, elapsedSeconds: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    this.elapsedSeconds = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (time: number) => {
    if (!this.running) return;
    if (this.lastTime < 0) {
      // First frame: establish the time base without integrating a bogus delta.
      this.lastTime = time;
      this.update(0, 0);
      this.render();
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }
    // Allow larger deltas so a fixed-timestep accumulator downstream can keep the
    // simulation in real time even when the frame rate drops.
    const deltaSeconds = Math.min(Math.max((time - this.lastTime) / 1000, 0), 0.25);
    this.lastTime = time;
    this.elapsedSeconds += deltaSeconds;
    this.update(deltaSeconds, this.elapsedSeconds);
    this.render();
    this.frameId = requestAnimationFrame(this.tick);
  };
}
