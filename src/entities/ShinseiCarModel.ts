import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createSteeringWheel } from './SteeringWheel';
import type { CarModel } from './CarModel';

let source: THREE.Group | undefined;
let pending: Promise<void> | undefined;
export function preloadShinseiCarModel(): Promise<void> {
  return pending ??= new GLTFLoader().loadAsync('/cars/shinsei/shinsei-nd01.glb?v=clean-rear-wing')
    .then(asset => { source = asset.scene; })
    .catch(error => { pending = undefined; throw error; });
}

/** Owner-authored body and wheels, with baked Blender surfaces and game pivots. */
export function createShinseiCarModel(): CarModel {
  if (!source) throw new Error('Shinsei car must load before construction');
  const group = source.clone(true);
  group.name = 'car';
  group.userData.design = 'neon-shinsei-nd01';
  group.userData.cockpitEye = [0, .87, .03];
  // Source presentation details sit almost against the driver's lens. The
  // placeholder dashboard emitter enters the wider speed FOV and floods the
  // cockpit with bloom; our functional wheel already supplies the instruments.
  // Retain both details for exterior views only.
  group.userData.cockpitHidden = ['Shinsei_wipers', 'Shinsei_interior_led_cyan']
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
