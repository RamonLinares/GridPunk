import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackBuilder } from './track/TrackBuilder';
import type { NeonAtmosphereLight } from '../systems/NeonAtmospherePass';
import { createWorldVideo } from './WorldVideo';

/** A front-facing media building beyond Turn 1, visible down the opening straight. */
export function createKairoVideoBillboard(parent: THREE.Group, lights: NeonAtmosphereLight[], builder: TrackBuilder) {
  const group = new THREE.Group(); group.name = 'kairo-mars-billboard';
  const forward=builder.spline.sampleAt(0).tangent;
  group.position.set(490,builder.terrainHeightAt(490,620),620);
  group.rotation.y=Math.atan2(-forward.x,-forward.z);
  const co=Math.cos(group.rotation.y),si=Math.sin(group.rotation.y);
  const world=(x:number,y:number,z:number)=>new THREE.Vector3(490+co*x+si*z,group.position.y+y,620-si*x+co*z);
  let clearance=Infinity;
  // Include the entire podium footprint, not only the screen's centre.
  for(let x=-38;x<=38;x+=2)for(let z=-42;z<=2;z+=2){const p=world(x,0,z);clearance=Math.min(clearance,builder.distanceToTrack(p.x,p.z));}
  if(clearance<18)throw new Error('Kairo media building intrudes on the racing corridor');
  const center=world(0,0,-20),reservation={x:center.x,z:center.z,r:62};
  const width=56,height=width*464/688,screenY=30;
  group.userData={roadClearanceVerified:true,roadClearance:clearance,progress:.108,building:{x:center.x,z:center.z,w:68,d:38,h:62,angle:group.rotation.y},screen:{width,height}};
  const material = new THREE.MeshStandardMaterial({color:0x404040,emissive:0xffffff,emissiveIntensity:.95,roughness:.58,metalness:.15});
  material.name = 'kairo-mars-video';
  // A distant screen is a luminous source. Dense street fog must not erase it.
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',THREE.ShaderChunk.fog_fragment.replaceAll('fogDensity','min(fogDensity, 0.001)'));};
  material.customProgramCacheKey=()=>'kairo-mars-fog-v1';
  const media=createWorldVideo('/circuits/kairo-mars.mp4','/circuits/kairo-mars-poster.webp',material,true);
  const backing=new THREE.MeshStandardMaterial({color:0x19252e,roughness:.75,metalness:.4});
  const trim=new THREE.MeshStandardMaterial({color:0x53616c,roughness:.5,metalness:.75});
  const concrete=new THREE.MeshStandardMaterial({color:0x34444e,roughness:.86});
  const glazing=new THREE.MeshStandardMaterial({color:0x20353d,roughness:.28,metalness:.55});
  const windowLight=new THREE.MeshStandardMaterial({color:0xb5c7bd,emissive:0x8bafab,emissiveIntensity:.65,roughness:.55});
  const unitBox=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const box=(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
    dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.updateMatrix();
    const parts=batches.get(mat)??[];parts.push(unitBox.clone().applyMatrix4(dummy.matrix));batches.set(mat,parts);
  };
  // Stepped civic megastructure, with a recessed concourse and a full media facade.
  box(concrete,0,1,-20,76,2,44);box(backing,0,31,-20,68,62,38);
  box(glazing,0,5,-.5,62,8,.5);box(concrete,0,10,1,74,1,5);
  box(backing,-16,68,-23,32,12,30);box(backing,21,65,-25,21,6,25);
  box(trim,-16,75,-23,34,1,32);box(trim,21,69,-25,23,1,27);
  for(const side of [-1,1]) {
    box(concrete,side*32.5,31,0,3,62,4);
    box(trim,side*29,34,0,1,56,1);
    for(let row=0;row<9;row++) {
      box(trim,side*34.3,7+row*6,-20,.7,.45,38);
      for(let bay=0;bay<5;bay++)box((row+bay)%3?glazing:windowLight,side*34.4,8.5+row*6,-5-bay*6,.3,3.2,3.2);
    }
    box(trim,side*24,80,-23,.5,12,.5);
    for(let x=-28;x<=28;x+=7)box(trim,x,5,.1,.5,8,.5);
  }
  box(backing,0,screenY,.25,width+2,height+2,1.5);
  for(const side of [-1,1]) {
    box(trim,side*(width/2+.7),screenY,1.1,.5,height+2,.6);
    box(trim,0,screenY+side*(height/2+.7),1.1,width+2,.5,.6);
    for(const y of [-height*.35,height*.35])box(backing,side*width*.4,screenY+y,-.6,.6,.6,2);
    const horn=new THREE.Mesh(new THREE.CylinderGeometry(.8,.2,1.4,12,1,true),trim);
    horn.name='mars-public-address-horn';horn.rotation.x=Math.PI/2;horn.position.set(side*(width/2-1),screenY-height/2-1.7,1);group.add(horn);
  }
  let index=0;
  for(const [mat,parts]of batches){const mesh=new THREE.Mesh(mergeGeometries(parts)!,mat);mesh.name=`kairo-media-building-${index++}`;group.add(mesh);parts.forEach(p=>p.dispose());}
  unitBox.dispose();
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);screen.name='kairo-mars-video-screen';screen.position.set(0,screenY,1.1);group.add(screen);parent.add(group);
  const position=world(0,screenY,1.1);
  lights.push({position:position.clone(),radiance:new THREE.Vector3(.52,.2,.065)});
  const approach=builder.spline.sampleAt(0).position,dx=position.x-approach.x,dz=position.z-approach.z,span=dx*dx+dz*dz;
  return {
    reservation,
    audioScene:{positions:[position],video:media.video,audioUrl:'/circuits/kairo-mars-megaphone.mp3',gain:.85,range:220,referenceDistance:75},
    buildingHeightLimit(x:number,z:number){const t=((x-approach.x)*dx+(z-approach.z)*dz)/span;return t>.72&&t<1&&Math.hypot(x-approach.x-dx*t,z-approach.z-dz*t)<55?8:Infinity;},
    update(focus?:THREE.Vector3){media.update(!focus||focus.distanceTo(position)<800);},
    dispose(){media.dispose();},
  };
}
