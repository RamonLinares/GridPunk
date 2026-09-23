import * as THREE from 'three';
import type { Car } from '../entities/Car';
import type { VfxSystem } from './Vfx';

const TRAIL_POINTS = 18;

interface CarState {
  car: Car;
  /** Car-local tail-lamp positions (left, right) and exhaust outlets. */
  lamps: THREE.Vector3[];
  outlets: THREE.Vector3[];
  history: { points: THREE.Vector3[]; times: number[] }[];
  lastThrottle: number;
  popCooldown: number;
}

export interface CarEffectInput { car: Car; wet: number; }

/**
 * Per-car effects for the whole grid: rear-wheel rain spray, over-run
 * backfires, rival tyre smoke and, on night circuits, tail-lamp light trails
 * drawn as camera-facing ribbons that brighten under braking.
 */
export class CarEffects {
  private readonly states: CarState[];
  private readonly trail: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly wheel = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly backward = new THREE.Vector3();
  private readonly world = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private time = 0;
  private visible = true;

  constructor(scene: THREE.Scene, private readonly vfx: VfxSystem, cars: readonly Car[], private readonly night: boolean) {
    this.states = cars.map(car => {
      const { lamps, outlets } = sockets(car);
      return { car, lamps, outlets, lastThrottle: 0, popCooldown: 0,
        history: lamps.map(() => ({ points: [] as THREE.Vector3[], times: [] as number[] })) };
    });
    const ribbons = this.states.length * 2, verts = ribbons * TRAIL_POINTS * 2;
    this.positions = new Float32Array(verts * 3); this.colors = new Float32Array(verts * 4);
    const index: number[] = [];
    for (let r = 0; r < ribbons; r++) for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = (r * TRAIL_POINTS + i) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(index);
    this.trail = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.name = 'tail-lamp-trails'; this.trail.frustumCulled = false; this.trail.visible = night;
    scene.add(this.trail);
  }

  setVisible(visible: boolean): void { this.visible = visible; this.trail.visible = visible && this.night; }

  update(dt: number, inputs: readonly CarEffectInput[], camera: THREE.Camera, player: Car): void {
    this.time += dt;
    for (const input of inputs) {
      const state = this.states.find(s => s.car === input.car);
      if (!state || !this.visible) continue;
      const car = state.car, t = car.physics.telemetry, speed = t.speed;
      const near = car === player || car.group.position.distanceToSquared(camera.position) < 170 * 170;
      this.forward.set(0, 0, 1).applyQuaternion(car.group.quaternion);
      if (near && input.wet > .05 && speed > 10 && t.onTrack) {
        const rate = input.wet * Math.min(1, speed / 60) * (car === player ? 95 : 70);
        for (const key of ['rl', 'rr'] as const) {
          car.model.wheels[key].getWorldPosition(this.wheel);
          this.wheel.y = car.group.position.y;
          this.vfx.spawnSpray(this.wheel, car.physics.velocity, this.forward, rate, dt);
        }
      }
      if (car !== player && near && speed > 12 && (Math.abs(t.slipAngleRear) > .16 || t.wheelSlip > .5))
        this.vfx.spawnSmoke(car.group.position, car.group.quaternion, speed, dt, car);
      // Over-run: a pop when the throttle snaps shut at high revs, then the odd crackle.
      state.popCooldown -= dt;
      const lifted = state.lastThrottle > .75 && t.throttle < .2 && t.rpm > 9000 && speed > 20;
      const crackle = t.throttle < .05 && t.rpm > 10500 && speed > 30 && Math.random() < dt * 2.5;
      if (near && state.popCooldown <= 0 && (lifted || crackle)) {
        this.backward.copy(this.forward).negate();
        for (const outlet of state.outlets) {
          this.world.copy(outlet).applyMatrix4(car.group.matrixWorld);
          this.vfx.spawnBackfire(this.world, this.backward, car.physics.velocity, lifted ? 1 : .6);
        }
        state.popCooldown = lifted ? .35 : .12;
      }
      state.lastThrottle = t.throttle;
    }
    if (this.night && this.visible) this.updateTrails(camera, player);
  }

  private updateTrails(camera: THREE.Camera, player: Car): void {
    const maxAge = .22;
    let vertex = 0;
    for (const state of this.states) {
      const car = state.car, t = car.physics.telemetry;
      // The player's own trail would stream back through the chase camera.
      const glow = car === player ? 0 : Math.min(1, t.speed / 25) * (.32 + t.brake * .68);
      state.lamps.forEach((lamp, k) => {
        const h = state.history[k];
        h.points.unshift(lamp.clone().applyMatrix4(car.group.matrixWorld)); h.times.unshift(this.time);
        while (h.points.length > TRAIL_POINTS || (h.times.length > 2 && this.time - h.times[h.times.length - 1] > maxAge)) { h.points.pop(); h.times.pop(); }
        for (let i = 0; i < TRAIL_POINTS; i++) {
          const p = h.points[Math.min(i, h.points.length - 1)];
          const last = h.points.length - 1, next = h.points[Math.min(i + 1, last)], prev = h.points[Math.min(Math.max(0, i - 1), last)];
          this.tangent.subVectors(prev, next);
          this.toCamera.subVectors(camera.position, p);
          this.side.crossVectors(this.tangent, this.toCamera);
          const length = this.side.length();
          const width = (.05 + t.brake * .05) * (1 - i / TRAIL_POINTS * .5);
          if (length > 1e-6) this.side.multiplyScalar(width / length); else this.side.set(0, width, 0);
          const age = i < h.times.length ? (this.time - h.times[i]) / maxAge : 1;
          const alpha = i >= h.points.length ? 0 : glow * Math.pow(Math.max(0, 1 - age), 1.6);
          for (const sign of [1, -1]) {
            const v = vertex++;
            this.positions[v * 3] = p.x + this.side.x * sign; this.positions[v * 3 + 1] = p.y + this.side.y * sign; this.positions[v * 3 + 2] = p.z + this.side.z * sign;
            this.colors[v * 4] = 1; this.colors[v * 4 + 1] = .13 + t.brake * .05; this.colors[v * 4 + 2] = .1; this.colors[v * 4 + 3] = alpha;
          }
        }
      });
    }
    const g = this.trail.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }

  /** A restart or recovery teleports cars; old trail points must not smear across the city. */
  reset(): void { for (const s of this.states) for (const h of s.history) { h.points.length = 0; h.times.length = 0; } }

  dispose(): void { this.trail.removeFromParent(); this.trail.geometry.dispose(); (this.trail.material as THREE.Material).dispose(); }
}

/** Finds the rearmost lamp edges and exhaust outlets in car-local space. */
function sockets(car: Car): { lamps: THREE.Vector3[]; outlets: THREE.Vector3[] } {
  const group = car.group; group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), v = new THREE.Vector3(), points: THREE.Vector3[] = [];
  for (const light of car.model.brakeLights) {
    const pos = light.geometry.getAttribute('position') as THREE.BufferAttribute;
    const toLocal = inverse.clone().multiply(light.matrixWorld);
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 400))) points.push(v.fromBufferAttribute(pos, i).applyMatrix4(toLocal).clone());
  }
  if (!points.length) return { lamps: [new THREE.Vector3(-.3, .4, -2.4), new THREE.Vector3(.3, .4, -2.4)], outlets: [new THREE.Vector3(0, .4, -2.5)] };
  const rear = Math.min(...points.map(p => p.z));
  const back = points.filter(p => p.z < rear + .3);
  const minX = Math.min(...back.map(p => p.x)), maxX = Math.max(...back.map(p => p.x));
  const y = back.reduce((sum, p) => sum + p.y, 0) / back.length;
  const inset = Math.min(.08, (maxX - minX) * .15);
  const lamps = [new THREE.Vector3(minX + inset, y, rear - .02), new THREE.Vector3(maxX - inset, y, rear - .02)];
  const design = group.userData.design as string | undefined;
  const outlets = design === 'neon-shinsei-nd01'
    ? [new THREE.Vector3(-.3, .36, -2.62), new THREE.Vector3(.3, .36, -2.62)]
    : [new THREE.Vector3(-.37, y - .14, rear + .02), new THREE.Vector3(.37, y - .14, rear + .02)];
  return { lamps, outlets };
}
