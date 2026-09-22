import { createSolarGrandstand, grandstandTrackClearance, type SolarGrandstand } from './SolarGrandstand';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import type { EnvironmentHandles } from './Environment';
import type { TrackBuilder } from './track/TrackBuilder';
import { SunLighting } from '../systems/SunLighting';
import { updateNeonLedSigns } from './NeonLedSigns';
import { createSolarVegetation } from './SolarVegetation';
import { createSolarBay } from './SolarSurfaces';

/**
 * Kairo Solar: the Kairo Loop layout by day, rebuilt as a solarpunk garden
 * city. Glazed buildings and rounded plaster ledges step back into planted terraces
 * hung with vines, every roof carries a solar array, flower beds and hedges
 * run the whole loop behind the walls, glass towers wear green balconies,
 * wind turbines turn on a mountain skyline and cumulus drifts over a bay.
 * Procedural and instanced like the night city; seeded so views reproduce.
 */
export function createSolarEnvironment(scene: THREE.Scene, builder: TrackBuilder, camera: THREE.PerspectiveCamera): EnvironmentHandles {
  const group = new THREE.Group(); group.name = 'solar-city'; group.userData.sceneryContainer = true; scene.add(group);
  // The post chain reads this for its daylight grade and bloom.
  scene.userData.daylight = true;
  let seed = 4111;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const spline = builder.spline;
  const liftAt = (p: number) => spline.circuit.surfaceLiftAt?.(((p % 1) + 1) % 1) ?? 0;
  const sampleStep = spline.length / spline.count;

  // --- Materials: sun-bleached walls, living roofs, glass and silicon. ---
  const plaster = new THREE.MeshStandardMaterial({ color: 0xf3eee2, roughness: .88 });
  const plasterWarm = new THREE.MeshStandardMaterial({ color: 0xe9d9bd, roughness: .88 });
  // Stronger sky reflections distinguish glazing from the matte terrace slabs.
  const glass = new THREE.MeshStandardMaterial({ color: 0x9ccbe0, roughness: .12, metalness: .55, envMapIntensity: 3.2 });
  const glazingCanvas = document.createElement('canvas'); glazingCanvas.width = 512; glazingCanvas.height = 256;
  const gc = glazingCanvas.getContext('2d')!;
  gc.fillStyle = '#627e86'; gc.fillRect(0, 0, 512, 256);
  for (let pane = 0; pane < 8; pane++) {
    const x = pane * 64;
    const gradient = gc.createLinearGradient(x, 0, x + 64, 256);
    gradient.addColorStop(0, '#b6cbd0'); gradient.addColorStop(.35, pane % 3 ? '#71959e' : '#a1b8ba');
    gradient.addColorStop(1, pane % 2 ? '#344849' : '#4b6468');
    gc.fillStyle = gradient; gc.fillRect(x + 2, 0, 61, 256);
    gc.fillStyle = 'rgba(222,227,214,.16)'; gc.fillRect(x + 8, 22, 12, 226);
    gc.fillStyle = '#c7cec5'; gc.fillRect(x, 0, 2, 256);
    gc.fillStyle = '#526367'; gc.fillRect(x, 126, 64, 3);
  }
  const glazingMap = new THREE.CanvasTexture(glazingCanvas); glazingMap.colorSpace = THREE.SRGBColorSpace; glazingMap.anisotropy = 8;
  glass.map = glazingMap; glass.color.setHex(0xd4e3e5); glass.roughness = .27; glass.metalness = .28;
  const greenRoof = new THREE.MeshStandardMaterial({ color: 0x5b9040, roughness: .96 });
  const hedge = new THREE.MeshStandardMaterial({ color: 0x467f32, roughness: .96 });
  const vines = [0x3f7d2c, 0x59993a, 0x2f6a27].map(color => new THREE.MeshStandardMaterial({ color, roughness: .95 }));
  const flowers = [0xe4609a, 0xf4d24a, 0x8f68d8, 0xf6f3e8, 0xf08a3c].map(color => new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  const solarPanel = new THREE.MeshStandardMaterial({ color: 0x172741, roughness: .2, metalness: .68, envMapIntensity: 2.5 });
  const frame = new THREE.MeshStandardMaterial({ color: 0xd2d9dc, roughness: .42, metalness: .62 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: .92 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f7f5, roughness: .48, metalness: .08 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x25312d, roughness: .6, metalness: .4 });
  const walls = [plaster, plaster, plaster, plasterWarm];

  // --- Instancing: one draw per material per 192 m cell. ---
  const box = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const block = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0, tilt = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(tilt, angle, 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
    const list = batches.get(mat) ?? []; list.push(dummy.matrix.clone()); batches.set(mat, list);
  };
  const vegetation = createSolarVegetation(group, rand);
  const tree = vegetation.tree;

  // --- Printed graphics: flags, façade slogans. ---
  const leaf = (c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
    c.fillStyle = color; c.beginPath(); c.moveTo(x, y + size);
    c.quadraticCurveTo(x, y, x + size, y); c.quadraticCurveTo(x + size, y + size, x, y + size); c.fill();
    c.strokeStyle = color; c.lineWidth = Math.max(1, size * .06); c.beginPath(); c.moveTo(x + size * .12, y + size * .88); c.lineTo(x + size * .7, y + size * .3); c.stroke();
  };
  const texture = (canvas: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const textures: THREE.Texture[] = [glazingMap];
  const flagCanvas = document.createElement('canvas'); flagCanvas.width = 128; flagCanvas.height = 384;
  {
    const c = flagCanvas.getContext('2d')!;
    c.fillStyle = '#242d2a'; c.fillRect(0, 0, 128, 384);
    leaf(c, 34, 22, 60, '#b7d580');
    c.save(); c.translate(64, 120); c.rotate(Math.PI / 2);
    c.fillStyle = '#f2f7ee'; c.font = '700 40px Titillium Web, Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText('KAIRO SOLAR', 0, 0);
    c.restore();
  }
  const flagMap = texture(flagCanvas); textures.push(flagMap);
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flagMap, side: THREE.DoubleSide, roughness: .85 });
  const sloganLines = [['A CLEANER', 'FASTER', 'BRIGHTER', 'TOMORROW'], ['CLEAN', 'CITIES', 'STRONGER', 'PEOPLE'], ['PEOPLE', 'PLANET', 'PROGRESS'], ['GROW', 'WITH', 'THE CITY']];
  const sloganMaterials = sloganLines.map(lines => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#1d3a2a'; c.font = '700 52px Titillium Web, Arial, sans-serif'; c.textBaseline = 'top';
    lines.forEach((line, i) => c.fillText(line, 18, 130 + i * 62));
    leaf(c, 18, 32, 66, '#4f9a3c');
    const map = texture(canvas); textures.push(map);
    return new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: .05, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 });
  });
  const sloganGeometry = new THREE.PlaneGeometry(5.2, 10.4);

  // --- Buildings: terraces, vines, planters and rooftop arrays; clearance-checked. ---
  const occupied: { x: number; z: number; r: number }[] = [];
  const addBuilding = (x: number, z: number, w: number, d: number, h: number, angle: number, near: boolean) => {
    const radius = Math.hypot(w, d) / 2;
    if (occupied.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.r + 2)) return;
    const co = Math.cos(angle), si = Math.sin(angle);
    if (builder.distanceToTrack(x, z) < radius + 16) {
      for (let u = -w / 2 - 1; u <= w / 2 + 3; u += 3) for (let v = -d / 2 - 1; v <= d / 2 + 3; v += 3) {
        if (builder.distanceToTrack(x + co * u + si * v, z - si * u + co * v) < 15) return;
      }
    }
    occupied.push({ x, z, r: radius });
    const wall = walls[Math.floor(rand() * walls.length)];
    const detailed = near || builder.distanceToTrack(x, z) < 110;
    const world = (u: number, v: number) => new THREE.Vector3(x + co * u + si * v, 0, z - si * u + co * v);
    const local = (material: THREE.Material, u: number, y: number, v: number, sw: number, sh: number, sd: number, tilt = 0) =>
      block(material, x + co * u + si * v, y, z - si * u + co * v, sw, sh, sd, angle, tilt);
    const slogan = near && h > 15 && rand() < .35;
    // A third of the street blocks wear a living wall over most of the façade.
    const livingWall = detailed && !slogan && rand() < .34;
    // Stepped terraces: every tier top is a living roof with a planted parapet.
    const tiers: { u: number; v: number; w: number; d: number; bottom: number; h: number }[] = [];
    const podium = Math.min(h, 9 + rand() * 6);
    tiers.push({ u: 0, v: 0, w, d, bottom: 0, h: podium });
    if (h > podium + 6) tiers.push({ u: -w * .1, v: -d * .1, w: w * .72, d: d * .72, bottom: podium, h: h - podium });
    if (h > podium + 22) tiers.push({ u: -w * .16, v: -d * .16, w: w * .48, d: d * .48, bottom: h - 8, h: 8 });
    for (const [index, t] of tiers.entries()) {
      local(detailed ? glass : wall, t.u, t.bottom + t.h / 2, t.v, t.w, t.h, t.d);
      // Tall plaster service cores break the glazing, as in planted Mediterranean towers.
      if (detailed) local(wall, t.u - t.w * .29, t.bottom + t.h / 2, t.v + .12, t.w * .26, t.h, t.d + .35);
      // Living roof and hedges along the front and back parapets.
      local(concrete, t.u, t.bottom + t.h + .12, t.v, t.w + .5, .24, t.d + .5);
      local(hedge, t.u, t.bottom + t.h + .85, t.v + t.d / 2 - .3, t.w * .92, .8, .8);
      local(hedge, t.u, t.bottom + t.h + .85, t.v - t.d / 2 + .3, t.w * .92, .8, .8);
      if (detailed) {
        for (let y = t.bottom + 3.6; y < t.bottom + t.h; y += 3.6) {
          // Deep cantilevered terraces with shadowed soffits, continuous rails and mullions.
          local(plaster, t.u, y, t.v, t.w + 2.2, .32, t.d + 2.2);
          local(concrete, t.u, y + .35, t.v + t.d / 2 + .72, t.w + 1.7, .55, .65);
          local(hedge, t.u, y + .69, t.v + t.d / 2 + .72, t.w + 1.3, .3, .6);
          local(frame, t.u, y + 1.12, t.v + t.d / 2 + 1, t.w + 1.8, .045, .045);
          for (let u = -t.w / 2 + .5; u < t.w / 2; u += 3) {
            local(frame, t.u + u, y - 1.65, t.v + t.d / 2 + .04, .075, 3.2, .12);
            local(frame, t.u + u, y + .7, t.v + t.d / 2 + 1, .04, .84, .04);
          }
          for (const side of [-1, 1]) {
            local(concrete, t.u + side * (t.w / 2 + .72), y + .35, t.v, .65, .55, t.d + 1.5);
            local(frame, t.u + side * (t.w / 2 + 1), y + 1.12, t.v, .045, .045, t.d + 1.7);
          }
          if (near) {
            for (let k = 0; k < 3; k++) {
              const p = world(t.u + (rand() - .5) * t.w * .86, t.v + t.d / 2 + 1.1);
              vegetation.drape(p.x, y + .85, p.z, 1.5 + rand() * 2.5, 1.4 + rand() * 3, angle);
            }
            const p = world(t.u + t.w / 2 + 1.1, t.v + (rand() - .5) * t.d);
            vegetation.drape(p.x, y + .8, p.z, 3, 2.5, angle + Math.PI / 2);
          }
        }
        if (livingWall && near) {
          const p = world(t.u - t.w * .3, t.v + t.d / 2 + .5);
          vegetation.drape(p.x,t.bottom+t.h,p.z,t.w*.25,t.h,angle);
        }
      }
      // Top tier carries the solar array, tilted to the sun.
      if (index === tiers.length - 1) {
        const rows = Math.max(1, Math.floor(t.d * .6 / 2.6));
        for (let k = 0; k < rows; k++) {
          const v = t.v - t.d * .3 + k * 2.6 + 1.2;
          local(frame, t.u, t.bottom + t.h + .95, v, t.w * .62, .14, .16);
          local(solarPanel, t.u, t.bottom + t.h + 1.3, v, t.w * .6, .06, 1.9, -.42);
        }
      } else {
        // Lower terraces are gardens: trees on the exposed step-back.
        const next = tiers[index + 1];
        const front = next.v + next.d / 2, side = next.u + next.w / 2;
        const y = t.bottom + t.h + .44;
        const a = world(t.u + (rand() - .5) * t.w * .7, (front + t.v + t.d / 2) / 2);
        tree(a.x, y, a.z, .5 + rand() * .3);
        const b = world((side + t.u + t.w / 2) / 2, t.v + (rand() - .5) * t.d * .6);
        tree(b.x, y, b.z, .45 + rand() * .3);
      }
    }
    if (slogan) {
      const mesh = new THREE.Mesh(sloganGeometry, sloganMaterials[Math.floor(rand() * sloganMaterials.length)]);
      mesh.name = 'solar-facade-slogan';
      const p = world(-w * .29, d / 2 + .32);
      mesh.position.set(p.x, Math.min(podium - 1, 8) + 2, p.z); mesh.rotation.y = angle;
      group.add(mesh);
    }
    if (near) {
      // Street level: a stone planter with a hedge right behind the pavement.
      local(concrete, 0, .35, d / 2 + 3.2, w, .7, 1.1);
      local(hedge, 0, 1.1, d / 2 + 3.2, w - .4, .8, .8);
    }
  };
  // Glass garden towers: green balconies every floor and a planted crown.
  const addTower = (x: number, z: number, w: number, h: number) => {
    if (builder.distanceToTrack(x, z) < w + 60) return;
    if (occupied.some(p => Math.hypot(x - p.x, z - p.z) < w + p.r + 4)) return;
    occupied.push({ x, z, r: w * .75 });
    const angle = rand() * Math.PI;
    block(glass, x, h / 2, z, w, h, w, angle);
    block(white, x, h / 2, z, w * .34, h + .4, w * 1.02, angle);
    for (let y = 4; y < h; y += 4) {
      block(greenRoof, x, y, z, w + 1.4, .5, w + 1.4, angle);
      if (y % 12 === 0) block(vines[y % 3], x + Math.cos(angle) * (w / 2 + .8), y - 2.6, z - Math.sin(angle) * (w / 2 + .8), .3, 5, w * .5, angle);
    }
    block(greenRoof, x, h + .3, z, w + .8, .6, w + .8, angle);
    for (let k = 0; k < 3; k++) tree(x + (rand() - .5) * w * .6, h + .6, z + (rand() - .5) * w * .6, .6 + rand() * .3);
    block(frame, x, h + 1.4, z, w * .5, .14, .16, angle);
    block(solarPanel, x, h + 1.8, z, w * .5, .06, 2.2, angle, -.42);
  };

  // Each stand owns one aligned local frame and a clearance-tested footprint.
  const grandstands: SolarGrandstand[] = [];
  const standClearance = grandstandTrackClearance(spline.samples);
  const stands = builder.corners.filter((_, i) => i % 4 === 1).slice(0, 5);
  for (const corner of stands) {
    if (liftAt(corner.apexIndex / spline.count) > .3) continue;
    const stand = createSolarGrandstand(spline.sampleAt(corner.apexIndex),
      corner.direction === 'left' ? 1 : -1, standClearance, 4111 + corner.number);
    if (!stand) continue;
    grandstands.push(stand); occupied.push(stand.footprint); group.add(stand.group);
  }

  // Street fronts along the whole loop, both sides, mid-rise.
  for (let i = 0; i < spline.count; i += 7) {
    const s = spline.sampleAt(i);
    for (const side of [-1, 1]) {
      const width = 12 + rand() * 15, depth = 15 + rand() * 13, offset = 17 + depth / 2;
      const p = s.position.clone().addScaledVector(s.right, side * offset);
      const angle = Math.atan2(-side * s.right.x, -side * s.right.z);
      addBuilding(p.x, p.z, width, depth, 24 + rand() * 34, angle, true);
    }
  }
  // Wider garden-city blocks with a lower, greener skyline than the night city.
  const bounds = new THREE.Box3();
  for (const s of spline.samples) bounds.expandByPoint(s.position);
  const centre = bounds.getCenter(new THREE.Vector3());
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + rand() * .4, r = 360 + rand() * 420;
    addTower(centre.x + Math.cos(a) * r, centre.z + Math.sin(a) * r, 20 + rand() * 10, 70 + rand() * 90);
  }
  for (let x = -950; x <= 950; x += 68) for (let z = -950; z <= 1000; z += 68) {
    const px = x + (rand() - .5) * 20, pz = z + (rand() - .5) * 20;
    addBuilding(px, pz, 24 + rand() * 24, 24 + rand() * 24, 16 + Math.pow(rand(), 2) * 70, 0, false);
  }

  // --- Verges: hedge, flower beds and street trees behind both walls. ---
  const flagMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < spline.count; i += 2) {
    const s = spline.sampleAt(i), lift = liftAt(i / spline.count), angle = Math.atan2(s.tangent.x, s.tangent.z);
    if (lift > .3) continue;
    for (const side of [-1, 1]) {
      const h = s.position.clone().addScaledVector(s.right, side * 13.3);
      block(concrete, h.x, .38, h.z, 1.2, .76, sampleStep * 2 + .15, angle);
      for (let along=-sampleStep;along<sampleStep;along+=1.6) {
        const shrubPoint=h.clone().addScaledVector(s.tangent,along);
        vegetation.shrub(shrubPoint.x, .9, shrubPoint.z, 1.15);
      }
      for (let k = 0; k < 12; k++) {
        const f = s.position.clone().addScaledVector(s.right, side * (12.95 + rand() * .7)).addScaledVector(s.tangent, (rand() - .5) * sampleStep * 2);
        block(flowers[Math.floor(rand() * flowers.length)], f.x, 1.36, f.z, .10 + rand() * .10, .07 + rand() * .05, .10 + rand() * .10, rand() * Math.PI);
      }
      if (rand() < .55) {
        // Flowering shrubs and grasses behind the hedge, tall enough to clear the wall.
        const b = s.position.clone().addScaledVector(s.right, side * (14.3 + rand() * .6)).addScaledVector(s.tangent, (rand() - .5) * sampleStep * 1.6);
        const height = 1.5 + rand() * 1.1, width = 1 + rand() * .8;
        vegetation.shrub(b.x, height / 2, b.z, width);
        for (let petal = 0; petal < 9; petal++) block(flowers[Math.floor(rand() * flowers.length)], b.x + (rand() - .5) * width, height / 2 + .15 + rand() * .35, b.z + (rand() - .5) * width, .15, .1, .15);
      }
    }
  }
  for (let i = 2; i < spline.count; i += 4) {
    const s = spline.sampleAt(i), lift = liftAt(i / spline.count);
    for (const side of [-1, 1]) {
      const p = s.position.clone().addScaledVector(s.right, side * (15.5 + rand() * .6)).addScaledVector(s.tangent, (rand() - .5) * 2);
      if (builder.distanceToTrack(p.x, p.z) < 15.1 || grandstands.some(stand => stand.contains(p.x,p.z,3))) continue;
      const ground = lift > .3 ? p.y - lift : p.y;
      tree(p.x, ground, p.z, lift > .3 ? .7 : 1.4 + rand() * .5);
    }
  }
  // Vertical circuit flags hang over the verge, readable on approach.
  for (let i = 6; i < spline.count; i += 13) {
    if (liftAt(i / spline.count) > .3) continue;
    const s = spline.sampleAt(i), side = Math.floor(i / 13) % 2 ? 1 : -1, angle = Math.atan2(s.tangent.x, s.tangent.z);
    const p = s.position.clone().addScaledVector(s.right, side * 14.7);
    if (builder.distanceToTrack(p.x, p.z) < 14.3) continue;
    block(pole, p.x, p.y + 3.7, p.z, .12, 7.4, .12);
    block(pole, p.x, p.y + 7.3, p.z, .08, .08, 1.6, angle);
    dummy.position.copy(p).addScaledVector(s.tangent, .7).add(new THREE.Vector3(0, 5.4, 0)); dummy.rotation.set(0, angle, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    flagMatrices.push(dummy.matrix.clone());
  }
  // Hedges along the flyover pavements so the crossing reads as a garden bridge.
  for (let i = 0; i < spline.count; i += 3) {
    const p = i / spline.count;
    if (liftAt(p) < .6) continue;
    const s = spline.sampleAt(i), angle = Math.atan2(s.tangent.x, s.tangent.z);
    for (const side of [-1, 1]) {
      const h = s.position.clone().addScaledVector(s.right, side * 17.1);
      block(concrete, h.x, h.y + .3, h.z, 1.4, .6, 3.4, angle);
      block(hedge, h.x, h.y + .95, h.z, 1.1, .7, 3.1, angle);
    }
  }
  // Park trees in the gaps between blocks.
  for (let k = 0; k < 1100; k++) {
    const x = (rand() - .5) * 1900, z = (rand() - .5) * 1900;
    if (builder.distanceToTrack(x, z) < 22) continue;
    if (occupied.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 3)) continue;
    tree(x, 0, z, .8 + rand() * .7);
  }
  // Solar farms on open ground.
  let farms = 0;
  for (let attempt = 0; attempt < 400 && farms < 5; attempt++) {
    const x = (rand() - .5) * 1700, z = (rand() - .5) * 1700, angle = rand() * Math.PI;
    if (builder.distanceToTrack(x, z) < 90) continue;
    if (occupied.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 46)) continue;
    occupied.push({ x, z, r: 44 });
    const co = Math.cos(angle), si = Math.sin(angle);
    for (let r = -4; r <= 4; r++) for (let c = -6; c <= 6; c++) {
      const u = c * 4.4, v = r * 6.5;
      const px = x + co * u + si * v, pz = z - si * u + co * v;
      block(frame, px, .7, pz, .18, 1.4, .18, angle);
      block(solarPanel, px, 1.35, pz, 4.1, .06, 2.4, angle, -.42);
    }
    farms++;
  }

  // Planted pedestrian links: a readable architectural landmark over three districts.
  const bridgeCanvas = document.createElement('canvas'); bridgeCanvas.width = 1024; bridgeCanvas.height = 96;
  const bc = bridgeCanvas.getContext('2d')!; bc.fillStyle = '#596961'; bc.fillRect(0,0,1024,96);
  bc.fillStyle = '#f3f0de'; bc.font = '500 31px Arial'; bc.textAlign='center';
  bc.fillText('P E O P L E     ›     P L A N E T     ›     P R O G R E S S',512,61);
  const bridgeMap = texture(bridgeCanvas); textures.push(bridgeMap);
  const bridgeSign = new THREE.MeshStandardMaterial({map:bridgeMap,roughness:.8,side:THREE.DoubleSide});
  for (const fraction of [.14,.34,.65]) {
    const s = spline.sampleAt(Math.round(fraction*spline.count));
    if (liftAt(fraction)>.3) continue;
    const angle=Math.atan2(s.tangent.x,s.tangent.z);
    // Entire overhead element is deliberately above the vehicle and chase camera.
    const bridge = new THREE.Group(); bridge.name='solar-garden-skybridge'; bridge.userData.intentionalOverpass=true;
    bridge.position.copy(s.position); bridge.rotation.y=angle; group.add(bridge);
    const part=(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
      const mesh=new THREE.Mesh(box,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;bridge.add(mesh);
    };
    part(plaster,0,10.3,0,39,.65,5.2);
    for(const side of [-1,1]) {
      part(plaster,side*18.5,5,0,1.1,10,3);
      part(glass,0,11.15,side*2.4,38,.9,.10);
      part(frame,0,11.7,side*2.4,39,.09,.09);
      part(concrete,0,10.95,side*2.1,38,.5,.7);
      for(let x=-18;x<=18;x+=3) part(frame,x,11.25,side*2.4,.045,1,.045);
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(30,1.1),bridgeSign);sign.position.set(0,10.22,side*2.68);if(side<0)sign.rotation.y=Math.PI;bridge.add(sign);
      for(let x=-17;x<18;x+=2) {
        const p=new THREE.Vector3(x,11.15,side*2.2).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(s.position);
        vegetation.shrub(p.x,p.y,p.z,.8);
        if(x%3===0)vegetation.drape(p.x,p.y,p.z,1.1,1.9,angle);
      }
    }
  }

  // --- Skyline: wind turbines, a bay and two mountain ranges. ---
  const turbines: THREE.Group[] = [];
  const tower = new THREE.CylinderGeometry(1.1, 2.4, 78, 10), nacelle = new THREE.BoxGeometry(5, 3, 3.4), blade = new THREE.BufferGeometry();
  blade.setAttribute('position',new THREE.Float32BufferAttribute([-.9,-15,0,1.3,-11,0,.55,15,0,-.1,15,0, -.9,-15,.25,1.3,-11,.25,.55,15,.08,-.1,15,.08],3));
  blade.setIndex([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);blade.computeVertexNormals();
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + rand() * .3, r = 700 + rand() * 300;
    let x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r;
    if (k < 3) {
      const site=spline.sampleAt(Math.round([.15,.36,.67][k]*spline.count));
      const p=site.position.clone().addScaledVector(site.right,-190);
      x=p.x;z=p.z;
    }
    if (builder.distanceToTrack(x, z) < 100) continue;
    const t = new THREE.Group(); t.name = 'solar-wind-turbine'; t.position.set(x, 0, z); t.rotation.y = rand() * Math.PI * 2; if(k<3)t.scale.setScalar(1.35);
    const mast = new THREE.Mesh(tower, white); mast.position.y = 39; mast.castShadow = true; t.add(mast);
    const head = new THREE.Mesh(nacelle, white); head.position.set(0, 78, 0); t.add(head);
    const rotor = new THREE.Group(); rotor.position.set(0, 78, 2.6); rotor.rotation.z = rand() * Math.PI * 2; rotor.userData.rate = .5 + rand() * .3;
    for (let b = 0; b < 3; b++) { const m = new THREE.Mesh(blade, white); m.position.y = 15.5; const pivot = new THREE.Group(); pivot.rotation.z = b * Math.PI * 2 / 3; pivot.add(m); rotor.add(pivot); }
    t.add(rotor); t.userData.rotor = rotor; group.add(t); turbines.push(t);
  }
  group.add(createSolarBay(spline.samples.map(sample => sample.position)));
  const ridge = (radius: number, base: number, amplitude: number, low: number, high: number, phase: number) => {
    const segments = 512, rows = 10, positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const lowColor = new THREE.Color(low), highColor = new THREE.Color(high), snow = new THREE.Color(0xf4f6f8), c = new THREE.Color();
    for (let row = 0; row <= rows; row++) for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const radial = row / rows;
      const r = radius - 320 + radial * 600 + Math.sin(a * 13 + phase) * 32;
      const bay = Math.max(0, Math.cos(a - Math.PI * .65)) ** 3;
      const peak = .5 + .5 * Math.sin(a * 5 + phase);
      const teeth = .55 + .3 * Math.sin(a * 17 + phase) + .15 * Math.sin(a * 43);
      const profile = Math.sin(radial * Math.PI);
      const h = -8 + Math.pow(profile,1.2) * (base + amplitude * peak * teeth) * (1 - bay * .5)
        + Math.sin(a * 71 + radial * 17) * profile * 13;
      positions.push(centre.x + Math.cos(a) * r,h,centre.z + Math.sin(a) * r);
      c.copy(lowColor).lerp(highColor, Math.min(1,h/(base+amplitude)*1.6));
      c.lerp(snow, THREE.MathUtils.smoothstep(h + Math.sin(a*61)*18,base+amplitude*.4,base+amplitude*.68));
      c.multiplyScalar(.79 + .21 * Math.sin(a*53+radial*12)**2);
      colors.push(c.r,c.g,c.b);
      if(row>0&&i>0) {
        const k=row*(segments+1)+i, p=k-segments-1;
        indices.push(k-1,p-1,k,p-1,p,k);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    rock.onBeforeCompile = shader => {
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRock;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvRock=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vRock;
        float rockHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float rockNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rockHash(i),rockHash(i+vec2(1,0)),f.x),mix(rockHash(i+vec2(0,1)),rockHash(i+vec2(1,1)),f.x),f.y);}
      `).replace('#include <color_fragment>',`#include <color_fragment>
        vec2 strata=vec2(vRock.x+vRock.z,vRock.y*.55);
        float crag=rockNoise(strata*.07)*.5+rockNoise(strata*.21)*.3+rockNoise(strata*.65)*.2;
        diffuseColor.rgb *= .38 + crag*1.1;
      `);
    };
    rock.customProgramCacheKey=()=> 'solar-mountain-strata-v1';
    const mesh = new THREE.Mesh(geometry, rock);
    mesh.name = 'solar-mountains'; mesh.frustumCulled = false; group.add(mesh);
  };
  ridge(2150, 160, 420, 0x7d97b0, 0x9fb3c6, 1.3);
  ridge(1780, 70, 250, 0x5f8468, 0x8aa08a, 4.1);

  // --- Sky: deep blue, sun and halo, warm horizon haze and drifting cumulus. ---
  const sunDirection = new THREE.Vector3(-.65, .95, .5).normalize();
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDirection }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun; uniform float uTime;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec2(17.,9.);a*=.5;}return s;}
      void main(){
        vec3 d=normalize(vDir); float h=clamp(d.y,-1.,1.);
        vec3 zenith=vec3(.018,.15,.48), horizon=vec3(.18,.44,.78), ground=vec3(.46,.52,.44);
        vec3 c=mix(horizon,zenith,pow(max(h,0.),.5));
        c=mix(c,ground,smoothstep(0.,-.08,h));
        float s=max(dot(d,uSun),0.);
        c+=vec3(1.,.93,.78)*(pow(s,8.)*.12+pow(s,64.)*.4);
        c+=vec3(.13,.08,.03)*exp(-max(h,0.)*6.);
        float cover=0.;
        if(h>.005){
          // Cumulus on a flat deck: coverage from fbm, lit towards the sun,
          // thinning into the horizon haze.
          vec2 uv=d.xz/(h+.12)*3.2+uTime*vec2(.012,.006);
          float n=fbm(uv)*.72+fbm(uv*3.1+vec2(41.,7.))*.28;
          cover=smoothstep(.52,.6,n)*smoothstep(.01,.14,h);
          float body=smoothstep(.52,.8,n);
          vec3 cloud=mix(vec3(.7,.75,.87),vec3(1.15,1.12,1.08),body);
          cloud+=vec3(.3,.22,.1)*pow(s,3.)*(1.-body*.6);
          c=mix(c,cloud,cover);
        }
        c+=vec3(1.,.96,.88)*smoothstep(.9986,.9995,s)*28.*(1.-cover);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`.replace(/ #include/g, '\n #include') });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 20), skyMat); sky.name = 'solar-sky'; sky.frustumCulled = false; group.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xd5e6ee, 0xa7a08b, 1.1); group.add(hemisphere);
  const sunLighting = new SunLighting({ camera, parent: group, color: 0xfff0d4, intensity: 4.2, sunDirection, range: 520, splits: [42, 150], shadowMapSize: 2048 });

  const rounded = new RoundedBoxGeometry(1, 1, 1, 2, .08);
  const flowerGeometry = new THREE.IcosahedronGeometry(.65, 1);
  // Submit the instanced city.
  for (const [mat, list] of batches) {
    const cells = new Map<string, THREE.Matrix4[]>();
    for (const m of list) { const key = Math.floor(m.elements[12] / 192) + ',' + Math.floor(m.elements[14] / 192); const cell = cells.get(key) ?? []; cell.push(m); cells.set(key, cell); }
    for (const cell of cells.values()) {
      const mesh = new THREE.InstancedMesh(flowers.includes(mat as THREE.MeshStandardMaterial) ? flowerGeometry : mat === plaster || mat === plasterWarm ? rounded : box, mat, cell.length); mesh.name = 'solar-city-instanced'; mesh.userData.preserveAuthoredElevation = true;
      cell.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere();
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
  }
  vegetation.finish();
  if (flagMatrices.length) {
    const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 3.6), flagMaterial, flagMatrices.length); flags.name = 'solar-circuit-flags';
    flagMatrices.forEach((m, k) => flags.setMatrixAt(k, m)); flags.computeBoundingSphere(); flags.castShadow = true; group.add(flags);
  }

  return {
    group, ready: Promise.resolve(), sun: sunLighting.sun, sunLighting, sky,
    update(focus, seconds = 0) {
      updateNeonLedSigns(seconds);
      if (focus) sky.position.copy(focus);
      skyMat.uniforms.uTime.value = seconds;
      for (const t of turbines) (t.userData.rotor as THREE.Group).rotation.z = seconds * (t.userData.rotor as THREE.Group).userData.rate;
    },
    createSkyProbeScene() { const probe = new THREE.Scene(); probe.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMat)); return probe; },
    updateShadows: () => sunLighting.update(), prepareShadowMaterials: root => sunLighting.prepareMaterials(root),
    setShadows: enabled => sunLighting.setShadows(enabled), setShadowMapSize: size => sunLighting.setShadowMapSize(size), updateStandings: () => {},
    disposeExtraResources: () => { textures.forEach(t => t.dispose()); vegetation.dispose(); },
  };
}
