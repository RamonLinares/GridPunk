import * as THREE from 'three';

export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  /** Brake can engage reverse once forward motion has stopped. */
  allowReverse?: boolean;
}

export interface SurfaceInfo {
  mu: number;
  rolling: number;
  drag: number;
  rumble: number;
}

export interface VehicleConfig {
  mass: number;
  inertia: number;
  wheelbase: number;
  cogToFront: number;
  cogHeight: number;
  wheelRadius: number;
  power: number;
  maxTractionForce: number;
  dragArea: number;
  downforce: number;
  brakeForce: number;
  maxSteer: number;
  steerSpeed: number;
  gearRatios: number[];
  finalDrive: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  idleRpm: number;
  maxRpm: number;
}

export const DEFAULT_CONFIG: VehicleConfig = {
  mass: 798,
  inertia: 1150,
  wheelbase: 3.2,
  cogToFront: 1.55,
  cogHeight: 0.32,
  wheelRadius: 0.36,
  power: 660000,
  maxTractionForce: 12500,
  dragArea: 1.35,
  downforce: 3.2,
  brakeForce: 44000,
  maxSteer: 0.5,
  steerSpeed: 2.6,
  gearRatios: [3.35, 2.55, 2.0, 1.62, 1.34, 1.12, 0.95, 0.82],
  finalDrive: 4.4,
  shiftUpRpm: 13600,
  shiftDownRpm: 8200,
  idleRpm: 4200,
  maxRpm: 15000,
};

export type AssistLevel = 'easy' | 'normal' | 'hard';

/**
 * Driving-aid presets. `tc` caps drive as a fraction of rear grip (lower =
 * more lateral headroom), `esc` scales the yaw-rate stability control, `bleed`
 * scales side-slip damping, `steer` scales steering lock, `clamp` limits yaw
 * rate and `steerRate` scales how fast the wheel turns.
 *
 * `lateralCap` and `lockTime` are the human driver's steering ergonomics and
 * only apply once `setDriverSteering(true)` has been called (the game does so
 * for the player's car; rivals keep the raw response their controller was
 * tuned for). `lateralCap` bounds the lateral acceleration full lock may ask
 * for, in m/s², which stops the lock from staying so large at speed that a
 * key tap yaws the car several degrees. `lockTime` keeps the time to reach
 * full lock constant, so the wheel no longer swings straight to a tiny lock
 * within a single frame at 250 km/h. Zero disables either. `servoFloor` is
 * the stability servo's authority before side-slip builds (0.4 is the raw
 * value) and `servoGainFloor` a floor on its error-proportional gain: both
 * make the yaw rate follow the wheel sooner on turn-in and die away sooner
 * after release, so responsiveness comes from the servo rather than from a
 * big lock. A tap and the first 300 ms of a held press are the same physics,
 * so these values are a chosen balance, not a decoupling.
 */
export const ASSIST_PRESETS: Record<AssistLevel, {
  tc: number; esc: number; bleed: number; steer: number; clamp: number; steerRate: number;
  lateralCap: number; lockTime: number; servoFloor: number; servoGainFloor: number;
}> = {
  easy: { tc: 0.62, esc: 1.8, bleed: 1.7, steer: 0.85, clamp: 1.0, steerRate: 0.8, lateralCap: 64, lockTime: 0.18, servoFloor: 0.85, servoGainFloor: 1.4 },
  normal: { tc: 0.72, esc: 1.0, bleed: 1.0, steer: 1.0, clamp: 1.6, steerRate: 1.0, lateralCap: 80, lockTime: 0.10, servoFloor: 0.6, servoGainFloor: 1.0 },
  hard: { tc: 0.92, esc: 0.35, bleed: 0.45, steer: 1.12, clamp: 2.4, steerRate: 1.25, lateralCap: 0, lockTime: 0, servoFloor: 0.4, servoGainFloor: 0 },
};

export interface Telemetry {
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steer: number;
  slipAngleFront: number;
  slipAngleRear: number;
  lateralG: number;
  longitudinalG: number;
  wheelSlip: number;
  onTrack: boolean;
}

const RHO = 1.225;
const GRAVITY = 9.81;

/**
 * Physics-steady dynamic bicycle model with a simplified Pacejka tire curve.
 * Produces believable weight transfer, downforce, traction-limited cornering and
 * power-limited top speed while remaining deterministic at a fixed timestep.
 */
export class VehiclePhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  vLong = 0;
  vLat = 0;
  omega = 0;
  gear = 1;
  rpm = DEFAULT_CONFIG.idleRpm;
  steer = 0;
  wheelSpinAngle = 0;
  engineForce = 0;

  telemetry: Telemetry = {
    speed: 0, rpm: 0, gear: 1, throttle: 0, brake: 0, steer: 0,
    slipAngleFront: 0, slipAngleRear: 0, lateralG: 0, longitudinalG: 0,
    wheelSlip: 0, onTrack: true,
  };

  private readonly cfg: VehicleConfig;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private aLong = 0;
  private aLat = 0;
  private lastRumble = 0;
  private shiftTimer = 0;
  private assists = { tc: true, abs: true };
  private assistLevel: AssistLevel = 'normal';
  private driverSteering = false;

  constructor(cfg: Partial<VehicleConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  reset(position: THREE.Vector3, yaw: number): void {
    this.position.copy(position);
    this.yaw = yaw;
    this.vLong = 0;
    this.vLat = 0;
    this.omega = 0;
    this.gear = 1;
    this.rpm = this.cfg.idleRpm;
    this.steer = 0;
    this.engineForce = 0;
    this.velocity.set(0, 0, 0);
    this.aLong = 0;
    this.aLat = 0;
    this.shiftTimer = 0;
    this.wheelSpinAngle = 0;
    Object.assign(this.telemetry, {
      speed: 0, rpm: this.rpm, gear: 1, throttle: 0, brake: 0, steer: 0,
      slipAngleFront: 0, slipAngleRear: 0, lateralG: 0, longitudinalG: 0,
      wheelSlip: 0, onTrack: true,
    });
  }

  setAssists(tc: boolean, abs: boolean): void {
    this.assists.tc = tc;
    this.assists.abs = abs;
  }

  getAssists(): { tc: boolean; abs: boolean } {
    return { ...this.assists };
  }

  setAssistLevel(level: AssistLevel): void {
    this.assistLevel = level;
  }

  getAssistLevel(): AssistLevel {
    return this.assistLevel;
  }

  /**
   * Enables the preset's human steering ergonomics (`lateralCap`, `lockTime`).
   * Off by default so rivals and the recorded handling baselines are unchanged.
   */
  setDriverSteering(enabled: boolean): void {
    this.driverSteering = enabled;
  }

  isDriverSteering(): boolean {
    return this.driverSteering;
  }

  /** Full hairpin lock at low speed; retain the established fast-corner feel. */
  getSteeringLimit(): number {
    const speed = Math.abs(this.vLong);
    const aid = ASSIST_PRESETS[this.assistLevel];
    const fastLock = this.cfg.maxSteer * aid.steer * Math.max(.12, 1 / (1 + speed * .075));
    // The previous reduction already removed half the lock at 40 km/h, and
    // Rookie removed another 15%. Slowing down must make tight turns possible.
    const blend = THREE.MathUtils.smoothstep(speed, 8, 25);
    const limit = THREE.MathUtils.lerp(this.cfg.maxSteer * 1.3, fastLock, blend);
    if (!this.driverSteering || aid.lateralCap <= 0) return limit;
    // The stability control steers the yaw rate to v·tan(δ)/L, so full lock
    // asks for v²·tan(δ)/L of lateral acceleration. Bound that demand: the
    // 1/(1+0.075v) lock above only shrinks linearly, which left a tap at
    // 250 km/h requesting several g and a heading change of many degrees.
    const v = Math.max(speed, 1);
    return Math.min(limit, Math.atan(aid.lateralCap * this.cfg.wheelbase / (v * v)));
  }

  /** Apply a world-space impulse (m/s) split into the car's forward/lateral axes. */
  applyWorldImpulse(wx: number, wz: number): void {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.vLong += wx * fx + wz * fz;
    this.vLat += wx * rx + wz * rz;
    this.velocity.copy(this.forwardVector).multiplyScalar(this.vLong).addScaledVector(this.rightVector, this.vLat);
    this.telemetry.speed = Math.hypot(this.vLong, this.vLat);
  }

  get forwardVector(): THREE.Vector3 {
    return this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get rightVector(): THREE.Vector3 {
    return this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Single fixed physics step. Surface is sampled by the owner. */
  step(dt: number, input: VehicleInput, surface: SurfaceInfo): void {
    if (!(dt > 0) || dt > 0.1) return;
    const cfg = this.cfg;
    const aid = ASSIST_PRESETS[this.assistLevel];
    this.lastRumble = surface.rumble;

    // --- Steering with adjustable lock and speed sensitivity ---
    const maxSteer = this.getSteeringLimit();
    const steerTarget = input.steer * maxSteer;
    let steerRate = cfg.steerSpeed * aid.steerRate * dt;
    if (this.driverSteering && aid.lockTime > 0) {
      // Keep the time to full lock constant as the lock shrinks with speed,
      // so a key tap builds a fraction of the lock instead of all of it.
      // Unwinding towards centre stays twice as quick so the car straightens.
      const unwinding = steerTarget * this.steer < 0 || Math.abs(steerTarget) < Math.abs(this.steer);
      steerRate = Math.min(steerRate, (maxSteer / aid.lockTime) * (unwinding ? 2 : 1) * dt);
    }
    this.steer += THREE.MathUtils.clamp(steerTarget - this.steer, -steerRate, steerRate);

    const v = Math.max(Math.abs(this.vLong), 1.0);
    const a = cfg.cogToFront;
    const b = cfg.wheelbase - cfg.cogToFront;
    // At hairpin speeds the stiff dynamic tyre model fights the large steering
    // lock and manufactures rear slip. Blend to rolling bicycle geometry on
    // grippy tarmac. Expert's weaker stability control needs this support
    // through corner exit too: fading it out at 65 km/h caused a sudden slide
    // as the driver accelerated out of a slow turn. Faster corners above
    // 126 km/h retain Expert's dynamic response; other presets are unchanged.
    // Loose surfaces and deliberate handbrake slides retain their dynamics.
    const expert = this.assistLevel === 'hard';
    const rollingGrip = input.handbrake ? 0
      : (1 - THREE.MathUtils.smoothstep(Math.abs(this.vLong), expert ? 18 : 8, expert ? 35 : 18))
        * THREE.MathUtils.smoothstep(surface.mu, .8, 1.2);

    // --- Slip angles ---
    // +steer turns the car toward the driver's right (screen-right in the chase
    // view) when moving forward. When reversing, invert the steering response so
    // pressing right still makes the car back toward the right (intuitive).
    const steerEff = this.vLong < -0.5 ? -this.steer : this.steer;
    const alphaF = Math.atan2(this.vLat + a * this.omega, v) + steerEff;
    const alphaR = Math.atan2(this.vLat - b * this.omega, v);

    // --- Load transfer (longitudinal) + downforce ---
    const staticFront = (cfg.mass * GRAVITY * b) / cfg.wheelbase;
    const staticRear = (cfg.mass * GRAVITY * a) / cfg.wheelbase;
    const transfer = (cfg.mass * this.aLong * cfg.cogHeight) / cfg.wheelbase;
    const df = 0.5 * RHO * cfg.downforce * this.vLong * this.vLong;
    const fzFront = Math.max(1200, staticFront - transfer + df * 0.44);
    const fzRear = Math.max(1200, staticRear + transfer + df * 0.56);

    // --- Engine / brake longitudinal demand ---
    const vAbs = Math.max(Math.abs(this.vLong), 1);
    const engineCap = Math.min(cfg.maxTractionForce, cfg.power / vAbs) * input.throttle;
    let driveForce = engineCap;

    // Reverse requires an explicit backwards intent. Space, the gamepad brake
    // trigger and the touch BRAKE control can therefore be held at a standstill
    // without unexpectedly driving the car backwards.
    const brakeInput = input.brake > 0.02 ? input.brake : 0;
    let brakeDemand = brakeInput * cfg.brakeForce;
    const wantReverse = input.allowReverse === true && !input.handbrake
      && input.throttle < 0.05 && brakeInput > 0.05 && this.vLong < 0.25;
    if (wantReverse) {
      // Reverse is a recovery gear: progressive pedal, bounded to 35 km/h.
      driveForce = -cfg.maxTractionForce * 0.38 * brakeInput * Math.max(0, 1 - Math.abs(this.vLong) / 9.7);
      brakeDemand = 0;
    }
    const handbrakeDemand = input.handbrake ? cfg.brakeForce : 0;
    if (input.handbrake) driveForce = 0;

    // Friction-limited longitudinal force per axle.
    const rearLongMax = 0.92 * surface.mu * fzRear;
    // Stronger dry-road brake bite without increasing engine traction or
    // granting the same stopping power to grass and gravel.
    const brakeGrip = THREE.MathUtils.lerp(1, 1.55, THREE.MathUtils.smoothstep(surface.mu, .8, 1.2));
    const rearBrakeMax = rearLongMax * brakeGrip;
    const frontBrakeMax = 0.95 * surface.mu * fzFront * brakeGrip;
    let rearLong = THREE.MathUtils.clamp(driveForce, -rearLongMax, rearLongMax);
    let brakeF = 0;
    let brakeR = 0;

    if (brakeDemand > 0 || handbrakeDemand > 0) {
      const total = brakeDemand + handbrakeDemand;
      brakeF = Math.min(total * 0.6, frontBrakeMax);
      brakeR = Math.min(total * 0.4 + handbrakeDemand, rearBrakeMax);
      rearLong = 0;
    }

    // Traction control: trim engine force when the rear is already saturated.
    const rearCapacity = surface.mu * fzRear;
    // Leave lateral headroom for the rear tyres so flooring it does not
    // instantly break traction into a drift.
    if (this.assists.tc && rearLong > rearCapacity * aid.tc) {
      rearLong = rearCapacity * aid.tc;
    }
    this.engineForce = rearLong;

    // --- Lateral tire forces (simplified magic formula) ---
    const tire = (alpha: number, fz: number, mu: number, longUsage: number) => {
      const D = mu * fz;
      const peak = D * 0.99;
      const raw = -peak * Math.sin(1.55 * Math.atan(8.6 * alpha));
      const available = Math.sqrt(Math.max(0, D * D - longUsage * longUsage));
      return THREE.MathUtils.clamp(raw, -available, available);
    };

    const rearLongUsage = Math.abs(brakeR) / brakeGrip + Math.abs(rearLong);
    const fyF = tire(alphaF, fzFront, surface.mu, Math.abs(brakeF) / brakeGrip);
    const fyR = tire(alphaR, fzRear, surface.mu, rearLongUsage);

    // --- Resistances ---
    const drag = 0.5 * RHO * cfg.dragArea * this.vLong * this.vLong * (1 + surface.drag);
    const rolling = surface.rolling * cfg.mass * GRAVITY + this.lastRumble * 400;
    // Resistive forces may stop the car, but must never accelerate it backwards.
    const resistance = Math.min(brakeF + brakeR + drag + rolling,
      Math.abs(this.vLong) * cfg.mass / dt + Math.abs(rearLong));
    const direction = Math.sign(this.vLong || rearLong);
    const longForce = rearLong - direction * resistance;

    // --- Equations of motion ---
    const cosSteer = Math.cos(this.steer);
    this.aLong = longForce / cfg.mass + this.vLat * this.omega * (1 - rollingGrip);
    this.aLat = (fyF * cosSteer + fyR) / cfg.mass - this.vLong * this.omega;
    const angularAccel = (a * fyF * cosSteer - b * fyR) / cfg.inertia;

    const previousLong = this.vLong;
    this.vLong += this.aLong * dt;
    if (!wantReverse && rearLong === 0 && previousLong * this.vLong < 0) this.vLong = 0;
    this.vLat += this.aLat * dt;
    this.omega += angularAccel * dt;

    // Stability control (electronic, like an F1-grade assist): drive the yaw
    // rate toward the rate implied by the steering angle, and bleed excess
    // side-slip, so the car turns with the wheel instead of spinning off.
    if (this.assists.tc) {
      // This model yaws negative for a positive (right) steer input, so the
      // kinematic target must carry the same sign or the ESC steers backwards.
      const omegaTarget = -(this.vLong * Math.tan(this.steer)) / cfg.wheelbase;
      const err = this.omega - omegaTarget;
      const floor = this.driverSteering ? aid.servoFloor : 0.4;
      const authority = Math.min(1, floor + Math.abs(this.vLat) * 0.25);
      // The raw gain scales with the error, so the small yaw targets of a
      // speed-capped lock converge slowly; the driver floor keeps turn-in
      // prompt at speed without enlarging the lock.
      const gainBase = Math.max(Math.min(2.4, Math.abs(err) * 1.4), this.driverSteering ? aid.servoGainFloor : 0);
      const gain = gainBase * authority * aid.esc;
      this.omega -= err * Math.min(1, gain * dt * 6);
    }
    const slipRatio = Math.abs(this.vLat) / Math.max(4, Math.abs(this.vLong));
    if (slipRatio > 0.1) {
      const correction = Math.min(1, (slipRatio - 0.1) * 8 * aid.bleed) * (surface.mu >= 1 ? 1 : 0.5);
      this.vLat *= Math.max(0, 1 - correction * dt * 9);
    }
    const slipRear = Math.abs(alphaR);
    if (slipRear > 0.09) {
      const damping = Math.min(11, (slipRear - 0.09) * 26 * aid.bleed);
      this.omega -= this.omega * Math.min(1, damping * dt);
    }
    // Beginner stability must not impose a wider minimum turning circle.
    // Restore its usual yaw limit as the car leaves hairpin speeds.
    const yawLimit = THREE.MathUtils.lerp(Math.max(1.6, aid.clamp), aid.clamp,
      THREE.MathUtils.smoothstep(Math.abs(this.vLong), 8, 25));
    this.omega = THREE.MathUtils.clamp(this.omega, -yawLimit, yawLimit);

    if (rollingGrip > 0) {
      const rollingYaw = -(this.vLong * Math.tan(this.steer)) / cfg.wheelbase;
      const gripYawLimit = surface.mu * GRAVITY * .85 / Math.max(Math.abs(this.vLong), 1);
      const targetYaw = THREE.MathUtils.clamp(rollingYaw,
        -Math.min(yawLimit, gripYawLimit), Math.min(yawLimit, gripYawLimit));
      this.omega = THREE.MathUtils.lerp(this.omega, targetYaw, rollingGrip);
      // The centre of mass moves sideways in a tight rolling turn. Match the
      // rear axle's velocity to its heading instead of damping this legitimate
      // motion to zero (which itself makes the rear tyres slide).
      this.vLat = THREE.MathUtils.lerp(this.vLat, b * this.omega, rollingGrip);
    }

    // Low-speed damping so the car settles cleanly, but never while the driver
    // is asking for power or reverse.
    if (Math.abs(this.vLong) < 0.6 && input.throttle < 0.02 && brakeInput < 0.02) {
      this.vLong *= 0.9;
      this.vLat *= 0.85;
      this.omega *= 0.8;
    }

    // A stationary car cannot rotate or creep from residual tyre force.
    if (Math.abs(this.vLong) < 0.12 && Math.abs(this.vLat) < 0.3 && input.throttle < 0.02 && !wantReverse) {
      this.vLong = 0;
      this.vLat = 0;
      this.omega = 0;
    }
    this.yaw += this.omega * dt;
    const forward = this.forwardVector;
    const right = this.rightVector;
    this.position.addScaledVector(forward, this.vLong * dt);
    this.position.addScaledVector(right, this.vLat * dt);
    this.velocity.copy(forward).multiplyScalar(this.vLong).addScaledVector(right, this.vLat);

    // --- Drivetrain for HUD + audio ---
    this.updateDrivetrain(dt);

    // --- Telemetry ---
    this.telemetry.speed = Math.hypot(this.vLong, this.vLat);
    this.telemetry.onTrack = surface.mu >= 1;
    this.telemetry.rpm = this.rpm;
    this.telemetry.gear = this.gear;
    this.telemetry.throttle = input.throttle;
    this.telemetry.brake = input.brake;
    this.telemetry.steer = this.steer;
    const resolvedRearSlip = THREE.MathUtils.lerp(alphaR,
      Math.atan2(this.vLat - b * this.omega, Math.max(Math.abs(this.vLong), 1)), rollingGrip);
    this.telemetry.slipAngleFront = THREE.MathUtils.lerp(alphaF,
      Math.atan2(this.vLat + a * this.omega, Math.max(Math.abs(this.vLong), 1)) + steerEff, rollingGrip);
    this.telemetry.slipAngleRear = resolvedRearSlip;
    this.telemetry.lateralG = this.aLat / GRAVITY;
    this.telemetry.longitudinalG = this.aLong / GRAVITY;
    this.telemetry.wheelSlip = Math.min(1, Math.max(Math.abs(resolvedRearSlip) / 0.35, (this.engineForce - rearLongMax) / 3000));
    this.wheelSpinAngle += (this.vLong / cfg.wheelRadius) * dt;

    if (!Number.isFinite(this.vLong) || !Number.isFinite(this.vLat) || !Number.isFinite(this.omega)) {
      this.vLong = 0;
      this.vLat = 0;
      this.omega = 0;
    }
  }

  private updateDrivetrain(dt: number): void {
    const cfg = this.cfg;
    if (this.vLong < -0.4) {
      this.gear = -1;
      this.rpm = THREE.MathUtils.clamp(cfg.idleRpm + Math.abs(this.vLong) * 260, cfg.idleRpm, 6800);
      return;
    }
    if (this.gear < 1) this.gear = 1;
    const ratio = cfg.gearRatios[this.gear - 1] * cfg.finalDrive;
    const wheelRpm = (Math.abs(this.vLong) / cfg.wheelRadius) * (60 / (Math.PI * 2));
    this.rpm = THREE.MathUtils.clamp(wheelRpm * ratio, cfg.idleRpm, cfg.maxRpm);
    this.shiftTimer -= dt;
    if (this.shiftTimer <= 0) {
      if (this.rpm > cfg.shiftUpRpm && this.gear < cfg.gearRatios.length) {
        this.gear += 1;
        this.shiftTimer = 0.12;
      } else if (this.rpm < cfg.shiftDownRpm && this.gear > 1) {
        this.gear -= 1;
        this.shiftTimer = 0.16;
      }
    }
  }
}
