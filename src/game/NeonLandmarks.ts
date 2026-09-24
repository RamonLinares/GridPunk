import * as THREE from 'three';
import {createNeonLedMaterial} from './NeonLedSigns';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {TrackBuilder} from './track/TrackBuilder';
import type {NeonAtmosphereLight} from '../systems/NeonAtmospherePass';
import {neonTunnelAt as districtTunnelAt} from './track/NeonProfile';
import {disposeObject3D} from '../utils/dispose';
import type {NeonBillboards} from './NeonBillboards';

interface Placement {x:number;z:number;r:number;angle:number;variant:number;fraction:number;side:number;adIndex:number}
/** Three Blender-authored silhouettes, actual bridge connections and local dressing. */
export function createNeonLandmarks(parent:THREE.Group,builder:TrackBuilder,lights:NeonAtmosphereLight[],billboards:NeonBillboards,reservedSites:readonly {x:number;z:number;r:number}[]=[]){
 const neonTunnelAt = (p: number) => builder.spline.circuitId === 'neon' && districtTunnelAt(p);
 const group=new THREE.Group();group.name='neon-blender-districts';group.userData.sceneryContainer=true;parent.add(group);
 const placements:Placement[]=[],pairs:{fraction:number;left:Placement;right:Placement}[]=[];
 const variants=['exchange','terraces','split-spire'];
 // Entire occupied footprints are checked against every part of the circuit.
 const clear=(x:number,z:number,angle:number)=>{
  if(reservedSites.some(site=>Math.hypot(x-site.x,z-site.z)<site.r+27))return false;
  // The original cylindrical landmark is authored separately from the filler.
  if(Math.hypot(x+92,z+300)<64)return false;
  const co=Math.cos(angle),si=Math.sin(angle);for(let u=-19;u<=19;u+=2)for(let v=-18;v<=18;v+=2)if(builder.distanceToTrack(x+co*u+si*v,z-si*u+co*v)<14.2)return false;return true;
 };
 for(const [district,fraction]of[.026,.081,.123,.208,.445,.52,.597,.693,.803,.915].entries()){
  const s=builder.spline.sampleAt(Math.round(fraction*builder.spline.count));if(neonTunnelAt(fraction))continue;
  const pair:Placement[]=[];
  for(const side of[-1,1]){
   const offset=36,p=s.position.clone().addScaledVector(s.right,side*offset),angle=Math.atan2(-side*s.right.x,-side*s.right.z);
   if(!clear(p.x,p.z,angle)||placements.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<48))continue;
   const place={x:p.x,z:p.z,r:27,angle,variant:(district+(side===1?1:0))%3,fraction,side,adIndex:billboards.pick(p.x,p.z)};placements.push(place);pair.push(place);
  }
  if(pair.length===2)pairs.push({fraction,left:pair[0],right:pair[1]});
 }
 group.userData.placements=placements;group.userData.bridges=pairs.length;group.userData.status='loading';
 const signMaterials:THREE.Material[]=[];
 function textSign(title:string,subtitle:string,color:string,vertical:boolean){
  const c=document.createElement('canvas');c.width=vertical?256:1024;c.height=vertical?1024:256;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#0c1520';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.textAlign='center';
  if(vertical){ctx.font='bold 156px sans-serif';Array.from(title).slice(0,4).forEach((t,i)=>ctx.fillText(t,128,190+i*185));ctx.font='18px monospace';ctx.fillText(subtitle,128,965);}
  else{ctx.font='bold 90px sans-serif';ctx.fillText(title,512,122);ctx.font='26px monospace';ctx.fillStyle='#d3c7bd';ctx.fillText(subtitle,512,190);}
  ctx.fillStyle='#0a142535';for(let y=0;y<c.height;y+=5)ctx.fillRect(0,y,c.width,1);
  const m=createNeonLedMaterial(c,{columns:vertical?40:192,rows:vertical?160:48,intensity:5.2,flipY:false,name:`neon-led-landmark-${title}`});signMaterials.push(m);return m;
 }
 const tall=[textSign('未来都市','LIVE BEYOND / 08','#ff369a',true),textSign('深夜生活','AFTER HOURS','#53dfef',true),textSign('新世界','ANOTHER TOMORROW','#bb85ff',true)];
 const strip=[textSign('KAIRO','EXCHANGE / OPEN ALL NIGHT','#6cd8e9',false),textSign('AFTER HOURS','FOOD • MUSIC • ROOMS','#ef88b3',false),textSign('ORBITAL','CITY TRANSIT / LEVEL 24','#d5c099',false)];
 // Eight different room/curtain masks, selected by UVs authored in Blender.
 const roomCanvas=document.createElement('canvas');roomCanvas.width=1024;roomCanvas.height=512;const rc=roomCanvas.getContext('2d')!;
 for(let tile=0;tile<8;tile++){
  const x=(tile%4)*256,y=Math.floor(tile/4)*256;const g=rc.createLinearGradient(0,y,0,y+256);g.addColorStop(0,'#121212');g.addColorStop(.24,['#777777','#9b9b9b','#555555','#888888'][tile%4]);g.addColorStop(1,'#252525');rc.fillStyle=g;rc.fillRect(x,y,256,256);
  rc.fillStyle='#111';rc.fillRect(x,y,12,256);rc.fillRect(x+244,y,12,256);rc.fillRect(x,y,256,12);rc.fillRect(x,y+244,256,12);
  if(tile%3===0){rc.fillStyle='#16161699';for(let k=0;k<10;k++)rc.fillRect(x+12,y+25+k*20,232,5);}
  else if(tile%3===1){rc.fillStyle='#1b1b1b';rc.fillRect(x+145,y+18,95,225);rc.fillStyle='#444';for(let k=0;k<7;k++)rc.fillRect(x+147+k*13,y+18,3,225);}
  else{rc.fillStyle='#202020';rc.fillRect(x+27,y+150,160,9);rc.fillRect(x+42,y+160,7,64);rc.fillRect(x+157,y+160,7,64);rc.fillRect(x+35,y+90,60,45);}
  rc.fillStyle='#bbb';rc.fillRect(x+27,y+27,100+tile*11,3);
 }
 const roomMap=new THREE.CanvasTexture(roomCanvas);roomMap.colorSpace=THREE.SRGBColorSpace;roomMap.flipY=false;roomMap.anisotropy=4;
 // Fine original wear shared by the imported metal, not a texture per window.
 const weather=document.createElement('canvas');weather.width=weather.height=128;const wc=weather.getContext('2d')!;wc.fillStyle='#bbb';wc.fillRect(0,0,128,128);
 for(let i=0;i<1400;i++){wc.fillStyle=i%3?'#77777725':'#eee8d523';wc.fillRect((i*37)%128,(i*71)%128,1,4+i%19)}
 const wear=new THREE.CanvasTexture(weather);wear.wrapS=wear.wrapT=THREE.RepeatWrapping;wear.repeat.set(3,9);wear.colorSpace=THREE.SRGBColorSpace;
 let disposed=false;const roots:THREE.Group[]=[],assets:THREE.Object3D[]=[],steam:THREE.Sprite[]=[];
 const cableMat=new THREE.MeshStandardMaterial({color:0x132029,roughness:.75});
 const steamCanvas=document.createElement('canvas');steamCanvas.width=steamCanvas.height=128;const sc=steamCanvas.getContext('2d')!,gradient=sc.createRadialGradient(64,64,0,64,64,60);gradient.addColorStop(0,'#d5c5bb55');gradient.addColorStop(.3,'#8ab6c030');gradient.addColorStop(1,'#52748400');sc.fillStyle=gradient;sc.fillRect(0,0,128,128);
 const steamMap=new THREE.CanvasTexture(steamCanvas),steamMat=new THREE.SpriteMaterial({map:steamMap,color:0x95a8ac,transparent:true,opacity:.36,depthWrite:false});
 function dress(p:Placement){
  const co=Math.cos(p.angle),si=Math.sin(p.angle),at=(u:number,y:number,v:number)=>new THREE.Vector3(p.x+co*u+si*v,y,p.z-si*u+co*v);
  lights.push({position:at(0,27,17),radiance:billboards.radiance(p.adIndex)});
  for(let j=0;j<3;j++){const sprite=new THREE.Sprite(steamMat);sprite.name='neon-district-vent-steam';sprite.position.copy(at(-13+j*2,6+j*1.4,17.7));sprite.userData.base=sprite.position.clone();sprite.scale.set(5+j*1.5,9+j*2,1);group.add(sprite);steam.push(sprite);}
 }
 const ready=Promise.all([...variants,'skybridge'].map(name=>new GLTFLoader().loadAsync(`/circuits/neon-models/${name}.glb`))).then(gltfs=>{
  if(disposed){gltfs.forEach(g=>disposeObject3D(g.scene));return;}
  gltfs.forEach((g,index)=>{assets.push(g.scene);g.scene.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;
    const material=m.material as THREE.MeshStandardMaterial;
    if(material.name==='AdPortrait'){m.userData.campaignScreen=true;m.material=billboards.gltfMaterials[0];}else if(material.name==='AdVertical')m.material=tall[index%3];else if(material.name==='AdStrip')m.material=strip[index%3];
    else if(['Armor','Concrete','Copper','Edge'].includes(material.name)){material.map=wear;material.needsUpdate=true;}
    if(material.name==='Warm'||material.name==='Pearl'){material.map=roomMap;material.emissiveMap=roomMap;material.needsUpdate=true;}
    m.castShadow=false;m.receiveShadow=false;
   });});
  // Consolidate the opaque structural pieces once per model. Vertex colour
  // retains separate metal/concrete tones without four draws per placement.
  for(const g of gltfs){
   g.scene.updateMatrixWorld(true);const opaque:THREE.Mesh[]=[];
   g.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&['Armor','Concrete','Copper','Edge'].includes((m.material as THREE.Material).name))opaque.push(m)});
   const pieces=opaque.map(m=>{const geo=m.geometry.clone();geo.applyMatrix4(m.matrixWorld);const colour=(m.material as THREE.MeshStandardMaterial).color;
    const colors=new Float32Array(geo.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=colour.r;colors[i+1]=colour.g;colors[i+2]=colour.b}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));return geo;});
   if(pieces.length){const geometry=mergeGeometries(pieces,false)!;const material=new THREE.MeshStandardMaterial({vertexColors:true,map:wear,roughness:.67,metalness:.38});material.name='BlenderWeatheredStructure';
    const mesh=new THREE.Mesh(geometry,material);mesh.name='neon-blender-structural-shell';g.scene.add(mesh);pieces.forEach(p=>p.dispose());opaque.forEach(m=>{m.removeFromParent();m.geometry.dispose();(m.material as THREE.Material).dispose()});}
  }
  placements.forEach((p,i)=>{const root=gltfs[p.variant].scene.clone(true);root.name=`neon-blender-${variants[p.variant]}-${i}`;root.position.set(p.x,builder.groundAt(p.x,p.z,p.r),p.z);root.rotation.y=p.angle;root.userData.roadClearanceVerified=true;root.userData.campaign=billboards.gltfMaterials[p.adIndex].userData.campaign;root.traverse(o=>{if(o.userData.campaignScreen)(o as THREE.Mesh).material=billboards.gltfMaterials[p.adIndex]});group.add(root);roots.push(root);dress(p);});
  pairs.forEach(({fraction},i)=>{
   const s=builder.spline.sampleAt(Math.round(fraction*builder.spline.count));
   const bridge=gltfs[3].scene.clone(true);bridge.name='neon-building-skybridge';bridge.position.copy(s.position);bridge.position.y=(builder.spline.circuit.terrainFollow?s.position.y:0)+30;bridge.rotation.y=Math.atan2(-s.right.z,s.right.x);bridge.userData.intentionalOverpass=true;group.add(bridge);roots.push(bridge);
   // Both ends penetrate the adjacent building decks; no freestanding pylons.
   for(let wire=0;wire<4;wire++){
    const points=[];for(let k=0;k<=16;k++){const t=k/16;const p=s.position.clone().addScaledVector(s.right,(t-.5)*74).addScaledVector(s.tangent,6+wire*.7);p.y=(builder.spline.circuit.terrainFollow?s.position.y:0)+42+i%3*6-Math.sin(t*Math.PI)*(7+wire*.3);points.push(p);}
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,.045,3,false),cableMat);mesh.name='neon-building-service-cable';mesh.userData.intentionalOverpass=true;group.add(mesh);
   }
  });
  const cables:THREE.Mesh[]=[];group.traverse(o=>{if(o.name==='neon-building-service-cable')cables.push(o as THREE.Mesh)});
  if(cables.length){const geometry=mergeGeometries(cables.map(m=>m.geometry),false)!;const mesh=new THREE.Mesh(geometry,cableMat);mesh.name='neon-building-service-cable';mesh.userData={intentionalOverpass:true,cableCount:cables.length};group.add(mesh);cables.forEach(m=>{m.removeFromParent();m.geometry.dispose()});}
  const vapourMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:steamMap},time:{value:0}},
   vertexShader:`uniform float time;varying vec2 vUv;varying float life;void main(){vUv=uv;vec3 centre=instanceMatrix[3].xyz;float phase=fract(time*.14+centre.x*.13+centre.z*.07);life=sin(phase*3.14159);centre.y+=phase*4.;vec4 view=modelViewMatrix*vec4(centre,1.);view.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*view;}`,
   fragmentShader:`uniform sampler2D map;varying vec2 vUv;varying float life;void main(){vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb*.75,c.a*.36*life);}`});
  const vapour=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),vapourMat,steam.length);vapour.name='neon-district-vent-steam';vapour.userData.plumes=steam.length;
  steam.forEach((s,i)=>{s.updateMatrix();vapour.setMatrixAt(i,s.matrix);s.removeFromParent()});vapour.computeBoundingSphere();if(vapour.boundingSphere)vapour.boundingSphere.radius+=4;group.add(vapour);steam.length=0;steamMat.dispose();
  group.userData.status='ready';group.userData.models=variants;

 });
 return{group,reservations:placements,ready,update(focus:THREE.Vector3|undefined,time:number){
  // Imported detail is only drawn in the near/mid street canyon.
  if(focus)for(const root of roots)root.visible=Math.hypot(root.position.x-focus.x,root.position.z-focus.z)<420;
  const vapour=group.getObjectByName('neon-district-vent-steam') as THREE.Mesh|undefined;if(vapour)(vapour.material as THREE.ShaderMaterial).uniforms.time.value=time;
 },dispose(){disposed=true;assets.forEach(a=>disposeObject3D(a));signMaterials.forEach(m=>{const mm=m as THREE.MeshStandardMaterial;mm.map?.dispose();mm.emissiveMap?.dispose();m.dispose()});wear.dispose();roomMap.dispose();steamMap.dispose();}};
}
