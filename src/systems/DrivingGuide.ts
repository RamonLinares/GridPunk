import * as THREE from 'three';
import type { Car } from '../entities/Car';
import type { TrackSpline } from '../game/track/TrackSpline';

export interface DrivingCue {
  cue: 'brake' | 'lift' | 'accelerate' | 'recover';
  targetSpeedKmh: number;
  distanceToCorner: number;
}

export interface RecoveryCoachState {
  dt: number;
  throttle: number;
  brake: number;
  reversing: boolean;
  contact: boolean;
  progressDelta: number;
}

/** Stateful but renderer-independent so the recovery thresholds can be tested. */
export class RecoveryCueDetector {
  private contactMemory = 0;
  private lowProgressTime = 0;
  private recoveryClearTime = 0;
  private active = false;

  reset(): void {
    this.contactMemory = 0;
    this.lowProgressTime = 0;
    this.recoveryClearTime = 0;
    this.active = false;
  }

  update(speed: number, state: RecoveryCoachState): boolean {
    const dt = Math.min(.1, Math.max(0, state.dt));
    this.contactMemory = state.contact ? .9 : Math.max(0, this.contactMemory - dt);
    const progressRate = Math.abs(state.progressDelta) / Math.max(dt, 1 / 240);
    const escaped = speed > 3.5 || progressRate > 2.5 || (state.reversing && speed > 1.2);

    if (this.active) {
      this.recoveryClearTime = escaped ? this.recoveryClearTime + dt : 0;
      if (this.recoveryClearTime >= .35) this.reset();
      return this.active;
    }

    const pushingWall = state.throttle > .55 && state.brake < .2 && speed < 2.5
      && progressRate < .35 && this.contactMemory > 0;
    this.lowProgressTime = pushingWall
      ? this.lowProgressTime + dt
      : Math.max(0, this.lowProgressTime - dt * 2);
    if (this.lowProgressTime >= 1.1) this.active = true;
    return this.active;
  }
}

/** A restrained road guide; colours show the braking envelope, not raw curvature. */
export class DrivingGuide {
  readonly group = new THREE.Group();
  enabled = true;
  private readonly mesh: THREE.InstancedMesh;
  private readonly cache = { index: 0 };
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly basis = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly green = new THREE.Color(0x82d9ac);
  private readonly amber = new THREE.Color(0xf9be63);
  private readonly red = new THREE.Color(0xf57867);
  private readonly markerCount = 28;
  private readonly spacing: number;
  private readonly recoveryCue = new RecoveryCueDetector();

  constructor(private readonly spline: TrackSpline) {
    this.group.name = 'driving-guide';
    this.spacing = spline.length / spline.count;
    const geometry = new THREE.BufferGeometry();
    // Two slim arms leave the asphalt visible between each chevron.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.43, 0, -0.43, 0, 0, 0.2, 0, 0, -0.01,
      -0.43, 0, -0.43, 0, 0, -0.01, -0.43, 0, -0.63,
      0, 0, 0.2, 0.43, 0, -0.43, 0.43, 0, -0.63,
      0, 0, 0.2, 0.43, 0, -0.63, 0, 0, -0.01,
    ], 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.8, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.markerCount);
    this.mesh.name = 'braking-guide-chevrons';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
  }

  reset(index = 0): void {
    this.cache.index = index;
    this.recoveryCue.reset();
  }

  update(car: Car, recovery?: RecoveryCoachState): DrivingCue {
    this.group.visible = this.enabled;
    const probe = this.spline.probe(car.physics.position, this.cache);
    const speed = car.physics.telemetry.speed;
    const base = probe.sample.index;
    let targetSpeed = 86;
    let distanceToCorner = 250;
    const comfortableGrip = 13.5;
    const brakingDeceleration = 10;
    for (let meters = 0; meters <= 260; meters += 8) {
      const sample = this.spline.sampleAt(base + Math.round(meters / this.spacing));
      const apexSpeed = Math.min(86, Math.sqrt(comfortableGrip / Math.max(0.0001, Math.abs(sample.curvature))));
      const envelope = Math.sqrt(apexSpeed * apexSpeed + 2 * brakingDeceleration * Math.max(0, meters - 18));
      if (envelope < targetSpeed) {
        targetSpeed = envelope;
        distanceToCorner = meters;
      }
    }
    if (this.enabled) {
      for (let i = 0; i < this.markerCount; i++) {
        const meters = 18 + i * 8;
        const index = base + Math.round(meters / this.spacing);
        const sample = this.spline.sampleAt(index);
        const apex = Math.min(86, Math.sqrt(comfortableGrip / Math.max(0.0001, Math.abs(sample.curvature))));
        const envelope = Math.sqrt(apex * apex + 2 * brakingDeceleration * Math.max(0, meters - 18));
        this.color.copy(speed > envelope + 3 ? this.red : speed > envelope - 5 ? this.amber : this.green);
        this.position.copy(sample.position).addScaledVector(sample.normal, 0.13);
        this.right.crossVectors(sample.normal, sample.tangent).normalize();
        this.basis.makeBasis(this.right, sample.normal, sample.tangent);
        this.rotation.setFromRotationMatrix(this.basis);
        const fade = 1 - Math.pow(i / this.markerCount, 3) * 0.8;
        this.scale.set(fade * 1.5, 1, fade * 2);
        this.matrix.compose(this.position, this.rotation, this.scale);
        this.mesh.setMatrixAt(i, this.matrix);
        this.mesh.setColorAt(i, this.color);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    const cue: DrivingCue = {
      cue: speed > targetSpeed + 2 ? 'brake' : speed > targetSpeed - 4 ? 'lift' : 'accelerate',
      targetSpeedKmh: Math.round(targetSpeed * 3.6),
      distanceToCorner,
    };
    return recovery && this.recoveryCue.update(speed, recovery)
      ? { cue: 'recover', targetSpeedKmh: 0, distanceToCorner }
      : cue;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
