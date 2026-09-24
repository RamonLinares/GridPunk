import { neonBankAt as districtBankAt, neonTunnelAt as districtTunnelAt } from './track/NeonProfile';
import * as THREE from 'three';
import type {TrackBuilder} from './track/TrackBuilder';

/** Human-scale street furniture, commuters and parked delivery scooters. */
export function createNeonStreetLife(builder:TrackBuilder,random:()=>number):THREE.Group {
 const neonTunnelAt = (p: number) => builder.spline.circuitId === 'neon' && districtTunnelAt(p);
 const neonBankAt = (p: number) => builder.spline.circuitId === 'neon' ? districtBankAt(p) : (builder.spline.circuit.surfaceLiftAt?.(p) ?? 0);
 const group=new THREE.Group();group.name='neon-pavement-life';
 const box=new THREE.BoxGeometry(1,1,1),coat=new THREE.CylinderGeometry(.2,.28,1,7),head=new THREE.SphereGeometry(.12,7,5),umbrella=new THREE.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI/2),wheel=new THREE.CylinderGeometry(.22,.22,.1,12);
 const materials=[new THREE.MeshStandardMaterial({color:0x20282b,roughness:.9}),new THREE.MeshStandardMaterial({color:0x74655b,roughness:.86}),new THREE.MeshStandardMaterial({color:0x435f63,roughness:.74}),new THREE.MeshStandardMaterial({color:0x67494b,roughness:.8}),new THREE.MeshStandardMaterial({color:0xa58c76,roughness:.95})];
 const glow=new THREE.MeshStandardMaterial({color:0xff7446,emissive:0xff5427,emissiveIntensity:1.8});
 const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;transforms:THREE.Matrix4[]}>(),o=new THREE.Object3D();
 const part=(g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Vector3,sx:number,sy:number,sz:number,rx=0,ry=0,rz=0)=>{o.position.copy(p);o.rotation.set(rx,ry,rz);o.scale.set(sx,sy,sz);o.updateMatrix();const key=g.uuid+m.uuid,b=batches.get(key)??{geometry:g,material:m,transforms:[]};b.transforms.push(o.matrix.clone());batches.set(key,b);};
 const lampMaterial=new THREE.MeshStandardMaterial({color:0xffe3b3,emissive:0xffce8b,emissiveIntensity:3.4,roughness:.35});
 const lampPositions:THREE.Vector3[]=[];
 for(let i=3;i<builder.spline.count;i+=11){
  if(neonTunnelAt(i/builder.spline.count))continue;
  const s=builder.spline.sampleAt(i),side=i%2?1:-1,base=s.position.clone().addScaledVector(s.right,side*14.8);base.y=builder.spline.circuit.gradeSeparated?s.position.y:builder.groundAt(base.x,base.z);
  if(builder.distanceToTrack(base.x,base.z)<13.8)continue;
  const angle=Math.atan2(s.tangent.x,s.tangent.z);
  const at=(u:number,y:number)=>base.clone().addScaledVector(s.right,u).add(new THREE.Vector3(0,y,0));
  part(box,materials[0],at(0,4.1),.19,8.2,.22,0,angle);
  part(box,materials[2],at(-side*.65,8.15),1.6,.15,.3,0,angle,side*.13);
  part(box,materials[0],at(-side*1.15,8.02),1.65,.22,.6,0,angle);
  // A lantern deep enough to survive the sub-HD wet-road reflection at range;
  // a 4.5 cm strip vanished until the car was almost underneath it.
  const light=at(-side*1.15,7.83);
  part(box,lampMaterial,light,1.5,.16,.48,0,angle);lampPositions.push(light);
  part(box,glow,at(-side*.13,.75),.07,.12,.38,0,angle);
 }
 group.userData.lampPositions=lampPositions;
 for(let i=9;i<builder.spline.count;i+=17){if(neonBankAt(i/builder.spline.count)>.005 || neonTunnelAt(i/builder.spline.count))continue;const s=builder.spline.sampleAt(i),side=i%2?1:-1,base=s.position.clone().addScaledVector(s.right,side*15.7);if(builder.distanceToTrack(base.x,base.z)<14.4)continue;
  const angle=Math.atan2(s.tangent.x,s.tangent.z);
  for(let j=0;j<2+Math.floor(random()*3);j++){
   const p=base.clone().addScaledVector(s.tangent,(j-1)*1.2),m=materials[Math.floor(random()*4)];
   part(coat,m,p.clone().add(new THREE.Vector3(0,.93,0)),1,1,1,0,angle);
   part(head,materials[4],p.clone().add(new THREE.Vector3(0,1.57,0)),1,1,1);
   for(const side of[-1,1]){part(box,materials[0],p.clone().add(new THREE.Vector3(side*.1,.28,0)),.13,.55,.16);part(box,m,p.clone().add(new THREE.Vector3(side*.27,1.1,0)),.13,.58,.15,0,0,side*.1);}
   if(random()>.28){part(umbrella,m,p.clone().add(new THREE.Vector3(0,1.85,0)),.72,.38,.72);part(box,materials[0],p.clone().add(new THREE.Vector3(0,1.52,0)),.025,.7,.025);}
  }
  const p=base.clone().addScaledVector(s.tangent,4);
  // Utility box, bins and a bench remain outside the wall.
  part(box,materials[2],p.clone().add(new THREE.Vector3(0,.6,0)),.8,1.2,.5,0,angle);
  part(box,materials[0],p.clone().add(new THREE.Vector3(1,.4,0)),.5,.8,.5);
  if(i%3===0)for(let j=0;j<3;j++){
   const b=p.clone().addScaledVector(s.tangent,3+j*1.4);
   const at=(x:number,y:number,z:number)=>b.clone().addScaledVector(s.right,x).addScaledVector(s.tangent,z).add(new THREE.Vector3(0,y,0));
   part(wheel,materials[0],at(0,.24,-.57),1,1,1,0,0,Math.PI/2);part(wheel,materials[0],at(0,.24,.57),1,1,1,0,0,Math.PI/2);
   part(box,materials[3],at(0,.52,0),.4,.22,1.1,0,angle);part(box,materials[0],at(0,.76,-.2),.45,.14,.6,0,angle);
   part(box,materials[2],at(0,.75,.45),.22,.65,.15,-.2,angle);part(box,materials[0],at(0,1.06,.48),.65,.06,.1,0,angle);part(box,glow,at(0,.6,-.62),.18,.06,.04,0,angle);
  }
 }
 for(const b of batches.values()){const m=new THREE.InstancedMesh(b.geometry,b.material,b.transforms.length);b.transforms.forEach((t,i)=>m.setMatrixAt(i,t));m.computeBoundingSphere();m.name='neon-pavement-props';group.add(m);}
 return group;
}
