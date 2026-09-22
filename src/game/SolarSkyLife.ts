import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackSpline } from './track/TrackSpline';
import { grandstandTrackClearance } from './SolarGrandstand';

type Plot = { x: number; z: number; r: number };
export interface SolarTurbineSite extends Plot { progress: number; angle: number }

/** Solar-only skyline props. Static detail is merged by material; only rotors and ships move. */
export function createSolarSkyLife(spline: TrackSpline, occupied: readonly Plot[]) {
  const group = new THREE.Group(); group.name = 'solar-sky-life'; group.userData.sceneryContainer = true;
  const ivory = new THREE.MeshStandardMaterial({ color: 0xeee7cd, roughness: .72 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xc9c4ac, roughness: .91 });
  const green = new THREE.MeshStandardMaterial({ color: 0x365f4d, roughness: .62, metalness: .12 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xa0794d, roughness: .52, metalness: .48 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x315d68, roughness: .24, metalness: .3 });
  const panelCanvas = document.createElement('canvas'); panelCanvas.width = panelCanvas.height = 256;
  const pc = panelCanvas.getContext('2d')!; pc.fillStyle = '#24414e'; pc.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) for (let y = 0; y < 256; y += 32) {
    pc.fillStyle = '#3e6875'; pc.fillRect(x + 2, y + 2, 28, 28);
    pc.fillStyle = '#9db4ae'; pc.fillRect(x + 15, y + 2, 1, 28);
  }
  const panelMap = new THREE.CanvasTexture(panelCanvas); panelMap.colorSpace = THREE.SRGBColorSpace;
  const panels = new THREE.MeshStandardMaterial({ map: panelMap, roughness: .4, metalness: .35, side: THREE.DoubleSide });
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 256;
  const sc = signCanvas.getContext('2d')!; sc.fillStyle = '#244f40'; sc.fillRect(0, 0, 1024, 256);
  sc.fillStyle = '#c4dda0'; sc.beginPath(); sc.ellipse(105, 125, 67, 33, -.7, 0, Math.PI * 2); sc.fill();
  sc.strokeStyle = '#244f40'; sc.lineWidth = 9; sc.beginPath(); sc.moveTo(54, 172); sc.lineTo(154, 78); sc.stroke();
  sc.fillStyle = '#f4edd6'; sc.font = 'bold 92px Arial'; sc.fillText(spline.circuit.shortName.toUpperCase(), 201, 129);
  sc.fillStyle = '#c4dda0'; sc.font = '29px Arial'; sc.fillText('CLEAN SKIES  /  SHARED HORIZONS', 205, 185);
  const signMap = new THREE.CanvasTexture(signCanvas); signMap.colorSpace = THREE.SRGBColorSpace; signMap.anisotropy = 8;
  const sign = new THREE.MeshStandardMaterial({ map: signMap, roughness: .8 });
  const textures = [panelMap, signMap];
  const box = new THREE.BoxGeometry(1, 1, 1);
  // Merge transformed parts rather than adding a draw call for each frame, window or rib.
  function kit(parent: THREE.Group) {
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const transform = new THREE.Object3D();
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, p: number[], scale = [1, 1, 1], rotation = [0, 0, 0]) => {
      transform.position.fromArray(p); transform.scale.fromArray(scale); transform.rotation.set(rotation[0], rotation[1], rotation[2]); transform.updateMatrix();
      const copy = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(transform.matrix);
      const list = parts.get(material) ?? []; list.push(copy); parts.set(material, list);
    };
    return { add, block: (material: THREE.Material, p: number[], scale: number[], rotation?: number[]) => add(box, material, p, scale, rotation),
      finish: (shadows = true) => {
        for (const [material, geometries] of parts) {
          const merged = mergeGeometries(geometries); geometries.forEach(geo => geo.dispose());
          if (!merged) throw new Error('Could not merge Solar skyline geometry');
          const mesh = new THREE.Mesh(merged, material); mesh.castShadow = shadows; mesh.receiveShadow = shadows; parent.add(mesh);
        }
      } };
  }
  const clearance = grandstandTrackClearance(spline.samples);
  const sites: SolarTurbineSite[] = [];
  for (const fraction of [.245, .46, .84]) {
    let found = false;
    for (const shift of [0, .015, -.015, .03, -.03]) {
      if (found) break;
      const progress = fraction + shift, s = spline.sampleAt(Math.round(progress * spline.count));
      for (const side of [1, -1]) {
        if (found) break;
        for (const offset of [48, 58, 68, 80]) {
          const p = s.position.clone().addScaledVector(s.right, side * offset), r = 23;
          if (clearance(p.x, p.z) < r + 17 || [...occupied, ...sites].some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + r + 10)) continue;
          sites.push({ x: p.x, z: p.z, r, progress, angle: Math.atan2(-side * s.right.x, -side * s.right.z) });
          found = true; break;
        }
      }
    }
  }
  const turbine = new THREE.Group(); turbine.name = 'solar-community-turbine'; turbine.userData.roadClearanceVerified = true;
  const base = kit(turbine);
  const plinth = new THREE.CylinderGeometry(3.4, 4.5, .9, 24);
  const tower = new THREE.CylinderGeometry(1.05, 2.1, 44, 20);
  const nacelle = new THREE.CapsuleGeometry(1.55, 3.8, 6, 16); nacelle.rotateX(Math.PI / 2);
  const ring = new THREE.TorusGeometry(1, .04, 5, 32);
  const hub = new THREE.SphereGeometry(1, 16, 10);
  base.add(plinth, stone, [0, .45, 0]);
  base.add(tower, ivory, [0, 22.7, 0]);
  base.add(nacelle, ivory, [0, 45, -.9]);
  // Service access, tower seams and generator cooling vents establish utility scale.
  base.block(green, [0, 2, 2.06], [1.05, 2.5, .14]);
  for (const y of [14, 29, 43]) {
    const radius = 2.1 - (y - .7) / 44 * 1.05;
    base.add(ring, stone, [0, y, 0], [radius + .025, radius + .025, 1.2], [Math.PI / 2, 0, 0]);
  }
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++)
    base.block(green, [side * 1.53, 45, -2.3 + k * .48], [.07, 1, .15]);
  base.block(green, [0, 46.65, -1.4], [.13, .65, .13]);
  base.block(stone, [0, 46.95, -1.4], [1.2, .1, .1]);
  base.finish();
  const rotor = new THREE.Group(); rotor.name = 'solar-turbine-rotor'; rotor.position.set(0, 45, 3.1); turbine.add(rotor);
  const blades = kit(rotor);
  // Tapered, swept airfoil sections with root twist: a generator rotor, not framed sails.
  const sections = [[1.1, .28, .24, 0], [2.7, .75, .21, .15], [5, 1.05, .16, .35],
    [9, .83, .12, .22], [14, .53, .08, -.05], [18, .28, .045, -.35], [21, .025, .015, -.65]];
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const segments = 12;
  for (let row = 0; row < sections.length; row++) {
    const [y, halfChord, thickness, sweep] = sections[row], twist = .30 * (1 - y / 21);
    for (let k = 0; k <= segments; k++) {
      const angle = k / segments * Math.PI * 2;
      const x = Math.cos(angle) * halfChord, z = Math.sin(angle) * thickness;
      positions.push(sweep + x * Math.cos(twist) - z * Math.sin(twist), y, x * Math.sin(twist) + z * Math.cos(twist));
      uvs.push(k / segments, y / 21);
      if (row > 0 && k < segments) {
        const n = row * (segments + 1) + k, prev = n - segments - 1;
        indices.push(prev, n, prev + 1, prev + 1, n, n + 1);
      }
    }
  }
  const blade = new THREE.BufferGeometry(); blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); blade.setIndex(indices); blade.computeVertexNormals();
  for (let k = 0; k < 3; k++) blades.add(blade, ivory, [0, 0, 0], [1, 1, 1], [0, 0, k * Math.PI * 2 / 3]);
  blades.add(hub, ivory, [0, 0, .5], [1.55, 1.55, 2.1]); blades.finish();
  rotor.userData.bladeCount = 3;
  const turbines = sites.map((site, index) => {
    const root = turbine.clone(true); root.position.set(site.x, 0, site.z); root.rotation.y = site.angle;
    root.userData.site = site; root.userData.phase = index * .8; group.add(root); return root;
  });

  // A ribbed, tapered envelope, cruciform tail and suspended cabin read as a zeppelin.
  const ship = new THREE.Group(); ship.name = 'solar-zeppelin'; ship.userData.intentionalOverpass = true;
  const hullPoints = [new THREE.Vector2(0, -48), new THREE.Vector2(4, -44), new THREE.Vector2(8.8, -34), new THREE.Vector2(11.4, -20), new THREE.Vector2(12.3, 0), new THREE.Vector2(11.8, 18), new THREE.Vector2(9.3, 33), new THREE.Vector2(5.6, 43), new THREE.Vector2(0, 49)];
  const smoothProfile = new THREE.SplineCurve(hullPoints).getPoints(64);
  const envelope = new THREE.LatheGeometry(smoothProfile, 48); envelope.rotateZ(-Math.PI / 2);
  const body = kit(ship); body.add(envelope, ivory, [0, 0, 0]);
  for (const x of [-32, -20, 0, 20, 33]) {
    const radius = x === 0 ? 12.4 : Math.abs(x) === 20 ? 11.7 : 9.45;
    body.add(ring, copper, [x, 0, 0], [radius, radius, 2], [0, Math.PI / 2, 0]);
  }
  const finShape = new THREE.Shape(); finShape.moveTo(-43, 3); finShape.lineTo(-46, 19); finShape.quadraticCurveTo(-42, 21, -32, 7); finShape.lineTo(-26, 4); finShape.closePath();
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: .35, bevelEnabled: false });
  for (let k = 0; k < 4; k++) body.add(fin, green, [0, 0, 0], [1, 1, 1], [k * Math.PI / 2, 0, 0]);
  body.block(copper, [0, -12.1, 0], [29, .8, 4.8]);
  const cabin = new THREE.CapsuleGeometry(2.2, 19, 4, 12); cabin.rotateZ(Math.PI / 2);
  body.add(cabin, green, [0, -14.6, 0], [1, 1, 1.05]);
  for (const side of [-1, 1]) for (let x = -9; x <= 9; x += 3) {
    body.block(glass, [x, -14.4, side * 2.12], [2.35, 1.4, .16]);
    body.block(copper, [x, -15.3, side * 2.2], [2.55, .12, .2]);
  }
  // Conforming strips keep panels and branding attached to the curved envelope.
  const strip = (x0: number, x1: number, a0: number, a1: number) => {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 24; i++) for (let j = 0; j <= 4; j++) {
      const x = THREE.MathUtils.lerp(x0, x1, i / 24);
      const upper = smoothProfile.findIndex(point => point.y >= x);
      const lo = smoothProfile[Math.max(0, upper - 1)], hi = smoothProfile[Math.max(1, upper)];
      const radius = THREE.MathUtils.lerp(lo.x, hi.x, (x - lo.y) / (hi.y - lo.y)) + .28;
      const a = THREE.MathUtils.lerp(a0, a1, j / 4);
      positions.push(x, Math.sin(a) * radius, Math.cos(a) * radius); uv.push(i / 24, j / 4);
      if (i < 24 && j < 4) { const n = i * 5 + j; indices.push(n, n + 5, n + 1, n + 1, n + 5, n + 6); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
  };
  const banner = strip(-26, 26, -.23, .23), topPanels = strip(-29, 29, .95, 2.19);
  body.add(banner, sign, [0, 0, 0]); body.add(banner, sign, [0, 0, 0], [1, 1, 1], [0, Math.PI, 0]); body.add(topPanels, panels, [0, 0, 0]);
  for (const side of [-1, 1]) {
    body.block(copper, [-9, -12, side * 5], [.45, .45, 7]); body.add(hub, green, [-9, -12, side * 8.5], [3, 1.3, 1.3]);
    const prop = new THREE.Group(); prop.name = 'solar-zeppelin-propeller'; prop.position.set(-5.7, -12, side * 8.5); ship.add(prop);
    const propKit = kit(prop);
    for (let k = 0; k < 3; k++) propKit.block(copper, [0, Math.cos(k * Math.PI * 2 / 3) * 1.6, Math.sin(k * Math.PI * 2 / 3) * 1.6], [.18, 3.2, .45], [k * Math.PI * 2 / 3, 0, 0]);
    propKit.add(hub, green, [0, 0, 0], [.5, .5, .5]); propKit.finish(false);
  }
  body.finish(false);
  const ships = [.182, .46, .79].map((progress, index) => {
    const s = spline.sampleAt(Math.round(progress * spline.count));
    // Ahead of the approach view, rather than directly overhead and outside the chase FOV.
    const anchor = s.position.clone().addScaledVector(s.tangent, 650).addScaledVector(s.right, index % 2 ? -45 : 45);
    const root = ship.clone(true); root.userData.anchor = { x: anchor.x, z: anchor.z, y: 194 + index * 18 };
    root.userData.progress = progress; root.userData.phase = index * 2.1;
    root.userData.heading = Math.atan2(-s.tangent.z, s.tangent.x) + Math.PI / 2; group.add(root); return root;
  });
  // Temporary source primitives are copied into the shared merged meshes above.
  for (const geo of [box, plinth, tower, nacelle, ring, blade, hub, envelope, fin, cabin, banner, topPanels]) geo.dispose();
  const update = (seconds: number) => {
    for (const root of turbines) root.getObjectByName('solar-turbine-rotor')!.rotation.z = seconds * .42 + root.userData.phase;
    for (const root of ships) {
      const a = root.userData.anchor, phase = seconds * .009 + root.userData.phase;
      root.position.set(a.x + Math.sin(phase) * 55, a.y + Math.sin(phase * 1.7) * 1.8, a.z + Math.cos(phase) * 24);
      root.rotation.set(0, root.userData.heading + Math.sin(phase) * .1, Math.sin(phase * 1.3) * .015);
      root.traverse(child => { if (child.name === 'solar-zeppelin-propeller') child.rotation.x = seconds * 9; });
    }
  };
  update(0);
  return { group, sites, update, dispose: () => textures.forEach(texture => texture.dispose()) };
}
