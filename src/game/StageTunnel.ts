import * as THREE from 'three';
import type { TrackBuilder } from './track/TrackBuilder';
import { NEON_TUNNEL } from './track/NeonProfile';

/** The District underpass keeps its authored clearance, with architecture from its stage. */
export function createStageTunnel(builder: TrackBuilder) {
  const steam = builder.spline.circuit.stage === 'steampunk';
  const group = new THREE.Group(); group.name = 'neon-transit-tunnel';
  group.userData.intentionalOverpass = true; group.userData.clearance = NEON_TUNNEL.clearance;
  group.userData.stage = builder.spline.circuit.stage;
  const wall = new THREE.MeshStandardMaterial({ color: steam ? 0x84705a : 0xd9d5bc, roughness: .88, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: steam ? 0x3f493f : 0x6b8275, roughness: .65, metalness: .35 });
  const copper = new THREE.MeshStandardMaterial({ color: steam ? 0xb78a50 : 0xc6d6af, metalness: .45, roughness: .5 });
  const leaves = new THREE.MeshStandardMaterial({ color: 0x527c3a, roughness: .95 });
  const lamp = new THREE.MeshStandardMaterial({ color: steam ? 0xffd79b : 0xe3efd7, emissive: steam ? 0xe7b45e : 0xc0dab5, emissiveIntensity: .6 });
  const first = Math.ceil(NEON_TUNNEL.start * builder.spline.count), last = Math.floor(NEON_TUNNEL.end * builder.spline.count);
  const section = [[-13.8,-.25],[-13.8,8.2],[13.8,8.2],[13.8,-.25],[12.55,-.25],[12.55,7.2],[-12.55,7.2],[-12.55,-.25]];
  const positions: number[] = [], indices: number[] = [];
  for (let i = first; i <= last; i++) {
    const sample = builder.spline.sampleAt(i);
    for (const [x,y] of section) { const p = sample.position.clone().addScaledVector(sample.right,x).addScaledVector(sample.normal,y); positions.push(p.x,p.y,p.z); }
    if (i > first) for (let j = 0; j < section.length; j++) {
      const a = (i-first-1)*section.length+j, b = (i-first-1)*section.length+(j+1)%section.length;
      indices.push(a,a+section.length,b,b,a+section.length,b+section.length);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geo.setIndex(indices); geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo,wall); shell.name = 'neon-tunnel-shell'; shell.castShadow = shell.receiveShadow = true; group.add(shell);
  const box = new THREE.BoxGeometry(1,1,1), batches = new Map<THREE.Material,THREE.Matrix4[]>(), dummy = new THREE.Object3D(), basis = new THREE.Matrix4();
  const part = (i: number, mat: THREE.Material, x: number, y: number, w: number, h: number, d: number) => {
    const s = builder.spline.sampleAt(i); basis.makeBasis(s.right,s.normal,s.tangent.clone().negate());
    dummy.quaternion.setFromRotationMatrix(basis); dummy.position.copy(s.position).addScaledVector(s.right,x).addScaledVector(s.normal,y); dummy.scale.set(w,h,d); dummy.updateMatrix();
    const batch = batches.get(mat) ?? []; batch.push(dummy.matrix.clone()); batches.set(mat,batch);
  };
  const stepLength = builder.spline.length / builder.spline.count;
  for (let i = first; i <= last; i += 3) {
    for (const side of [-1,1]) {
      part(i,trim,side*8,7.04,1.2,.2,3.4); part(i,lamp,side*8,6.91,.6,.08,2.8);
      part(i,copper,side*12.4,1.5,.12,.16,1.4);
      // Patinated service mains in the foundry; a continuous planted roof in the garden city.
      if (steam) {
        part(i,copper,side*10.8,6.75,.4,.4,stepLength*3+.08);
        part(i,trim,side*10.8,6.75,.55,.55,.16);
      } else {
        part(i,trim,side*12.9,8.5,1.5,.6,stepLength*3+.08);
        part(i,leaves,side*12.9,9.05,1.35,.6,stepLength*3+.08);
      }
    }
    if ((i-first)%9 === 0) {
      part(i,trim,0,7.08,25,.2,.4);
      for (const side of [-1,1]) part(i,trim,side*12.45,3.5,.2,7,.4);
    }
  }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const c = canvas.getContext('2d')!; c.fillStyle = steam ? '#29342e' : '#365244'; c.fillRect(0,0,1024,128);
  c.fillStyle = steam ? '#e1bb7f' : '#e4edc8'; c.font = 'bold 57px Georgia'; c.textAlign = 'center'; c.fillText(steam ? 'FOUNDRY PASSAGE' : 'GARDEN UNDERPASS',512,79);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map,roughness:.8,side:THREE.DoubleSide });
  const portal = new THREE.ShapeGeometry(new THREE.Shape(section.map(([x,y])=>new THREE.Vector2(x,y))));
  for (const i of [first,last]) {
    const s = builder.spline.sampleAt(i); basis.makeBasis(s.right,s.normal,s.tangent.clone().negate());
    const cap = new THREE.Mesh(portal,wall); cap.position.copy(s.position); cap.quaternion.setFromRotationMatrix(basis); group.add(cap);
    part(i,trim,0,8,28.8,1.3,1.4);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(19,2.4),signMat); sign.position.copy(s.position).addScaledVector(s.normal,9.3); sign.quaternion.setFromRotationMatrix(basis); group.add(sign);
    for (const side of [-1,1]) { part(i,trim,side*13.3,4,1.2,8,1.5); part(i,copper,side*10,9.1,.2,2,.2); }
  }
  for (const [mat,matrices] of batches) {
    const mesh = new THREE.InstancedMesh(box,mat,matrices.length); matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.userData.preserveAuthoredElevation = true; mesh.castShadow = mat !== lamp; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
  }
  return { group, dispose: () => map.dispose() };
}
