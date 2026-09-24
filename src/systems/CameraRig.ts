import * as THREE from 'three';
import type { Car } from '../entities/Car';

export type CameraMode = 'chase' | 'far' | 'hood' | 'cockpit';

const MODES: CameraMode[] = ['chase', 'far', 'hood', 'cockpit'];

export class CameraRig {
  mode: CameraMode = 'chase';
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly smoothedLook = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly previousAnchor = new THREE.Vector3();
  private readonly anchorDelta = new THREE.Vector3();
  private anchorReady = false;
  private shake = 0;
  private fov = 60;

  private readonly obstructionRay = new THREE.Raycaster();
  private readonly obstructionOrigin = new THREE.Vector3();
  private readonly obstructionDirection = new THREE.Vector3();

  /** `groundAt`: terrain height for hilly layouts, so the follow camera never sinks into a slope. */
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly obstructions: THREE.Object3D[] = [], private readonly groundAt?: (x: number, z: number) => number) {}

  private keepOutsideScenery(car: Car): void {
    if (!this.obstructions.length || this.mode === 'hood' || this.mode === 'cockpit') return;
    this.obstructionOrigin.copy(car.group.position).addScaledVector(car.group.up, .9);
    this.obstructionDirection.subVectors(this.camera.position, this.obstructionOrigin);
    const distance = this.obstructionDirection.length();
    if (distance < .01) return;
    this.obstructionDirection.divideScalar(distance);
    // Include room for the near plane before the follow camera reaches a wall
    // or sloping tunnel ceiling. This changes framing, never the car's motion.
    const padding = .8;
    this.obstructionRay.set(this.obstructionOrigin, this.obstructionDirection);
    this.obstructionRay.far = distance + padding;
    const hit = this.obstructionRay.intersectObjects(this.obstructions, true)[0];
    if (hit) this.camera.position.copy(this.obstructionOrigin)
      .addScaledVector(this.obstructionDirection, Math.max(.5, hit.distance - padding));
  }

  cycleMode(): CameraMode {
    const index = MODES.indexOf(this.mode);
    this.mode = MODES[(index + 1) % MODES.length];
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  snap(car: Car): void {
    this.shake = 0;
    this.previousAnchor.copy(car.group.position);
    this.anchorReady = true;
    this.computeDesired(car);
    this.camera.position.copy(this.desired);
    this.smoothedLook.copy(this.lookAt);
    this.camera.up.set(0, 1, 0);
    if (this.mode === 'hood' || this.mode === 'cockpit') this.camera.up.applyQuaternion(car.group.quaternion);
    this.keepOutsideScenery(car);
    if (this.groundAt && this.mode !== 'hood' && this.mode !== 'cockpit') this.camera.position.y = Math.max(this.camera.position.y, this.groundAt(this.camera.position.x, this.camera.position.z) + 1.2);
    this.camera.lookAt(this.lookAt);
    this.fov = this.targetFov(car.physics.telemetry.speed);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, car: Car): void {
    if (!this.anchorReady) this.snap(car);
    // Carry both camera and aim with the rendered car before smoothing their
    // relative framing. Chasing its absolute world position makes follow lag
    // depend on frame duration and fixed-step cadence: the whole field appears
    // to jump forwards/backwards when consecutive frames have different costs.
    this.anchorDelta.subVectors(car.group.position, this.previousAnchor);
    this.camera.position.add(this.anchorDelta);
    this.smoothedLook.add(this.anchorDelta);
    this.previousAnchor.copy(car.group.position);
    // The camera framing uses the car's actual heading every frame, so it is
    // always directly behind the car and follows it through every turn.
    this.computeDesired(car);
    const speed = car.physics.telemetry.speed;
    const onboard = this.mode === 'hood' || this.mode === 'cockpit';
    if (onboard) {
      // An onboard mount must move with the body this frame. Even 40 ms of
      // positional follow lag leaves the camera metres behind at racing speed.
      this.camera.position.copy(this.desired);
      this.smoothedLook.copy(this.lookAt);
      this.camera.up.set(0, 1, 0).applyQuaternion(car.group.quaternion);
    } else {
      this.camera.up.set(0, 1, 0);
      const lag = this.mode === 'chase' ? 0.08 : THREE.MathUtils.lerp(0.12, 0.05, Math.min(1, speed / 70));
      const factor = 1 - Math.exp(-dt / lag);
      this.camera.position.lerp(this.desired, factor);
      this.smoothedLook.lerp(this.lookAt, Math.min(1, factor * 1.8));
    }

    // Never let the camera clip into the car (a sudden wall stop or a car pushed
    // backwards can otherwise put the body right on the lens) or sink below the
    // ground, which blows the frame out white.
    if (!onboard) {
      const px = car.group.position.x;
      const pz = car.group.position.z;
      const py = car.group.position.y;
      const dx = this.camera.position.x - px;
      const dz = this.camera.position.z - pz;
      const horiz = Math.hypot(dx, dz);
      const minDist = 4.5;
      if (horiz < minDist) {
        const nx = horiz > 0.001 ? dx / horiz : -Math.sin(car.physics.yaw);
        const nz = horiz > 0.001 ? dz / horiz : -Math.cos(car.physics.yaw);
        this.camera.position.x = px + nx * minDist;
        this.camera.position.z = pz + nz * minDist;
      }
      if (this.camera.position.y < py + 0.8) this.camera.position.y = py + 0.8;
    }

    this.keepOutsideScenery(car);
    if (this.groundAt && !onboard) this.camera.position.y = Math.max(this.camera.position.y, this.groundAt(this.camera.position.x, this.camera.position.z) + 1.2);
    this.camera.lookAt(this.smoothedLook);

    const targetFov = this.targetFov(speed);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 2.5);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (!onboard && this.shake > 0.001) {
      const s = this.shake * Math.min(1, speed / 50);
      this.camera.position.x += (Math.random() - 0.5) * s * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.3;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.4;
    }
  }

  private computeDesired(car: Car): void {
    for (const detail of (car.group.userData.cockpitHidden ?? []) as THREE.Object3D[]) {
      detail.visible = this.mode !== 'cockpit';
    }
    const p = car.group.position;
    const forward = car.physics.forwardVector.clone();
    const speed = car.physics.telemetry.speed;

    switch (this.mode) {
      case 'hood':
      case 'cockpit': {
        // Transform both the eye and aim point by the same pitch/roll/yaw as
        // the visible car, preserving clearance over hills and under braking.
        const hood = this.mode === 'hood';
        const recessedCockpit = car.group.userData.design === 'neon-k89-r';
        this.offset.set(0, hood ? 0.95 : recessedCockpit ? 0.93 : 1.04,
          hood ? 0.9 : recessedCockpit ? -0.25 : 0.35);
        if (!hood && car.group.userData.cockpitEye) this.offset.fromArray(car.group.userData.cockpitEye);
        this.desired.copy(this.offset).applyQuaternion(car.group.quaternion).add(p);
        this.lookAt.set(0, hood ? 0.9 : 0.75, 30)
          .applyQuaternion(car.group.quaternion).add(p);
        break;
      }
      case 'far': {
        const dist = 11 + speed * 0.09 + this.speedTrail(speed);
        const height = 4.6 + speed * 0.02;
        this.desired.copy(p).addScaledVector(forward, -dist);
        this.desired.y = p.y + height;
        this.lookAt.copy(p).addScaledVector(forward, 8 + speed * 0.06);
        this.lookAt.y = p.y + 0.9;
        break;
      }
      default: {
        // Close chase keeps the car's framing steady under acceleration.
        const dist = 5.4;
        const height = 2.2;
        this.desired.copy(p).addScaledVector(forward, -dist);
        this.desired.y = p.y + height;
        this.lookAt.copy(p).addScaledVector(forward, 4);
        this.lookAt.y = p.y + 0.5;
      }
    }
  }

  private targetFov(speed: number): number {
    if (this.mode === 'chase') {
      // Preserve at least a 60-degree horizontal view on portrait screens so
      // the closer car still fits. The lens never changes with speed.
      return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 6) / Math.min(1, this.camera.aspect)));
    }
    return 60 + Math.min(14, speed * 0.17) + (this.mode === 'hood' ? 6 : 0);
  }

  /** Keep the familiar high-speed pullback without world-space follow lag. */
  private speedTrail(speed: number): number {
    return speed * THREE.MathUtils.lerp(0.12, 0.05, Math.min(1, speed / 70));
  }
}
