export type GamepadSession = 'welcome' | 'race' | 'pause' | 'finish';

interface GamepadActionsOptions {
  getSession: () => GamepadSession;
  isReady: () => boolean;
  overlay: HTMLElement;
  primary: HTMLButtonElement;
  pause: HTMLButtonElement;
  camera: HTMLButtonElement;
  recover: HTMLButtonElement;
  onActiveDisconnect: () => void;
  getGamepads?: () => readonly (Gamepad | null)[];
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

type Direction = 'up' | 'down' | 'left' | 'right';

interface PadState {
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  start: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const RELEASE_THRESHOLD = 0.38;
const PRESS_THRESHOLD = 0.62;
const EMPTY_STATE: PadState = {
  a: false, b: false, x: false, y: false, start: false,
  up: false, down: false, left: false, right: false,
};

/** Discrete standard-gamepad actions for menus and race-session controls. */
export class GamepadActions {
  private readonly getGamepads: () => readonly (Gamepad | null)[];
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private activeIndex: number | null = null;
  private activeId: string | null = null;
  private previous: PadState = { ...EMPTY_STATE };
  private waitingForNeutral = true;
  private aMenuArmed = false;
  private bMenuArmed = false;
  private frame = 0;
  private disposed = false;

  constructor(private readonly options: GamepadActionsOptions) {
    this.getGamepads = options.getGamepads ?? (() => navigator.getGamepads?.() ?? []);
    this.requestFrame = options.requestFrame ?? (callback => window.requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? (handle => window.cancelAnimationFrame(handle));
    window.addEventListener('gamepaddisconnected', this.onDisconnected);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onNonGamepadInput);
    window.addEventListener('pointerdown', this.onNonGamepadInput);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.frame = this.requestFrame(this.poll);
  }

  private readonly onDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad.index === this.activeIndex && event.gamepad.id === this.activeId) this.releaseActivePad(true);
  };

  private readonly onBlur = (): void => {
    this.resetInputGate();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.resetInputGate();
  };

  private readonly onNonGamepadInput = (): void => {
    document.body.classList.remove('gamepad-navigation');
  };

  private markGamepadNavigation(): void {
    document.body.classList.add('gamepad-navigation');
  }

  private resetInputGate(): void {
    this.previous = { ...EMPTY_STATE };
    this.waitingForNeutral = true;
    this.aMenuArmed = false;
    this.bMenuArmed = false;
  }

  private readonly poll = (): void => {
    if (this.disposed) return;
    this.pollOnce();
    this.frame = this.requestFrame(this.poll);
  };

  /** Public for deterministic source-level tests; production calls it via rAF. */
  pollOnce(): void {
    if (document.hidden || !document.hasFocus()) {
      this.resetInputGate();
      return;
    }
    const pads = this.getGamepads();
    const first = this.firstConnectedPad(pads);
    const identityChanged = first?.index !== this.activeIndex || first?.id !== this.activeId;
    if (identityChanged) {
      if (this.activeIndex !== null) this.releaseActivePad(true);
      if (first?.mapping === 'standard') this.activate(first);
    }
    const pad = first?.mapping === 'standard' ? first : null;
    if (!pad || pad.index !== this.activeIndex || pad.id !== this.activeId) return;

    const state = this.readState(pad);
    if (this.waitingForNeutral) {
      this.previous = state;
      if (this.isNeutral(pad, state)) {
        this.waitingForNeutral = false;
        this.previous = { ...EMPTY_STATE };
      }
      return;
    }

    const sessionAtStart = this.options.getSession();
    if (state.start && !this.previous.start) this.activateStart();
    // A and pause-menu B commit on release. Both are analogue driving buttons
    // during a race, so release avoids carrying throttle/reverse into gameplay.
    if (state.a && !this.previous.a) this.aMenuArmed = sessionAtStart !== 'race';
    if (!state.a && this.previous.a) {
      if (this.aMenuArmed) this.activateFocused();
      this.aMenuArmed = false;
    }
    if (state.b && !this.previous.b) this.bMenuArmed = sessionAtStart === 'pause';
    if (!state.b && this.previous.b) {
      if (this.bMenuArmed && this.options.getSession() === 'pause') {
        this.markGamepadNavigation();
        this.options.primary.click();
      }
      this.bMenuArmed = false;
    }
    if (this.options.getSession() === 'race') {
      if (state.x && !this.previous.x) this.options.camera.click();
      if (state.y && !this.previous.y) this.options.recover.click();
    } else {
      for (const direction of ['up', 'down', 'left', 'right'] as const) {
        if (state[direction] && !this.previous[direction]) this.moveMenuFocus(direction);
      }
    }
    this.previous = state;
  }

  private activate(pad: Gamepad): void {
    this.activeIndex = pad.index;
    this.activeId = pad.id;
    this.resetInputGate();
  }

  private firstConnectedPad(pads: readonly (Gamepad | null)[]): Gamepad | null {
    return pads.find(candidate => candidate?.connected) ?? null;
  }

  private releaseActivePad(pauseRace: boolean): void {
    if (pauseRace && this.options.getSession() === 'race') this.options.onActiveDisconnect();
    this.activeIndex = null;
    this.activeId = null;
    this.resetInputGate();
  }

  private readState(pad: Gamepad): PadState {
    const pressed = (index: number): boolean => Boolean(pad.buttons[index]?.pressed);
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    return {
      a: pressed(0), b: pressed(1), x: pressed(2), y: pressed(3), start: pressed(9),
      up: pressed(12) || axisY <= -PRESS_THRESHOLD,
      down: pressed(13) || axisY >= PRESS_THRESHOLD,
      left: pressed(14) || axisX <= -PRESS_THRESHOLD,
      right: pressed(15) || axisX >= PRESS_THRESHOLD,
    };
  }

  private isNeutral(pad: Gamepad, state: PadState): boolean {
    return !Object.values(state).some(Boolean)
      && Math.abs(pad.axes[0] ?? 0) < RELEASE_THRESHOLD
      && Math.abs(pad.axes[1] ?? 0) < RELEASE_THRESHOLD;
  }

  private activateStart(): void {
    if (!this.options.isReady()) return;
    this.markGamepadNavigation();
    if (this.options.getSession() === 'race') this.options.pause.click();
    else this.options.primary.click();
  }

  private activateFocused(): void {
    if (!this.options.isReady() || this.options.getSession() === 'race') return;
    this.markGamepadNavigation();
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.menuControls().includes(focused)) focused.click();
    else this.options.primary.focus({ preventScroll: true });
  }

  private moveMenuFocus(direction: Direction): void {
    const controls = this.menuControls();
    if (!controls.length) return;
    this.markGamepadNavigation();
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const assist = current?.closest<HTMLElement>('.assist-row');
    if (assist && (direction === 'left' || direction === 'right')) {
      const choices = controls.filter(control => control.closest('.assist-row') === assist);
      const index = choices.indexOf(current!);
      choices[(index + (direction === 'left' ? -1 : 1) + choices.length) % choices.length]?.focus({ preventScroll: true });
      return;
    }
    const index = controls.indexOf(current!);
    if (index < 0) {
      (controls.includes(this.options.primary) ? this.options.primary : controls[0])?.focus({ preventScroll: true });
      return;
    }
    const delta = direction === 'up' || direction === 'left' ? -1 : 1;
    controls[(index + delta + controls.length) % controls.length]?.focus({ preventScroll: true });
  }

  private menuControls(): HTMLElement[] {
    return [...this.options.overlay.querySelectorAll<HTMLElement>('button:not([disabled]), summary')]
      .filter(element => !element.hidden && !element.closest('[hidden]'));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFrame(this.frame);
    window.removeEventListener('gamepaddisconnected', this.onDisconnected);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onNonGamepadInput);
    window.removeEventListener('pointerdown', this.onNonGamepadInput);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.body.classList.remove('gamepad-navigation');
  }
}
