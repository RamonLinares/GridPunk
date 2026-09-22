import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackSpline } from './track/TrackSpline';
import { grandstandTrackClearance } from './SolarGrandstand';
import type { createSolarVegetation } from './SolarVegetation';

type LandmarkKind = 'grove' | 'glasshouse' | 'farm';
export interface SolarLandmarkSite {
  kind: LandmarkKind;
  title: string;
  progress: number;
  x: number;
  z: number;
  r: number;
  angle: number;
}

/** Reserve whole districts before ordinary buildings and trees are placed. */
export function solarLandmarkSites(spline: TrackSpline, occupied: readonly { x: number; z: number; r: number }[] = []): SolarLandmarkSite[] {
  const clearance = grandstandTrackClearance(spline.samples);
  const sites: SolarLandmarkSite[] = [];
  for (const spec of [
    { kind: 'grove', title: 'HELIOS GROVE', progress: .20, side: 1, r: 41 },
    { kind: 'glasshouse', title: 'THE GLASSHOUSE', progress: .552, side: -1, r: 37 },
    { kind: 'farm', title: 'HARVEST COMMONS', progress: .756, side: 1, r: 33 },
  ] as const) {
    let placed = false;
    for (const shift of [0, .012, -.012, .024, -.024]) {
      if (placed) break;
      const progress = spec.progress + shift, s = spline.sampleAt(Math.round(progress * spline.count));
      if (s.position.y > .3) continue;
      for (const side of [spec.side, -spec.side]) {
        if (placed) break;
        for (let offset = spec.r + 19; offset < spec.r + 65; offset += 5) {
          const p = s.position.clone().addScaledVector(s.right, side * offset);
          // Distance to the entire centreline protects return lanes, not just this segment.
          if (clearance(p.x, p.z) < spec.r + 16) continue;
          if (sites.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + spec.r + 15)) continue;
          if (occupied.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + spec.r + 8)) continue;
          sites.push({ kind: spec.kind, title: spec.title, progress, x: p.x, z: p.z, r: spec.r,
            angle: Math.atan2(side * s.right.x, side * s.right.z) });
          placed = true; break;
        }
      }
    }
  }
  return sites;
}

/** Authored Solar-only civic infrastructure, batched by geometry/material per district. */
export function createSolarLandmarks(sites: SolarLandmarkSite[], vegetation: ReturnType<typeof createSolarVegetation>, circuitName = 'Kairo Solar') {
  const group = new THREE.Group(); group.name = 'solar-landmarks'; group.userData.sceneryContainer = true;
  const textures: THREE.Texture[] = [];
  const stone = new THREE.MeshStandardMaterial({ color: 0xded9c5, roughness: .88 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf0e8cc, roughness: .6 });
  const copper = new THREE.MeshStandardMaterial({ color: 0x98704b, roughness: .52, metalness: .5 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x98734b, roughness: .86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x25473f, roughness: .7 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x514430, roughness: 1 });
  const leaves = [0x638c39, 0x97af4d, 0x39734a].map(color => new THREE.MeshStandardMaterial({ color, roughness: .95 }));
  const water = new THREE.MeshStandardMaterial({ color: 0x42938a, roughness: .27, metalness: .25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x87c9ba, roughness: .22, metalness: .15,
    transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide });
  const panelCanvas = document.createElement('canvas'); panelCanvas.width = panelCanvas.height = 256;
  const pc = panelCanvas.getContext('2d')!; pc.fillStyle = '#214b58'; pc.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) for (let y = 0; y < 256; y += 32) {
    pc.fillStyle = (x + y) % 64 ? '#386376' : '#2b5667'; pc.fillRect(x + 2, y + 2, 28, 28);
    pc.fillStyle = '#819d9c'; pc.fillRect(x + 15, y + 2, 1, 28);
  }
  const panelMap = new THREE.CanvasTexture(panelCanvas); panelMap.colorSpace = THREE.SRGBColorSpace; panelMap.anisotropy = 8; textures.push(panelMap);
  const panel = new THREE.MeshStandardMaterial({ map: panelMap, roughness: .38, metalness: .45, side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphere = new THREE.SphereGeometry(1, 8, 6), ring = new THREE.TorusGeometry(1, .045, 5, 40);
  const hemisphere = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const site of sites) {
    const root = new THREE.Group(); root.name = `solar-${site.kind}`; root.position.set(site.x, 0, site.z); root.rotation.y = site.angle;
    root.userData.roadClearanceVerified = true; root.userData.landmark = site; group.add(root);
    const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
    const solarPetals: THREE.BufferGeometry[] = [];
    const dummy = new THREE.Object3D();
    const instance = (geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3, scale: THREE.Vector3, q = new THREE.Quaternion()) => {
      const key = `${geo.uuid}:${mat.uuid}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometry: geo, material: mat, matrices: [] }; batches.set(key, batch); }
      dummy.position.copy(p); dummy.quaternion.copy(q); dummy.scale.copy(scale); dummy.updateMatrix(); batch.matrices.push(dummy.matrix.clone());
    };
    const part = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, geo: THREE.BufferGeometry = box, yaw = 0) =>
      instance(geo, mat, new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d), new THREE.Quaternion().setFromAxisAngle(yAxis, yaw));
    const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, mat = ivory) =>
      instance(cylinder, mat, a.clone().add(b).multiplyScalar(.5), new THREE.Vector3(radius, a.distanceTo(b), radius), new THREE.Quaternion().setFromUnitVectors(yAxis, b.clone().sub(a).normalize()));
    const hoop = (x: number, y: number, z: number, radius: number, mat = copper) => {
      const steps = radius > 3 ? 64 : 24;
      for (let k = 0; k < steps; k++) {
        const a = k / steps * Math.PI * 2, b = (k + 1) / steps * Math.PI * 2;
        beam(new THREE.Vector3(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius),
          new THREE.Vector3(x + Math.cos(b) * radius, y, z + Math.sin(b) * radius), .06, mat);
      }
    };
    const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
      .applyAxisAngle(yAxis, site.angle).add(root.position);
    const crop = (x: number, y: number, z: number, scale: number) => {
      const p = world(x, y, z); vegetation.shrub(p.x, p.y, p.z, scale);
    };
    const dome = (x: number, base: number, z: number, radius: number, height: number) => {
      const shell = new THREE.Mesh(hemisphere, glass); shell.name = 'conservatory-glazing'; shell.position.set(x, base, z); shell.scale.set(radius, height, radius); root.add(shell);
      const point = (a: number, t: number) => new THREE.Vector3(x + Math.cos(a) * radius * Math.cos(t), base + height * Math.sin(t), z + Math.sin(a) * radius * Math.cos(t));
      for (let spoke = 0; spoke < 24; spoke++) for (let row = 0; row < 10; row++) {
        const a = spoke / 24 * Math.PI * 2, t = row / 10 * Math.PI / 2, next = (row + 1) / 10 * Math.PI / 2;
        beam(point(a, t), point(a, next), .10);
        if (row < 8) beam(point(a, t), point(a + Math.PI / 12, next), .045, copper);
      }
      for (let row = 0; row < 8; row++) {
        const t = row / 10 * Math.PI / 2;
        // Individual short bars keep mullions a constant width at every elevation.
        for (let k = 0; k < 48; k++) beam(point(k / 48 * Math.PI * 2, t), point((k + 1) / 48 * Math.PI * 2, t), .075);
      }
    };
    const cropBed = (x: number, y: number, z: number, width: number, depth: number, tone: number) => {
      part(stone, x, y, z, width, .55, depth); part(soil, x, y + .3, z, width - .25, .08, depth - .25);
      for (let u = -width / 2 + .6; u < width / 2; u += 1.15) for (let v = -depth / 2 + .5; v < depth / 2; v += .85)
        crop(x + u, y + .36, z + v, .38 + (tone % 3) * .03);
      part(copper, x, y + .35, z, width - .3, .06, .06);
    };
    const bench = (x: number, z: number) => {
      part(timber, x, .7, z, 3.2, .18, .9); part(timber, x, 1.25, z + .4, 3.2, .9, .12);
      for (const side of [-1, 1]) part(dark, x + side * 1.2, .35, z, .15, .7, .7);
    };
    // Raised plaza, inset water gardens and human-scale street furniture.
    part(stone, 0, .1, 0, site.r - 2, .24, site.r - 2, cylinder);
    for (const side of [-1, 1]) {
      bench(side * 12, -site.r + 10);
      part(copper, side * 18, 1.7, -site.r + 12, 1.4, 3.2, 1.4, cylinder);
      hoop(side * 18, 2.6, -site.r + 12, 1.42); hoop(side * 18, .7, -site.r + 12, 1.42);
      part(dark, side * 18, 3.35, -site.r + 12, 1.5, .16, 1.5, cylinder);
    }
    // Cycle parking: wheels, triangular frames, saddles and handlebars.
    for (let bike = 0; bike < 4; bike++) {
      const x = -5 + bike * 2.4, z = -site.r + 5;
      for (const side of [-1, 1]) instance(ring, dark, new THREE.Vector3(x + side * .7, .7, z), new THREE.Vector3(.62, .62, .62));
      const a = new THREE.Vector3(x - .7, .7, z), b = new THREE.Vector3(x + .7, .7, z), c = new THREE.Vector3(x, 1.5, z);
      beam(a, b, .045, copper); beam(a, c, .045, copper); beam(b, c, .045, copper);
      part(dark, x, 1.53, z, .4, .12, .25); beam(b, new THREE.Vector3(x + .65, 1.65, z), .04, copper);
      part(dark, x + .65, 1.65, z, .1, .08, .55);
    }
    if (site.kind === 'glasshouse') {
      part(ivory, 0, 1, 0, 27.1, 2, 27.1, cylinder);
      dome(0, 2, 0, 27, 24);
      for (const side of [-1, 1]) for (let row = 0; row < 5; row++) cropBed(side * 10, 1.5, -16 + row * 7, 10, 4, row);
      // Use the city's cut-out foliage for a real branching canopy inside the glass.
      for (const [x, z, h] of [[0, 3, 14], [-7, 6, 11], [7, 9, 10]]) {
        const p = world(x, 1, z); vegetation.tree(p.x, p.y, p.z, h / 6);
      }
      part(dark, 0, 2, -27, 10, 4, 4); part(glass, 0, 2.1, -29.05, 7, 3.8, .1);
      part(ivory, 0, 4.2, -27, 12, .3, 6);
      for (const side of [-1, 1]) part(copper, side * 5.5, 2, -29, .12, 4, .12);
      // Visible rainwater channels connect the roof to the cisterns.
      for (const side of [-1, 1]) beam(new THREE.Vector3(side * 19, 15, -10), new THREE.Vector3(side * 18, 3.4, -25), .16, copper);
    } else if (site.kind === 'grove') {
      for (const [x, z, height, radius] of [[0, 8, 39, 18], [-19, -6, 27, 12], [19, -5, 30, 13]]) {
        part(stone, x, .8, z, 4.8, 1.2, 4.8, cylinder);
        part(dark, x, height * .4, z, 1.3, height * .8, 1.3, cylinder);
        for (let spoke = 0; spoke < 12; spoke++) {
          const a = spoke / 12 * Math.PI * 2;
          let previous = new THREE.Vector3(x + Math.cos(a) * 3.5, .8, z + Math.sin(a) * 3.5);
          for (let step = 1; step <= 12; step++) {
            const t = step / 12, r = 1.5 + Math.pow(t, 4) * (radius - 1.5), angle = a + (1 - t) * .5;
            const next = new THREE.Vector3(x + Math.cos(angle) * r, .8 + t * height, z + Math.sin(angle) * r);
            beam(previous, next, .16, copper); previous = next;
          }
          const positions: number[] = [], uv: number[] = [], indices: number[] = [];
          for (let row = 0; row <= 8; row++) for (let col = 0; col <= 4; col++) {
            const t = row / 8, across = col / 4 * 2 - 1, r = 3 + t * (radius - 3);
            const angle = a + across * Math.sin(t * Math.PI * .94) * .255;
            positions.push(x + Math.cos(angle) * r, height - 3 + t * 3.8 + across * across * .4, z + Math.sin(angle) * r); uv.push(col / 4, t);
            if (row && col) { const i = row * 5 + col; indices.push(i, i - 1, i - 5, i - 1, i - 6, i - 5); }
          }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
          solarPetals.push(geo);
          const p = world(x + Math.cos(a) * 1.6, height * .59, z + Math.sin(a) * 1.6);
          vegetation.drape(p.x, p.y, p.z, 1.7, height * .55, site.angle - a);
        }
        for (let y = 4; y < height - 4; y += 6) hoop(x, y, z, 1.9);
      }
      for (const side of [-1, 1]) {
        part(dark, side * 10, .55, 5, 5, .9, 22); part(water, side * 10, 1.03, 5, 4.6, .08, 21.6);
        for (let k = 0; k < 12; k++) part(leaves[k % 3], side * 10 + Math.sin(k) * 1.5, 1.2, -4 + k * 1.5, .7, .12, .65, sphere);
      }
    } else {
      for (let floor = 0; floor < 8; floor++) {
        const radius = 19 - floor * 1.25, y = 1 + floor * 4.2, z = floor * 1.2;
        part(dark, 0, y + 1.8, z, radius - 3, 3.6, radius - 3, cylinder);
        part(ivory, 0, y, z, radius, .45, radius, cylinder);
        part(glass, 0, y + 2, z, radius - 2.8, 3.5, radius - 2.8, cylinder);
        for (let k = 0; k < 48; k++) {
          const a = k / 48 * Math.PI * 2, x = Math.cos(a) * (radius - 1.2), v = z + Math.sin(a) * (radius - 1.2);
          part(stone, x, y + .5, v, 2.25, .6, 1.9, box, -a + Math.PI / 2);
          crop(x, y + .85, v, 1.1);
          if (k % 3 === 0) part(timber, Math.cos(a) * (radius - 2.5), y + 1.9, z + Math.sin(a) * (radius - 2.5), .16, 3.8, .16);
          if (k % 4 === 0) {
            const p = world(x, y + 1, v);
            vegetation.drape(p.x, p.y, p.z, 1.8, 1.5, site.angle - a + Math.PI / 2);
          }
        }
        hoop(0, y + 1.25, z, radius - .4, copper);
      }
      dome(0, 31, 8.4, 8.6, 7);
      // A growers' market at the foot of the tower.
      for (let stall = 0; stall < 4; stall++) {
        const x = -10.5 + stall * 7;
        part(timber, x, 1, -22, 5, 1.3, 2.5);
        part(stall % 2 ? ivory : leaves[1], x, 3.5, -22, 5.8, .22, 4);
        for (const side of [-1, 1]) part(timber, x + side * 2.6, 1.8, -22, .13, 3.4, .13);
        for (let k = 0; k < 4; k++) part(leaves[(k + stall) % 3], x - 1.8 + k * 1.2, 1.95, -22, .5, .4, .6, sphere);
      }
      for (const side of [-1, 1]) cropBed(side * 22, .7, -4, 3.5, 13, side + 2);
    }
    // One legible roadside nameplate identifies the district at racing speed.
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#203e36'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#c1d999'; ctx.font = '500 31px Arial'; ctx.fillText(`${circuitName.toUpperCase()}  /  COMMONS`, 42, 55);
    ctx.fillStyle = '#faf1d8'; ctx.font = 'bold 76px Arial'; ctx.fillText(site.title, 40, 154, 945);
    ctx.fillStyle = '#c1d999'; ctx.font = '28px Arial'; ctx.fillText(site.kind === 'grove' ? 'SUNLIGHT TO SHARED ENERGY' : site.kind === 'glasshouse' ? 'SEEDS · WATER · LIFE' : 'GROWN HERE. SHARED HERE.', 42, 216);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; textures.push(map);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map, roughness: .8 }));
    sign.name = 'solar-district-name'; sign.position.set(0, 3, -site.r + 2); sign.rotation.y = Math.PI; root.add(sign);
    for (const side of [-1, 1]) part(copper, side * 6.7, 1.5, -site.r + 2.2, .16, 3, .16);
    if (solarPetals.length) {
      const petals = new THREE.Mesh(mergeGeometries(solarPetals)!, panel);
      petals.name = 'solar-collector-petals'; petals.castShadow = true; petals.receiveShadow = true; root.add(petals);
      solarPetals.forEach(geometry => geometry.dispose());
    }
    for (const [key, batch] of batches) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      mesh.name = `solar-${site.kind}-details-${key.slice(0, 6)}`; mesh.userData.preserveAuthoredElevation = true;
      batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere();
      mesh.castShadow = batch.material !== glass && batch.material !== water; mesh.receiveShadow = true; root.add(mesh);
    }
  }
  return { group, dispose: () => textures.forEach(texture => texture.dispose()) };
}
