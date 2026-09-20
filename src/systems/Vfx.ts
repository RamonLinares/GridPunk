import * as THREE from 'three';
import type { Car } from '../entities/Car';
import type { Telemetry } from '../systems/VehiclePhysics';

interface Pool {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  sizes: Float32Array;
  count: number;
  cursor: number;
  material: THREE.ShaderMaterial;
}

const particleVertex = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aVelocity;
  uniform float uMaxSize;
  varying float vLife;
  varying float vFade;
  varying vec2 vDirection;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec2 direction = (modelViewMatrix * vec4(aVelocity, 0.0)).xy;
    vDirection = length(direction) > 0.001 ? normalize(vec2(direction.x, -direction.y)) : vec2(0.0, 1.0);
    float dist = max(-mv.z, 0.1);
    // Cap the on-screen size: without this a particle right next to the chase
    // camera projects to thousands of pixels and fills the screen.
    float px = aSize * (300.0 / dist);
    gl_PointSize = clamp(px, 1.0, uMaxSize);
    // Fade puffs that come very close to the lens, so a stack of overlapping
    // particles can never cover the whole frame (this blew out on impacts).
    vFade = smoothstep(1.5, 5.0, dist);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  varying float vLife;
  varying float vFade;
  varying vec2 vDirection;
  uniform vec3 uColor;
  uniform float uSoft;
  uniform float uStreak;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d) * uSoft;
    vec3 color = uColor;
    if (uStreak > 0.5) {
      float along = dot(uv, vDirection);
      float across = abs(dot(uv, vec2(-vDirection.y, vDirection.x)));
      alpha = (1.0 - smoothstep(0.025, 0.085, across))
        * (1.0 - smoothstep(0.30, 0.50, abs(along))) * uSoft;
      color = mix(uColor, vec3(1.0, 0.95, 0.76),
        (1.0 - smoothstep(0.0, 0.045, across)) * 0.8);
    }
    alpha *= smoothstep(0.0, 0.2, vLife) * (1.0 - smoothstep(0.6, 1.0, vLife));
    alpha *= vFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createPool(color: number, count: number, soft: number, additive: boolean, maxSize: number): Pool {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const maxLife = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    life[i] = 1;
    positions[i * 3 + 1] = -1000;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSoft: { value: soft }, uMaxSize: { value: maxSize }, uStreak: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, positions, velocities, life, maxLife, sizes, count, cursor: 0, material };
}

function emit(pool: Pool, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, ttl: number): void {
  const i = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.count;
  pool.positions[i * 3] = x;
  pool.positions[i * 3 + 1] = y;
  pool.positions[i * 3 + 2] = z;
  pool.velocities[i * 3] = vx;
  pool.velocities[i * 3 + 1] = vy;
  pool.velocities[i * 3 + 2] = vz;
  pool.life[i] = 0;
  pool.maxLife[i] = ttl;
  pool.sizes[i] = size;
}

export class VfxSystem {
  private readonly smoke: Pool;
  private readonly dust: Pool;
  private readonly sparks: Pool;
  private readonly exhaust: Pool;
  private readonly skidMarks: THREE.InstancedMesh;
  private readonly skidMatrix = new THREE.Matrix4();
  private readonly skidQuat = new THREE.Quaternion();
  private readonly skidScale = new THREE.Vector3();
  private readonly skidPos = new THREE.Vector3();
  private skidCursor = 0;
  private readonly skidMax = 3000;
  private readonly updaters: Pool[];
  private emitAccumulator = 0;
  private readonly wheelPos = new THREE.Vector3();
  private readonly markRight = new THREE.Vector3();
  private readonly markForward = new THREE.Vector3();
  private readonly markNormal = new THREE.Vector3();
  private readonly markBasis = new THREE.Matrix4();

  constructor(private readonly scene: THREE.Scene, private readonly surfaceHeightAt: (x: number, z: number, referenceY?: number) => number) {
    this.smoke = createPool(0xdedede, 400, 0.32, false, 120);
    this.dust = createPool(0xc8a86a, 300, 0.4, false, 100);
    this.sparks = createPool(0xffa62e, 220, 0.9, true, 24);
    this.sparks.material.uniforms.uStreak.value = 1;
    this.exhaust = createPool(0x9aa2ab, 160, 0.3, false, 48);
    this.scene.add(this.smoke.points, this.dust.points, this.sparks.points, this.exhaust.points);
    this.updaters = [this.smoke, this.dust, this.sparks, this.exhaust];

    const markGeo = new THREE.PlaneGeometry(0.32, 0.7);
    markGeo.rotateX(-Math.PI / 2);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0d, transparent: true, opacity: 0.55, depthWrite: false });
    this.skidMarks = new THREE.InstancedMesh(markGeo, markMat, this.skidMax);
    this.skidMarks.frustumCulled = false;
    this.skidMarks.count = this.skidMax;
    this.skidScale.set(0, 0, 0);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.skidMax; i += 1) this.skidMarks.setMatrixAt(i, hidden);
    this.skidMarks.instanceMatrix.needsUpdate = true;
    this.scene.add(this.skidMarks);
  }

  setVisible(visible:boolean):void {for(const pool of this.updaters)pool.points.visible=visible;this.skidMarks.visible=visible;}

  spawnSmoke(pos: THREE.Vector3, quat: THREE.Quaternion, speed: number, dt: number): void {
    this.emitAccumulator += dt * Math.min(30, 5 + speed * 0.25);
    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      const side = Math.random() > 0.5 ? 1 : -1;
      const off = new THREE.Vector3(side * 0.9, 0.1, -1.7).applyQuaternion(quat);
      const size = 8 + Math.random() * 14;
      emit(
        this.smoke,
        pos.x + off.x + (Math.random() - 0.5) * 0.4,
        pos.y + off.y + 0.2,
        pos.z + off.z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 2,
        1.2 + Math.random(),
        (Math.random() - 0.5) * 2,
        size,
        1.4 + Math.random(),
      );
    }
  }

  spawnDust(pos: THREE.Vector3, speed: number, dt: number): void {
    const n = Math.min(6, 1 + speed * 0.1);
    for (let i = 0; i < n; i += 1) {
      if (Math.random() > dt * 40) continue;
      emit(
        this.dust,
        pos.x + (Math.random() - 0.5) * 2,
        pos.y + 0.15,
        pos.z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 3,
        0.8 + Math.random() * 1.5,
        (Math.random() - 0.5) * 3,
        12 + Math.random() * 14,
        1.6 + Math.random(),
      );
    }
  }

  spawnSparks(pos: THREE.Vector3, impulse: number): void {
    const n = Math.min(14, 4 + Math.floor(impulse));
    const surfaceY = this.surfaceHeightAt(pos.x, pos.z, pos.y) + 0.08;
    for (let i = 0; i < n; i += 1) {
      emit(
        this.sparks,
        pos.x,
        surfaceY,
        pos.z,
        (Math.random() - 0.5) * 8,
        0.6 + Math.random() * 1.8,
        (Math.random() - 0.5) * 8,
        0.3 + Math.random() * 0.3,
        0.18 + Math.random() * 0.2,
      );
    }
  }

  spawnExhaust(pos: THREE.Vector3, quat: THREE.Quaternion, telemetry: Telemetry, dt: number): void {
    if (telemetry.throttle < 0.35 || telemetry.rpm < 6000) return;
    const off = new THREE.Vector3(0, 0.34, -2.85).applyQuaternion(quat);
    const rate = telemetry.throttle > 0.85 && telemetry.rpm > 12000 ? 2 : 1;
    for (let i = 0; i < rate; i += 1) {
      if (Math.random() > dt * 5) continue;
      emit(
        this.exhaust,
        pos.x + off.x,
        pos.y + off.y,
        pos.z + off.z,
        (Math.random() - 0.5) * 0.4,
        0.4 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.4,
        4 + Math.random() * 4,
        0.35 + Math.random() * 0.3,
      );
    }
  }

  spawnTyreMarks(car: Car, active: boolean, dt: number): void {
    if (!active || !car.physics.telemetry.onTrack) return;
    if (Math.random() > Math.min(1, dt * 90)) return;
    for (const key of ['rl', 'rr'] as const) {
      const wheel = car.model.wheels[key];
      wheel.getWorldPosition(this.wheelPos);
      const x = this.wheelPos.x, z = this.wheelPos.z;
      const sin = Math.sin(car.physics.yaw), cos = Math.cos(car.physics.yaw);
      this.skidPos.set(x, this.surfaceHeightAt(x, z, car.physics.position.y) + 0.018, z);
      const riseForward = this.surfaceHeightAt(x + sin * .35, z + cos * .35, car.physics.position.y)
        - this.surfaceHeightAt(x - sin * .35, z - cos * .35, car.physics.position.y);
      const riseRight = this.surfaceHeightAt(x + cos * .16, z - sin * .16, car.physics.position.y)
        - this.surfaceHeightAt(x - cos * .16, z + sin * .16, car.physics.position.y);
      this.markForward.set(sin, riseForward / .7, cos).normalize();
      this.markRight.set(cos, riseRight / .32, -sin).normalize();
      this.markNormal.crossVectors(this.markForward, this.markRight).normalize();
      this.markRight.crossVectors(this.markNormal, this.markForward).normalize();
      this.markBasis.makeBasis(this.markRight, this.markNormal, this.markForward);
      this.skidQuat.setFromRotationMatrix(this.markBasis);
      this.skidScale.set(1, 1, 1);
      this.skidMatrix.compose(this.skidPos, this.skidQuat, this.skidScale);
      this.skidMarks.setMatrixAt(this.skidCursor, this.skidMatrix);
      this.skidCursor = (this.skidCursor + 1) % this.skidMax;
    }
    this.skidMarks.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    for (const pool of this.updaters) {
      let changed = false;
      for (let i = 0; i < pool.count; i += 1) {
        if (pool.life[i] >= 1) continue;
        pool.life[i] += dt / pool.maxLife[i];
        if (pool.life[i] >= 1) {
          pool.positions[i * 3 + 1] = -1000;
          changed = true;
          continue;
        }
        pool.positions[i * 3] += pool.velocities[i * 3] * dt;
        pool.positions[i * 3 + 1] += pool.velocities[i * 3 + 1] * dt;
        pool.positions[i * 3 + 2] += pool.velocities[i * 3 + 2] * dt;
        pool.velocities[i * 3] *= 1 - dt * 1.2;
        if (pool === this.sparks) pool.velocities[i * 3 + 1] -= 9.8 * dt;
        else pool.velocities[i * 3 + 1] *= 1 - dt * 0.6;
        pool.velocities[i * 3 + 2] *= 1 - dt * 1.2;
        changed = true;
      }
      if (changed) {
        (pool.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (pool.points.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
        (pool.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
        (pool.points.geometry.attributes.aVelocity as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const pool of this.updaters) {
      pool.points.geometry.dispose();
      pool.material.dispose();
      this.scene.remove(pool.points);
    }
    this.skidMarks.geometry.dispose();
    (this.skidMarks.material as THREE.Material).dispose();
    this.scene.remove(this.skidMarks);
  }
}
