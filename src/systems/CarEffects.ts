import * as THREE from 'three';
import type { Car } from '../entities/Car';
import type { VfxSystem } from './Vfx';

/** Mist cards behind each rear tyre: distance behind the wheel, size and opacity. */
const PLUME = [
  { back: 1.2, size: 1.6, alpha: .22 }, { back: 3, size: 2.4, alpha: .17 }, { back: 5.4, size: 3.3, alpha: .11 },
  { back: 8.4, size: 4.2, alpha: .06 },
];

interface CarState {
  car: Car;
  /** Car-local tail-lamp positions (left, right) and exhaust outlets. */
  lamps: THREE.Vector3[];
  outlets: THREE.Vector3[];
  lastThrottle: number;
  popCooldown: number;
  seed: number;
}

export interface CarEffectInput { car: Car; wet: number; }

const plumeVertex = /* glsl */ `
  attribute vec4 aPlume; // x: size, y: alpha, z: seed, w: stretch along the view-space motion
  attribute vec2 aDrift;
  varying vec2 vUv; varying vec2 vLocal; varying float vAlpha; varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vAlpha = aPlume.y; vSeed = aPlume.z;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
    vec2 offset = position.xy * aPlume.x;
    // The car's projected direction of travel orients the haze texture's flow.
    vec2 along = length(aDrift) > .001 ? normalize(aDrift) : vec2(0., 1.);
    vec2 across = vec2(-along.y, along.x);
    vLocal = vec2(dot(position.xy, along), dot(position.xy, across));
    // A low, wide card: flattened vertically on screen so the haze hugs the road
    // from any viewing angle; the texture, not the card shape, carries the motion.
    offset.y *= .55;
    mvPosition.xy += offset;
    // Fade cards that reach the lens instead of letting one fill the screen.
    vAlpha *= smoothstep(2.5, 9., -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const plumeFragment = /* glsl */ `
  uniform float uTime; uniform vec3 uColor;
  varying vec2 vUv; varying vec2 vLocal; varying float vAlpha; varying float vSeed;
  #include <fog_pars_fragment>
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
  void main() {
    // Turbulent water haze dragged back along the direction of travel (x):
    // domain-warped noise gives billows and holes rather than lines, and
    // nothing drifts upward, so it never reads as steam.
    vec2 q = vLocal * 3.2 + vec2(-uTime * 2.4 + vSeed * 5., vSeed * 3.);
    vec2 warp = vec2(fbm(q + vec2(0., uTime * .7)), fbm(q + vec2(5.2, 1.3)));
    float n = fbm(q + warp * 1.6);
    float envelope = exp(-dot(vLocal * vec2(2.2, 3.), vLocal * vec2(2.2, 3.)));
    float base = smoothstep(.0, .3, vUv.y);
    float a = vAlpha * envelope * base * smoothstep(.38, .72, n) * 1.3;
    if (a < .004) discard;
    gl_FragColor = vec4(uColor * (.85 + .3 * n), a);
    #include <fog_fragment>
  }`;

/**
 * Per-car effects for the whole grid: wet-road spray (droplets flung back off
 * the rear tyres over a thin haze that streams along the direction of travel),
 * over-run backfires and rival tyre smoke on dry circuits.
 */
export class CarEffects {
  private readonly states: CarState[];
  private readonly plumes: THREE.InstancedMesh;
  private readonly plumeData: THREE.InstancedBufferAttribute;
  private readonly plumeDrift: THREE.InstancedBufferAttribute;
  private readonly plumeMaterial: THREE.ShaderMaterial;
  private readonly matrix = new THREE.Matrix4();
  private readonly wheel = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly backward = new THREE.Vector3();
  private readonly world = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly motion = new THREE.Vector3();
  private readonly viewA = new THREE.Vector3();
  private readonly viewB = new THREE.Vector3();
  private time = 0;
  private visible = true;

  constructor(scene: THREE.Scene, private readonly vfx: VfxSystem, cars: readonly Car[], night: boolean) {
    this.states = cars.map((car, i) => ({ car, ...sockets(car), lastThrottle: 0, popCooldown: 0, seed: i * 1.37 }));
    const count = this.states.length * 2 * PLUME.length;
    this.plumeMaterial = new THREE.ShaderMaterial({ vertexShader: plumeVertex, fragmentShader: plumeFragment, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(night ? 0x8e9fa8 : 0xc9d2d6) } }]) });
    const card = new THREE.PlaneGeometry(1, 1);
    this.plumeData = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.plumeDrift = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    card.setAttribute('aPlume', this.plumeData); card.setAttribute('aDrift', this.plumeDrift);
    this.plumes = new THREE.InstancedMesh(card, this.plumeMaterial, count);
    this.plumes.name = 'wet-spray-plumes'; this.plumes.frustumCulled = false; this.plumes.renderOrder = 2;
    scene.add(this.plumes);

  }

  setVisible(visible: boolean): void { this.visible = visible; this.plumes.visible = visible; }

  update(dt: number, inputs: readonly CarEffectInput[], camera: THREE.Camera, player: Car): void {
    this.time += dt;
    this.plumeMaterial.uniforms.uTime.value = this.time;
    let instance = 0;
    for (const input of inputs) {
      const state = this.states.find(s => s.car === input.car);
      if (!state) continue;
      const car = state.car, t = car.physics.telemetry, speed = t.speed;
      const near = car === player || car.group.position.distanceToSquared(camera.position) < 170 * 170;
      this.forward.set(0, 0, 1).applyQuaternion(car.group.quaternion);
      instance = this.updatePlume(state, input.wet, camera, player, dt, instance);
      if (!this.visible) continue;
      // Tyres do not smoke on a wet road; the mist plume stands in for it there.
      if (car !== player && near && input.wet < .2 && speed > 12 && (Math.abs(t.slipAngleRear) > .2 || t.wheelSlip > .6))
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
    this.plumes.count = instance;
    this.plumes.instanceMatrix.needsUpdate = true; this.plumeData.needsUpdate = true; this.plumeDrift.needsUpdate = true;
  }

  /** Cards trail each rear tyre along the car's motion, growing and thinning with distance. */
  private updatePlume(state: CarState, wet: number, camera: THREE.Camera, player: Car, dt: number, instance: number): number {
    const car = state.car, speed = car.physics.telemetry.speed;
    // The player's own plume sits between the chase camera and the road ahead, so it stays faint.
    const strength = this.visible && car.physics.telemetry.onTrack ? wet * THREE.MathUtils.smoothstep(speed, 8, 45) * (car === player ? .45 : 1) : 0;
    if (strength < .02 || car.group.position.distanceToSquared(camera.position) > 220 * 220) return instance;
    const reach = .55 + Math.min(1, speed / 65) * .75;
    this.motion.copy(car.physics.velocity).setY(0);
    if (this.motion.lengthSq() < 1) this.motion.copy(this.forward);
    this.motion.normalize();
    for (const [w, key] of (['rl', 'rr'] as const).entries()) {
      car.model.wheels[key].getWorldPosition(this.wheel);
      const outward = w === 0 ? -1 : 1;
      this.side.set(this.motion.z, 0, -this.motion.x).multiplyScalar(outward);
      this.wheel.y = car.group.position.y;
      if (this.visible) this.vfx.spawnDroplets(this.wheel, car.physics.velocity, this.side, strength * (car === player ? 140 : 200), dt);
      PLUME.forEach((puff, k) => {
        const back = puff.back * reach, size = puff.size * (.7 + .3 * reach);
        const wobble = Math.sin(this.time * 3.1 + state.seed + k * 1.7) * .15 * size;
        this.world.copy(this.wheel).addScaledVector(this.motion, -back).addScaledVector(this.side, back * .12 + wobble);
        this.world.y = car.group.position.y + .05 + size * .16;
        // Screen direction this card's water travels in, so its streaks stream the right way.
        this.viewA.copy(this.world).applyMatrix4(camera.matrixWorldInverse);
        this.viewB.copy(this.world).addScaledVector(this.motion, -1).applyMatrix4(camera.matrixWorldInverse);
        const driftX = this.viewB.x / Math.max(.1, -this.viewB.z) - this.viewA.x / Math.max(.1, -this.viewA.z);
        const driftY = this.viewB.y / Math.max(.1, -this.viewB.z) - this.viewA.y / Math.max(.1, -this.viewA.z);
        this.matrix.makeTranslation(this.world.x, this.world.y, this.world.z);
        this.plumes.setMatrixAt(instance, this.matrix);
        this.plumeData.setXYZW(instance, size, puff.alpha * strength, state.seed + k * .31 + w * 2.3, 1 + Math.min(1.2, reach * .9));
        this.plumeDrift.setXY(instance, driftX, driftY);
        instance++;
      });
    }
    return instance;
  }

  /** Kept for callers that teleport cars; effects are derived from the current pose. */
  reset(): void { /* nothing is accumulated across frames */ }

  dispose(): void {
    this.plumes.removeFromParent(); this.plumes.geometry.dispose(); this.plumeMaterial.dispose();
  }
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
