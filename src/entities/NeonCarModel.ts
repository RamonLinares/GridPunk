import * as THREE from 'three';
import {DecalGeometry} from 'three/examples/jsm/geometries/DecalGeometry.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createSteeringWheel} from './SteeringWheel';
import type {CarModel} from './CarModel';
type Livery={primary?:number;secondary?:number;number?:number;accent?:number};
let authored:THREE.Group|undefined;
let pending:Promise<void>|undefined;
/** Neon loads one authored body; the six cars share geometry and vary materials. */
export function preloadNeonCarModel():Promise<void>{
 return pending??=(new GLTFLoader().loadAsync('/cars/neon/k89-r.glb').then(g=>{authored=g.scene;}));
}
function wearTexture(){
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d')!;
 x.fillStyle='#d1d0cc';x.fillRect(0,0,512,512);let seed=1989;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<2800;i++){x.fillStyle=`rgba(18,22,25,${rand()*.12})`;x.fillRect(rand()*512,rand()*512,.5+rand()*1.5,1+rand()*17);}
 for(let i=0;i<45;i++){const px=rand()*512,py=rand()*512,r=10+rand()*50,g=x.createRadialGradient(px,py,1,px,py,r);g.addColorStop(0,'rgba(20,24,28,.12)');g.addColorStop(1,'rgba(20,24,28,0)');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
function industrialLabel(number:number){
 const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d')!;
 x.fillStyle='#c7c7b8';x.font='bold 60px monospace';x.fillText('黒鉄  KUROGANE',24,77);
 x.font='27px monospace';x.fillText(`K89-R / ${String(number).padStart(2,'0')}    都市耐久仕様`,25,128);
 x.font='20px monospace';x.fillText('COOLANT RETURN   •   1989 / REBUILT 2089',25,171);
 x.fillStyle='#ad8f54';x.fillRect(25,192,200,7);x.fillStyle='#d1d0c0';for(let i=0;i<54;i++)x.fillRect(590+i*5,194,i%3?2:3,24);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
export function createNeonCarModel(livery:Livery={}):CarModel{
 if(!authored)throw new Error('Neon body must finish loading before car construction');
 const group=authored.clone(true);group.name='car';group.userData.design='neon-k89-r';
 const number=livery.number??10;
 const palette:Record<number,number>={10:0x86212e,16:0x803e32,4:0x355d60,55:0x9a6d3d,77:0x3e4953,23:0xb5b4a2};
 const wear=wearTexture();const materials=new Map<THREE.Material,THREE.MeshStandardMaterial>();
 let drsFlap:THREE.Object3D|undefined;const brakeLights:THREE.Mesh[]=[];
 group.traverse(o=>{
  if(o.name==='K89_Flap')drsFlap=o;
  if(!(o instanceof THREE.Mesh))return;
  const source=o.material as THREE.MeshStandardMaterial;let mat=materials.get(source);
  if(!mat){mat=source.clone();materials.set(source,mat);
   if(mat.name==='K89_Paint'){mat.color.setHex(palette[number]??palette[10]);mat.map=wear;mat.roughness=.43;}
   if(['K89_Alloy','K89_Carbon','K89_Copper'].includes(mat.name))mat.map=wear;
   // A small two-sided wind deflector at the lip of the open cockpit.
   if(mat.name==='K89_Glass'){mat.side=THREE.DoubleSide;mat.transparent=true;mat.opacity=.68;mat.depthWrite=false;mat.envMapIntensity=.8;}
  }
  o.material=mat;o.castShadow=mat.name!=='K89_Glass';o.receiveShadow=true;
  if(o.name==='K89_BrakeBank')brakeLights.push(o);
 });
 if(!drsFlap||brakeLights.length!==1)throw new Error('Neon body missing animation sockets');
 // Project the technical paint marks onto the compound pod surface, rather than
 // leaving a rectangular card hovering beside it or intersecting its curvature.
 group.updateMatrixWorld(true);
 const pod=group.getObjectByName('K89_Paint') as THREE.Mesh;
 const labelMaterial=new THREE.MeshStandardMaterial({map:industrialLabel(number),transparent:true,alphaTest:.08,depthWrite:false,roughness:.75,polygonOffset:true,polygonOffsetFactor:-2});
 for(const side of[-1,1]){
  const ray=new THREE.Raycaster(new THREE.Vector3(side*2,.46,-.25),new THREE.Vector3(-side,0,0));
  const hit=ray.intersectObject(pod,false)[0];
  if(hit){const geometry=new DecalGeometry(pod,hit.point,new THREE.Euler(0,side*Math.PI/2,0),new THREE.Vector3(.96,.24,.12));const decal=new THREE.Mesh(geometry,labelMaterial);decal.name='k89-conformal-works-marking';group.add(decal);}
 }

 const black=new THREE.MeshStandardMaterial({color:0x0c1318,roughness:.61,metalness:.45});
 const metal=new THREE.MeshStandardMaterial({color:0x667574,map:wear,metalness:.8,roughness:.38});
 const copper=new THREE.MeshStandardMaterial({color:0x896141,metalness:.78,roughness:.45});
 const rubber=new THREE.MeshPhysicalMaterial({color:0x11171a,map:wear,roughness:.46,clearcoat:.22,clearcoatRoughness:.24});
 const add=(geometry:THREE.BufferGeometry,material:THREE.Material,name:string,parent:THREE.Object3D=group)=>{const m=new THREE.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(name:string,size:number[],pos:number[],material:THREE.Material,parent:THREE.Object3D=group)=>{const m=add(new THREE.BoxGeometry(...size as [number,number,number]),material,name,parent);m.position.fromArray(pos);return m;};
 const {group:steeringWheel,updateDisplay}=createSteeringWheel();steeringWheel.position.set(0,.665,.48);group.add(steeringWheel);
 // Driver is recessed into the tub; helmet stays below the rear haunches.
 const helmet=add(new THREE.SphereGeometry(.12,16,12),black,'k89-driver');helmet.position.set(0,.745,-.27);
 const torso=add(new THREE.SphereGeometry(1,12,8),black,'k89-driver-suit');
 torso.scale.set(.15,.15,.22);torso.position.set(0,.51,-.15);
 // Four independent wheel pivots with the same support profile as the Formula car.
 const wheels={} as CarModel['wheels'];
 for(const key of['fl','fr','rl','rr'] as const){
  const front=key[0]==='f',side=key[1]==='l'?-1:1,radius=front?.36:.40,width=front?.42:.50;
  const steer=new THREE.Group(),spin=new THREE.Group();steer.name=`k89-wheel-${key}`;steer.add(spin);steer.position.set(side*(front?.98:1.04),radius,front?1.6:-1.6);group.add(steer);wheels[key]=steer;
  const profile=[new THREE.Vector2(radius*.63,-width/2),new THREE.Vector2(radius*.89,-width/2),new THREE.Vector2(radius*.98,-width*.4),new THREE.Vector2(radius,-width*.25),new THREE.Vector2(radius,width*.25),new THREE.Vector2(radius*.98,width*.4),new THREE.Vector2(radius*.89,width/2),new THREE.Vector2(radius*.63,width/2)];
  const tireGeo=new THREE.LatheGeometry(profile,40);tireGeo.rotateZ(Math.PI/2);add(tireGeo,rubber,'k89-tire',spin);
  const contactPoints=new Float32Array(tireGeo.attributes.position.array);steer.userData={spin,isFront:front,radius,width,contactPoints};
  const rim=add(new THREE.CylinderGeometry(radius*.64,radius*.64,width*1.01,16),black,'k89-rim',spin);rim.rotation.z=Math.PI/2;
  for(const end of[-1,1]){
   const cover=add(new THREE.CylinderGeometry(radius*.60,radius*.60,.018,12),metal,'k89-turbofan-cover',spin);cover.rotation.z=Math.PI/2;cover.position.x=end*(width/2+.009);
   for(let i=0;i<10;i++){const a=i*Math.PI/5;const slit=box('k89-wheel-cooling-slot',[.021,.043,.105],[end*(width/2+.021),Math.cos(a)*radius*.43,Math.sin(a)*radius*.43],black,spin);slit.rotation.x=-a;}
   const nut=add(new THREE.CylinderGeometry(.055,.055,.022,6),copper,'k89-hub-nut',spin);nut.rotation.z=Math.PI/2;nut.position.x=end*(width/2+.023);
  }
 }

 for(const w of Object.values(wheels))batch(w.userData.spin);
 batch(steeringWheel);
 return{group,wheels,steeringWheel,updateDisplay,drsFlap,brakeLights,body:group};
}
function batch(root:THREE.Group,excluded=new Set<THREE.Object3D>()){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map<THREE.Material,THREE.Mesh[]>();
 const walk=(o:THREE.Object3D)=>{if(excluded.has(o))return;if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&!o.material.transparent){const list=buckets.get(o.material)??[];list.push(o);buckets.set(o.material,list);}o.children.forEach(walk);};root.children.forEach(walk);
 for(const [mat,meshes]of buckets){if(meshes.length<2)continue;const copies=meshes.map(m=>{let g=m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld));if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}return g;});const merged=mergeGeometries(copies,false);copies.forEach(g=>g.dispose());if(!merged)continue;
  const m=new THREE.Mesh(merged,mat);m.name=mat.name||'k89-batched-mechanics';m.castShadow=true;m.receiveShadow=true;root.add(m);for(const old of meshes){old.removeFromParent();old.geometry.dispose();}
 }
}
