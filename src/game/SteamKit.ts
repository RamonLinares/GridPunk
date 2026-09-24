import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { createSteamMaterials } from './SteamMaterials';

type Materials = ReturnType<typeof createSteamMaterials>;
export type V3 = [number, number, number];
export type SteamKit = ReturnType<typeof createSteamKit>;
export type Sketch = ReturnType<SteamKit['sketch']>;

/**
 * The Steampunk set-piece vocabulary: riveted black iron, brass, copper,
 * glazing and lamplight, plus modelling helpers (arched windows, pilasters,
 * railings, pipes, banded tanks, lamps, crates). A sketch collects parts in a
 * building's local metres and merges them into one geometry per material, so
 * a building can be placed once or instanced many times.
 */
export function createSteamKit(m: Materials) {
  const iron = new THREE.MeshStandardMaterial({ name: 'steamkit-black-iron', color: 0x2a2b2d, metalness: .72, roughness: .46 });
  const brass = new THREE.MeshStandardMaterial({ name: 'steamkit-brass', color: 0xc9a25a, metalness: .85, roughness: .34 });
  const copper = new THREE.MeshStandardMaterial({ name: 'steamkit-copper', color: 0xb96a3b, metalness: .82, roughness: .36 });
  const verdigris = new THREE.MeshStandardMaterial({ name: 'steamkit-verdigris', color: 0x5f8f7f, metalness: .55, roughness: .55 });
  const bronze = new THREE.MeshStandardMaterial({ name: 'steamkit-bronze', color: 0x6d5337, metalness: .78, roughness: .42 });
  const glass = new THREE.MeshStandardMaterial({ name: 'steamkit-vault-glass', color: 0x4d5d6c, metalness: .82, roughness: .16 });
  const warmGlass = new THREE.MeshStandardMaterial({ name: 'steamkit-warm-glass', color: 0x4a4436, emissive: 0xb86f28, emissiveIntensity: .18, metalness: .5, roughness: .22 });
  const glow = new THREE.MeshStandardMaterial({ name: 'steamkit-window-glow', color: 0xffc77a, emissive: 0xff9c3d, emissiveIntensity: .9, roughness: .5 });
  const paving = new THREE.MeshStandardMaterial({ name: 'steamkit-paving', color: 0x8f887c, roughness: .92 });
  const stone = new THREE.MeshStandardMaterial({ name: 'steamkit-dressed-stone', color: 0xc2b294, roughness: .88 });
  const slate = new THREE.MeshStandardMaterial({ name: 'steamkit-slate', color: 0x3f4550, roughness: .8 });
  const wood = new THREE.MeshStandardMaterial({ name: 'steamkit-crate-wood', color: 0x6a4a2e, roughness: .85 });
  // Window glass, mapped once over each whole arched pane (u across, v up).
  // Upper glass reflects a pale sky with a diagonal sheen; lower glass shows
  // the lit room, framed by curtains. The unlit variant is only reflection.
  const paneTexture = (lit: boolean, emissive: boolean) => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 256;
    const c = canvas.getContext('2d')!;
    const sky = c.createLinearGradient(0, 0, 0, 256);
    if (emissive) {
      sky.addColorStop(0, '#000'); sky.addColorStop(.32, '#1a0e04'); sky.addColorStop(.62, '#b86a24'); sky.addColorStop(1, '#ffb45a');
    } else if (lit) {
      sky.addColorStop(0, '#9fb3ba'); sky.addColorStop(.28, '#6f858c'); sky.addColorStop(.5, '#7a6448'); sky.addColorStop(1, '#d9a45e');
    } else {
      sky.addColorStop(0, '#a9bcc2'); sky.addColorStop(.35, '#62757c'); sky.addColorStop(1, '#27333a');
    }
    c.fillStyle = sky; c.fillRect(0, 0, 64, 256);
    if (!emissive) {
      // Diagonal sheen across the glass.
      const sheen = c.createLinearGradient(0, 40, 64, 150);
      sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(.45, 'rgba(255,255,255,.22)'); sheen.addColorStop(.55, 'rgba(255,255,255,.05)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sheen; c.fillRect(0, 0, 64, 256);
    }
    if (lit) {
      // A warm lamp deep in the room.
      const lampGlow = c.createRadialGradient(32, 170, 2, 32, 170, 60);
      lampGlow.addColorStop(0, emissive ? 'rgba(255,214,150,.9)' : 'rgba(255,220,160,.55)'); lampGlow.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = lampGlow; c.fillRect(0, 100, 64, 156);
      // Curtains tied back at both sides: full at the top, pinched at the tie, flared at the sill.
      for (const side of [0, 1]) {
        const edge = side ? 64 : 0, dir = side ? -1 : 1;
        c.beginPath(); c.moveTo(edge, 70);
        c.bezierCurveTo(edge + dir * 22, 90, edge + dir * 18, 150, edge + dir * 6, 170);
        c.bezierCurveTo(edge + dir * 12, 200, edge + dir * 16, 235, edge + dir * 14, 256);
        c.lineTo(edge, 256); c.closePath();
        const drape = c.createLinearGradient(edge, 0, edge + dir * 22, 0);
        drape.addColorStop(0, emissive ? 'rgba(40,14,4,1)' : 'rgba(88,26,20,.95)'); drape.addColorStop(1, emissive ? 'rgba(120,52,14,1)' : 'rgba(150,60,34,.8)');
        c.fillStyle = drape; c.fill();
        c.strokeStyle = emissive ? 'rgba(0,0,0,.4)' : 'rgba(40,10,6,.35)'; c.lineWidth = 1;
        for (const k of [5, 10, 15]) { c.beginPath(); c.moveTo(edge + dir * k, 78); c.quadraticCurveTo(edge + dir * (k * .5 + 3), 150, edge + dir * 4, 168); c.stroke(); }
        c.fillStyle = emissive ? '#6a4210' : '#c49a52'; c.fillRect(edge + (side ? -9 : 3), 166, 6, 4);
      }
      c.fillStyle = emissive ? '#140904' : 'rgba(30,20,12,.6)'; c.fillRect(0, 246, 64, 10);
    }
    const map = m.texture(canvas); map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; return map;
  };
  const windowLit = new THREE.MeshStandardMaterial({ name: 'steamkit-window-lit', map: paneTexture(true, false), emissiveMap: paneTexture(true, true), emissive: 0xffffff, emissiveIntensity: .75, metalness: .25, roughness: .12 });
  const windowDark = new THREE.MeshStandardMaterial({ name: 'steamkit-window-dark', map: paneTexture(false, false), metalness: .45, roughness: .1 });
  /** One riveted metal for repeated buildings: each part keeps its alloy's colour per vertex. */
  const metalwork = new THREE.MeshStandardMaterial({ name: 'steamkit-metalwork', color: 0xffffff, vertexColors: true, metalness: .78, roughness: .42 });
  // Window trim on repeated buildings: same look, but too shallow to need shadow-map passes.
  const metalworkTrim = new THREE.MeshStandardMaterial({ name: 'steamkit-metalwork-trim', color: 0xffffff, vertexColors: true, metalness: .78, roughness: .42 });
  const stoneTrim = new THREE.MeshStandardMaterial({ name: 'steamkit-stone-trim', color: 0xc2b294, roughness: .88 });
  const materials: THREE.Material[] = [iron, brass, copper, verdigris, bronze, glass, warmGlass, glow, paving, stone, slate, wood, metalwork, metalworkTrim, stoneTrim, windowLit, windowDark];

  let noise = 7;
  const rnd = () => { noise = (Math.imul(noise, 1103515245) + 12345) >>> 0; return noise / 4294967296; };
  // Riveted plate: seams, rivet rows and soot streaks.
  const plateCanvas = document.createElement('canvas'); plateCanvas.width = plateCanvas.height = 512;
  const pc = plateCanvas.getContext('2d')!;
  pc.fillStyle = '#c8c8c8'; pc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 512, y = rnd() * 512, v = 150 + rnd() * 90;
    pc.fillStyle = `rgba(${v},${v},${v},.35)`; pc.fillRect(x, y, 2 + rnd() * 30, 1 + rnd() * 3);
  }
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, y = rnd() * 512, g = pc.createLinearGradient(0, y, 0, y + 180);
    g.addColorStop(0, 'rgba(40,36,30,.35)'); g.addColorStop(1, 'rgba(40,36,30,0)');
    pc.fillStyle = g; pc.fillRect(x, y, 3 + rnd() * 10, 180);
  }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
    const x = col * 256 + (row % 2) * 128, y = row * 128;
    pc.strokeStyle = 'rgba(30,28,26,.85)'; pc.lineWidth = 3; pc.strokeRect(x % 512, y, 256, 128);
    for (let k = 10; k < 256; k += 20) for (const yy of [y + 9, y + 119]) {
      pc.fillStyle = 'rgba(245,240,230,.9)'; pc.beginPath(); pc.arc((x + k) % 512, yy - 1, 3.2, 0, Math.PI * 2); pc.fill();
      pc.fillStyle = 'rgba(25,22,20,.8)'; pc.beginPath(); pc.arc((x + k) % 512, yy + 1.5, 3, 0, Math.PI); pc.fill();
    }
  }
  // Cobbles and flags for yards and plinths.
  const slabCanvas = document.createElement('canvas'); slabCanvas.width = slabCanvas.height = 256;
  const sc = slabCanvas.getContext('2d')!;
  sc.fillStyle = '#6c665d'; sc.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const shade = 120 + ((row * 5 + col * 3) % 7) * 6;
    sc.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`; sc.fillRect(col * 64 + (row % 2) * 32 + 2, row * 64 + 2, 60, 60);
    sc.fillStyle = `rgb(${shade - 14},${shade - 20},${shade - 30})`; sc.fillRect((col * 64 + (row % 2) * 32 + 34) % 256, row * 64 + 2, 30, 60);
  }
  // Ashlar courses for dressed stone.
  const ashlarCanvas = document.createElement('canvas'); ashlarCanvas.width = ashlarCanvas.height = 256;
  const ac = ashlarCanvas.getContext('2d')!;
  ac.fillStyle = '#d9d3c6'; ac.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) { const v = 190 + rnd() * 50; ac.fillStyle = `rgba(${v},${v - 6},${v - 18},.4)`; ac.fillRect(rnd() * 256, rnd() * 256, 3 + rnd() * 20, 2 + rnd() * 4); }
  ac.strokeStyle = 'rgba(90,82,70,.8)'; ac.lineWidth = 2;
  for (let y = 0; y < 256; y += 64) {
    ac.beginPath(); ac.moveTo(0, y); ac.lineTo(256, y); ac.stroke();
    for (let x = (y / 64) % 2 ? 64 : 0; x < 256; x += 128) { ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x, y + 64); ac.stroke(); }
  }
  /**
   * Projects a detail texture along the object's own axes in metres
   * (object space, so it works on merged and on instanced geometry).
   */
  const triplanar = (mat: THREE.MeshStandardMaterial, map: THREE.Texture, key: string, metres: number, strength: number, rough = .6) => {
    mat.onBeforeCompile = shader => {
      shader.uniforms.plateMap = { value: map };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPlatePos; varying vec3 vPlateNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlatePos = position; vPlateNormal = normal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D plateMap; varying vec3 vPlatePos; varying vec3 vPlateNormal;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 plateW = pow(abs(normalize(vPlateNormal)), vec3(4.)); plateW /= plateW.x + plateW.y + plateW.z;
          vec3 plateP = vPlatePos / ${metres.toFixed(2)};
          vec3 plateC = texture2D(plateMap, plateP.zy).rgb * plateW.x + texture2D(plateMap, plateP.xz).rgb * plateW.y + texture2D(plateMap, plateP.xy).rgb * plateW.z;
          float plate = plateC.r;
          diffuseColor.rgb *= mix(vec3(1.), plateC * 1.25, ${strength.toFixed(2)});`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (.8 - plate) * ${(strength * rough).toFixed(2)}, .05, 1.);`);
    };
    mat.customProgramCacheKey = () => `steamkit-${key}-${metres}-${strength}`;
  };
  const plateMap = m.texture(plateCanvas), slabMap = m.texture(slabCanvas), ashlarMap = m.texture(ashlarCanvas);
  triplanar(iron, plateMap, 'plate', 2.6, .8); triplanar(copper, plateMap, 'plate', 3.2, .75); triplanar(bronze, plateMap, 'plate', 2.6, .8);
  triplanar(brass, plateMap, 'plate', 2.2, .45); triplanar(verdigris, plateMap, 'plate', 3, .6); triplanar(metalwork, plateMap, 'plate', 2.6, .65); triplanar(metalworkTrim, plateMap, 'plate', 2.6, .65);
  triplanar(paving, slabMap, 'slab', 4, .9, .1); triplanar(stone, ashlarMap, 'ashlar', 3.2, .7, .2); triplanar(stoneTrim, ashlarMap, 'ashlar', 3.2, .7, .2);

  // ------------------------------------------------------------ Signs
  const canvasMaterial = (width: number, height: number, draw: (c: CanvasRenderingContext2D) => void, transparent = false) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d')!);
    const mat = new THREE.MeshStandardMaterial({ name: 'steamkit-sign', map: m.texture(canvas), roughness: .55, metalness: .35, transparent, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2 });
    materials.push(mat); return mat;
  };
  const goldText = (c: CanvasRenderingContext2D, top: number, bottom: number) => {
    const g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#f6dfa0'); g.addColorStop(.5, '#d0a254'); g.addColorStop(1, '#8e6429'); return g;
  };
  const plate = (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = '#1e2021'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#b68d4c'; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
    c.lineWidth = 3; c.strokeRect(24, 24, w - 48, h - 48);
    c.fillStyle = '#c29a57';
    for (let x = 16; x < w; x += 44) for (const y of [16, h - 16]) { c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
  };
  /** A black-and-gold nameboard: title with an optional letter-spaced motto. */
  const nameboard = (title: string, motto = '') => canvasMaterial(1024, 256, c => {
    plate(c, 1024, 256);
    c.textAlign = 'center'; c.fillStyle = goldText(c, 50, 170);
    c.font = `bold ${title.length > 14 ? 88 : 112}px Georgia`; c.fillText(title, 512, motto ? 156 : 170, 940);
    if (motto) { c.fillStyle = '#c9a25f'; c.font = '32px Georgia'; c.fillText(motto.split('').join(' '), 512, 212, 940); }
  });

  // ------------------------------------------------------------ Shared primitives
  const primitives = (hero: boolean) => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, hero ? 24 : 14),
    cylLow: new THREE.CylinderGeometry(1, 1, 1, hero ? 10 : 6),
    sphere: new THREE.SphereGeometry(1, hero ? 20 : 12, hero ? 12 : 8),
    rivet: new THREE.SphereGeometry(1, hero ? 8 : 5, hero ? 5 : 3),
    dome: new THREE.SphereGeometry(1, hero ? 28 : 14, hero ? 12 : 6, 0, Math.PI * 2, 0, Math.PI / 2),
    band: new THREE.TorusGeometry(1, .02, hero ? 6 : 3, hero ? 40 : 16),
    halfTorus: new THREE.TorusGeometry(1, .03, hero ? 6 : 3, hero ? 28 : 12, Math.PI),
    halfDisc: new THREE.CircleGeometry(1, hero ? 28 : 12, 0, Math.PI),
    disc: new THREE.CircleGeometry(1, hero ? 40 : 18),
    vault: new THREE.CylinderGeometry(1, 1, 1, hero ? 32 : 14, 1, true, Math.PI, Math.PI),
    cone: new THREE.ConeGeometry(1, 1, hero ? 16 : 8),
    pyramid: new THREE.ConeGeometry(1, 1, 4, 1),
    /** Triangular prism: base from x -1..1 at y 0, apex at y 1, depth 1 along z. */
    prism: (() => {
      const shape = new THREE.Shape(); shape.moveTo(-1, 0); shape.lineTo(1, 0); shape.lineTo(0, 1); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); geo.translate(0, 0, -.5); return geo;
    })(),
    plane: new THREE.PlaneGeometry(1, 1),
  });
  const heroGeo = primitives(true), leanGeo = primitives(false);
  const gearGeometry = (hero: boolean) => {
    const shape = new THREE.Shape(), teeth = hero ? 128 : 64;
    for (let k = 0; k <= teeth; k++) {
      const a = k / teeth * Math.PI * 2, r = k % 4 < 2 ? 1 : .86;
      if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, .74, 0, Math.PI * 2, true); shape.holes.push(hole);
    const pieces: THREE.BufferGeometry[] = [new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false, curveSegments: hero ? 4 : 2 }).toNonIndexed()];
    for (let k = 0; k < 6; k++) { const spoke = new THREE.BoxGeometry(1.5, .1, .12).toNonIndexed(); spoke.rotateZ(k * Math.PI / 6); spoke.translate(0, 0, .07); pieces.push(spoke); }
    const hub = new THREE.CylinderGeometry(.2, .2, .3, hero ? 16 : 8).toNonIndexed(); hub.rotateX(Math.PI / 2); hub.translate(0, 0, .07); pieces.push(hub);
    const inner = new THREE.TorusGeometry(.78, .05, hero ? 5 : 3, hero ? 48 : 20).toNonIndexed(); inner.translate(0, 0, .07); pieces.push(inner);
    const merged = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose()); return merged;
  };
  const heroGear = gearGeometry(true), leanGear = gearGeometry(false);

  const face = (yaw: number, x: number, z: number) => new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);

  /**
   * Arched window pieces for a unit-wide opening of the given height/width
   * ratio (the head is a semicircle of radius 0.5): the glass with UVs over
   * the whole pane, a solid extruded frame, and a moulded hood over the head.
   */
  const archCache = new Map<string, { pane: THREE.BufferGeometry; frame: THREE.BufferGeometry; hood: THREE.BufferGeometry; reveal: THREE.BufferGeometry }>();
  const archPieces = (aspect: number, hero: boolean) => {
    const key = `${aspect.toFixed(2)}-${hero}`;
    let cached = archCache.get(key);
    if (cached) return cached;
    const seg = hero ? 18 : 8, spring = aspect - .5;
    const arched = (r: number, bottom = 0) => {
      const shape = new THREE.Shape(); shape.moveTo(-r, bottom); shape.lineTo(r, bottom); shape.lineTo(r, spring);
      shape.absarc(0, spring, r, 0, Math.PI, false); shape.lineTo(-r, bottom); return shape;
    };
    const pane = new THREE.ShapeGeometry(arched(.5), seg);
    const uv = pane.attributes.uv as THREE.BufferAttribute, pos = pane.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + .5, pos.getY(i) / aspect);
    const frameShape = arched(.62, -.02); frameShape.holes.push(arched(.5) as unknown as THREE.Path);
    const frame = new THREE.ExtrudeGeometry(frameShape, { depth: .16, bevelEnabled: false, curveSegments: seg });
    const revealShape = arched(.5); revealShape.holes.push(arched(.44, .06) as unknown as THREE.Path);
    const reveal = new THREE.ShapeGeometry(revealShape, seg);
    const hoodShape = new THREE.Shape(); hoodShape.absarc(0, spring, .8, 0, Math.PI, false); hoodShape.lineTo(-.66, spring);
    hoodShape.absarc(0, spring, .66, Math.PI, 0, true); hoodShape.lineTo(.8, spring);
    const hood = new THREE.ExtrudeGeometry(hoodShape, { depth: .14, bevelEnabled: false, curveSegments: seg });
    // Frames and hoods sit against the wall: drop their back caps.
    const front = (geo: THREE.BufferGeometry) => {
      const flat = geo.toNonIndexed(), n = flat.attributes.normal, keep: number[] = [];
      for (let t = 0; t < n.count; t += 3) if (n.getZ(t) > -.5) keep.push(t);
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const src = flat.attributes[name] as THREE.BufferAttribute, size = src.itemSize, data = new Float32Array(keep.length * 3 * size);
        keep.forEach((t, i) => data.set((src.array as Float32Array).subarray(t * size, (t + 3) * size), i * 3 * size));
        out.setAttribute(name, new THREE.BufferAttribute(data, size));
      }
      flat.dispose(); geo.dispose(); return out;
    };
    cached = { pane, frame: front(frame), hood: front(hood), reveal }; archCache.set(key, cached); return cached;
  };
  let windowSeed = 11;

  /** Collects parts for one building, in its local metres. */
  const sketch = (detail: 'hero' | 'lean' = 'hero') => {
    const g = detail === 'hero' ? heroGeo : leanGeo, hero = detail === 'hero';
    const { box, cylLow, rivet, band, cone } = g;
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const extents = new Map<THREE.BufferGeometry, number>(), trim = new Set<THREE.BufferGeometry>();
    const box3 = new THREE.Box3(), size = new THREE.Vector3();
    /** While set, parts are close-up detail only and never reach the distant LOD. */
    let closeUp = false;
    const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, p: V3, s: V3 = [1, 1, 1], r: V3 = [0, 0, 0], base?: THREE.Matrix4) => {
      const part = geo.index ? geo.toNonIndexed() : geo.clone();
      tmp.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(r[0], r[1], r[2])), new THREE.Vector3(...s));
      if (base) tmp.premultiply(base);
      part.applyMatrix4(tmp);
      extents.set(part, closeUp ? 0 : box3.setFromBufferAttribute(part.attributes.position as THREE.BufferAttribute).getSize(size).length());
      if (closeUp) trim.add(part);
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat)!.push(part);
    };
    const front = (z: number) => face(0, 0, z), right = (x: number) => face(Math.PI / 2, x, 0);
    const left = (x: number) => face(-Math.PI / 2, x, 0), back = (z: number) => face(Math.PI, 0, z);
    /**
     * A round-headed sash window on a wall facing the frame's +z: glass (lit
     * or dark), a solid arched frame with a shadowed reveal, glazing bars that
     * follow the head, a moulded hood with keystone and a stone sill.
     */
    const archWindow = (f: THREE.Matrix4, x: number, y: number, w: number, h: number, lit?: boolean) => {
      const aspect = Math.round(Math.max(1.1, h / w) * 20) / 20, height = aspect * w, body = height - w / 2, spring = y + body;
      const { pane, frame, hood, reveal } = archPieces(aspect, hero);
      windowSeed = (Math.imul(windowSeed, 1103515245) + 12345) >>> 0;
      const on = lit ?? (windowSeed >>> 16) % 10 < 7;
      add(pane, on ? windowLit : windowDark, [x, y, .04], [w, w, 1], [0, 0, 0], f);
      closeUp = true;
      add(reveal, m.dark, [x, y, .05], [w, w, 1], [0, 0, 0], f);
      add(frame, iron, [x, y, .02], [w, w, 1], [0, 0, 0], f);
      add(hood, stone, [x, y, .04], [w, w, 1], [0, 0, 0], f);
      add(box, stone, [x, spring + w * .5 + w * .06, .12], [w * .18, w * .26, .24], [0, 0, 0], f);
      add(box, stone, [x, y - .1, .16], [w + .5, .2, .38], [0, 0, 0], f);
      // Glazing bars: mullion to the crown, transom at the springing, fan in the head.
      const bar = Math.max(.05, w * .035);
      add(box, iron, [x, y + height / 2, .09], [bar, height - .05, .06], [0, 0, 0], f);
      add(box, iron, [x, spring, .09], [w, bar * 1.3, .06], [0, 0, 0], f);
      if (body > w * 1.1) add(box, iron, [x, y + body * .5, .09], [w, bar, .06], [0, 0, 0], f);
      for (const a of hero ? [Math.PI / 6, Math.PI / 3, 2 * Math.PI / 3, 5 * Math.PI / 6] : [Math.PI / 4, 3 * Math.PI / 4])
        add(box, iron, [x + Math.cos(a) * w / 4, spring + Math.sin(a) * w / 4, .09], [w / 2, bar, .06], [0, 0, a], f);
      closeUp = false;
    };
    /** The same moulded arched frame, hood and keystone around an opening (doors). */
    const archFrame = (f: THREE.Matrix4, x: number, y: number, w: number, h: number) => {
      const aspect = Math.round(Math.max(1.1, h / w) * 20) / 20, spring = y + aspect * w - w / 2;
      const { frame, hood } = archPieces(aspect, hero);
      closeUp = true;
      add(frame, iron, [x, y, .02], [w, w, 1.4], [0, 0, 0], f);
      add(hood, stone, [x, y, .04], [w, w, 1.3], [0, 0, 0], f);
      add(box, stone, [x, spring + w * .56, .14], [w * .16, w * .24, .28], [0, 0, 0], f);
      closeUp = false;
      return { pane: archPieces(aspect, hero).pane, spring };
    };
    const pilaster = (f: THREE.Matrix4, x: number, y0: number, y1: number, width = .8) => {
      add(box, iron, [x, (y0 + y1) / 2, .22], [width, y1 - y0, .44], [0, 0, 0], f);
      add(box, brass, [x, y1 - .2, .32], [width + .24, .3, .56], [0, 0, 0], f);
      add(box, brass, [x, y0 + .25, .32], [width + .24, .3, .56], [0, 0, 0], f);
    };
    const railing = (x0: number, z0: number, x1: number, z1: number, y: number, height = 1.1, finials = false) => {
      const length = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
      const f = face(yaw, (x0 + x1) / 2, (z0 + z1) / 2);
      add(box, brass, [0, y + height, 0], [length, .08, .08], [0, 0, 0], f);
      if (hero) add(box, iron, [0, y + height * .5, 0], [length, .05, .05], [0, 0, 0], f);
      const posts = Math.max(1, Math.round(length / (hero ? 1.3 : 2.2)));
      for (let i = 0; i <= posts; i++) {
        const u = -length / 2 + length * i / posts;
        add(box, iron, [u, y + height / 2, 0], [.07, height, .07], [0, 0, 0], f);
        if (finials && i % 3 === 0) {
          add(box, iron, [u, y + height / 2, 0], [.16, height + .1, .16], [0, 0, 0], f);
          add(cone, brass, [u, y + height + .35, 0], [.1, .5, .1], [0, 0, 0], f);
        }
      }
    };
    const tube = (points: V3[], radius: number, mat: THREE.Material, flanges: number[] = []) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal', .2);
      add(new THREE.TubeGeometry(curve, points.length * (hero ? 16 : 6), radius, hero ? 18 : 8, false), mat, [0, 0, 0]);
      for (const t of flanges) {
        const p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
        const ring = new THREE.TorusGeometry(radius * 1.12, radius * .12, hero ? 6 : 3, hero ? 24 : 10);
        ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent)); ring.translate(p.x, p.y, p.z);
        add(ring, brass, [0, 0, 0]);
      }
    };
    /** Brass hoops around a vertical tank or stack. */
    const bands = (x: number, z: number, r: number, heights: number[], thickness = 1) => {
      for (const y of heights) add(band, brass, [x, y, z], [r + .05, r + .05, thickness * 10], [Math.PI / 2, 0, 0]);
    };
    const lamp = (x: number, z: number, height = 4.6, y = 0) => {
      add(box, iron, [x, y + .65, z], [.5, 1.3, .5]);
      add(cylLow, iron, [x, y + height / 2 + .5, z], [.09, height, .09]);
      add(box, glow, [x, y + height + .95, z], [.44, .7, .44]);
      if (hero) for (const u of [-.24, .24]) for (const v of [-.24, .24]) add(box, iron, [x + u, y + height + .95, z + v], [.05, .8, .05]);
      add(cone, iron, [x, y + height + 1.55, z], [.42, .5, .42]);
      add(rivet, brass, [x, y + height + 1.9, z], [.09, .12, .09]);
      add(box, brass, [x, y + height + .52, z], [.52, .08, .52]);
    };
    const crate = (x: number, y: number, z: number, s: number, yaw = 0) => {
      add(box, wood, [x, y + s / 2, z], [s, s, s], [0, yaw, 0]);
      const f = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
      for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) add(box, iron, [u * s / 2, y + s / 2, v * s / 2], [.08, s + .02, .08], [0, 0, 0], f);
      for (const yy of [y + .04, y + s - .04]) for (const side of [-1, 1]) {
        add(box, iron, [0, yy, side * s / 2], [s + .02, .08, .08], [0, 0, 0], f);
        add(box, iron, [side * s / 2, yy, 0], [.08, .08, s + .02], [0, 0, 0], f);
      }
      if (hero) add(box, iron, [0, y + s / 2, s / 2 + .01], [s * 1.35, .06, .02], [0, 0, Math.PI / 4], f);
    };
    /** Static gear baked into the building (animated ones are placed by the caller). */
    const staticGear = (p: V3, radius: number, yaw = 0, mat: THREE.Material = brass) => add(hero ? heroGear : leanGear, mat, p, [radius, radius, radius * .9], [0, yaw, 0]);
    /**
     * Merges parts into one geometry per material. `consolidate` folds the
     * metals into the vertex-coloured metalwork material (fewer draws for
     * buildings that repeat along the lap).
     */
    /** `minExtent` keeps only parts whose bounding diagonal reaches it: an automatic distant LOD. */
    const merge = (consolidate = false, minExtent = 0) => {
      const merged = new Map<THREE.Material, THREE.BufferGeometry>();
      const metals = new Set<THREE.Material>([iron, brass, copper, verdigris, bronze, m.dark, warmGlass]);
      const folded: THREE.BufferGeometry[] = [], foldedTrim: THREE.BufferGeometry[] = [], stoneTrimParts: THREE.BufferGeometry[] = [];
      for (const [mat, all] of parts) {
        let list = all.filter(part => extents.get(part)! >= minExtent);
        if (consolidate && mat === stone) { stoneTrimParts.push(...list.filter(part => trim.has(part))); list = list.filter(part => !trim.has(part)); }
        if (!list.length) continue;
        if (consolidate && metals.has(mat)) {
          const colour = mat === warmGlass ? warmGlass.emissive : (mat as THREE.MeshStandardMaterial).color;
          for (const part of list) {
            if (!part.attributes.color) {
              const count = part.attributes.position.count, data = new Float32Array(count * 3);
              for (let i = 0; i < count; i++) data.set([colour.r, colour.g, colour.b], i * 3);
              part.setAttribute('color', new THREE.BufferAttribute(data, 3));
            }
            (trim.has(part) ? foldedTrim : folded).push(part);
          }
          continue;
        }
        merged.set(mat, mergeGeometries(list)!);
      }
      if (folded.length) merged.set(metalwork, mergeGeometries(folded)!);
      if (foldedTrim.length) merged.set(metalworkTrim, mergeGeometries(foldedTrim)!);
      if (stoneTrimParts.length) merged.set(stoneTrim, mergeGeometries(stoneTrimParts)!);
      return merged;
    };
    const dispose = () => { for (const list of parts.values()) list.forEach(part => part.dispose()); parts.clear(); extents.clear(); trim.clear(); };
    return { ...g, add, face, front, right, left, back, archWindow, archFrame, pilaster, railing, tube, bands, lamp, crate, staticGear, merge, dispose };
  };

  const glowing = new Set<THREE.Material>([glow, glass, warmGlass, paving, windowLit, windowDark, metalworkTrim, stoneTrim]);
  return {
    mat: { iron, brass, copper, verdigris, bronze, glass, warmGlass, glow, paving, stone, slate, wood, metalwork, windowLit, windowDark },
    sketch, canvasMaterial, goldText, plate, nameboard, heroGear, leanGear,
    /** Materials that should not cast shadows (glazing, lamplight, signs). */
    castsShadow: (mat: THREE.Material) => !glowing.has(mat) && (mat as THREE.MeshStandardMaterial).name !== 'steamkit-sign',
    setCinematic(enabled: boolean) {
      glow.emissiveIntensity = enabled ? 1.7 : .9;
      windowLit.emissiveIntensity = enabled ? 1.5 : .75;
      warmGlass.emissiveIntensity = enabled ? .4 : .18;
    },
    dispose() {
      materials.forEach(mat => mat.dispose());
      for (const set of [heroGeo, leanGeo]) Object.values(set).forEach(geo => geo.dispose());
      heroGear.dispose(); leanGear.dispose();
      for (const pieces of archCache.values()) Object.values(pieces).forEach(geo => geo.dispose());
    },
  };
}
