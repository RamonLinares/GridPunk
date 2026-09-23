import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createSteeringWheel } from './SteeringWheel';
import type { CarModel } from './CarModel';

let source: THREE.Group | undefined;
let pending: Promise<void> | undefined;
export function preloadShinseiCarModel(): Promise<void> {
  return pending ??= new GLTFLoader().loadAsync('/cars/shinsei/shinsei-nd01.glb?v=worn-red-wing')
    .then(asset => { source = asset.scene; })
    .catch(error => { pending = undefined; throw error; });
}

/** Owner-authored body and wheels, with baked Blender surfaces and game pivots. */
/**
 * Rival liveries: the crimson paint in the baked body texture is re-hued to the
 * team colour in the shader, leaving carbon, metal, decals and wear untouched.
 * Very dark liveries become graphite with the original saturation removed.
 */
function applyShinseiLivery(material: THREE.MeshStandardMaterial, primary: number): void {
  const target = new THREE.Color(primary), hsl = { h: 0, s: 0, l: 0 };
  target.getHSL(hsl);
  const uniform = { value: new THREE.Vector3(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l < .2 ? .42 : Math.min(1.35, .6 + hsl.l)) };
  material.onBeforeCompile = shader => {
    shader.uniforms.uLivery = uniform;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uLivery;
      vec3 liveryHsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1.0e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}
      vec3 liveryRgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec3 paint = liveryHsv(diffuseColor.rgb);
      float red = (1. - smoothstep(.05, .1, min(paint.x, 1. - paint.x))) * smoothstep(.3, .5, paint.y);
      vec3 recoloured = liveryRgb(vec3(uLivery.x, paint.y * uLivery.y, min(1., paint.z * uLivery.z)));
      diffuseColor.rgb = mix(diffuseColor.rgb, recoloured, red);`);
  };
  material.customProgramCacheKey = () => `shinsei-livery-${primary.toString(16)}`;
}

export function createShinseiCarModel(livery: { primary?: number } = {}): CarModel {
  if (!source) throw new Error('Shinsei car must load before construction');
  const group = source.clone(true);
  group.name = 'car';
  group.userData.design = 'neon-shinsei-nd01';
  group.userData.cockpitEye = [0, .87, .03];
  // The source wiper rods protrude through the canopy in exterior views.
  // Remove them from this instance so camera changes and replays cannot restore them.
  group.getObjectByName('Shinsei_wipers')?.removeFromParent();
  // The source dashboard detail sits almost against the driver's lens. The
  // placeholder dashboard emitter enters the wider speed FOV and floods the
  // cockpit with bloom; our functional wheel already supplies the instruments.
  // Retain the dashboard emitter for exterior views only.
  group.userData.cockpitHidden = ['Shinsei_interior_led_cyan']
    .map(name => group.getObjectByName(name)).filter(Boolean);
  const materialCopies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const brakeLights: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = object.material as THREE.MeshStandardMaterial;
    let material = materialCopies.get(original);
    if (!material) {
      material = original.clone(); materialCopies.set(original, material);
      if (material.name === 'smoked_glass') {
        material.transparent = true; material.opacity = .72;
        material.side = THREE.FrontSide; material.depthWrite = false;
      }
      if (material.name.startsWith('decal_')) {
        material.transparent = true; material.alphaTest = .08;
        material.depthWrite = false;
        material.polygonOffset = true; material.polygonOffsetFactor = -1;
      }
      // Source render emitters were calibrated to Blender's exposure, not the
      // game's bloom. Preserve small lamps without washing out the silhouette.
      const emission: Record<string, number> = { led_white: 3, led_red: 1.2, led_cyan: 1.8, led_amber: 1.6, underglow_blue: .65 };
      if (material.name in emission) material.emissiveIntensity = emission[material.name];
      if (livery.primary !== undefined && ['Shinsei_BakedBody', 'Shinsei_WingWornCrimson'].includes(material.name)) applyShinseiLivery(material, livery.primary);
      if (livery.primary !== undefined && material.name === 'Shinsei_WingPaint') material.color.setHex(livery.primary).multiplyScalar(.8);
      for (const map of [material.map, material.normalMap, material.roughnessMap]) {
        if (map) map.anisotropy = 8;
      }
    }
    object.material = material;
    object.castShadow = !material.transparent;
    object.receiveShadow = true;
    if (object.name.startsWith('Shinsei_brakes_')) {
      // The brake bank shares its source red material with the splitter lamp.
      // Give it its own copy so braking only changes the rear lamps.
      object.material = material.clone(); brakeLights.push(object);
    }
  });
  const wheels = {} as CarModel['wheels'];
  for (const key of ['fl', 'fr', 'rl', 'rr'] as const) {
    const shell = group.getObjectByName(`Shinsei_${key}`) as THREE.Mesh | undefined;
    if (!shell?.isMesh) throw new Error(`Shinsei wheel missing: ${key}`);
    const steer = new THREE.Group(), spin = new THREE.Group();
    steer.name = `shinsei-wheel-${key}`;
    steer.position.copy(shell.position);
    shell.position.set(0, 0, 0);
    spin.add(shell); steer.add(spin); group.add(steer);
    const front = key[0] === 'f';
    steer.userData = { spin, isFront: front, radius: front ? .33 : .35, width: front ? .31 : .4,
      contactPoints: new Float32Array(shell.geometry.attributes.position.array) };
    wheels[key] = steer;
  }
  const drsFlap = group.getObjectByName('Shinsei_flap');
  if (!drsFlap || !brakeLights.length) throw new Error('Shinsei animation parts missing');
  const { group: steeringWheel, updateDisplay } = createSteeringWheel();
  steeringWheel.position.set(0, .70, .51);
  group.add(steeringWheel);
  return { group, wheels, drsFlap, brakeLights, steeringWheel, updateDisplay, body: group };
}
