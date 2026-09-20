import * as THREE from 'three';
import {createNeonLedMaterial} from './NeonLedSigns';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {TrackBuilder} from './track/TrackBuilder';
import type {NeonAtmosphereLight} from '../systems/NeonAtmospherePass';
import {NEON_TUNNEL} from './track/NeonProfile';

/** Blender-authored portal and service bays, fitted to the existing curved shell.
 * Merge by material after placement: detail does not imply a draw per fitting. */
export function createNeonTunnelArchitecture(parent:THREE.Group,builder:TrackBuilder,lights:NeonAtmosphereLight[]){
 const group=new THREE.Group();group.name='neon-blender-tunnel';group.userData={status:'loading',intentionalOverpass:true,clearance:7.2};parent.add(group);
 const first=Math.ceil(NEON_TUNNEL.start*builder.spline.count),last=Math.floor(NEON_TUNNEL.end*builder.spline.count);
 const textures:THREE.Texture[]=[],materials=new Map<string,THREE.MeshStandardMaterial>();let disposed=false;
 const texture=(canvas:HTMLCanvasElement,srgb=true)=>{const t=new THREE.CanvasTexture(canvas);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.flipY=false;t.anisotropy=4;textures.push(t);return t;};
 // Original mottled metal, rain streaks, joints and chipped coating. UVs are
 // authored in metres in Blender, so fittings and panels share a sensible scale.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;
 let seed=709;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 ctx.fillStyle='#a9afaa';ctx.fillRect(0,0,512,512);
 for(let i=0;i<16000;i++){ctx.fillStyle=i%3?'#10222d12':'#e1dac318';ctx.fillRect(rand()*512,rand()*512,1+rand()*5,1+rand()*9);}
 for(let i=0;i<120;i++){const x=rand()*512,y=rand()*512,h=30+rand()*200;const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#17212850');g.addColorStop(1,'#17212800');ctx.fillStyle=g;ctx.fillRect(x,y,1+rand()*8,h);}
 const wear=texture(canvas),relief=texture(canvas,false);for(const t of[wear,relief])t.wrapS=t.wrapT=THREE.RepeatWrapping;
 function sign(name:string){
  const c=document.createElement('canvas');c.width=name==='TunnelHeader'?2048:512;c.height=name==='TunnelHeader'?256:1024;const x=c.getContext('2d')!;
  x.fillStyle='#0b1b25';x.fillRect(0,0,c.width,c.height);
  for(let i=0;i<4500;i++){x.fillStyle=i%2?'#44687815':'#010c131c';x.fillRect(rand()*c.width,rand()*c.height,1+rand()*4,rand()*26);}
  x.textAlign='center';x.fillStyle='#64bfdb';
  if(name==='TunnelIdentity'){
   // Original four-part exchange mark, with large readable hierarchy.
   for(const [u,v]of [[0,0],[94,-35],[0,108],[-94,143]]){x.beginPath();x.moveTo(226+u,190+v);x.lineTo(282+u,190+v);x.lineTo(244+u,251+v);x.lineTo(188+u,251+v);x.closePath();x.fill();}
   x.font='600 65px sans-serif';x.fillText('NEXUS',256,530);x.font='24px monospace';
   ['DRIVE A CLEANER','TOMORROW'].forEach((line,i)=>x.fillText(line,256,598+i*40));
   x.fillStyle='#476a78';x.font='16px monospace';x.fillText('URBAN SYSTEMS / 07',256,925);
  }else if(name==='TunnelDistrict'){
   x.font='140px sans-serif';x.fillText('東',256,190);x.fillText('区',256,365);x.font='49px sans-serif';x.fillText('NEON',256,565);x.fillText('DISTRICT',256,634);x.font='23px monospace';x.fillText('SECTOR 07',256,910);
  }else{
   x.font='600 83px sans-serif';x.fillText('GRIDPUNK  ›››',440,140);x.font='45px monospace';x.fillText('A CLEANER TOMORROW',1420,107);x.font='36px sans-serif';x.fillText('より遠くへ',1420,171);
  }
  x.fillStyle='#020b1422';for(let y=0;y<c.height;y+=6)x.fillRect(0,y,c.width,1);
  const material=createNeonLedMaterial(c,{columns:name==='TunnelHeader'?288:name==='TunnelIdentity'?96:48,rows:name==='TunnelHeader'?32:128,intensity:4.2,flipY:false,name:`neon-led-${name}`});textures.push(material.map!,material.emissiveMap!);return material;
 }
 const placements:{kind:number;matrix:THREE.Matrix4}[]=[];
 const at=(index:number,side=0)=>{const s=builder.spline.sampleAt(index);const m=new THREE.Matrix4();
  if(side)m.makeBasis(s.tangent.clone().multiplyScalar(side),s.normal,s.right.clone().multiplyScalar(side));
  else {const direction=index===last?-1:1;m.makeBasis(s.right.clone().multiplyScalar(direction),s.normal,s.tangent.clone().multiplyScalar(-direction));}
  m.setPosition(s.position.clone().addScaledVector(s.right,side*22));return m;
 };
 for(const index of[first,last]){
  const m=at(index);placements.push({kind:0,matrix:m});
  lights.push({position:new THREE.Vector3(-2,27,2.5).applyMatrix4(m),radiance:new THREE.Vector3(.18,.6,.82)});
 }
 // Skip end bays so the wraparound portal has room for its deep returns.
 const startDistance=builder.spline.sampleAt(first).distance,endDistance=builder.spline.sampleAt(last).distance;
 let previous=startDistance+15;
 for(let i=first;i<last;i++){
  const distance=builder.spline.sampleAt(i).distance;
  if(distance<previous||distance>endDistance-16)continue;
  for(const side of[-1,1])placements.push({kind:1,matrix:at(i,side)});previous=distance+18.5;
 }
 group.userData.placements=placements.map(p=>({kind:p.kind,matrix:p.matrix.toArray()}));
 const portals=placements.filter(p=>p.kind===0);
 // Recycle one warm/cool floodlight pair at the nearest portal. No shadow maps
 // and no lights per window/fitting; illumination reveals the authored relief.
 const floods=[new THREE.SpotLight(0xffc993,1200,75,.72,.8,2),new THREE.SpotLight(0x97c7df,900,75,.72,.8,2)];
 floods.forEach(light=>{light.name='neon-tunnel-facade-flood';group.add(light,light.target)});
 const vapourCanvas=document.createElement('canvas');vapourCanvas.width=vapourCanvas.height=128;
 const vc=vapourCanvas.getContext('2d')!,gradient=vc.createRadialGradient(64,64,0,64,64,62);
 gradient.addColorStop(0,'#acc0c65c');gradient.addColorStop(.35,'#91aeb837');gradient.addColorStop(1,'#69858f00');vc.fillStyle=gradient;vc.fillRect(0,0,128,128);
 const vapourMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:texture(vapourCanvas)},time:{value:0}},
  vertexShader:`uniform float time;varying vec2 vUv;varying float life;void main(){vUv=uv;vec3 centre=instanceMatrix[3].xyz;float phase=fract(time*.1+centre.x*.13+centre.z*.07);life=sin(phase*3.14159);centre.y+=phase*5.;vec4 view=modelViewMatrix*vec4(centre,1.);view.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz))*(.6+phase*.6);gl_Position=projectionMatrix*view;}`,
  fragmentShader:`uniform sampler2D map;varying vec2 vUv;varying float life;void main(){vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb*.55,c.a*life*.55);}`});
 const vapour=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),vapourMaterial,8),dummy=new THREE.Object3D();vapour.name='neon-tunnel-vent-steam';
 portals.forEach((p,index)=>{for(let j=0;j<4;j++){dummy.position.set(18+(j%2)*.9,2+j*.7,3);dummy.position.applyMatrix4(p.matrix);dummy.scale.set(3,5,1);dummy.updateMatrix();vapour.setMatrixAt(index*4+j,dummy.matrix)}});
 vapour.computeBoundingSphere();if(vapour.boundingSphere)vapour.boundingSphere.radius+=7;group.add(vapour);
 const ready=Promise.all(['tunnel-portal','tunnel-service-bay'].map(name=>new GLTFLoader().loadAsync(`/circuits/neon-models/${name}.glb`))).then(assets=>{
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),sourceMaterials=new Set<THREE.Material>();
  if(!disposed){
   for(const {kind,matrix}of placements){const asset=assets[kind].scene;asset.updateMatrixWorld(true);
    asset.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;const original=mesh.material as THREE.MeshStandardMaterial;sourceMaterials.add(original);let material=materials.get(original.name);
     if(!material){material=original.name.match(/Identity|District|Header/)?sign(original.name):original.clone();material.name=original.name;
      if(original.name.match(/Armor|Edge|Concrete|Copper/)){material.map=wear;material.bumpMap=relief;material.bumpScale=.065;}
      materials.set(original.name,material);
     }
     const geo=mesh.geometry.clone().applyMatrix4(matrix.clone().multiply(mesh.matrixWorld));
     const list=batches.get(material)??[];list.push(geo);batches.set(material,list);
    });
   }
   let triangles=0;
   for(const [material,pieces]of batches){const geometry=mergeGeometries(pieces,false)!;pieces.forEach(p=>p.dispose());const mesh=new THREE.Mesh(geometry,material);mesh.name=`neon-tunnel-authored-${material.name}`;mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.intentionalOverhead=true;mesh.userData.roadClearanceVerified=true;group.add(mesh);triangles+=(geometry.index?.count??geometry.getAttribute('position').count)/3;}
   group.userData.status='ready';group.userData.triangles=triangles;group.userData.drawCalls=batches.size;group.userData.serviceBays=placements.filter(p=>p.kind===1).length;
  }
  for(const asset of assets)asset.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.geometry.dispose();sourceMaterials.add(m.material as THREE.Material)}});
  sourceMaterials.forEach(m=>m.dispose());
 });
 return {group,ready,update(focus:THREE.Vector3|undefined,time:number){
  vapourMaterial.uniforms.time.value=time;
  let closest=portals[0],distance=Infinity;
  if(focus)for(const p of portals){const d=new THREE.Vector3().setFromMatrixPosition(p.matrix).distanceTo(focus);if(d<distance){distance=d;closest=p}}
  floods.forEach((light,i)=>{const side=i===0?-1:1;light.position.set(side*18,40,8).applyMatrix4(closest.matrix);light.target.position.set(side*8,23,-1).applyMatrix4(closest.matrix);light.intensity=(i===0?1200:900)*THREE.MathUtils.clamp((240-distance)/60,0,1);});
 },dispose(){disposed=true;textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}};
}
