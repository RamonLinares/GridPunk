import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

export interface SunLightingOptions {
  camera: THREE.PerspectiveCamera;
  parent: THREE.Object3D;
  color: THREE.ColorRepresentation;
  intensity: number;
  /** Unit vector pointing from the scene towards the sun. */
  sunDirection: THREE.Vector3;
  /** Camera-space distance covered by the last cascade, in metres. */
  range?: number;
  /** Camera-space distances where each cascade hands over, in metres. */
  splits?: number[];
  shadowMapSize?: number;
}

type ShaderHook = NonNullable<THREE.Material['onBeforeCompile']>;

const LIT = (material: THREE.Material): boolean => {
  const m = material as THREE.Material & {
    isMeshStandardMaterial?: boolean;
    isMeshLambertMaterial?: boolean;
    isMeshPhongMaterial?: boolean;
    isMeshToonMaterial?: boolean;
  };
  return Boolean(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
};

/**
 * One sun, cascaded shadow maps. The previous single 130 m shadow box
 * left every grandstand, hotel, fence and tree beyond the car unshadowed, so a
 * low sun could not read as a low sun. Cascades keep ~3 cm texels around the
 * car while still projecting building and stand shadows 600 m down the road.
 *
 * three.js' CSM overwrites `material.onBeforeCompile`; this wrapper composes
 * it with the project's own world-variation hooks and keeps program cache keys
 * unique so hooked and unhooked materials never share a compiled program.
 */
export class SunLighting {
  readonly csm: CSM;
  readonly lights: THREE.DirectionalLight[];
  private readonly camera: THREE.PerspectiveCamera;
  private readonly prepared = new WeakSet<THREE.Material>();
  private readonly splits: number[];
  private intensity: number;
  private shadowsEnabled = true;
  private mapSize: number;
  private lastFov = -1;
  private lastAspect = -1;
  private lastRange = -1;
  private nearOnlyCasters: THREE.Object3D[] = [];
  private shadowFrame = 0;
  /** Re-render the farthest cascade every other frame; its texels are ~70 cm. */
  farCascadeHalfRate = true;

  constructor(options: SunLightingOptions) {
    this.camera = options.camera;
    this.intensity = options.intensity;
    this.mapSize = options.shadowMapSize ?? 2048;
    this.splits = options.splits ?? [20, 60, 180];
    const cascades = this.splits.length + 1;
    const range = options.range ?? 640;
    this.csm = new CSM({
      camera: options.camera,
      parent: options.parent,
      cascades,
      maxFar: range,
      mode: 'custom',
      shadowMapSize: this.mapSize,
      shadowBias: -0.00003,
      lightDirection: options.sunDirection.clone().negate().normalize(),
      lightIntensity: options.intensity,
      lightNear: 1,
      // Casters far above the visible frustum (hotel roofs, stand canopies at
      // a low sun) still have to land in the depth map.
      lightMargin: 320,
      lightFar: 2600,
      customSplitsCallback: (count, _near, far, breaks) => {
        for (let i = 0; i < count - 1; i += 1) breaks.push(Math.min(0.999, this.splits[i] / far));
        breaks.push(1);
      },
    });
    this.csm.fade = true;
    this.lights = this.csm.lights;
    for (const light of this.lights) {
      light.color.set(options.color);
      // Vogel-disk PCF radius in texels: a soft edge rather than a stair-step.
      light.shadow.radius = 1.6;
    }
    this.refreshFrustums();
  }

  get sun(): THREE.DirectionalLight {
    return this.lights[0];
  }

  setDirection(sunDirection: THREE.Vector3): void {
    this.csm.lightDirection.copy(sunDirection).negate().normalize();
  }

  setColor(color: THREE.ColorRepresentation): void {
    for (const light of this.lights) light.color.set(color);
  }

  setIntensity(intensity: number): void {
    this.intensity = intensity;
    this.applyIntensity();
  }

  /**
   * Without shadow maps the CSM shader lights fragments with every cascade
   * light, so the extra cascades must contribute nothing while disabled.
   */
  setShadows(enabled: boolean): void {
    if (this.shadowsEnabled === enabled) return;
    this.shadowsEnabled = enabled;
    for (const light of this.lights) light.castShadow = enabled;
    this.applyIntensity();
  }

  setShadowMapSize(size: number): void {
    if (this.mapSize === size) return;
    this.mapSize = size;
    this.csm.shadowMapSize = size;
    for (const light of this.lights) {
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    this.applyBias();
  }

  setRange(range: number): void {
    if (this.csm.maxFar === range) return;
    this.csm.maxFar = range;
    this.refreshFrustums();
  }

  /** Registers every lit material below `root` with the cascade shader. */
  prepareMaterials(root: THREE.Object3D): void {
    root.traverse(object => {
      const holder = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
      if (!holder.material) return;
      const list = Array.isArray(holder.material) ? holder.material : [holder.material];
      for (const material of list) this.prepareMaterial(material);
    });
  }

  prepareMaterial(material: THREE.Material): void {
    if (!LIT(material) || this.prepared.has(material)) return;
    this.prepared.add(material);
    const own = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? (material.onBeforeCompile as ShaderHook) : null;
    const ownKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey.bind(material) : null;
    this.csm.setupMaterial(material);
    const cascadeHook = material.onBeforeCompile as ShaderHook;
    material.onBeforeCompile = (shader, renderer) => {
      own?.call(material, shader, renderer);
      cascadeHook.call(material, shader, renderer);
    };
    const fallbackKey = own ? own.toString() : '';
    material.customProgramCacheKey = () => `${ownKey ? ownKey() : fallbackKey}|csm${this.csm.cascades}`;
    material.needsUpdate = true;
  }

  /**
   * Splits the renderer's single shadow pass into near cascades and the far
   * cascade. three.js has no per-light caster masks, so small props and cars
   * are switched off while the far map renders: their shadows there would be
   * sub-texel anyway, and the far map covers most of the circuit, so this is
   * where most redundant shadow draw calls came from.
   */
  installCasterTiers(renderer: THREE.WebGLRenderer): void {
    const shadowMap = renderer.shadowMap;
    const original = shadowMap.render.bind(shadowMap);
    shadowMap.render = (lights, scene, camera) => {
      const far = this.lights[this.lights.length - 1];
      const near = lights.filter(light => light !== far);
      const frame = this.shadowFrame++;
      if (near.length > 0) original(near, scene, camera);
      if (!lights.includes(far)) return;
      const due = !this.farCascadeHalfRate || frame % 2 === 0 || far.shadow.map === null;
      if (!due) return;
      for (const object of this.nearOnlyCasters) object.castShadow = false;
      original([far], scene, camera);
      for (const object of this.nearOnlyCasters) object.castShadow = true;
    };
  }

  /**
   * Collects casters that only matter in the near cascades: every mesh whose
   * world bounding sphere is smaller than `maxRadius` (posts, cones, boards,
   * balcony rails) plus everything under `alwaysNear` (the cars). Returns the
   * number of casters demoted.
   */
  collectNearOnlyCasters(root: THREE.Object3D, alwaysNear: THREE.Object3D[] = [], maxRadius = 2.0): number {
    root.updateMatrixWorld(true);
    const list = new Set<THREE.Object3D>();
    const scale = new THREE.Vector3();
    root.traverse(object => {
      const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean };
      if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.castShadow) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere;
      if (!sphere) return;
      scale.setFromMatrixScale(mesh.matrixWorld);
      if (sphere.radius * Math.max(scale.x, scale.y, scale.z) < maxRadius) list.add(mesh);
    });
    for (const group of alwaysNear) {
      group.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.castShadow) list.add(mesh);
      });
    }
    this.nearOnlyCasters = [...list];
    return this.nearOnlyCasters.length;
  }

  /** Call once per frame after the camera has been placed and before rendering. */
  update(): void {
    if (this.camera.fov !== this.lastFov || this.camera.aspect !== this.lastAspect || this.csm.maxFar !== this.lastRange) {
      this.refreshFrustums();
    }
    this.csm.update();
  }

  dispose(): void {
    for (const light of this.lights) light.shadow.dispose();
    this.csm.dispose();
    this.csm.remove();
  }

  private refreshFrustums(): void {
    this.lastFov = this.camera.fov;
    this.lastAspect = this.camera.aspect;
    this.lastRange = this.csm.maxFar;
    this.csm.updateFrustums();
    this.applyBias();
  }

  /**
   * Slope bias scales with each cascade's texel footprint: the far cascade
   * covers well over a kilometre and would otherwise acne across every verge.
   */
  private applyBias(): void {
    for (const light of this.lights) {
      const cam = light.shadow.camera;
      const texel = (cam.right - cam.left) / this.mapSize;
      light.shadow.normalBias = Math.max(0.03, texel * 1.7);
    }
  }

  private applyIntensity(): void {
    this.lights.forEach((light, index) => {
      light.intensity = this.shadowsEnabled || index === 0 ? this.intensity : 0;
    });
  }
}
