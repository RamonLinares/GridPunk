import { createWeatheredConcrete } from './NeonCityMaterials';
import * as THREE from 'three';
import type { TrackBuilder } from './track/TrackBuilder';
import { NEON_TUNNEL } from './track/NeonProfile';
import {createNeonTunnelArchitecture} from './NeonTunnelArchitecture';
import type {NeonAtmosphereLight} from '../systems/NeonAtmospherePass';

/** Curved concrete undercroft, with a flat soffit like Monaco's tunnel. */
export function createNeonTunnel(builder: TrackBuilder, lights:NeonAtmosphereLight[]) {
  const group=new THREE.Group();group.name='neon-transit-tunnel';
  group.userData.intentionalOverpass=true;group.userData.clearance=NEON_TUNNEL.clearance;
  const first=Math.ceil(NEON_TUNNEL.start*builder.spline.count),last=Math.floor(NEON_TUNNEL.end*builder.spline.count);
  let seed=2197;
  const stone=createWeatheredConcrete(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
  stone.color.setHex(0x66777b);stone.side=THREE.DoubleSide;
  const trim=new THREE.MeshStandardMaterial({color:0x27363c,roughness:.6,metalness:.35});
  const white=new THREE.MeshStandardMaterial({color:0xbfd5d8,emissive:0xa8d7e4,emissiveIntensity:.65});
  const amber=new THREE.MeshStandardMaterial({color:0xf0b977,emissive:0xf7b665,emissiveIntensity:.45});
  // Closed U-shaped section: thick walls and roof, no floor covering the racing road.
  const cross=[[-13.8,-.25],[-13.8,8.2],[13.8,8.2],[13.8,-.25],[12.55,-.25],[12.55,7.2],[-12.55,7.2],[-12.55,-.25]];
  const points:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=first;i<=last;i++){
    const s=builder.spline.sampleAt(i);
    for(const [x,y] of cross){const p=s.position.clone().addScaledVector(s.right,x).addScaledVector(s.normal,y);points.push(p.x,p.y,p.z);uv.push(x/4+y/4,s.distance/4);}
    if(i>first)for(let j=0;j<cross.length;j++){const a=(i-first-1)*cross.length+j,b=(i-first-1)*cross.length+(j+1)%cross.length,c=a+cross.length,d=b+cross.length;indices.push(a,c,b,b,c,d);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  const shell=new THREE.Mesh(geo,stone);shell.name='neon-tunnel-shell';shell.castShadow=shell.receiveShadow=true;shell.userData.intentionalOverhead=true;shell.userData.roadClearanceVerified=true;group.add(shell);
  const shape=new THREE.Shape(cross.map(([x,y])=>new THREE.Vector2(x,y)));
  const box=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),basis=new THREE.Matrix4();
  const batches=new Map<THREE.Material,THREE.Matrix4[]>();
  const part=(index:number,material:THREE.Material,x:number,y:number,w:number,h:number,d:number,along=0)=>{
    const s=builder.spline.sampleAt(index);basis.makeBasis(s.right,s.normal,s.tangent.clone().negate());
    dummy.quaternion.setFromRotationMatrix(basis);dummy.position.copy(s.position).addScaledVector(s.right,x).addScaledVector(s.normal,y).addScaledVector(s.tangent,along);dummy.scale.set(w,h,d);dummy.updateMatrix();
    const batch=batches.get(material)??[];batch.push(dummy.matrix.clone());batches.set(material,batch);
  };
  for(const index of [first,last]){
    const s=builder.spline.sampleAt(index);basis.makeBasis(s.right,s.normal,s.tangent.clone().negate());
    const cap=new THREE.Mesh(new THREE.ShapeGeometry(shape),stone);cap.position.copy(s.position);cap.quaternion.setFromRotationMatrix(basis);cap.name='neon-tunnel-portal';group.add(cap);
    part(index,trim,0,7.65,27.6,.7,1.2);
    for(const side of[-1,1])part(index,trim,side*13.15,3.5,1.15,7.5,1.2);
  }
  for(const side of[-1,1])part(first,trim,side*7,8.9,.16,1.7,.2);
  for(let i=first;i<=last;i+=5){
    // Two rows of individual lamps, recessed trays and wall reflectors.
    for(const side of[-1,1]){
      part(i,trim,side*8,7.07,1.5,.18,4.2);part(i,white,side*8,6.96,.65,.08,3.6);
      part(i,amber,side*12.42,1.6,.08,.16,1.25);
    }
    if((i-first)%10===0){part(i,trim,0,7.13,25,.12,.22);for(const side of[-1,1])part(i,trim,side*12.48,4.15,.12,5.7,.22);}
  }
  // The road passes through a substantial mixed-use megablock. Its continuous
  // upper floors follow the road, resting directly on the concrete undercroft.
  const facade=stone.clone();facade.color.setHex(0x34464b);
  const volume=(name:string,halfWidth:number,bottom:number,top:number,mat:THREE.Material)=>{
    const positions:number[]=[],coordinates:number[]=[],indices:number[]=[];
    for(let i=first;i<=last;i++){
      const s=builder.spline.sampleAt(i);
      for(const[x,y]of[[-halfWidth,bottom],[-halfWidth,top],[halfWidth,top],[halfWidth,bottom]]){const p=s.position.clone().addScaledVector(s.right,x).addScaledVector(s.tangent,i===first?-(halfWidth-22):i===last?(halfWidth-22):0);positions.push(p.x,p.y+y,p.z);coordinates.push(s.distance/4,y/4);}
      if(i>first)for(let j=0;j<4;j++){const a=(i-first-1)*4+j,b=(i-first-1)*4+(j+1)%4;indices.push(a,a+4,b,b,a+4,b+4);}
    }
    const end=(last-first)*4;indices.push(0,1,2,0,2,3,end,end+2,end+1,end,end+3,end+2);
    for(let i=0;i<indices.length;i+=3)[indices[i],indices[i+2]]=[indices[i+2],indices[i]];
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(coordinates,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.intentionalOverhead=true;group.add(mesh);
  };
  volume('neon-undercity-megablock',22,8.2,42,facade);
  volume('neon-megablock-roof',22.7,42,43,trim);
  // Side arcades carry the upper-floor overhang down to street level.
  for(let i=first;i<=last;i+=5)for(const side of[-1,1])part(i,stone,side*18,4.1,1.4,8.2,2);
  // The load-bearing curved mass stays continuous. Blender supplies its
  // recessed facades, open maintenance decks, pipes and irregular roof plant.
  const architecture=createNeonTunnelArchitecture(group,builder,lights);
  for(const [mat,transforms]of batches){const mesh=new THREE.InstancedMesh(box,mat,transforms.length);transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.name=mat===white||mat===amber?'neon-tunnel-fixtures':'neon-tunnel-structure';mesh.receiveShadow=true;group.add(mesh);}
  return {group,ready:architecture.ready,update:architecture.update,dispose:architecture.dispose};
}
