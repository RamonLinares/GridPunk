import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnvironmentHandles } from './Environment';
import type { TrackBuilder } from './track/TrackBuilder';
import { SunLighting } from '../systems/SunLighting';
import { createSteamMaterials } from './SteamMaterials';
import { createSteamBuildingKit } from './SteamBuildings';
import { createSteamPlumes, type PressureVent } from './SteamPlumes';
import { createBrassWorks } from './SteamBrassWorks';
import { createSteamKit } from './SteamKit';
import { createSteamStreetBuildings } from './SteamStreetBuildings';
import { grandstandTrackClearance } from './SolarGrandstand';

type Site = { x: number; z: number; r: number; angle: number; progress: number; kind: string };

/** A Victorian industrial city fitted around the selected road layout. */
export function createSteamEnvironment(scene: THREE.Scene, builder: TrackBuilder, camera: THREE.PerspectiveCamera): EnvironmentHandles {
  const group = new THREE.Group(); group.name = 'steam-city'; group.userData.sceneryContainer = true; scene.add(group);
  scene.userData.daylight = true; scene.userData.steam = true;
  const m = createSteamMaterials(), kit = createSteamKit(m), spline = builder.spline;
  let seed = 1886;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphere = new THREE.SphereGeometry(1, 20, 12), cone = new THREE.ConeGeometry(1, 1, 12);
  const ring = new THREE.TorusGeometry(1, .08, 6, 32), plane = new THREE.PlaneGeometry(1, 1);
  const batches = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; matrices: THREE.Matrix4[] }>();
  const dummy = new THREE.Object3D();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, p: number[], size: number[], rotation = [0, 0, 0]) => {
    dummy.position.fromArray(p); dummy.scale.fromArray(size); dummy.rotation.set(rotation[0], rotation[1], rotation[2]); dummy.updateMatrix();
    const key = `${geo.uuid}:${mat.uuid}:${Math.floor(p[0] / 240)},${Math.floor(p[2] / 240)}`;
    let batch = batches.get(key); if (!batch) { batch = { geo, mat, matrices: [] }; batches.set(key, batch); }
    batch.matrices.push(dummy.matrix.clone());
  };
  const localKit = (x: number, z: number, angle: number) => {
    const co = Math.cos(angle), si = Math.sin(angle), yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    return (geo: THREE.BufferGeometry, mat: THREE.Material, u: number, y: number, v: number, w: number, h: number, d: number, rotation = [0, 0, 0]) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation as [number, number, number])).premultiply(yaw);
      const e = new THREE.Euler().setFromQuaternion(q);
      part(geo, mat, [x + co * u + si * v, y, z - si * u + co * v], [w, h, d], [e.x, e.y, e.z]);
    };
  };
  const clearance = grandstandTrackClearance(spline.samples);
  const occupied: { x: number; z: number; r: number }[] = [], sites: Site[] = [];
  for (const spec of [{ kind: 'clockworks', progress: .20, r: 27 }, { kind: 'boilerworks', progress: .552, r: 35 }, { kind: 'aerodrome', progress: .756, r: 36 }, // Brass & Co. closes a long straight: the back straight on Kairo, the start straight on Neon.
    { kind: 'brassworks', progress: spline.circuit.layout === 'neon' ? .10 : .40, r: 31 }]) {
    let found = false;
    for (const shift of [0, .015, -.015, .03]) {
      if (found) break;
      const progress = spec.progress + shift, s = spline.sampleAt(Math.round(progress * spline.count));
      if (s.position.y > .3) continue;
      for (const side of [1, -1]) {
        if (found) break;
        for (let offset = spec.r + 20; offset < spec.r + 85; offset += 8) {
          const p = s.position.clone().addScaledVector(s.right, side * offset);
          if (clearance(p.x, p.z) < spec.r + 17 || occupied.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + spec.r + 10)) continue;
          const site = { ...spec, progress, x: p.x, z: p.z, angle: Math.atan2(-side * s.right.x, -side * s.right.z) };
          sites.push(site); occupied.push(site); found = true; break;
        }
      }
    }
  }
  group.userData.landmarks = sites;
  const reserved = (x: number, z: number, radius: number) => sites.some(site => {
    if (Math.hypot(x - site.x, z - site.z) < site.r + radius + 5) return true;
    const approach = spline.sampleAt(Math.round((site.progress - .034) * spline.count)).position;
    const dx = site.x - approach.x, dz = site.z - approach.z;
    const t = THREE.MathUtils.clamp(((x - approach.x) * dx + (z - approach.z) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - approach.x - t * dx, z - approach.z - t * dz) < radius + 9;
  });
  const vents: THREE.Vector3[] = [], pressureVents: PressureVent[] = [];
  const animated: { root: THREE.Object3D; rate: number; phase?: number }[] = [];
  const gearShape = new THREE.Shape();
  for (let k = 0; k <= 96; k++) {
    const a = k / 96 * Math.PI * 2, r = k % 4 < 2 ? 1 : .88;
    if (k === 0) gearShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else gearShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, .62, 0, Math.PI * 2, true); gearShape.holes.push(hole);
  const gearParts: THREE.BufferGeometry[] = [new THREE.ExtrudeGeometry(gearShape, { depth: .13, bevelEnabled: false })];
  for (let k = 0; k < 4; k++) { const geo = new THREE.BoxGeometry(1.55, .11, .13).toNonIndexed(); geo.rotateZ(k * Math.PI / 4); gearParts.push(geo); }
  const gearGeo = mergeGeometries(gearParts)!; gearParts.forEach(geo => geo.dispose());
  const gear = (x: number, y: number, z: number, r: number, yaw: number, rate: number) => {
    const axle = new THREE.Group(); axle.name = 'steam-flywheel'; axle.position.set(x, y, z); axle.rotation.y = yaw;
    const mesh = new THREE.Mesh(gearGeo, m.brass); mesh.scale.setScalar(r); mesh.castShadow = true; axle.add(mesh); group.add(axle);
    animated.push({ root: mesh, rate }); return axle;
  };
  const sign = (text: string, subtitle: string) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#28342f'; ctx.fillRect(0, 0, 1024, 256); ctx.strokeStyle = '#ba965e'; ctx.lineWidth = 8; ctx.strokeRect(12, 12, 1000, 232);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ebd3a1'; ctx.font = 'bold 91px Georgia'; ctx.fillText(text, 512, 125);
    ctx.font = '25px Arial'; ctx.fillText(subtitle, 512, 188);
    return new THREE.MeshStandardMaterial({ map: m.texture(c), roughness: .7, side: THREE.DoubleSide });
  };
  const nameplate = sign(spline.circuit.shortName.toUpperCase(), 'FORGED IN FIRE  /  DRIVEN BY STEAM');
  const clockCanvas = document.createElement('canvas'); clockCanvas.width = clockCanvas.height = 512;
  const cc = clockCanvas.getContext('2d')!; cc.fillStyle = '#e2c894'; cc.fillRect(0, 0, 512, 512);
  cc.strokeStyle = '#6a5031'; cc.lineWidth = 12; cc.beginPath(); cc.arc(256, 256, 238, 0, Math.PI * 2); cc.stroke();
  cc.fillStyle = '#263530'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.font = 'bold 46px Georgia';
  const numerals = ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
  numerals.forEach((n, i) => { const a = i * Math.PI / 6; cc.fillText(n, 256 + Math.sin(a) * 185, 256 - Math.cos(a) * 185); });
  const clockMat = new THREE.MeshStandardMaterial({ map: m.texture(clockCanvas), roughness: .7 });
  const disk = new THREE.CircleGeometry(1, 48);
  let brassWorks: ReturnType<typeof createBrassWorks> | undefined;
  // Authored districts establish different visual beats through the lap.
  for (const site of sites) {
    if (site.kind === 'brassworks') {
      // Brass & Co. is a fully modelled set piece with its own plaza.
      brassWorks = createBrassWorks(m, kit);
      brassWorks.root.position.set(site.x, 0, site.z); brassWorks.root.rotation.y = site.angle;
      group.add(brassWorks.root); brassWorks.root.updateMatrixWorld(true);
      for (const vent of brassWorks.vents) vents.push(brassWorks.root.localToWorld(vent.clone()));
      animated.push(...brassWorks.gears);
      continue;
    }
    const rawLocal = localKit(site.x, site.z, site.angle), heightScale = site.kind === 'clockworks' ? .75 : 1;
    const local: typeof rawLocal = (geo, mat, u, y, v, w, h, d, rotation) => rawLocal(geo, mat, u, y * heightScale, v, w, h * heightScale, d, rotation);
    local(cylinder, m.stone, 0, .4, 0, site.r - 1, .8, site.r - 1);
    const world = (u: number, y: number, v: number) => new THREE.Vector3(u, y * heightScale, v).applyAxisAngle(new THREE.Vector3(0, 1, 0), site.angle).add(new THREE.Vector3(site.x, 0, site.z));
    if (site.kind === 'clockworks') {
      local(box, m.facade, 0, 22, 0, 16, 44, 16);
      for (const y of [2, 14, 28, 41, 45, 57]) local(box, m.stone, 0, y, 0, y > 40 ? 20 : 17.5, .8, y > 40 ? 20 : 17.5);
      local(box, m.iron, 0, 51, 0, 17.4, 11, 17.4);
      local(cone, m.roof, 0, 63, 0, 13.5, 13, 13.5);
      local(cylinder, m.brass, 0, 73, 0, .24, 10, .24);
      for (let side = 0; side < 4; side++) {
        const face = new THREE.Group(); face.name = 'steam-clock-face'; face.rotation.y = site.angle + side * Math.PI / 2;
        face.position.copy(world(Math.sin(side * Math.PI / 2) * 8.85, 51, Math.cos(side * Math.PI / 2) * 8.85));
        const dial = new THREE.Mesh(disk, clockMat); dial.scale.setScalar(4.75); face.add(dial);
        const frame = new THREE.Mesh(ring, m.brass); frame.scale.setScalar(4.9); face.add(frame);
        for (const [length, angle, rate] of [[3.8, .55, -.02], [2.5, 2.2, -.00167]]) {
          const pivot = new THREE.Group(); pivot.position.z = .16; pivot.rotation.z = angle;
          const hand = new THREE.Mesh(box, m.iron); hand.position.y = length / 2; hand.scale.set(.18, length, .14); pivot.add(hand); face.add(pivot); animated.push({ root: pivot, rate, phase: angle });
        }
        group.add(face);
      }
      for (const side of [-1, 1]) {
        const p = world(side * 15, 13, 10); gear(p.x, p.y, p.z, 9, site.angle, side * .10);
        local(cylinder, m.iron, side * 15, 6, 10, 1.2, 12, 1.2);
      }
      local(plane, sign('CLOCKWORKS', 'THE CITY NEVER STOPS'), 0, 6, 8.4, 15, 3.6, 1);
    } else if (site.kind === 'boilerworks') {
      local(box, m.facade, 0, 10, -9, 43, 20, 20);
      for (const side of [-1, 1]) {
        local(cylinder, m.brick, side * 18, 30, -8, 2.8, 60, 2.8);
        for (const y of [4, 20, 38, 57]) local(cylinder, m.iron, side * 18, y, -8, 3.05, .65, 3.05);
        vents.push(world(side * 18, 60, -8));
      }
      for (const x of [-12, 0, 12]) {
        local(cylinder, m.copper, x, 14, 10, 4.5, 24, 4.5);
        local(sphere, m.copper, x, 26, 10, 4.5, 3, 4.5);
        for (const y of [4, 12, 21]) local(ring, m.brass, x, y, 10, 4.6, 4.6, 2, [Math.PI / 2, 0, 0]);
        local(cylinder, m.iron, x, 7, 16, .75, 12, .75);
        vents.push(world(x, 29, 10));
      }
      local(cylinder, m.copper, 0, 24, 14, 1.2, 32, 1.2, [0, 0, Math.PI / 2]);
      local(plane, sign('BOILER WORKS', 'PRECISION UNDER PRESSURE'), 0, 18, 2, 28, 6, 1);
      const p = world(0, 8, 18); gear(p.x, p.y, p.z, 5, site.angle, -.15);
    } else {
      local(box, m.facade, 0, 9, -4, 44, 18, 28);
      // Multiple pitched copper roof bays read as an old train shed.
      for (const x of [-15, 0, 15]) for (const side of [-1, 1])
        local(box, m.roof, x + side * 3.8, 21, -4, 8.7, .55, 29, [0, 0, -side * .53]);
      for (const side of [-1, 1]) {
        local(box, m.iron, side * 23, 24, 6, 1.2, 48, 1.2);
        local(box, m.brass, side * 23, 49, 6, 5, 2, 5);
        for (let y = 5; y < 43; y += 7) local(box, m.copper, side * 23, y, 6, 6, .4, .5);
      }
      local(box, m.iron, 0, 46, 6, 47, 1.2, 1.2);
      local(plane, sign('AERODROME', 'ROYAL KAIRO AIRSHIP COMPANY'), 0, 12, 10.3, 32, 6, 1);
      for (const x of [-17, 17]) { const p = world(x, 29, 6); gear(p.x, p.y, p.z, 5, site.angle, x * .006); }
    }
  }
  const buildingKit = createSteamBuildingKit(m, { box, cylinder, sphere, cone, ring });
  const buildingFootprints: { x: number; z: number; r: number; style: number; near: boolean }[] = [];
  // Skyline blocks: six silhouette families behind the street, cell-instanced.
  const building = (x: number, z: number, w: number, d: number, h: number, angle: number) => {
    const r = Math.hypot(w, d) / 2 + 2;
    if (reserved(x, z, r) || clearance(x, z) < r + 15 || occupied.some(o => Math.hypot(x - o.x, z - o.z) < o.r + r + 2)) return;
    const index = buildingFootprints.length, style = index % 6;
    occupied.push({ x, z, r }); buildingFootprints.push({ x, z, r, style, near: false });
    const local = localKit(x, z, angle);
    const { roofHeight } = buildingKit.build(local, w, d, h, index, false);
    if (style === 1 || style === 5) {
      const chimneyHeight = 10 + rand() * 14, u = w * .30, v = -d * .27;
      local(cylinder, m.brick, u, roofHeight + chimneyHeight / 2, v, 1.2, chimneyHeight, 1.2);
      for (const y of [roofHeight + 2, roofHeight + chimneyHeight - .3]) local(cylinder, m.iron, u, y, v, 1.45, .6, 1.45);
    }
  };
  // The street itself is lined with characterful set pieces; the plain
  // silhouette families below fill the skyline behind them.
  const street = createSteamStreetBuildings(m, kit);
  const streetOrder = [0, 4, 2, 6, 1, 5, 3, 7];
  let streetIndex = 0;
  for (let i = 0; i < spline.count; i += 10) {
    const s = spline.sampleAt(i);
    for (const side of [-1, 1]) {
      const style = streetOrder[streetIndex % streetOrder.length], r = street.archetypes[style].r;
      const p = s.position.clone().addScaledVector(s.right, side * (r + 17)), angle = Math.atan2(-side * s.right.x, -side * s.right.z);
      if (reserved(p.x, p.z, r) || clearance(p.x, p.z) < r + 15 || occupied.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r + r + 2)) continue;
      occupied.push({ x: p.x, z: p.z, r }); buildingFootprints.push({ x: p.x, z: p.z, r, style: 6 + style, near: true });
      const { vents: stacks, valves } = street.place(style, p.x, p.z, angle);
      vents.push(...stacks); pressureVents.push(...valves);
      streetIndex++;
    }
  }
  const streetMeshes = street.build(group);
  group.userData.streetPlacements = street.placed;
  const bounds = new THREE.Box3().setFromPoints(spline.samples.map(s => s.position));
  for (let x = bounds.min.x - 260; x < bounds.max.x + 260; x += 86) for (let z = bounds.min.z - 260; z < bounds.max.z + 260; z += 86)
    building(x + rand() * 20, z + rand() * 20, 24 + rand() * 18, 22 + rand() * 20, 18 + rand() * 47, 0);
  group.userData.buildingFootprints = buildingFootprints;
  // Gas lanterns and copper water mains follow the verges, with full return-lane clearance.
  for (let i = 0; i < spline.count; i += 9) {
    const s = spline.sampleAt(i), angle = Math.atan2(s.tangent.x, s.tangent.z);
    for (const side of [-1, 1]) {
      const p = s.position.clone().addScaledVector(s.right, side * 15.5);
      if (clearance(p.x, p.z) < 14.5) continue;
      const local = localKit(p.x, p.z, angle), ground = spline.circuit.layout === 'neon' ? 0 : s.position.y;
      local(cylinder, m.iron, 0, ground + 3.5, 0, .15, 7, .15);
      local(cone, m.iron, 0, ground + 7.9, 0, .65, .7, .65);
      local(box, m.lamp, 0, ground + 7.15, 0, .7, .9, .7);
      for (const x of [-.4, .4]) for (const z of [-.4, .4]) local(box, m.iron, x, ground + 7.2, z, .08, 1.25, .08);
      local(cylinder, m.brass, 0, ground + .25, 0, .4, .5, .4);
    }
  }
  // High service gantries: supports clear both carriageways and the deck leaves 13 m headroom.
  for (const progress of [.11, .32, .65, .94]) {
    const s = spline.sampleAt(Math.round(progress * spline.count)), angle = Math.atan2(s.tangent.x, s.tangent.z);
    const support = [-1, 1].map(side => s.position.clone().addScaledVector(s.right, side * 18));
    if (support.some(p => clearance(p.x, p.z) < 16) || s.position.y > .3) continue;
    const bridge = new THREE.Group(); bridge.name = 'steam-pipe-gantry'; bridge.userData.intentionalOverpass = true;
    bridge.position.copy(s.position); bridge.rotation.y = angle; group.add(bridge);
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, p: number[], scale: number[], rotation = [0, 0, 0]) => {
      const o = new THREE.Mesh(geo, mat); o.position.fromArray(p); o.scale.fromArray(scale); o.rotation.set(rotation[0], rotation[1], rotation[2]); o.castShadow = true; bridge.add(o);
    };
    for (const side of [-1, 1]) {
      mesh(box, m.iron, [side * 18, 7, 0], [1, 14, 2.8]);
      mesh(box, m.iron, [0, 14, side * 1.3], [37, 1.4, .4]);
      mesh(cylinder, m.copper, [0, 16, side * .7], [.7, 38, .7], [0, 0, Math.PI / 2]);
      for (let x = -16; x <= 16; x += 4) mesh(box, m.brass, [x, 15, side * 1.4], [4.2, .15, .15], [0, 0, x % 8 ? .55 : -.55]);
    }
    mesh(plane, nameplate, [0, 14, -1.55], [17, 3, 1], [0, Math.PI, 0]);
  }
  // Slow cargo dirigibles cross the open approach sky; no Solar branding or turbines.
  const airships: { root: THREE.Group; anchor: THREE.Vector3; heading: number; phase: number }[] = [];
  for (const [index, progress] of [.182, .70].entries()) {
    const s = spline.sampleAt(Math.round(progress * spline.count));
    const root = new THREE.Group(); root.name = 'steam-dirigible'; root.userData.intentionalOverpass = true;
    const hull = new THREE.Mesh(sphere, m.stone); hull.scale.set(43, 10.5, 10.5); root.add(hull);
    for (const x of [-26, -13, 0, 13, 26]) {
      const radius = 10.6 * Math.sqrt(1 - (x / 43) ** 2);
      const rib = new THREE.Mesh(ring, m.copper); rib.rotation.y = Math.PI / 2; rib.position.x = x; rib.scale.set(radius, radius, 1.8); root.add(rib);
    }
    const gondola = new THREE.Mesh(box, m.iron); gondola.position.y = -11; gondola.scale.set(23, 3.2, 4); root.add(gondola);
    for (const side of [-1, 1]) {
      for (let x = -9; x <= 9; x += 3) { const window = new THREE.Mesh(box, m.lamp); window.position.set(x, -10.8, side * 2.05); window.scale.set(1.8, 1.1, .1); root.add(window); }
      const fin = new THREE.Mesh(cone, m.roof); fin.position.set(-33, side * 10, 0); fin.scale.set(4, 14, .3); fin.rotation.z = side * -.7; root.add(fin);
      const engine = new THREE.Mesh(sphere, m.copper); engine.position.set(-6, -11, side * 7); engine.scale.set(3, 1.2, 1.2); root.add(engine);
    }
    const anchor = s.position.clone().addScaledVector(s.tangent, 600); anchor.y = 150 + index * 30;
    airships.push({ root, anchor, heading: Math.atan2(-s.tangent.z, s.tangent.x) + Math.PI / 2, phase: index * 2 }); group.add(root);
  }
  const { mesh: steam, material: steamMaterial } = createSteamPlumes(vents, pressureVents);
  group.add(steam);
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geo, batch.mat, batch.matrices.length); mesh.name = 'steam-city-instanced'; mesh.userData.preserveAuthoredElevation = true;
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.computeBoundingSphere();
    // Thin trim and glazed roof panes do not need additional shadow-cascade draws.
    mesh.castShadow = ![m.brass, m.lamp, m.glass].includes(batch.mat as THREE.MeshStandardMaterial) && batch.geo !== ring && batch.geo !== plane;
    mesh.receiveShadow = true; group.add(mesh);
  }
  // Cinematic tier: a low golden-hour sun with a hot disc and a wide glow; the
  // default overcast afternoon keeps the original sun and gradient.
  const daySun = new THREE.Vector3(-.6, .65, .4).normalize(), goldenSun = new THREE.Vector3(-.8, .27, .53).normalize();
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, uSun: { value: new THREE.Vector3(-.6, .5, .4).normalize() }, uCine: { value: 0 } },
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 direction; uniform float time,uCine; uniform vec3 uSun;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float h=max(d.y,0.);float sun=max(dot(d,uSun),0.);
      vec3 low=mix(vec3(.69,.46,.25),vec3(1.05,.52,.2),uCine),high=mix(vec3(.12,.25,.31),vec3(.1,.17,.27),uCine);
      vec3 c=mix(low,high,pow(h,mix(.45,.32,uCine)));
      vec2 uv=d.xz/(h+.25)*3.+time*.002;float n=noise(uv)*.6+noise(uv*2.7)*.3+noise(uv*8.)*.1;
      // Clouds catch the sun from below at golden hour: bright rims towards the sun, dusky elsewhere.
      vec3 cloud=mix(vec3(.62,.56,.45),mix(vec3(.36,.25,.24),vec3(1.5,.78,.38),pow(sun,3.)),uCine);
      c=mix(c,cloud,smoothstep(.54,.75,n)*smoothstep(.02,.15,h)*mix(.65,.8,uCine));
      c+=vec3(1.,.7,.32)*pow(sun,70.)*.4*(1.-uCine);
      c+=uCine*(vec3(1.,.55,.2)*(pow(sun,8.)*.28+pow(sun,90.)*.9)+vec3(1.,.82,.55)*smoothstep(.9994,.9998,sun)*8.);
      c=mix(c,mix(vec3(.37,.33,.27),vec3(.3,.19,.12),uCine),smoothstep(0.,-.15,d.y));gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), skyMat); sky.name = 'steam-sky'; sky.frustumCulled = false; group.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xd1dadd, 0x806445, 1.35); group.add(hemisphere);
  const sunLighting = new SunLighting({ camera, parent: group, color: 0xffdbac, intensity: 3.3, sunDirection: daySun, range: 520, splits: [42, 150], shadowMapSize: 2048 });
  group.userData.scenery = { streetBuildings: Object.fromEntries(street.archetypes.map((a, i) => [a.name, street.placed.filter(p => p.style === i).length])),
    buildings: occupied.length - sites.length, vents: vents.length, pressureVents: pressureVents.length, steamParticles: steam.userData.particles, animatedGears: animated.length, streetGears: streetMeshes.gears, airships: airships.length, buildingStyles: buildingKit.styles, features: buildingKit.features };
  const update = (focus?: THREE.Vector3, seconds = 0) => {
    if (focus) sky.position.copy(focus);
    skyMat.uniforms.time.value = seconds; steamMaterial.uniforms.time.value = seconds;
    for (const item of animated) item.root.rotation.z = (item.phase ?? 0) + seconds * item.rate;
    streetMeshes.update(seconds, focus);
    for (const ship of airships) {
      const phase = seconds * .008 + ship.phase;
      ship.root.position.copy(ship.anchor).add(new THREE.Vector3(Math.sin(phase) * 45, Math.sin(phase * 1.3) * 2, Math.cos(phase) * 20));
      ship.root.rotation.y = ship.heading + Math.sin(phase) * .08;
    }
  };
  update();
  // The startup clearance pass measures individual child meshes; their parent transforms must exist first.
  group.updateMatrixWorld(true);
  return { group, ready: Promise.resolve(), sky, sun: sunLighting.sun, sunLighting, update,
    createSkyProbeScene() { const probe = new THREE.Scene(); probe.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMat)); return probe; },
    updateShadows: () => sunLighting.update(), prepareShadowMaterials: root => sunLighting.prepareMaterials(root),
    setShadows: enabled => sunLighting.setShadows(enabled), setShadowMapSize: size => sunLighting.setShadowMapSize(size), updateStandings: () => {},
    setCinematic(enabled) {
      // Golden hour: the key light drops to the skyline and turns amber, the
      // sky fill cools so shadows read blue, and the gas lamps are lit.
      sunLighting.setDirection(enabled ? goldenSun : daySun);
      sunLighting.setColor(enabled ? 0xffa45c : 0xffdbac); sunLighting.setIntensity(enabled ? 4.4 : 3.3);
      hemisphere.color.setHex(enabled ? 0x7f9bbd : 0xd1dadd); hemisphere.groundColor.setHex(enabled ? 0x5c3b24 : 0x806445);
      hemisphere.intensity = enabled ? .95 : 1.35;
      skyMat.uniforms.uSun.value.copy(enabled ? goldenSun : new THREE.Vector3(-.6, .5, .4).normalize()); skyMat.uniforms.uCine.value = enabled ? 1 : 0;
      steamMaterial.uniforms.uSun.value.copy(goldenSun); steamMaterial.uniforms.uCine.value = enabled ? 1 : 0;
      m.lamp.emissiveIntensity = enabled ? 3.4 : 1.2;
      kit.setCinematic(enabled);
      scene.userData.cinematicSun = enabled ? goldenSun : undefined;
    },
    disposeExtraResources: () => { m.dispose(); kit.dispose(); street.dispose(); } };
}
