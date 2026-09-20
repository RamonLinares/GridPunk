import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function carbonMaterial() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(1024, 1024);
  const reliefCanvas = document.createElement('canvas'); reliefCanvas.width = reliefCanvas.height = 1024;
  const rc = reliefCanvas.getContext('2d')!, relief = rc.createImageData(1024, 1024);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const u = (x + y) / Math.SQRT2, v = (y - x) / Math.SQRT2;
    const warp = ((Math.floor(u / 10) + Math.floor(v / 10)) % 4 + 4) % 4 < 2;
    const cross = warp ? u : v, length = warp ? v : u;
    const strand = Math.pow(Math.sin(((cross % 10 + 10) % 10) / 10 * Math.PI), .6);
    const value = 17 + strand * (warp ? 21 : 12) + Math.sin(length * 3.2) * 2;
    const i = (y * 1024 + x) * 4;
    pixels.data[i] = value; pixels.data[i + 1] = value + 2; pixels.data[i + 2] = value + 4; pixels.data[i + 3] = 255;
    const height = 70 + strand * 110;
    relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = height; relief.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  rc.putImageData(relief, 0, 0);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(reliefCanvas); bumpMap.anisotropy = 8;
  return new THREE.MeshPhysicalMaterial({ map, bumpMap, bumpScale: .00006, roughness: .48, metalness: .02,
    specularIntensity: .4, clearcoat: .12, clearcoatRoughness: .4, envMapIntensity: .25 });
}

/** Dimensions are authored in millimetres; +Z is the driver's side of the face. */
function buildWheel() {
  const group = new THREE.Group();
  group.name = 'formula-steering-wheel';
  const face = new THREE.Group();
  face.name = 'wheel-face';
  face.scale.setScalar(.001);
  face.scale.y = .00104;
  face.rotation.y = Math.PI;
  group.add(face);
  const carbon = carbonMaterial();
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: .72 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x737b83, roughness: .3, metalness: .8 });
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    if (material === carbon) {
      const p = geometry.getAttribute('position'), uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + 170) / 340; uv[i * 2 + 1] = (p.getY(i) + 110) / 220; }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; face.add(mesh);
    return mesh;
  };
  const extrude = (shape: THREE.Shape, depth: number, bevel = 1) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8, steps: 1,
  });
  const rounded = (w: number, h: number, r: number) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  };
  const outline = new THREE.Shape();
  outline.moveTo(-86, -91); outline.quadraticCurveTo(0, -104, 86, -91);
  outline.lineTo(98, -40); outline.lineTo(141, -32); outline.lineTo(147, -9);
  outline.lineTo(111, -4); outline.lineTo(105, 36); outline.lineTo(143, 39);
  outline.quadraticCurveTo(161, 32, 158, 49); outline.quadraticCurveTo(152, 78, 123, 87);
  outline.quadraticCurveTo(77, 99, 0, 98); outline.quadraticCurveTo(-77, 99, -123, 87);
  outline.quadraticCurveTo(-152, 78, -158, 49); outline.quadraticCurveTo(-161, 32, -143, 39);
  outline.lineTo(-105, 36); outline.lineTo(-111, -4); outline.lineTo(-147, -9);
  outline.lineTo(-141, -32); outline.lineTo(-98, -40); outline.closePath();
  add('shell', extrude(outline, 11, 1.3), carbon, 0, 0, -7);
  for (const side of [-1, 1]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 146, 39, 0), new THREE.Vector3(side * 149, 12, 6),
      new THREE.Vector3(side * 150, -22, 8), new THREE.Vector3(side * 149, -58, 4),
      new THREE.Vector3(side * 136, -96, 0),
    ]);
    const grip = new THREE.TubeGeometry(path, 28, 16, 12, false);
    const positions = grip.getAttribute('position');
    for (let ring = 0; ring <= 28; ring++) {
      const t = ring / 28, centre = path.getPointAt(t);
      // Flatten the back and swell the palm around the connecting spoke.
      const radius = 1 + .18 * Math.exp(-(((t - .48) / .18) ** 2)) - .13 * Math.cos(t * Math.PI * 2);
      for (let j = 0; j <= 12; j++) {
        const k = ring * 13 + j;
        positions.setXYZ(k, centre.x + (positions.getX(k) - centre.x) * radius,
          centre.y + (positions.getY(k) - centre.y) * radius,
          centre.z + (positions.getZ(k) - centre.z) * .83);
      }
    }
    grip.computeVertexNormals();
    add(`grips-${side}`, grip, rubber);
    for (const t of [0, 1]) {
      const end = path.getPointAt(t);
      const cap = add('grip-end', new THREE.SphereGeometry(14, 12, 8), rubber, end.x, end.y, end.z);
      cap.scale.set(1, .55, .85);
    }
    const thumb = add('grip-thumb-rest', new THREE.SphereGeometry(11, 12, 8), rubber, side * 136, -10, 13);
    thumb.scale.set(1.4, .72, .8);
  }
  const bezel = rounded(124, 79, 6);
  bezel.holes.push(new THREE.Path(rounded(110, 63, 4).getPoints(12).reverse()));
  add('screen-housing', extrude(bezel, 7, 1), rubber, 0, 37, 4);
  add('display', new THREE.PlaneGeometry(111, 64), new THREE.MeshBasicMaterial({ color: 0x061017 }), 0, 37, 11.1).castShadow = false;
  const hub = add('hub', new THREE.CylinderGeometry(24, 27, 30, 20), metal, 0, 0, -22);
  hub.rotation.x = Math.PI / 2;
  const cylinder = (name: string, x: number, y: number, z: number, r: number, depth: number, mat = rubber, segments = 16) => {
    const mesh = add(name, new THREE.CylinderGeometry(r, r, depth, segments), mat, x, y, z);
    mesh.rotation.x = Math.PI / 2; return mesh;
  };
  const buttons = [
    [-126, 70, 'N', '#68da8a'], [-148, 51, 'NRG', '#c06bd8'], [-84, 47, 'RAD', '#ff9c5d'],
    [-91, 1, 'OK', '#e3e9e9'], [126, 70, 'PIT', '#ff675d'], [148, 51, 'DRS', '#bb72dd'],
    [105, 51, '+', '#66ccec'], [83, 32, '−', '#f5db66'], [91, 1, 'OT', '#f2dc58'],
  ] as const;
  const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 512;
  const ink = atlas.getContext('2d')!;
  const atlasMap = new THREE.CanvasTexture(atlas); atlasMap.colorSpace = THREE.SRGBColorSpace; atlasMap.anisotropy = 8;
  const controlPaint = new THREE.MeshStandardMaterial({ map: atlasMap, color: 0xbcbcbc, roughness: .58, metalness: 0, envMapIntensity: .2 });
  const tile = (i: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    ink.save(); ink.translate(i % 8 * 128, Math.floor(i / 8) * 128); draw(ink); ink.restore();
  };
  const decal = (i: number, x: number, y: number, z: number, radius: number) => {
    const geo = new THREE.CircleGeometry(radius, 32), uv = geo.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i % 8 + uv.getX(k)) / 8, 1 - (Math.floor(i / 8) + 1 - uv.getY(k)) / 4);
    return add('legends', geo, controlPaint, x, y, z);
  };
  buttons.forEach(([x, y, label, color], i) => {
    cylinder('upper-controls-socket', x, y, 7, 10.5, 5, metal);
    cylinder('upper-controls-cap', x, y, 11, 8.1, 5);
    tile(i, c => { c.fillStyle = color; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#18262c'; c.lineWidth = 4; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#13232c'; c.font = `900 ${label.length > 2 ? 31 : 48}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 64, 67); });
    decal(i, x, y, 13.6, 8);
  });
  const rotaries = [[-45, -34, 'ENTRY'], [0, -34, 'MODE'], [45, -34, 'STRAT'], [-25, -74, 'TYRE'], [25, -74, 'DIFF']] as const;
  const dialColors = ['#c2df83', '#e9d561', '#52bb79', '#54bdda', '#c569cb'];
  rotaries.forEach(([x, y], i) => {
    cylinder('rotary-bank', x, y, 7, 18, 5, metal, 32);
    tile(16 + i, c => {
      c.fillStyle = dialColors[i]; c.fillRect(0, 0, 128, 128);
      if (i === 0 || i === 3) for (let segment = 0; segment < 6; segment++) {
        c.fillStyle = ['#d8d67a', '#a5ce76', '#66bdd2', '#ca72b8', '#ed8657', '#e4ce76'][segment];
        c.beginPath(); c.moveTo(64, 64); c.arc(64, 64, 64, segment * Math.PI / 3, (segment + 1) * Math.PI / 3); c.fill();
      }
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#152229';
      for (let n = 0; n < 12; n++) { const a = n * Math.PI / 6 - Math.PI / 2; c.fillText(String(n + 1), 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); }
    });
    decal(16 + i, x, y, 9.6, 17.5);
    cylinder('selector-knurls', x, y, 11, 10, 7, rubber, 20);
    add('selector-pointer', extrude(rounded(6, 24, 2), 6, 1), rubber, x, y, 14).rotation.z = -.3;
  });
  atlasMap.needsUpdate = true;
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 1536; labelCanvas.height = 1024;
  const lc = labelCanvas.getContext('2d')!;
  const label = (text: string, x: number, y: number, size = 4.2) => {
    lc.fillStyle = '#dfe4e5'; lc.font = `700 ${size * 1536 / 340}px Arial`; lc.textAlign = 'center'; lc.textBaseline = 'middle';
    lc.fillText(text, (x / 340 + .5) * 1536, (.5 - y / 220) * 1024);
  };
  label('WING', -95, 83); label('ENERGY', 95, 83); label('BBAL −', -112, -36); label('BBAL +', 112, -36);
  label('GRIDPUNK', 0, -9, 4.5);
  for (const [x, y, title] of rotaries) label(title, x, y - 20, 3.2);
  const labelMap = new THREE.CanvasTexture(labelCanvas); labelMap.colorSpace = THREE.SRGBColorSpace; labelMap.anisotropy = 8;
  add('face-labels', new THREE.PlaneGeometry(340, 220), new THREE.MeshStandardMaterial({ map: labelMap, transparent: true, depthWrite: false, roughness: .6 }), 0, 0, 5.35).castShadow = false;
  add('led-housing', extrude(rounded(112, 9, 4), 3, .7), rubber, 0, 85, 5);
  const ledMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const shiftLeds = new THREE.InstancedMesh(new THREE.SphereGeometry(2.7, 10, 6), ledMaterial, 15);
  shiftLeds.name = 'shift-leds';
  const ledTransform = new THREE.Matrix4();
  for (let i = 0; i < 15; i++) {
    ledTransform.compose(new THREE.Vector3((i - 7) * 7.15, 85, 8), new THREE.Quaternion(), new THREE.Vector3(1, 1, .5));
    shiftLeds.setMatrixAt(i, ledTransform); shiftLeds.setColorAt(i, new THREE.Color(0x152029));
  }
  face.add(shiftLeds);
  for (const side of [-1, 1]) {
    add('side-led-housing', extrude(rounded(8, 25, 3), 3, .7), rubber, side * 67, 58, 5);
    for (let i = 0; i < 3; i++) cylinder('side-led-lenses', side * 67, 66 - i * 8, 8, 2.5, 2, metal, 12);
    cylinder('thumb-wheels', side * 116, -18, 7, 9, 23).rotation.z = Math.PI / 2;
    const paddle = add('paddles', extrude(rounded(25, 77, 10), 3, 1.5), carbon, side * 104, -14, -25);
    paddle.rotation.y = side * -.25;
  }
  for (const [x, y] of [[-74, 84], [74, 84], [-74, -1], [74, -1], [-68, -85], [68, -85]]) {
    cylinder('fasteners', x, y, 5.5, 3.3, 2, metal, 16);
    cylinder('fastener-recess', x, y, 6.6, 1.6, .3, rubber, 6);
  }
  batchWheel(face);
  return group;
}

let wheelTemplate: THREE.Group | undefined;

/** Shared static geometry/materials; each car owns its LCD and LED state. */
export function createSteeringWheel() {
  wheelTemplate ??= buildWheel();
  const group = wheelTemplate.clone(true);
  const display = group.getObjectByName('display') as THREE.Mesh;
  const shiftLeds = group.getObjectByName('shift-leds') as THREE.InstancedMesh;
  const displayCanvas = document.createElement('canvas'); displayCanvas.width = 512; displayCanvas.height = 256;
  const displayContext = displayCanvas.getContext('2d')!;
  const displayTexture = new THREE.CanvasTexture(displayCanvas); displayTexture.colorSpace = THREE.SRGBColorSpace; displayTexture.anisotropy = 8;
  display.material = new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false });
  let previous = '';
  const ledColor = new THREE.Color();
  const updateDisplay = (speed: number, gear: number, rpm: number) => {
    const speedKmh = Math.round(Math.abs(speed) * 3.6), revs = Math.round(rpm / 100) * 100;
    const lit = THREE.MathUtils.clamp(Math.floor((rpm - 8000) / 450), 0, 15);
    const key = `${speedKmh}/${gear}/${revs}/${lit}`;
    if (key === previous) return;
    previous = key;
    group.userData.telemetry = { speedKmh, gear, rpm: revs, shiftLights: lit };
    const c = displayContext;
    c.fillStyle = '#061017'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#182e39'; c.fillRect(12, 12, 488, 28);
    c.font = 'bold 16px Arial'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#b6ced6'; c.fillText('GRIDPUNK', 23, 27);
    c.textAlign = 'right'; c.fillStyle = '#68e7bb'; c.fillText('RACE', 488, 27);
    c.fillStyle = '#e8fff4'; c.textAlign = 'center'; c.font = 'bold 136px monospace'; c.fillText(gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear), 108, 119);
    c.fillStyle = '#81a2ad'; c.font = 'bold 16px Arial'; c.fillText('GEAR', 108, 203);
    c.fillStyle = '#2b4149'; c.fillRect(201, 60, 2, 143);
    c.fillStyle = '#f7fbff'; c.textAlign = 'right'; c.font = 'bold 73px monospace'; c.fillText(String(speedKmh), 480, 109);
    c.font = 'bold 16px Arial'; c.fillStyle = '#83a4b0'; c.fillText('KM/H', 479, 153);
    c.font = 'bold 23px monospace'; c.fillStyle = '#b4e9c7'; c.fillText(`${revs.toLocaleString('en-US')} RPM`, 480, 194);
    c.fillStyle = '#203139'; c.fillRect(18, 231, 476, 7); c.fillStyle = lit > 12 ? '#75baff' : '#71eab5'; c.fillRect(18, 231, 476 * THREE.MathUtils.clamp(rpm / 15000, 0, 1), 7);
    displayTexture.needsUpdate = true;
    for (let i = 0; i < 15; i++) shiftLeds.setColorAt(i, ledColor.setHex(i < lit ? (i < 5 ? 0x42f39b : i < 10 ? 0xff5d48 : 0x68bfff) : 0x152029));
    shiftLeds.instanceColor!.needsUpdate = true;
  };
  updateDisplay(0, 1, 4000);
  return { group, updateDisplay };
}

/** Retain component provenance while reducing static controls to material batches. */
function batchWheel(face: THREE.Group) {
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const object of face.children) {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object.name === 'display') continue;
    const material = object.material as THREE.Material;
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material)!.push(object);
  }
  for (const [material, meshes] of batches) {
    const parts = meshes.map(mesh => {
      mesh.updateMatrix();
      const copy = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if (!copy.index) return copy;
      const flat = copy.toNonIndexed(); copy.dispose(); return flat;
    });
    const merged = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'wheel-static-details';
    mesh.userData.componentRefs = [...new Set(meshes.map(m => m.name))];
    mesh.castShadow = meshes.some(m => m.castShadow); mesh.receiveShadow = true;
    for (const part of meshes) { face.remove(part); part.geometry.dispose(); }
    face.add(mesh);
  }
}
