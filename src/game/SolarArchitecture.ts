import * as THREE from 'three';

type Vegetation = {
  tree(x: number, y: number, z: number, s?: number): void;
  drape(x: number, y: number, z: number, width: number, height: number, angle: number): void;
  shrub(x: number, y: number, z: number, s?: number): void;
};

const FLOOR = 3.6;

/** A unit rounded-square slab, centred, extruded along +Y. Instance scale gives each plate its size. */
function roundSlabGeometry(radius = .2, segments = 5): THREE.BufferGeometry {
  const r = radius, s = new THREE.Shape();
  s.moveTo(-.5 + r, -.5); s.lineTo(.5 - r, -.5); s.quadraticCurveTo(.5, -.5, .5, -.5 + r);
  s.lineTo(.5, .5 - r); s.quadraticCurveTo(.5, .5, .5 - r, .5); s.lineTo(-.5 + r, .5);
  s.quadraticCurveTo(-.5, .5, -.5, .5 - r); s.lineTo(-.5, -.5 + r); s.quadraticCurveTo(-.5, -.5, -.5 + r, -.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: segments });
  g.rotateX(-Math.PI / 2); g.translate(0, -.5, 0); g.computeVertexNormals();
  return g;
}

/** World position and normal for instanced, scaled meshes, shared by the metre-mapped materials. */
const WORLD_VERTEX = `
  vec4 archWorld = vec4(transformed, 1.0);
  vec3 archNormal = objectNormal;
  #ifdef USE_INSTANCING
    archWorld = instanceMatrix * archWorld;
    archNormal = mat3(instanceMatrix) * archNormal;
  #endif
  archWorld = modelMatrix * archWorld;
  vArchWorld = archWorld.xyz;
  vArchNormal = normalize(mat3(modelMatrix) * archNormal);
`;
const HASH = 'float archHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}';

/**
 * Curtain glazing drawn in world metres: 1.5 m mullions, 3.6 m floor
 * spandrels and per-pane variation (blinds, lit interiors, sky tint), so a
 * glass core of any size or curvature keeps a believable storey scale.
 */
function curtainGlass(name: string, tint: number, frame: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ name, color: tint, roughness: .1, metalness: .55, envMapIntensity: 2.6 });
  const frameColor = new THREE.Color(frame);
  m.onBeforeCompile = shader => {
    shader.uniforms.uFrame = { value: frameColor };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArchWorld; varying vec3 vArchNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vArchWorld; varying vec3 vArchNormal; uniform vec3 uFrame; ${HASH}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 an = abs(vArchNormal);
      float along = an.x > an.z ? vArchWorld.z : vArchWorld.x;
      vec2 cell = vec2(along / 1.5, vArchWorld.y / ${FLOOR.toFixed(1)});
      vec2 f = fract(cell);
      float pane = archHash(floor(cell));
      float frameMask = an.y > .7 ? 1. : max(step(f.x, .05) + step(.95, f.x), step(f.y, .16));
      frameMask = clamp(frameMask, 0., 1.);
      vec3 glassColor = diffuseColor.rgb * (.55 + .5 * pane) * mix(vec3(1.), vec3(1.25, 1.1, .85), step(.86, pane));
      glassColor = mix(glassColor, vec3(.78, .76, .7), step(.93, pane) * step(.45, f.y));
      diffuseColor.rgb = mix(glassColor, uFrame, frameMask);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .55, frameMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .15, frameMask);');
  };
  m.customProgramCacheKey = () => `solar-curtain-glass-v1-${name}`;
  return m;
}

/** A 3.6 m wall bay atlas mapped in world metres; roofs and slab tops read as plain render. */
function wallMaterial(name: string, map: THREE.Texture, color: number, bay = FLOOR): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ name, map, color, roughness: .86, metalness: 0, envMapIntensity: .35 });
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArchWorld; varying vec3 vArchNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vArchWorld; varying vec3 vArchNormal;')
      .replace('#include <map_fragment>', `
      vec3 an = abs(vArchNormal);
      float along = an.x > an.z ? vArchWorld.z : vArchWorld.x;
      vec2 archUv = an.y > .7 ? vec2(.02, .96) : vec2(along, vArchWorld.y) / vec2(${(bay * 2).toFixed(1)});
      diffuseColor *= texture2D(map, archUv);`);
  };
  m.customProgramCacheKey = () => `solar-wall-metres-v1-${bay}`;
  return m;
}

function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d')!);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Signature solarpunk architecture for the Solar stage: twisting vertical-forest
 * towers, terraced Mediterranean hill blocks, finned sail towers with solar
 * sails, geodesic glasshouse domes and the Arbor Spire, a city-scale garden
 * tower. Repeated parts are instanced in 384 m cells: many materials, few instances each.
 */
export function createSolarArchitecture(parent: THREE.Group, vegetation: Vegetation, rand: () => number) {
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(t: T) => { textures.push(t); return t; };

  // Arched Mediterranean bay: limewash with a deep arched window, shutters and a planter.
  const arched = keep(canvasTexture(512, 512, c => {
    c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${150 + rand() * 60},${130 + rand() * 50},${110 + rand() * 40},.05)`; c.fillRect(rand() * 512, rand() * 512, 3 + rand() * 9, 2 + rand() * 5); }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const x = col * 256, y = row * 256;
      c.fillStyle = '#d8cbb6'; c.fillRect(x, y + 246, 256, 10);
      const arch = (inset: number) => { c.beginPath(); c.moveTo(x + 78 + inset, y + 212); c.lineTo(x + 78 + inset, y + 104); c.arc(x + 128, y + 104, 50 - inset, Math.PI, 0); c.lineTo(x + 178 - inset, y + 212); c.closePath(); };
      c.fillStyle = '#a99479'; arch(-7); c.fill();
      const glass = c.createLinearGradient(0, y + 60, 0, y + 212); glass.addColorStop(0, '#6f8f98'); glass.addColorStop(.6, '#314c55'); glass.addColorStop(1, '#1f3035');
      c.fillStyle = glass; arch(0); c.fill();
      c.strokeStyle = '#e9e1d2'; c.lineWidth = 5; c.beginPath(); c.moveTo(x + 128, y + 58); c.lineTo(x + 128, y + 212); c.moveTo(x + 80, y + 128); c.lineTo(x + 176, y + 128); c.stroke();
      if ((row + col) % 2 === 0) {
        // Open louvred shutters on both sides.
        for (const side of [-1, 1]) { c.fillStyle = side < 0 ? '#5d7d6c' : '#557565'; c.fillRect(x + 128 + side * 76 - 14, y + 70, 28, 142); c.fillStyle = 'rgba(0,0,0,.18)'; for (let s = 0; s < 9; s++) c.fillRect(x + 128 + side * 76 - 12, y + 76 + s * 15, 24, 3); }
      }
      c.fillStyle = '#8c6a4c'; c.fillRect(x + 70, y + 212, 116, 16);
      for (let k = 0; k < 26; k++) { c.fillStyle = ['#4f7a3a', '#6b9446', '#e2627f', '#f2c14e', '#fbf3e4'][k % 5]; c.beginPath(); c.arc(x + 74 + (k * 29 % 108), y + 210 - (k * 7 % 12), 4 + (k % 3) * 2, 0, Math.PI * 2); c.fill(); }
    }
  }));
  const walls = [
    wallMaterial('solar-limewash', arched, 0xffffff), wallMaterial('solar-terracotta', arched, 0xe29a74),
    wallMaterial('solar-ochre', arched, 0xf0c886), wallMaterial('solar-blush', arched, 0xf4cdbd), wallMaterial('solar-sage', arched, 0xd3dfbf),
  ];
  const glassCool = curtainGlass('solar-curtain-cool', 0x7fa6b4, 0xeef0ea);
  const glassWarm = curtainGlass('solar-curtain-warm', 0x8fa79a, 0xd9c8a8);
  const slab = new THREE.MeshStandardMaterial({ name: 'solar-slab', color: 0xf6f3ec, roughness: .6 });
  const planted = new THREE.MeshStandardMaterial({ name: 'solar-planted-rim', color: 0x4f8a36, roughness: .97 });
  const copper = new THREE.MeshStandardMaterial({ name: 'solar-copper', color: 0xc07a47, roughness: .38, metalness: .85 });
  const timber = new THREE.MeshStandardMaterial({ name: 'solar-timber', color: 0x9b6d45, roughness: .8 });
  const cellMap = keep(canvasTexture(256, 256, c => {
    c.fillStyle = '#d9d4c4'; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const g = c.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32); g.addColorStop(0, '#4d78b0'); g.addColorStop(.5, '#2d5390'); g.addColorStop(1, '#1d3663');
      c.fillStyle = g; c.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
    }
    c.strokeStyle = '#c9a25a'; c.lineWidth = 1.5; for (let k = 0; k <= 256; k += 32) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 256); c.moveTo(0, k); c.lineTo(256, k); c.stroke(); }
  }));
  const photovoltaic = new THREE.MeshStandardMaterial({ name: 'solar-pv-cells', map: cellMap, roughness: .18, metalness: .45, envMapIntensity: 2.6, side: THREE.DoubleSide });
  const latticeMap = keep(canvasTexture(512, 256, c => {
    c.fillStyle = '#5f8f94'; c.fillRect(0, 0, 512, 256);
    for (let k = 0; k < 140; k++) { c.fillStyle = `rgba(${200 + rand() * 55},${230 + rand() * 25},255,${.05 + rand() * .12})`; c.fillRect(rand() * 512, rand() * 256, 30, 20); }
    c.strokeStyle = '#f3f1e8'; c.lineWidth = 3;
    for (let x = 0; x <= 512; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
    for (let y = 0; y <= 256; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(512, y); c.stroke(); }
    for (let x = -256; x <= 512; x += 32) { c.beginPath(); c.moveTo(x, 256); c.lineTo(x + 256, 0); c.stroke(); }
  }));
  const domeGlass = new THREE.MeshStandardMaterial({ name: 'solar-dome-lattice', map: latticeMap, roughness: .14, metalness: .35, envMapIntensity: 2 });
  const water = new THREE.MeshStandardMaterial({ name: 'solar-pool', color: 0x2c7a93, roughness: .06, metalness: .55, envMapIntensity: 2.6 });
  const fallMap = keep(canvasTexture(128, 512, c => {
    c.fillStyle = '#000'; c.fillRect(0, 0, 128, 512);
    for (let k = 0; k < 220; k++) { const x = rand() * 128, w = 1 + rand() * 4, l = 30 + rand() * 160; const g = c.createLinearGradient(0, 0, 0, l); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${.35 + rand() * .6})`); g.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.translate(x, rand() * 512); c.fillStyle = g; c.fillRect(0, 0, w, l); c.restore(); }
  }));
  const fallMaterial = new THREE.MeshStandardMaterial({ name: 'solar-waterfall', color: 0xeaf6fb, emissive: 0x9fc4d4, emissiveIntensity: .35, alphaMap: fallMap,
    transparent: true, depthWrite: false, roughness: .3, side: THREE.DoubleSide });

  const roundSlab = roundSlabGeometry(.2), softSlab = roundSlabGeometry(.34, 6), box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 48), disc = new THREE.CylinderGeometry(1, 1, 1, 40), band = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
  const dome = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const sail = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, -.75, 1.5);
  const petal = (() => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(.55, .15, .6, .75, 0, 1); s.bezierCurveTo(-.6, .75, -.55, .15, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: .04, bevelEnabled: false, curveSegments: 8 });
    const uv = g.getAttribute('uv') as THREE.BufferAttribute, pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 3 + .5, pos.getY(i) * 3);
    g.rotateX(-Math.PI / 2); return g;
  })();
  const geometries: THREE.BufferGeometry[] = [roundSlab, softSlab, box, cylinder, disc, band, dome, sail, petal];

  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; shadow: boolean }>();
  const d = new THREE.Object3D();
  const put = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0, shadow = true) => {
    d.position.set(x, y, z); d.rotation.set(rx, ry, rz, 'YXZ'); d.scale.set(sx, sy, sz); d.updateMatrix();
    const key = `${geometry.uuid}|${material.uuid}|${shadow}`;
    let batch = batches.get(key); if (!batch) batches.set(key, batch = { geometry, material, matrices: [], shadow });
    batch.matrices.push(d.matrix.clone());
  };
  const frameOf = (x: number, z: number, angle: number) => {
    const co = Math.cos(angle), si = Math.sin(angle);
    return (u: number, v: number) => new THREE.Vector2(x + co * u + si * v, z - si * u + co * v);
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

  /** Vertical forest: rounded floor plates turning a few degrees per storey, each ringed by planting. */
  const helixTower = (x: number, z: number, w: number, height: number, angle: number, detailed: boolean) => {
    const floors = Math.max(6, Math.floor(height / FLOOR)), twist = (1.6 + rand() * 1.8) * Math.PI / 180 * (rand() < .5 ? -1 : 1);
    const glass = rand() < .5 ? glassCool : glassWarm, taper = .18 + rand() * .12;
    for (let f = 0; f < floors; f++) {
      const t = f / floors, a = angle + f * twist, y = f * FLOOR, s = w * (1 - taper * t);
      put(roundSlab, slab, x, y + .2, z, s + 3.4, .4, s * .82 + 3.4, a);
      put(roundSlab, planted, x, y + .62, z, s + 2.6, .45, s * .82 + 2.6, a);
      put(roundSlab, glass, x, y + 2.2, z, s, FLOOR - .4, s * .82, a);
      if (detailed && f % 3 === 1) {
        // A balcony tree on the planted rim, sometimes trailing vines to the floor below.
        const k = rand() * Math.PI * 2, p = frameOf(x, z, a)(Math.cos(k) * (s + 1.6) / 2, Math.sin(k) * (s * .82 + 1.6) / 2);
        vegetation.tree(p.x, y + .85, p.y, .34 + rand() * .12);
        if (rand() < .5) vegetation.drape(p.x, y + .6, p.y, 2.2, 4 + rand() * 4, a - k + Math.PI / 2);
      }
    }
    const top = floors * FLOOR, s = w * (1 - taper);
    put(roundSlab, slab, x, top + .3, z, s + 2, .6, s * .82 + 2, angle + floors * twist);
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      put(box, copper, x + Math.cos(a) * s * .45, top + 4, z + Math.sin(a) * s * .38, .35, 8, .35, -a);
    }
    put(disc, photovoltaic, x, top + 8.2, z, s * .62, .18, s * .52, angle + floors * twist, -.12);
    for (let k = 0; k < 3; k++) vegetation.tree(x + (rand() - .5) * s * .4, top + .6, z + (rand() - .5) * s * .3, .5 + rand() * .2);
  };

  /** Mediterranean hill block: stacked, set-back tiers in warm render, every step a garden with a pergola. */
  const terraceHill = (x: number, z: number, w: number, depth: number, height: number, angle: number, detailed: boolean) => {
    const at = frameOf(x, z, angle), wall = pick(walls.slice(1)), accent = pick(walls);
    const tiers = Math.max(2, Math.min(6, Math.round(height / (FLOOR * 2))));
    for (let k = 0; k < tiers; k++) {
      const tw = w * (1 - .07 * k), td = depth * (1 - .16 * k), back = -(depth - td) / 2, h = FLOOR * 2, y = k * h;
      const p = at(0, back);
      put(softSlab, k % 2 ? accent : wall, p.x, y + h / 2, p.y, tw, h, td, angle);
      put(softSlab, slab, p.x, y + h + .15, p.y, tw + .6, .3, td + .6, angle);
      if (k < tiers - 1) {
        // The exposed step in front of the next tier is a planted terrace with a timber pergola.
        const nextD = depth * (1 - .16 * (k + 1)), frontGap = td - nextD;
        const fv = back + td / 2 - frontGap / 2;
        const g = at(0, fv);
        put(box, planted, g.x, y + h + .5, g.y, tw * .92, .5, Math.max(.8, frontGap * .7), angle);
        for (let u = -tw * .4; u <= tw * .4; u += 3.2) {
          const post = at(u, back + td / 2 - .4);
          put(box, timber, post.x, y + h + 1.6, post.y, .22, 2.8, .22, angle, 0, 0, false);
        }
        const beam = at(0, fv);
        for (let v = -frontGap * .4; v <= frontGap * .4; v += .9) {
          const b = at(0, fv + v); put(box, timber, b.x, y + h + 3, b.y, tw * .82, .16, .16, angle, 0, 0, false);
        }
        put(box, timber, beam.x, y + h + 3.12, beam.y, .18, .12, frontGap * .9, angle, 0, 0, false);
        if (detailed) {
          for (let u = -tw * .38; u <= tw * .38; u += 4.5 + rand() * 3) {
            const tree = at(u, fv + (rand() - .5) * frontGap * .4);
            if (rand() < .5) vegetation.tree(tree.x, y + h + .7, tree.y, .42 + rand() * .2);
            else vegetation.shrub(tree.x, y + h + 1, tree.y, 1.4);
          }
          const vine = at((rand() - .5) * tw * .5, back + td / 2 + .2);
          vegetation.drape(vine.x, y + h + .4, vine.y, tw * .45, h * (.5 + rand() * .6), angle);
        }
      } else {
        // Crown: a small solar pavilion and rooftop trees.
        const c = at(0, back);
        put(box, copper, c.x, y + h + 2.6, c.y, tw * .5, .12, td * .45, angle, 0, 0, false);
        put(box, photovoltaic, c.x, y + h + 2.8, c.y, tw * .48, .06, td * .42, angle, -.18);
        if (detailed) vegetation.tree(c.x + (rand() - .5) * tw * .3, y + h + .3, c.y + (rand() - .5) * td * .3, .55);
      }
    }
  };

  /** Elliptical glass tower wrapped in white fins, crowned by a tilted, curved solar sail. */
  const sailTower = (x: number, z: number, w: number, height: number, angle: number) => {
    const rx = w / 2, rz = w * .34, glass = rand() < .5 ? glassCool : glassWarm;
    put(cylinder, glass, x, height / 2, z, rx, height, rz, angle);
    const fins = 26, co = Math.cos(angle), si = Math.sin(angle);
    for (let k = 0; k < fins; k++) {
      const a = k / fins * Math.PI * 2, lx = Math.cos(a) * (rx + .5), lz = Math.sin(a) * (rz + .5);
      const normal = Math.atan2(Math.cos(a) / rx, Math.sin(a) / rz);
      put(box, slab, x + co * lx + si * lz, height * .49, z - si * lx + co * lz, .45, height * .98, 1.6, angle + normal);
    }
    for (let y = FLOOR * 6; y < height - 6; y += FLOOR * 6) put(cylinder, planted, x, y, z, rx + 1.4, .7, rz + 1.4, angle);
    put(cylinder, slab, x, height + .4, z, rx + .8, .8, rz + .8, angle);
    for (let k = 0; k < 3; k++) vegetation.tree(x + (rand() - .5) * rx, height + .8, z + (rand() - .5) * rz, .6);
    // The sail leans off the crown like a sun collector turned to the south-west.
    put(sail, photovoltaic, x + co * rx * .2, height + w * .42, z - si * rx * .2, w * .9, w * .75, w * .9, angle + Math.PI * .5, .28);
    for (const side of [-1, 1]) put(box, copper, x + co * side * rx * .5, height + w * .2, z - si * side * rx * .5, .5, w * .45, .5, angle, .3 * side);
  };

  /** Geodesic glasshouses on a stone plinth, like a botanical campus. */
  const domeCluster = (x: number, z: number, radius: number, angle: number) => {
    const at = frameOf(x, z, angle);
    put(softSlab, slab, x, .6, z, radius * 2.1, 1.2, radius * 1.7, angle);
    const domes = [[0, 0, radius * .55], [-radius * .55, radius * .25, radius * .34], [radius * .52, -radius * .2, radius * .3]];
    for (const [u, v, r] of domes) {
      const p = at(u, v);
      put(dome, domeGlass, p.x, 1.2, p.y, r, r * .92, r, rand() * Math.PI);
      put(cylinder, copper, p.x, 1.35, p.y, r * 1.02, .3, r * 1.02);
    }
    for (let k = 0; k < 6; k++) { const a = rand() * Math.PI * 2, r = radius * (.85 + rand() * .2), p = at(Math.cos(a) * r, Math.sin(a) * r * .8); vegetation.tree(p.x, 1.2, p.y, .7 + rand() * .3); }
  };

  const fallMeshes: THREE.Mesh[] = [];
  /**
   * The Arbor Spire: eight braided white columns root into a pool and rise into
   * a city-scale trunk; four sky-garden canopies carry trees, hanging vines and
   * rings of giant photovoltaic petals, and a waterfall drops from the lowest
   * garden into the pool. Seen above the skyline from most of the lap.
   */
  const arborSpire = (x: number, z: number, scale = 1) => {
    const root = new THREE.Group(); root.name = 'solar-arbor-spire'; root.position.set(x, 0, z); parent.add(root);
    const height = 250 * scale, trunk = 10 * scale, spread = 36 * scale;
    const white = new THREE.MeshStandardMaterial({ name: 'solar-spire-column', color: 0xf4f1e9, roughness: .45, metalness: .05 });
    const own: THREE.Material[] = [white];
    for (let k = 0; k < 8; k++) {
      const points: THREE.Vector3[] = [], phase = k / 8 * Math.PI * 2;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, y = t * height * .96;
        const r = trunk + (spread - trunk) * Math.pow(Math.max(0, 1 - t * 3.2), 1.6) + Math.sin(t * 9 + k) * .8;
        const a = phase + t * 2.4 + (k % 2 ? .2 : -.2) * Math.sin(t * 6);
        points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, (2.1 - k % 2 * .5) * scale, 8), white);
      tube.castShadow = true; tube.receiveShadow = true; root.add(tube); geometries.push(tube.geometry);
    }
    put(cylinder, glassCool, x, height * .47, z, trunk * .85, height * .94, trunk * .85);
    put(disc, water, x, .15, z, spread * 1.7, .3, spread * 1.7, 0, 0, 0, false);
    put(disc, slab, x, .1, z, spread * 1.8, .2, spread * 1.8);
    const tiers = [[.38, 48], [.58, 42], [.76, 33], [.92, 22]] as const;
    for (const [fraction, r0] of tiers) {
      const y = height * fraction, r = r0 * scale;
      put(disc, slab, x, y, z, r, 1.6, r);
      put(disc, planted, x, y + 1.1, z, r * .96, .7, r * .96);
      put(band, copper, x, y + .2, z, r * 1.01, 2.2, r * 1.01, 0, 0, 0, false);
      for (let k = 0; k < Math.round(r / 3); k++) {
        const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r * .85;
        vegetation.tree(x + Math.cos(a) * rr, y + 1.4, z + Math.sin(a) * rr, (.8 + rand() * .5) * scale);
      }
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2 + fraction;
        vegetation.drape(x + Math.cos(a) * r * .98, y + .6, z + Math.sin(a) * r * .98, 5 * scale, (8 + rand() * 12) * scale, -a + Math.PI / 2);
      }
      // Petals above each garden, tilted up and out like leaves to the sun.
      const petals = Math.round(r / 3.4), length = r * 1.05;
      for (let k = 0; k < petals; k++) {
        const a = k / petals * Math.PI * 2 + fraction * 3;
        const px = x + Math.cos(a) * r * .35, pz = z + Math.sin(a) * r * .35;
        put(petal, photovoltaic, px, y + 9 * scale + (k % 2) * 2.5 * scale, pz, length * .5, 1, length, -a - Math.PI / 2, .1 + (k % 3) * .07);
      }
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2;
        put(box, copper, x + Math.cos(a) * r * .3, y + 5 * scale, z + Math.sin(a) * r * .3, .6, 9 * scale, .6, -a, .35);
      }
    }
    // Crown.
    put(cylinder, copper, x, height + 6 * scale, z, 2.2 * scale, 12 * scale, 2.2 * scale);
    put(disc, copper, x, height + 12 * scale, z, 6 * scale, .5, 6 * scale);
    // Waterfall from the first garden into the pool, bowed out as it falls.
    const fallHeight = height * tiers[0][0], fallGeometry = new THREE.PlaneGeometry(16 * scale, fallHeight, 1, 24);
    const pos = fallGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const t = .5 - pos.getY(i) / fallHeight; pos.setZ(i, Math.pow(t, 1.8) * 22 * scale); }
    fallGeometry.computeVertexNormals(); geometries.push(fallGeometry);
    const fallMap2 = fallMap.clone(); fallMap2.repeat.set(1, 3); keep(fallMap2);
    const material = fallMaterial.clone(); material.alphaMap = fallMap2; own.push(material);
    const fall = new THREE.Mesh(fallGeometry, material); fall.name = 'solar-spire-waterfall';
    const fr = tiers[0][1] * scale * .98;
    fall.position.set(fr, fallHeight / 2, 0); fall.rotation.y = Math.PI / 2; root.add(fall); fallMeshes.push(fall);
    put(cylinder, slab, x + fr + 20 * scale, .5, z, 12 * scale, .6, 12 * scale, 0, 0, 0, false);
    root.userData.dispose = () => own.forEach(m => m.dispose());
    // The startup road-clearance pass measures world boxes before the scene's
    // first matrix update; without this it sees the spire at the origin.
    root.updateMatrixWorld(true); root.userData.roadClearanceVerified = true;
    return { r: spread * 1.9 + 6, root };
  };

  const finish = () => {
    for (const batch of batches.values()) {
      const cells = new Map<string, THREE.Matrix4[]>();
      for (const m of batch.matrices) { const key = `${Math.floor(m.elements[12] / 384)},${Math.floor(m.elements[14] / 384)}`; const cell = cells.get(key) ?? []; cell.push(m); cells.set(key, cell); }
      for (const cell of cells.values()) {
        const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, cell.length); mesh.name = 'solar-architecture';
        mesh.userData.preserveAuthoredElevation = true;
        cell.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere();
        mesh.castShadow = batch.shadow; mesh.receiveShadow = true; parent.add(mesh);
      }
    }
    batches.clear();
  };
  const update = (seconds: number) => {
    for (const fall of fallMeshes) { const map = (fall.material as THREE.MeshStandardMaterial).alphaMap!; map.offset.y = seconds * .45; }
  };
  const dispose = () => {
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose());
    for (const m of [...walls, glassCool, glassWarm, slab, planted, copper, timber, photovoltaic, domeGlass, water, fallMaterial]) m.dispose();
    parent.traverse(o => (o.userData.dispose as (() => void) | undefined)?.());
  };
  return { helixTower, terraceHill, sailTower, domeCluster, arborSpire, finish, update, dispose };
}
