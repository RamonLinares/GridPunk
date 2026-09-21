import type { VehicleInput } from '../systems/VehiclePhysics';

export type DiscreteAction =
  | 'reset'
  | 'restart'
  | 'camera'
  | 'pause'
  | 'lights'
  | 'map'
  | 'grid'
  | 'mapSurface';

export class InputController {
  private readonly keys = new Set<string>();
  private throttle = 0;
  private brake = 0;
  private steer = 0;
  private handbrake = false;
  private readonly listeners = new Set<(action: DiscreteAction) => void>();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (this.keys.has(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'KeyR') this.emit(event.shiftKey ? 'restart' : 'reset');
    if (event.code === 'KeyC') this.emit('camera');
    if (event.code === 'KeyP' || event.code === 'Escape') this.emit('pause');
    if (event.code === 'KeyL') this.emit('lights');
    if (event.code === 'KeyM') this.emit('map');
    if (event.code === 'KeyG') this.emit('grid');
    if (event.code === 'KeyT') this.emit('mapSurface');
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.handbrake = false;
    this.throttle = this.brake = this.steer = 0;
    this.touchThrottle = this.touchBrake = this.touchSteer = 0;
    this.touchReverse = false;
    this.touchHandbrake = false;
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  onAction(listener: (action: DiscreteAction) => void): void {
    this.listeners.add(listener);
  }

  private emit(action: DiscreteAction): void {
    for (const listener of this.listeners) listener(action);
  }

  setTouch(partial: Partial<VehicleInput>): void {
    if (partial.steer !== undefined) this.touchSteer = partial.steer;
    if (partial.throttle !== undefined) this.touchThrottle = partial.throttle;
    if (partial.brake !== undefined) this.touchBrake = partial.brake;
    if (partial.allowReverse !== undefined) this.touchReverse = partial.allowReverse;
    if (partial.handbrake !== undefined) this.touchHandbrake = partial.handbrake;
  }

  private touchSteer = 0;
  private touchThrottle = 0;
  private touchBrake = 0;
  private touchReverse = false;
  private touchHandbrake = false;

  private gamepadSteer = 0;
  private gamepadThrottle = 0;
  private gamepadBrake = 0;
  private gamepadReverse = false;

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) {
      this.gamepadSteer = 0;
      this.gamepadThrottle = 0;
      this.gamepadBrake = 0;
      this.gamepadReverse = false;
      return;
    }
    const dead = (value: number, threshold = 0.08) =>
      Math.abs(value) < threshold ? 0 : (value - Math.sign(value) * threshold) / (1 - threshold);
    this.gamepadSteer = dead(pad.axes[0] ?? 0);
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    this.gamepadThrottle = Math.max(rt, pad.buttons[0]?.pressed ? 1 : 0);
    // Left trigger always brakes. Face-button B is the deliberate reverse
    // control, and also applies the brake while the car is still moving.
    this.gamepadReverse = pad.buttons[1]?.pressed ?? false;
    this.gamepadBrake = Math.max(lt, this.gamepadReverse ? 1 : 0);
  }

  read(dt: number): VehicleInput {
    this.pollGamepad();
    const keys = this.keys;
    const keySteer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const keyThrottle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
    const keyReverse = keys.has('KeyS') || keys.has('ArrowDown');
    const keyBrake = keyReverse || keys.has('Space') ? 1 : 0;
    // Handbrake moved off Space (now brake) to H.
    this.handbrake = keys.has('KeyH');

    const targetSteer = clamp(keySteer + this.gamepadSteer + this.touchSteer, -1, 1);
    const targetThrottle = clamp(Math.max(keyThrottle, this.gamepadThrottle, this.touchThrottle), 0, 1);
    const targetBrake = clamp(Math.max(keyBrake, this.gamepadBrake, this.touchBrake), 0, 1);

    // Smooth pedal inputs for a less binary, more analogue feel.
    const rate = 1 - Math.exp(-dt / 0.12);
    this.steer += (targetSteer - this.steer) * Math.min(1, rate * 1.6);
    this.throttle += (targetThrottle - this.throttle) * rate;
    this.brake += (targetBrake - this.brake) * (1 - Math.exp(-dt / 0.055));
    // Snap small residuals to exactly zero so smoothed pedals cannot leave a
    // permanent trickle of brake/throttle (which previously stuck the car).
    if (this.throttle < 0.004) this.throttle = 0;
    if (this.brake < 0.004) this.brake = 0;
    if (Math.abs(this.steer) < 0.004) this.steer = 0;

    return {
      throttle: this.throttle,
      brake: this.brake,
      steer: this.steer,
      handbrake: this.handbrake || this.touchHandbrake,
      allowReverse: keyReverse || this.gamepadReverse || this.touchReverse,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
