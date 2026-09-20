import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackBuilder } from './track/TrackBuilder';

// Original retro-industrial air taxis, built once and instanced as city traffic.
// +Z is forward. Layered chamfered hulls give them a car silhouette from below.
function hull(sections: number[][]): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  for (const [z, w, bottom, top] of sections) {
    for (const [x, y] of [[-w*.8,bottom],[w*.8,bottom],[w,bottom+.12],
      [w,top-.1],[w*.78,top],[-w*.78,top],[-w,top-.1],[-w,bottom+.12]]) vertices.push(x,y,z);
  }
  for(let s=0;s<sections.length-1;s++)for(let i=0;i<8;i++){
    const a=s*8+i,b=s*8+(i+1)%8,c=b+8,d=a+8;
    indices.push(a,b,d,b,c,d);
  }
  for(let i=1;i<7;i++){indices.push(0,i+1,i);const end=(sections.length-1)*8;indices.push(end,end+i,end+i+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function airframe(cargo: boolean) {
  const parts: THREE.BufferGeometry[][]=Array.from({length:6},()=>[]);
  const add=(slot:number,g:THREE.BufferGeometry,x=0,y=0,z=0,rx=0)=>{
    g.rotateX(rx);g.translate(x,y,z);const flat=g.index?g.toNonIndexed():g;
    flat.deleteAttribute('uv');parts[slot].push(flat);if(flat!==g)g.dispose();
  };
  const box=(slot:number,x:number,y:number,z:number,w:number,h:number,d:number)=>add(slot,new THREE.BoxGeometry(w,h,d),x,y,z);
  add(0,hull([[-2.7,.78,-.25,.26],[-2.15,1.12,-.42,.43],[1.6,1.04,-.34,.28],[2.8,.68,-.12,.08]]));
  add(1,hull([[-2.6,.68,-.44,-.22],[-1.8,.93,-.59,-.31],[1.6,.83,-.48,-.28],[2.5,.54,-.25,-.1]]));
  add(2,hull([[-1.9,.85,.25,.5],[-1.15,.8,.35,cargo?1.35:1.05],[.2,.74,.3,cargo?1.35:1.06],[1.3,.76,.23,.34]]));
  // Separate panoramic windshield, slanted side windows, roof ribs and door seams.
  box(0,0,cargo?1.34:1.05,-.56,1.34,.12,1.52);
  for(const s of [-1,1]){
    const a=new THREE.Vector3(s*.58,cargo?1.35:1.06,.2),b=new THREE.Vector3(s*.59,.34,1.3);
    const pillar=new THREE.CylinderGeometry(.038,.038,a.distanceTo(b),5);
    pillar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));
    const mid=a.add(b).multiplyScalar(.5);add(0,pillar,mid.x,mid.y,mid.z);
    box(1,s*.81,.66,-.73,.055,.7,.085);
    box(1,s*1.06,.13,-.22,.025,.035,2.65);
    box(3,s*.94,.39,-.8,.22,.035,.055);
    // Outboard lift pods: recessed fan, armoured lip, vanes, aft thruster.
    add(0,hull([[-1.9,.38,-.3,.17],[-1.5,.49,-.37,.38],[1.2,.45,-.36,.3],[1.6,.3,-.19,.12]]),s*1.29,0,-.25);
    for(const z of [-1.08,.77]){
      add(3,new THREE.CylinderGeometry(.36,.38,.1,12),s*1.32,-.38,z);
      add(1,new THREE.CylinderGeometry(.29,.29,.12,12),s*1.32,-.44,z);
      add(4,new THREE.CylinderGeometry(.17,.17,.015,12),s*1.32,-.51,z);
      for(let k=-1;k<=1;k++)box(1,s*1.32+k*.1,-.529,z,.035,.025,.42);
    }
    add(3,new THREE.CylinderGeometry(.25,.3,.3,12),s*1.3,-.02,-2.07,Math.PI/2);
    add(4,new THREE.CylinderGeometry(.16,.16,.018,12),s*1.3,-.02,-2.23,Math.PI/2);
    box(3,s*.87,-.63,-.15,.1,.11,3.45);
    for(const z of [-1.3,.9])box(1,s*.87,-.48,z,.12,.4,.13);
    box(4,s*.57,.015,2.62,.39,.12,.05);
    box(5,s*.68,.18,-2.66,.38,.09,.06);
    for(let k=0;k<5;k++)box(1,s*.94,.45,-1.9+k*.12,.35,.035,.05);
    box(3,s*1.15,.31,-.2,.06,.035,1.25);
  }
  box(1,0,.22,1.86,.95,.055,.53);
  box(3,0,.25,1.85,.03,.04,.5);
  if(cargo){box(3,0,1.47,-.65,1.25,.15,1.35);box(5,0,1.57,-.7,.32,.05,.18);}
  else{box(1,-.52,1.28,-1.02,.035,.42,.035);box(5,-.52,1.5,-1.02,.06,.05,.06);}
  return parts.map(p=>{const g=mergeGeometries(p)!;p.forEach(g=>g.dispose());return g;});
}

export function createNeonAirTraffic(parent: THREE.Group, builder: TrackBuilder) {
  const group=new THREE.Group();group.name='neon-air-traffic';group.userData.intentionalOverpass=true;parent.add(group);
  const materials=[
    new THREE.MeshStandardMaterial({color:0xffffff,metalness:.62,roughness:.42}),
    new THREE.MeshStandardMaterial({color:0x101c23,metalness:.65,roughness:.6}),
    new THREE.MeshStandardMaterial({color:0x143742,metalness:.8,roughness:.19,emissive:0x1b5662,emissiveIntensity:.22}),
    new THREE.MeshStandardMaterial({color:0x69777c,metalness:.85,roughness:.36}),
    new THREE.MeshStandardMaterial({color:0xa8d8e2,emissive:0x91d4e8,emissiveIntensity:3.5}),
    new THREE.MeshStandardMaterial({color:0xff7b42,emissive:0xff5528,emissiveIntensity:2.4}),
  ];
  // Three continuous two-way circuits occupy the street's clear air corridor.
  // The tunnel district is deliberately excluded; low lanes pass below the
  // 18m transit decks and high lanes pass above the 30m pedestrian bridges.
  const routes=[ [.015,.245], [.435,.69], [.775,.97] ].map(([start,end])=>{
    const points:THREE.Vector3[]=[];
    for(const side of [1,-1])for(let j=0;j<=48;j++){
      const t=side===1?j/48:1-j/48;
      const s=builder.spline.sampleAt(Math.round((start+(end-start)*t)*builder.spline.count));
      const right=new THREE.Vector3(-s.tangent.z,0,s.tangent.x).normalize();
      const p=s.position.clone().addScaledVector(right,side*4.8);p.y+=12.6;points.push(p);
    }
    const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');curve.arcLengthDivisions=1200;return curve;
  });
  const count=18;
  const batches=[false,true].map(cargo=>airframe(cargo).map((g,m)=>{
    const mesh=new THREE.InstancedMesh(g,materials[m],count/2);mesh.name=`neon-flyer-${cargo?'utility':'coupe'}-${m}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);return mesh;
  }));
  const paint=[0x72878b,0x927b46,0x40516b,0x6c3932,0x647366,0x9c9b8c];
  batches.forEach(batch=>{for(let i=0;i<count/2;i++)batch[0].setColorAt(i,new THREE.Color(paint[i%paint.length]));});
  const dummy=new THREE.Object3D(),position=new THREE.Vector3(),tangent=new THREE.Vector3(),ahead=new THREE.Vector3();
  const lengths=routes.map(r=>r.getLength());
  group.userData.vehicleCount=count;group.userData.routes=routes;
  group.userData.trianglesPerFleet=batches.reduce((sum,b)=>sum+b.reduce((s,m)=>s+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.count,0),0);
  function update(seconds:number){
    for(let i=0;i<count;i++){
      const corridor=i%3,route=routes[corridor],high=Math.floor(i/3)%3===2;
      const u=((i*.173+seconds*(high?14:10)/lengths[corridor])%1+1)%1;
      route.getPointAt(u,position);route.getTangentAt(u,tangent);route.getTangentAt((u+.006)%1,ahead);
      dummy.position.copy(position);dummy.position.y+=(high?27:0)+Math.sin(seconds*.8+i)*.16;
      const turn=tangent.z*ahead.x-tangent.x*ahead.z;
      dummy.rotation.set(-Math.asin(THREE.MathUtils.clamp(tangent.y,-1,1)),Math.atan2(tangent.x,tangent.z),THREE.MathUtils.clamp(-turn*1.8,-.2,.2),'YXZ');
      dummy.scale.setScalar(i%2?1.08:1);dummy.updateMatrix();
      for(const mesh of batches[i%2])mesh.setMatrixAt(Math.floor(i/2),dummy.matrix);
    }
    for(const batch of batches)for(const mesh of batch)mesh.instanceMatrix.needsUpdate=true;
  }
  update(0);
  return {group,update};
}
