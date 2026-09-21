import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNeonLedMaterial } from './NeonLedSigns';
import type { TrackBuilder } from './track/TrackBuilder';

const RADIUS = 110;
const HUB_HEIGHT = 142;
const CABINS = 32;
const ANGULAR_SPEED = Math.PI * 2 / 540;

/** Kairo's skyline landmark: steel observation wheel, not a track obstacle. */
export function createKairoFerrisWheel(builder: TrackBuilder) {
  const station = builder.spline.sampleAt(0);
  // Beyond the first turn, facing the opening straight as an urban vista.
  const center = new THREE.Vector3(620, 0, 760);
  center.y = builder.terrainHeightAt(center.x, center.z) + .06;
  const root = new THREE.Group();
  root.name = 'kairo-ferris-wheel';
  root.position.copy(center);
  root.scale.setScalar(.9);
  root.rotation.y = Math.atan2(-station.tangent.x, -station.tangent.z);
  // The entire moving silhouette stays inside this surveyed, off-road envelope.
  const reservation = { x: center.x, z: center.z, r: 120 };
  const clearance = builder.distanceToTrack(center.x, center.z) - reservation.r;
  if (clearance < 20) throw new Error('Kairo wheel site intrudes on the racing corridor');
  root.userData.roadClearanceVerified = true;
  root.userData.radius = RADIUS * .9;
  root.userData.cabinCount = CABINS;
  root.userData.roadClearance = clearance;
  root.userData.rotationPeriod = 540;

  const steel = new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: .66, metalness: .78 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x5b6367, roughness: .45, metalness: .82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101a23, roughness: .76, metalness: .45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x172b35, roughness: .22, metalness: .68, emissive: 0x29414b, emissiveIntensity: .24 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x38444c, roughness: .92 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xf693ac, emissive: 0xff638e, emissiveIntensity: 6, roughness: .38 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xffdbb8, emissive: 0xf6b886, emissiveIntensity: 1.8 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, 6);
  const up = new THREE.Vector3(0, 1, 0);
  const dummy = new THREE.Object3D();

  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const item = new THREE.Mesh(geometry, material); item.name = name;
    parent.add(item); return item;
  };
  const box = (parent: THREE.Object3D, material: THREE.Material, name: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const item = mesh(parent, unitBox, material, name); item.position.set(x, y, z); item.scale.set(w, h, d); return item;
  };
  const beamGeometry = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const geometry = rod.clone();
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    dummy.scale.set(radius, a.distanceTo(b), radius); dummy.updateMatrix();
    return geometry.applyMatrix4(dummy.matrix);
  };
  const merge = (parent: THREE.Object3D, parts: THREE.BufferGeometry[], material: THREE.Material, name: string) => {
    const geometry = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose());
    return mesh(parent, geometry, material, name);
  };
  const ring = (parent: THREE.Object3D, radius: number, tube: number, z: number, material: THREE.Material, name: string) => {
    const item = mesh(parent, new THREE.TorusGeometry(radius, tube, 6, 160), material, name); item.position.z = z; return item;
  };
  const at = (angle: number, radius: number, z: number) => new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z);

  // Four tapered plate-steel legs with welded edge flanges and concrete feet.
  const legs: THREE.BufferGeometry[] = [], flanges: THREE.BufferGeometry[] = [];
  for (const z of [-17, 17]) for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(side * 71 - 4.6, 5); shape.lineTo(side * 71 + 4.6, 5);
    shape.lineTo(side * 9 + 2.6, HUB_HEIGHT); shape.lineTo(side * 9 - 2.6, HUB_HEIGHT); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: true, bevelSize: .4, bevelThickness: .4, bevelSegments: 1, steps: 1 });
    geometry.translate(0, 0, z - 3); legs.push(geometry);
    for (const edgeSide of [-1, 1]) flanges.push(beamGeometry(new THREE.Vector3(side * 71 + edgeSide * 4, 6, z + 3.5), new THREE.Vector3(side * 9 + edgeSide * 2.2, HUB_HEIGHT - 2, z + 3.5), .3));
    box(root, concrete, 'kairo-wheel-foundation', side * 71, 2.5, z, 16, 5, 17);
    box(root, dark, 'kairo-wheel-footplate', side * 71, 5.3, z, 11, .6, 10);
  }
  merge(root, legs, steel, 'kairo-wheel-tapered-supports');
  merge(root, flanges, edge, 'kairo-wheel-support-flanges');
  box(root, dark, 'kairo-wheel-axle', 0, HUB_HEIGHT, 0, 22, 16, 46);
  // An elevated boarding concourse reaches the cabins at their lowest point.
  box(root, concrete, 'kairo-wheel-terminal', 0, 8, 3, 65, 16, 27);
  box(root, glass, 'kairo-wheel-terminal-glazing', 0, 10, 17, 60, 8, .4);
  box(root, steel, 'kairo-wheel-terminal-roof', 0, 16.5, 3, 70, 1, 31);
  box(root, steel, 'kairo-wheel-boarding-deck', 0, 22.2, 0, 47, 1.2, 19);
  box(root, pink, 'kairo-wheel-terminal-strip', 0, 17.1, 18.7, 64, .18, .18);
  const terminalDetail: THREE.BufferGeometry[] = [];
  for (let x = -30; x <= 30; x += 5) terminalDetail.push(beamGeometry(new THREE.Vector3(x, 6, 17.5), new THREE.Vector3(x, 14, 17.5), .15));
  for (const side of [-1, 1]) {
    for (let step = 0; step < 36; step++) box(root, concrete, 'kairo-wheel-concourse-step', side * (39 + step * .65), (36 - step) * .3, 10, 1, .6, 8);
    terminalDetail.push(beamGeometry(new THREE.Vector3(side * 26, 17, 0), new THREE.Vector3(side * 26, 22, 0), .65));
  }
  merge(root, terminalDetail, edge, 'kairo-wheel-terminal-framing');

  const rotor = new THREE.Group(); rotor.name = 'kairo-wheel-rotor'; rotor.position.y = HUB_HEIGHT; root.add(rotor);
  for (const z of [-5, 5]) {
    ring(rotor, RADIUS, 1.05, z, steel, 'kairo-wheel-outer-rim');
    ring(rotor, RADIUS - 4, .65, z, edge, 'kairo-wheel-inner-rim');
    ring(rotor, RADIUS + .25, .8, z * 1.24, pink, 'kairo-wheel-pink-rim');
  }
  const spokes: THREE.BufferGeometry[] = [], trusses: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2, b = (i + 1) / 64 * Math.PI * 2;
    for (const z of [-5, 5]) {
      spokes.push(beamGeometry(at(a - .2, 20, z * 1.5), at(a, RADIUS - 4, z), .2));
      spokes.push(beamGeometry(at(a + .2, 20, z * 1.5), at(a, RADIUS - 4, z), .2));
      trusses.push(beamGeometry(at(a, RADIUS - 4, z), at(b, RADIUS, z), .25));
    }
    trusses.push(beamGeometry(at(a, RADIUS, -5), at(b, RADIUS, 5), .28));
    trusses.push(beamGeometry(at(a, RADIUS, 5), at(a, RADIUS, -5), .35));
  }
  merge(rotor, spokes, steel, 'kairo-wheel-tension-spokes');
  // Sparse pink radial lights make the silhouette readable from the road.
  const spokeLights: THREE.BufferGeometry[] = [];
  for(let i=0;i<16;i++) for(const z of [-6.3,6.3]) {
    const a=i/16*Math.PI*2;
    spokeLights.push(beamGeometry(at(a,25,z),at(a,RADIUS-5,z),.16));
  }
  merge(rotor,spokeLights,pink,'kairo-wheel-spoke-lights');
  merge(rotor, trusses, edge, 'kairo-wheel-rim-truss');
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.46, 6, 4), pink, 128);
  bulbs.name = 'kairo-wheel-rim-beacons'; rotor.add(bulbs);
  for (let i = 0; i < 128; i++) {
    dummy.position.copy(at(Math.floor(i / 2) / 64 * Math.PI * 2, RADIUS - 4, i % 2 ? 5.7 : -5.7));
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix);
  }
  bulbs.computeBoundingSphere();

  // Stationary hub signage contrasts with the slowly revolving steelwork.
  const hub = mesh(root, new THREE.CylinderGeometry(24, 24, 48, 64), dark, 'kairo-wheel-hub-housing');
  hub.rotation.x = Math.PI / 2; hub.position.y = HUB_HEIGHT;
  const sign = document.createElement('canvas'); sign.width = sign.height = 512;
  const ctx = sign.getContext('2d')!;
  ctx.fillStyle = '#091119'; ctx.fillRect(0, 0, 512, 512);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ff789b'; ctx.font = '500 64px sans-serif';
  ctx.fillText('HIGHER', 256, 230); ctx.fillText('STILL', 256, 307);
  ctx.fillStyle = '#ab707f'; ctx.font = '18px monospace'; ctx.fillText('K A I R O   L O O P', 256, 367);
  const face = createNeonLedMaterial(sign, { columns: 128, rows: 128, intensity: 5, motion: 'static', name: 'kairo-wheel-hub-sign' });
  for (const side of [-1, 1]) {
    const board = mesh(root, new THREE.CircleGeometry(22, 64), face, 'kairo-wheel-higher-still');
    board.position.set(0, HUB_HEIGHT, side * 24.15); if (side < 0) board.rotation.y = Math.PI;
    const rim = ring(root, 23, .28, side * 24.3, edge, 'kairo-wheel-hub-trim'); rim.position.y = HUB_HEIGHT;
  }

  // Shared opaque tinted glazing avoids transparency sorting on 32 moving pods.
  const podParts: { geometry: THREE.BufferGeometry; material: THREE.Material; name: string }[] = [];
  const podGlass = new THREE.SphereGeometry(1, 18, 12); podGlass.scale(4.5, 3.1, 3.8);
  podParts.push({ geometry: podGlass, material: glass, name: 'kairo-wheel-cabin-glass' });
  const podBase = new THREE.CylinderGeometry(3.6, 2.6, 1.3, 16); podBase.translate(0, -2.5, 0);
  const podRoof = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); podRoof.scale(3.6, .65, 3.2); podRoof.translate(0, 2.65, 0);
  podParts.push({ geometry: mergeGeometries([podBase, podRoof])!, material: dark, name: 'kairo-wheel-cabin-shells' }); podBase.dispose(); podRoof.dispose();
  const framing: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([-2.2, -1, 1, 2.5].map(y => { const r = Math.sqrt(1 - (y / 3.2) ** 2); return new THREE.Vector3(Math.cos(a) * 4.55 * r, y, Math.sin(a) * 3.85 * r); }));
    framing.push(new THREE.TubeGeometry(curve, 6, .12, 4, false));
  }
  framing.push(beamGeometry(new THREE.Vector3(0, 2.9, 0), new THREE.Vector3(0, 6.3, 0), .32));
  const podFrame = mergeGeometries(framing)!; framing.forEach(g => g.dispose());
  podParts.push({ geometry: podFrame, material: edge, name: 'kairo-wheel-cabin-frames' });
  const sill = new THREE.TorusGeometry(3.3, .1, 4, 24); sill.rotateX(Math.PI / 2); sill.translate(0, -2.05, 0);
  podParts.push({ geometry: sill, material: warm, name: 'kairo-wheel-cabin-interior-light' });
  const pods = podParts.map(({ geometry, material, name }) => {
    const instances = new THREE.InstancedMesh(geometry, material, CABINS); instances.name = name;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Fixed conservative bounds avoid rebuilding them every animation frame.
    instances.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, HUB_HEIGHT, 0), RADIUS + 12);
    root.add(instances); return instances;
  });
  root.updateMatrixWorld(true);
  const approach = builder.spline.sampleAt(0).position;
  const dx = center.x - approach.x, dz = center.z - approach.z, spanSquared = dx * dx + dz * dz;
  const buildingHeightLimit = (x: number, z: number) => {
    const t = ((x - approach.x) * dx + (z - approach.z) * dz) / spanSquared;
    if (t < .04 || t > 1) return Infinity;
    const distance = Math.hypot(x - approach.x - dx * t, z - approach.z - dz * t);
    return distance < 30 + t * 160 ? 18 + t * 24 : Infinity;
  };
  // Imported landmark towers have fixed silhouettes, so reserve their view gap.
  const landmarkReservations = [reservation, ...[.15, .3, .45, .6, .75, .9].map(t => ({ x: approach.x + dx * t, z: approach.z + dz * t, r: 45 + t * 130 }))];
  const update = (seconds: number) => {
    const angle = (seconds % 540) * ANGULAR_SPEED;
    rotor.rotation.z = angle;
    root.userData.rotationAngle = angle;
    for (let i = 0; i < CABINS; i++) {
      const a = i / CABINS * Math.PI * 2 + angle;
      dummy.position.set(Math.cos(a) * RADIUS, HUB_HEIGHT + Math.sin(a) * RADIUS - 6.3, 0);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      for (const instances of pods) instances.setMatrixAt(i, dummy.matrix);
    }
    for (const instances of pods) instances.instanceMatrix.needsUpdate = true;
  };
  update(0);
  // Consolidate the concourse steps and boxes by material, not one draw per step.
  const staticBatches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...root.children]) {
    if (!(child instanceof THREE.Mesh) || child.geometry !== unitBox) continue;
    child.updateMatrix();
    const material = child.material as THREE.Material;
    const parts = staticBatches.get(material) ?? [];
    parts.push(unitBox.clone().applyMatrix4(child.matrix)); staticBatches.set(material, parts);
    root.remove(child);
  }
  let batch = 0;
  for (const [material, parts] of staticBatches) merge(root, parts, material, `kairo-wheel-concourse-${batch++}`);
  // This skyline structure rises above the dense street fog. Keep the same
  // fog colour, but cap its optical density independently of graphics presets.
  const materials = new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh)materials.add(o.material as THREE.Material);});
  for(const material of materials) {
    const compile=material.onBeforeCompile.bind(material);
    const cacheKey=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',
        THREE.ShaderChunk.fog_fragment.replaceAll('fogDensity','min(fogDensity, 0.0008)'));
    };
    material.customProgramCacheKey=()=>`${cacheKey}-kairo-skyline-fog-v1`;
    material.userData.skylineFogDensity=.0008;
  }
  unitBox.dispose();
  // Temporary construction geometry is not part of the scene's disposal tree.
  rod.dispose();
  return { group: root, reservation, landmarkReservations, buildingHeightLimit, update };
}
