import * as THREE from 'three';
import type { MaterialLibrary } from './Materials';
import type { TrackBuilder } from './track/TrackBuilder';

/** Continuous flyover structure beneath the road and its elevated pavements. */
export function createKairoCityBridge(builder: TrackBuilder, materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'kairo-loop-flyover';
  group.userData.intentionalOverpass = true;
  const vertices: number[] = [], indices: number[] = [], uvs: number[] = [];
  const first = Math.floor(.807 * builder.spline.count), last = Math.ceil(.891 * builder.spline.count);
  for (let i = first; i <= last; i++) {
    const sample = builder.spline.sampleAt(i);
    for (const depth of [.12, 1.1]) for (const side of [-1, 1]) {
      const p = sample.position.clone().addScaledVector(sample.right, side * 18);
      vertices.push(p.x, p.y - depth, p.z);
      uvs.push((side + 1) * 3, sample.distance / 6);
    }
    if (i === first) continue;
    const a = (i - first - 1) * 4, b = a + 4;
    indices.push(a, a + 1, b, a + 1, b + 1, b,
      a + 2, b + 2, a + 3, a + 3, b + 2, b + 3,
      a, b, a + 2, a + 2, b, b + 2,
      a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const deck = new THREE.Mesh(geometry, materials.concrete);
  deck.name = 'kairo-flyover-deck'; deck.castShadow = true; deck.receiveShadow = true;
  group.add(deck);

  // Split piers stay outside the upper racing walls AND every lower-road lane.
  const pierGeometry = new THREE.BoxGeometry(2, 1, 3);
  for (let i = first + 5; i < last; i += 10) {
    const sample = builder.spline.sampleAt(i);
    const height = sample.position.y - 1.1;
    if (height < 1) continue;
    for (const side of [-1, 1]) {
      const foot = sample.position.clone().addScaledVector(sample.right, side * 16);
      if (builder.distanceToTrack(foot.x, foot.z) < 14) continue;
      const pier = new THREE.Mesh(pierGeometry, materials.darkMetal);
      pier.name = 'kairo-flyover-pier';
      pier.position.set(foot.x, height / 2, foot.z);
      pier.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      pier.scale.y = height; pier.castShadow = true; pier.receiveShadow = true;
      group.add(pier);
    }
  }
  addUnderpassDetail(group, builder, first, last);
  return group;
}

/** Repeated structural and service parts share seven instanced draw calls. */
function addUnderpassDetail(group: THREE.Group, builder: TrackBuilder, first: number, last: number) {
  const steel = new THREE.MeshStandardMaterial({color:0x40535b, roughness:.65, metalness:.65});
  const trim = new THREE.MeshStandardMaterial({color:0x728086, roughness:.48, metalness:.7});
  const recess = new THREE.MeshStandardMaterial({color:0x1b2b33, roughness:.88, metalness:.25});
  const copper = new THREE.MeshStandardMaterial({color:0x93694b, roughness:.65, metalness:.6});
  const amber = new THREE.MeshStandardMaterial({color:0xd9953a, roughness:.7, metalness:.2});
  const light = new THREE.MeshStandardMaterial({color:0xffdda2, emissive:0xffb756, emissiveIntensity:3, roughness:.4});
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pipe = new THREE.CylinderGeometry(1, 1, 1, 8);
  pipe.rotateX(Math.PI / 2);
  const batches = [
    {name:'steel-ribs', material:steel, geometry:box, matrices:[] as THREE.Matrix4[]},
    {name:'girder-flanges', material:trim, geometry:box, matrices:[] as THREE.Matrix4[]},
    {name:'recessed-panels', material:recess, geometry:box, matrices:[] as THREE.Matrix4[]},
    {name:'service-pipes', material:copper, geometry:pipe, matrices:[] as THREE.Matrix4[]},
    {name:'hazard-markers', material:amber, geometry:box, matrices:[] as THREE.Matrix4[]},
    {name:'maintenance-lights', material:light, geometry:box, matrices:[] as THREE.Matrix4[]},
    {name:'pipe-collars', material:trim, geometry:pipe, matrices:[] as THREE.Matrix4[]},
  ];
  const dummy = new THREE.Object3D(), axis = new THREE.Vector3(0, 0, 1);
  const part = (slot:number, index:number, x:number, depth:number, z:number, w:number, h:number, d:number) => {
    const s = builder.spline.sampleAt(index);
    dummy.position.copy(s.position).addScaledVector(s.right,x).addScaledVector(s.tangent,z);
    dummy.position.y -= depth;
    dummy.rotation.set(0,Math.atan2(s.tangent.x,s.tangent.z),0);
    dummy.scale.set(w,h,d);dummy.updateMatrix();batches[slot].matrices.push(dummy.matrix.clone());
  };
  const span = (slot:number, a:THREE.Vector3, b:THREE.Vector3, w:number, h:number) => {
    const direction = b.clone().sub(a);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(axis,direction.clone().normalize());
    dummy.scale.set(w,h,direction.length()+.03);dummy.updateMatrix();batches[slot].matrices.push(dummy.matrix.clone());
  };
  let bays = 0;
  for(let i=first;i+2<=last;i+=2){
    const a=builder.spline.sampleAt(i),b=builder.spline.sampleAt(i+2);
    // Keep services above ground on ramps; the crossing retains 6 m of headroom.
    if(Math.min(a.position.y,b.position.y)<4)continue;
    bays++;
    for(const x of [-17.3,-12,-4,4,12,17.3]){
      const p=a.position.clone().addScaledVector(a.right,x),q=b.position.clone().addScaledVector(b.right,x);
      p.y-=1.52;q.y-=1.52;span(0,p,q,.22,.78);
      p.y-=.41;q.y-=.41;span(1,p,q,.85,.14);
    }
    for(const x of [-8,0,8]){
      part(2,i+1,x,1.14,0,7.35,.08,7.2);
      // Short seams and fasteners break up the ceiling into maintainable bays.
      part(1,i+1,x,1.22,0,7.3,.08,.10);
      for(const side of [-1,1])part(1,i+1,x+side*3.4,1.24,2.9,.18,.10,.18);
    }
    for(const x of [-15.3,-14.7,14.7,15.3]){
      const p=a.position.clone().addScaledVector(a.right,x),q=b.position.clone().addScaledVector(b.right,x);
      p.y-=1.48;q.y-=1.48;span(3,p,q,.13,.13);
      part(6,i+1,x,1.48,0,.20,.20,.22);
    }
    // Full-width crossmembers carry inset lamps and their protective housings.
    part(0,i+1,0,1.52,0,35.4,.65,.28);
    part(1,i+1,0,1.88,0,35.4,.12,.65);
    for(const x of [-8,0,8]){
      part(2,i+1,x,1.38,2.2,3.7,.38,.75);
      part(5,i+1,x,1.59,2.2,3.2,.06,.42);
      for(const z of [-.21,.21])part(1,i+1,x,1.65,2.2+z,3.5,.10,.07);
    }
    for(const x of [-16.6,-15.6,15.6,16.6])part(4,i+1,x,1.96,0,.45,.06,.68);
  }
  for(const batch of batches){
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);
    mesh.name=`kairo-underpass-${batch.name}`;
    batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;
    group.add(mesh);
  }
  group.userData.underpass={bays,instancedBatches:batches.length,crossingHeadroom:6,source:'Procedural steel ribs, panel bays and maintenance services'};
}
