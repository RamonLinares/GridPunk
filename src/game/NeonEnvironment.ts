import { neonBankAt as districtBankAt, neonTunnelAt as districtTunnelAt, NEON_TUNNEL } from './track/NeonProfile';
import { createKairoVideoBillboard } from './KairoVideoBillboard';
import { createKairoFerrisWheel } from './KairoFerrisWheel';
import { createNeonTunnel } from './NeonTunnel';
import { createNeonAirTraffic } from './NeonAirTraffic';
import {createNeonLedMaterial,updateNeonLedSigns,setNeonLedCinematic} from './NeonLedSigns';
import * as THREE from 'three';
import type { EnvironmentHandles } from './Environment';
import type { TrackBuilder } from './track/TrackBuilder';
import { createCityFacade, createWeatheredConcrete } from './NeonCityMaterials';
import { createNeonStreetLife } from './NeonStreetLife';
import { createWetRoad } from './NeonWetRoad';
import { createNeonHologram } from './NeonHologram';
import { createNeonLandmarks } from './NeonLandmarks';
import { createNeonBillboards } from './NeonBillboards';
import { createNeonArchitecture } from './NeonArchitecture';
import { createNeonShopfronts } from './NeonShopfronts';
import type { NeonAtmosphereLight } from '../systems/NeonAtmospherePass';
import { SunLighting } from '../systems/SunLighting';

// Original procedural city geometry and surfaces, with an original generated
// advertising atlas. Seeded placement keeps clearance and views reproducible.
export function createNeonEnvironment(scene: THREE.Scene, builder: TrackBuilder, camera: THREE.PerspectiveCamera): EnvironmentHandles {
 const neonTunnelAt = (p: number) => builder.spline.circuitId === 'neon' && districtTunnelAt(p);
 const neonBankAt = (p: number) => builder.spline.circuitId === 'neon' ? districtBankAt(p) : (builder.spline.circuit.surfaceLiftAt?.(p) ?? 0);
  const group = new THREE.Group(); group.name = 'neon-city'; scene.add(group); scene.userData.neon = true;
  group.userData.sceneryContainer = true;
  const atmosphereLights: NeonAtmosphereLight[] = [];
  scene.userData.neonAtmosphereLights = atmosphereLights;
  const billboards=createNeonBillboards();
  const videoBillboard=builder.spline.circuitId==='kairo'?createKairoVideoBillboard(group,atmosphereLights,builder):undefined;
  const wheel=builder.spline.circuitId === 'kairo' ? createKairoFerrisWheel(builder) : undefined;
  if(wheel)group.add(wheel.group);
  const landmarks=createNeonLandmarks(group,builder,atmosphereLights,billboards,[...(wheel?.landmarkReservations??[]),...(videoBillboard?[videoBillboard.reservation]:[])]);
  group.userData.billboards=billboards.placements;
  const shops=createNeonShopfronts(group,builder);
  const architecture=createNeonArchitecture(group);
  const tunnel=builder.spline.circuitId === 'neon' ? createNeonTunnel(builder,atmosphereLights) : undefined;if(tunnel)group.add(tunnel.group);
  const tunnelCache={index:0};
  let seed = 7301;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const box = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const block = (mat: THREE.Material, x:number,y:number,z:number,w:number,h:number,d:number,angle=0) => {
    dummy.position.set(x,y,z); dummy.rotation.set(0,angle,0); dummy.scale.set(w,h,d); dummy.updateMatrix();
    const list = batches.get(mat) ?? []; list.push(dummy.matrix.clone()); batches.set(mat,list);
  };
  const metal = new THREE.MeshStandardMaterial({color:0x38464b,roughness:.65,metalness:.72});
  const concrete = createWeatheredConcrete(rand);
  const plaster = new THREE.MeshStandardMaterial({color:0x6a7778,roughness:.9});
  const black = new THREE.MeshStandardMaterial({color:0x091517,roughness:.6,metalness:.3});
  const glow = [0x77d9e2,0xe34f53,0xeac790,0x8baebd].map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2,roughness:.45}));
  const facades=Array.from({length:5},(_,i)=>createCityFacade(i,rand));
  const signs = [
    ['夜行','NIGHT RUN','#ff388e'],['軌道','ORBITAL TRANSIT','#56efff'],['NEON','DISTRICT 08','#9b8aff'],
    ['未来','AFTER HOURS','#ffba68'],['PULSE','STAY CONNECTED','#fc4292'],['KAIRO','CITY OF TOMORROW','#54f5df'],
    ['2089','THE NIGHT IS YOURS','#92a3ff'],['GRID','NO LIMITS / ALL SIGNAL','#55e8ff'],
  ];
  const signMats=signs.map(([title,subtitle,color],index)=>{
    const c=document.createElement('canvas');c.width=256;c.height=1024;const ctx=c.getContext('2d')!;
    ctx.fillStyle=['#18272b','#222326','#233035'][index%3];ctx.fillRect(0,0,256,1024);
    for(let k=0;k<2400;k++){ctx.fillStyle=rand()>.5?'#7392990a':'#00000018';ctx.fillRect(rand()*256,rand()*1024,1+rand()*6,8+rand()*35);}
    ctx.textAlign='center';ctx.strokeStyle=color;ctx.lineWidth=3;ctx.shadowColor=color;ctx.shadowBlur=10;
    const text=index%2===0?title: ['深夜','通信','食堂','電脳'][Math.floor(index/2)];
    ctx.font='700 155px sans-serif';
    for(let j=0;j<Math.min(text.length,4);j++){ctx.strokeText(text[j],128,200+j*190);ctx.fillStyle=color;ctx.globalAlpha=.65;ctx.fillText(text[j],128,200+j*190);ctx.globalAlpha=1;}
    ctx.shadowBlur=0;ctx.font='18px monospace';ctx.fillStyle='#a8c0bc';ctx.fillText(subtitle,128,945);ctx.fillStyle=color;ctx.fillRect(24,980,208,3);
    return createNeonLedMaterial(c,{columns:40,rows:160,intensity:5.2,name:`neon-led-city-${index}`});
  });
  const plane=new THREE.PlaneGeometry(1,1);
  const displayBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  const artMaterials=billboards.materials;
  const addDisplay=(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,angle:number)=>{
    dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(w,h,1);dummy.updateMatrix();
    if (artMaterials.includes(material as THREE.MeshStandardMaterial)) {
      const tint = billboards.radiance(artMaterials.indexOf(material as THREE.MeshStandardMaterial));
      atmosphereLights.push({position:new THREE.Vector3(x,y,z),radiance:tint});
    }
    const list=displayBatches.get(material)??[];list.push(dummy.matrix.clone());displayBatches.set(material,list);
  };
  const tunnelFootprint=builder.spline.samples.filter(s=>neonTunnelAt(s.index/builder.spline.count));
  const occupied: {x:number;z:number;r:number}[]=[...landmarks.reservations,...(wheel?[wheel.reservation]:[]),...(videoBillboard?[videoBillboard.reservation]:[])];
  const addBuilding=(x:number,z:number,w:number,d:number,h:number,angle:number,near:boolean)=>{
    const radius=Math.hypot(w,d)/2;
    h=Math.min(h,wheel?.buildingHeightLimit(x,z)??Infinity,videoBillboard?.buildingHeightLimit(x,z)??Infinity);
    if(tunnelFootprint.some(s=>Math.hypot(x-s.position.x,z-s.position.z)<radius+23))return;
    if(occupied.some(p=>Math.hypot(x-p.x,z-p.z)<radius+p.r+1))return;
    const co=Math.cos(angle),si=Math.sin(angle);
    if(builder.distanceToTrack(x,z)<radius+16){
      // Check the occupied rectangle, not just its centre. The closer street
      // fronts still leave a walkable pavement behind the racing barrier.
      for(let u=-w/2-1;u<=w/2+3;u+=3)for(let v=-d/2-1;v<=d/2+3;v+=3){
        if(builder.distanceToTrack(x+co*u+si*v,z-si*u+co*v)<14.5)return;
      }
    }
    occupied.push({x,z,r:radius});
    const style=Math.floor(rand()*5),mat=facades[style],ground=builder.groundAt(x,z,radius);
    const local=(material:THREE.Material,u:number,y:number,v:number,sw:number,sh:number,sd:number)=>block(material,x+co*u+si*v,y+ground,z-si*u+co*v,sw,sh,sd,angle);
    local(concrete,0,.25,0,w+1,.5,d+1);
    // Every filler building has authored setbacks or separate shafts. Keep
    // every section inside the footprint already checked against the circuit.
    type Section={u:number;v:number;w:number;d:number;bottom:number;h:number};
    const sections:Section[]=[];
    const tier=(u:number,v:number,sw:number,sd:number,bottom:number,sh:number)=>sections.push({u,v,w:sw,d:sd,bottom,h:sh});
    const podium=near?h*.54:h*.32;
    tier(0,0,w,d,0,podium);
    if(style===0||style===3){
      tier(-w*.2,-d*.12,w*.52,d*.76,podium,h-podium);
      tier(w*.29,-d*.03,w*.36,d*.88,podium,(h-podium)*.68);
    }else if(style===1){
      tier(-w*.12,-d*.13,w*.76,d*.74,podium,(h-podium)*.58);
      tier(-w*.23,-d*.24,w*.54,d*.52,podium+(h-podium)*.58,(h-podium)*.42);
    }else if(style===2){
      tier(w*.12,-d*.12,w*.76,d*.76,podium,h-podium);
      tier(-w*.35,d*.08,w*.16,d*.64,podium,(h-podium)*.42);
    }else{
      tier(w*.16,-d*.1,w*.68,d*.8,podium,(h-podium)*.7);
      tier(w*.26,-d*.22,w*.48,d*.56,podium+(h-podium)*.7,(h-podium)*.3);
    }
    for(const [part,t]of sections.entries()){
      const bottom=part===0&&near?4.2:t.bottom;
      local(mat,t.u,(bottom+t.bottom+t.h)/2,t.v,t.w,t.bottom+t.h-bottom,t.d);
      local(metal,t.u,t.bottom+t.h+.18,t.v,t.w+.45,.36,t.d+.45);
      // Full galleries on all street fronts; far towers use shared, larger
      // structural bays and service spines rather than thousands of rooms.
      if((near||builder.distanceToTrack(x,z)<150)&&t.h>6&&t.h<100){
        const base=part===0?0:t.bottom-4.5;
        architecture.addBuilding(x+co*t.u+si*t.v,z-si*t.u+co*t.v,t.w,t.d,t.h+(part===0?0:4.5),angle,occupied.length*5+part,base+ground,near?1:2.25);
      }else{
        const pitch=8+style*1.8;
        for(let y=t.bottom+pitch;y<t.bottom+t.h;y+=pitch){
          local(metal,t.u,y,t.v,t.w+1,.5,t.d+1);
          if(Math.round(y/pitch)%3===1)local(black,t.u,y+.7,t.v+t.d/2+.2,t.w,1.1,.5);
        }
        for(const side of[-1,1]){
          local(metal,t.u+side*t.w*.4,t.bottom+t.h/2,t.v+t.d/2+.4,.65,t.h,1.2);
          local(metal,t.u+side*(t.w/2+.3),t.bottom+t.h/2,t.v-t.d*.22,.7,t.h,.85);
        }
        local(black,t.u+t.w*.16,t.bottom+t.h*.5,t.v+t.d/2+.24,t.w*.13,t.h,.5);
      }
      local(metal,t.u-t.w*.23,t.bottom+t.h+1.25,t.v,t.w*.26,2.5,t.d*.3);
      local(black,t.u+t.w*.2,t.bottom+t.h+1,t.v-t.d*.2,t.w*.2,2,t.d*.22);
    }
    local(metal,-w*.2,h+4,-d*.2,.28,8,.28);
    local(glow[1],-w*.2,h+8.1,-d*.2,.24,.2,.24);
    if(near){
      shops.addBuilding(x,z,w,d,angle,occupied.length,mat.userData.groundFloorMaterial,ground);
      local(metal,0,4.3,d/2+1,w, .24,2.6);
      local(plaster,0,4.05,d/2+2.2,w,.65,.18);
      if(occupied.length%2===1&&h>30){
        const ah=Math.min(28,podium*.74),aw=Math.min(w*.65,ah*.55),adY=5+ah/2;
        addDisplay(artMaterials[billboards.pick(x,z)],x+si*(d/2+2.7),adY+ground,z+co*(d/2+2.7),aw,ah,angle);
        local(black,0,adY,d/2+2.35,aw+1.1,ah+1.1,.6);
        for(const side of[-1,1]){
          local(metal,side*(aw/2+.65),adY,d/2+2.5,.7,ah+2,1.1);
          local(metal,0,adY+side*(ah/2+.65),d/2+2.5,aw+2,.7,1.1);
          for(let y=adY-ah/2;y<adY+ah/2;y+=4)local(concrete,side*(aw/2+.75),y,d/2+2.7,.3,.4,1.3);
        }
      }
      // Most signs project perpendicular to the facade, like a real crowded
      // commercial street; an occasional full-height screen is a landmark.
      const display=new THREE.Mesh(plane,signMats[Math.floor(rand()*signMats.length)]);
      const signHeight=Math.min(podium-3,9+rand()*12),signWidth=2.5+rand()*2.5;
      display.position.set(x+co*(-w*.35)+si*(d/2+1.4),5+signHeight/2+ground,z-si*(-w*.35)+co*(d/2+1.4));
      display.rotation.y=angle+(rand()>.4?Math.PI/2:0);display.scale.set(signWidth,signHeight,1);display.updateMatrix();
      const list=displayBatches.get(display.material)??[];list.push(display.matrix.clone());displayBatches.set(display.material,list);
      // Double-sided signage needs actual front/back faces, not mirrored text.
      display.rotateY(Math.PI);display.position.add(new THREE.Vector3(Math.sin(display.rotation.y),0,Math.cos(display.rotation.y)).multiplyScalar(.08));display.updateMatrix();list.push(display.matrix.clone());
      local(metal,-w*.35,5,d/2+1.1,3,.2,3);local(metal,-w*.35,5+signHeight,d/2+1.1,3,.2,3);
    }else if(builder.distanceToTrack(x,z)<220 && occupied.length%2===0){
      const t=sections[1],nearest=builder.spline.nearestSample(new THREE.Vector3(x,0,z),{index:0});
      const facing=Math.round(Math.atan2(nearest.position.x-x,nearest.position.z-z)/(Math.PI/2))*Math.PI/2;
      const side=Math.abs(Math.sin(facing))>.5,faceWidth=side?t.d:t.w;
      const ah=Math.min(54,t.h*.74),aw=Math.min(faceWidth*.66,ah*.5);
      const cx=x+t.u,cz=z+t.v,edge=(side?t.w:t.d)/2+1.1,y=t.bottom+t.h*.52+ground;
      const px=cx+Math.sin(facing)*edge,pz=cz+Math.cos(facing)*edge;
      addDisplay(occupied.length%4===0?artMaterials[billboards.pick(px,pz)]:signMats[occupied.length%signMats.length],px,y,pz,aw,ah,facing);
      block(black,px-Math.sin(facing)*.3,y,pz-Math.cos(facing)*.3,aw+1.4,ah+1.4,.5,facing);
      for(const edgeSide of[-1,1])block(metal,px+Math.cos(facing)*edgeSide*(aw/2+.6),y,pz-Math.sin(facing)*edgeSide*(aw/2+.6),.45,ah+2,1,facing);
    }
  };
  // A cylindrical communications tower breaks the rectangular skyline. Its
  // three unequal drums, projecting floor rings and antenna crown are a
  // recognisable landmark from the opening straight and the western esses.
  occupied.push({x:-92,z:-300,r:34});
  const towerGround=builder.groundAt(-92,-300,34),heroGround=builder.groundAt(-25,-501,26);
  const tower=new THREE.InstancedMesh(new THREE.CylinderGeometry(.5,.5,1,48),facades[3],3);
  const drums=[[64,120,60],[50,80,160],[32,72,236]];
  drums.forEach(([width,height,y],i)=>{dummy.position.set(-92,y+towerGround,-300);dummy.rotation.set(0,0,0);dummy.scale.set(width,height,width);dummy.updateMatrix();tower.setMatrixAt(i,dummy.matrix);});tower.name='neon-orbital-exchange';tower.computeBoundingSphere();group.add(tower);
  const rings=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.012,6,48),metal,44);let ri=0;
  for(let y=6;y<272;y+=7){const radius=y<=120?32.3:y<=200?25.3:16.3;dummy.position.set(-92,y+towerGround,-300);dummy.rotation.set(Math.PI/2,0,0);dummy.scale.setScalar(radius);dummy.updateMatrix();rings.setMatrixAt(ri++,dummy.matrix);}rings.count=ri;rings.name='neon-tower-floor-rings';rings.computeBoundingSphere();group.add(rings);
  block(metal,-92,282+towerGround,-300,.65,24,.65);block(glow[1],-92,294+towerGround,-300,.5,.7,.5);
  // Hero landmark at the end of the opening boulevard, reserved before
  // filling the neighbourhood so its screen is not buried in another tower.
  addBuilding(-25,-501,42,32,135,0,false);
  architecture.addBuilding(-25,-501,42,32,43.2,0,10001,heroGround);
  // Layered crown and side service stacks make the boulevard anchor read as a
  // megastructure even where the central screen falls outside the driving view.
  for(const side of[-1,1]){
    block(metal,-25+side*21,64+heroGround,-485,1.2,126,2.4);
    block(facades[3],-25+side*13,140+side*6+heroGround,-504,13,35,23);
    block(concrete,-25+side*13,158+side*6+heroGround,-504,14,1.2,24);
    block(metal,-25+side*13,174+side*6+heroGround,-504,.45,31,.45);
  }
  block(metal,-25,38+heroGround,-482,44,2.2,5);
  block(metal,-25,110+heroGround,-482,44,1.6,5);
  addDisplay(artMaterials[billboards.pick(-25,-481.4)],-25,74+heroGround,-481.4,34,68,0);
  block(black,-25,74+heroGround,-481.8,35,69,.6);
  // Street-facing fronts follow the entire loop; the footprint guard checks
  // every other part of the circuit too, including the inside of the esses.
  for(let i=0;i<builder.spline.count;i+=7){
    const s=builder.spline.sampleAt(i);
    for(const side of [-1,1]){
      const width=12+rand()*15,depth=15+rand()*14,offset=16+depth/2;
      const p=s.position.clone().addScaledVector(s.right,side*offset);
      const angle=Math.atan2(-side*s.right.x,-side*s.right.z);
      addBuilding(p.x,p.z,width,depth,22+rand()*45,angle,true);
    }
  }
  shops.build();
  const streetLife=createNeonStreetLife(builder,rand);group.add(streetLife);
  const streetLamps=streetLife.userData.lampPositions as THREE.Vector3[];
  // Mid-rise blocks, stepped megatowers and a distant skyline, all with
  // deterministic spacing. One instanced draw per material, not per window.
  const hilly=!!builder.spline.circuit.terrainFollow;
  const cityBounds = new THREE.Box3().setFromPoints(builder.spline.samples.map(s => s.position));
  const minX = builder.spline.circuitId === 'neon' ? -950 : Math.min(-950, Math.floor((cityBounds.min.x - 350) / 68) * 68);
  const maxX = Math.max(950, cityBounds.max.x + 350);
  const minZ = Math.min(-950, cityBounds.min.z - 350), maxZ = Math.max(1000, cityBounds.max.z + 350);
  for(let x=minX;x<=maxX;x+=68)for(let z=minZ;z<=maxZ;z+=68){
    const px=x+(rand()-.5)*20,pz=z+(rand()-.5)*20;
    addBuilding(px,pz,25+rand()*25,25+rand()*25,80+Math.pow(rand(),2)*290,0,false);
  }
  architecture.build();
  group.userData.cityBuildings=occupied.length;
  // Suspended utility cables add a middle-distance silhouette without filling
  // the track corridor with props. Their lowest point is 24 m above the road.
  for(const fraction of [.02,.15,.31,.53,.81,.94]){
    const s=builder.spline.sampleAt(Math.round(fraction*builder.spline.count));
    const cableGroup=new THREE.Group();cableGroup.name='neon-utility-overpass';cableGroup.userData.intentionalOverpass=true;
    for(let wire=0;wire<3;wire++){
      const points=[];for(let k=0;k<=20;k++){const t=k/20;const p=s.position.clone().addScaledVector(s.right,(t-.5)*110).addScaledVector(s.tangent,wire*.65);p.y=(hilly?s.position.y:0)+30-Math.sin(t*Math.PI)*6+wire*.3;points.push(p);}
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x142833}));cableGroup.add(line);
    }group.add(cableGroup);
  }
  // Cinematic tier only: the reference threads sagging utility looms across
  // every street at roof height. One merged line draw, hidden on other tiers.
  const loomPositions:number[]=[];
  for(let i=3;i<builder.spline.count;i+=9){
    const f=i/builder.spline.count;if(neonBankAt(f)>.005||neonTunnelAt(f))continue;
    const s=builder.spline.sampleAt(i),spans=1+Math.floor(rand()*3);
    for(let wire=0;wire<spans;wire++){
      const h=13+rand()*12,sag=2+rand()*3.5,half=17+rand()*6,skew=(rand()-.5)*14,along=(rand()-.5)*6+wire*.5;
      let previous:THREE.Vector3|undefined;
      for(let k=0;k<=16;k++){
        const t=k/16,p=s.position.clone().addScaledVector(s.right,(t-.5)*2*half).addScaledVector(s.tangent,along+(t-.5)*skew);
        p.y=s.position.y+h-Math.sin(t*Math.PI)*sag+wire*.4;
        if(previous)loomPositions.push(previous.x,previous.y,previous.z,p.x,p.y,p.z);
        previous=p;
      }
    }
  }
  const loomGeometry=new THREE.BufferGeometry();loomGeometry.setAttribute('position',new THREE.Float32BufferAttribute(loomPositions,3));
  const looms=new THREE.LineSegments(loomGeometry,new THREE.LineBasicMaterial({color:0x0b151b}));
  looms.name='neon-cinematic-looms';looms.userData.intentionalOverpass=true;looms.visible=false;looms.frustumCulled=false;group.add(looms);
  // Raised, continuous pavement ties shop fronts and street furniture to the
  // road instead of leaving a featureless lot between city and race wall.
  for(const side of[-1,1]){
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let i=0;i<=builder.spline.count;i++){const s=builder.spline.sampleAt(i);for(const offset of[12.4,18]){const p=s.position.clone().addScaledVector(s.right,side*offset);positions.push(p.x,hilly&&offset!==12.4?builder.groundAt(p.x,p.z)+.05:builder.spline.circuit.gradeSeparated?p.y+.025:offset===12.4?p.y+.025:.025,p.z);uvs.push(offset/3,s.distance/3);}if(i){const a=(i-1)*2,b=i*2;indices.push(a,b,a+1,b,b+1,a+1);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();const m=concrete.clone();m.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,m);mesh.name='neon-sidewalk-ground';mesh.receiveShadow=true;group.add(mesh);
  }
  // Practical route studs, not continuous neon rails. The street remains a
  // believable road; its painted edge and braking boards carry navigation.
  for(let i=0;i<builder.spline.count;i+=5){const s=builder.spline.sampleAt(i);for(const side of[-1,1]){const p=s.position.clone().addScaledVector(s.right,side*11.8);block(glow[2],p.x,p.y+1.08,p.z,.24,.06,.35,Math.atan2(s.tangent.x,s.tangent.z));}}
  // Three elevated transit portals have >12 m clearance and supports outside
  // the collision wall. Each is a deliberate landmark, not a track obstacle.
  const trains: {mesh:THREE.Group;center:THREE.Vector3;right:THREE.Vector3;phase:number}[]=[];
  for(const [j,p]of [.065,.405,.73].entries()){
    const s=builder.spline.sampleAt(Math.round(p*builder.spline.count));
    const portal=new THREE.Group();portal.name='neon-transit-overpass';portal.userData.intentionalOverpass=true;
    portal.position.copy(s.position);portal.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);group.add(portal);
    const part=(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{const m=new THREE.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(w,h,d);portal.add(m);};
    part(metal,0,19,0,110,2,7);part(glow[j%2],0,17.9,-3.55,108,.12,.12);
    for(const side of [-1,1]){part(concrete,side*15,8.5,0,2,17,3);part(glow[j%2],side*13.9,8.5,-1.55,.12,16,.1);}
    const train=new THREE.Group();train.name='neon-skytrain';train.userData.intentionalOverpass=true;group.add(train);
    for(let k=0;k<3;k++){const body=new THREE.Mesh(box,metal);body.scale.set(13,3.2,4.2);body.position.x=k*14;train.add(body);const window=new THREE.Mesh(box,glow[0]);window.scale.set(11,1.3,.1);window.position.set(k*14,.4,-2.2);train.add(window);}
    train.rotation.y=portal.rotation.y;trains.push({mesh:train,center:s.position.clone().add(new THREE.Vector3(0,22,0)),right:new THREE.Vector3(Math.cos(portal.rotation.y),0,-Math.sin(portal.rotation.y)),phase:j*.31});
  }
  // Bus shelters, vending machines, lamp posts and service cabinets live on
  // the pavement behind the wall. Keep a minimum 13.2 m road clearance.
  for(let i=4;i<builder.spline.count;i+=13){const s=builder.spline.sampleAt(i),side=(i%2?1:-1),p=s.position.clone().addScaledVector(s.right,side*14.7),angle=Math.atan2(s.tangent.x,s.tangent.z);
    if(builder.distanceToTrack(p.x,p.z)<13.2 || neonBankAt(i/builder.spline.count)>.005 || neonTunnelAt(i/builder.spline.count))continue;
    const g=builder.groundAt(p.x,p.z);
    block(metal,p.x,4.8+g,p.z,.14,9.6,.14);block(metal,p.x,9.5+g,p.z,3,.13,.2,angle);block(glow[2],p.x,9.39+g,p.z,2,.06,.24,angle);
    block(concrete,p.x+1, .65+g,p.z, .7,1.3,.45,angle);
    if(i%3===0){block(black,p.x,1.1+g,p.z+2,1,2.2,.8,angle);block(glow[0],p.x,1.35+g,p.z+2.42,.65,.8,.035,angle);}
  }
  // Small warm pools in the damp air under practical street lighting.
  const hazeCanvas=document.createElement('canvas');hazeCanvas.width=hazeCanvas.height=128;const hc=hazeCanvas.getContext('2d')!;
  const hg=hc.createRadialGradient(64,64,0,64,64,64);hg.addColorStop(0,'#c9e9ea66');hg.addColorStop(.25,'#97c6d030');hg.addColorStop(1,'#52778e00');hc.fillStyle=hg;hc.fillRect(0,0,128,128);
  const hazeMap=new THREE.CanvasTexture(hazeCanvas);
  const steamMaterial=new THREE.SpriteMaterial({map:hazeMap,color:0x819d9b,transparent:true,opacity:.24,depthWrite:false});
  const steam:THREE.Sprite[]=[];
  for(let i=0;i<builder.spline.count;i+=24){if(neonBankAt(i/builder.spline.count)>.005 || neonTunnelAt(i/builder.spline.count))continue;const s=builder.spline.sampleAt(i),p=s.position.clone().addScaledVector(s.right,15);const sprite=new THREE.Sprite(steamMaterial);sprite.name='neon-street-steam';sprite.position.copy(p);sprite.userData.ground=builder.groundAt(p.x,p.z);sprite.position.y=sprite.userData.ground+2.8;sprite.scale.set(9,8,1);group.add(sprite);steam.push(sprite);}
  const rainPositions:number[]=[],rainPhases:number[]=[];
  for(let i=0;i<850;i++){const x=(rand()-.5)*100,z=(rand()-.5)*100,y=rand()*48;rainPositions.push(x,0,z,x+.08,.7+rand()*.6,z);rainPhases.push(y,y);}
  const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rainPositions,3));rainGeometry.setAttribute('aPhase',new THREE.Float32BufferAttribute(rainPhases,1));
  const shelter=Array.from({length:16},(_,i)=>{const s=builder.spline.sampleAt(Math.round(THREE.MathUtils.lerp(NEON_TUNNEL.start,NEON_TUNNEL.end,i/15)*builder.spline.count));return new THREE.Vector2(s.position.x,s.position.z);});
  const rainMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uShelter:{value:shelter},uHasShelter:{value:builder.spline.circuitId === 'neon' ? 1 : 0}},vertexShader:`attribute float aPhase;uniform float uTime;uniform float uHasShelter;uniform vec2 uShelter[16];varying float fade;void main(){vec3 p=position;p.y+=mod(aPhase-uTime*15.,48.);vec4 mv=modelViewMatrix*vec4(p,1.);fade=clamp(1.-length(mv.xyz)/60.,0.,1.);
 vec3 world=(modelMatrix*vec4(p,1.)).xyz;
 if(uHasShelter>.5&&world.y<8.2)for(int i=0;i<15;i++){vec2 d=uShelter[i+1]-uShelter[i];float t=dot(world.xz-uShelter[i],d)/dot(d,d);if(t>=0.&&t<=1.&&length(world.xz-uShelter[i]-d*t)<22.)fade=0.;}
 gl_Position=projectionMatrix*mv;}`,fragmentShader:'varying float fade;void main(){gl_FragColor=vec4(.55,.74,.8,fade*.22);}'});
  const rain=new THREE.LineSegments(rainGeometry,rainMaterial);rain.frustumCulled=false;rain.name='neon-rain';group.add(rain);
  const wetRoad=createWetRoad(builder);group.add(wetRoad);
  for(const[mat,list]of displayBatches){
    const mesh=new THREE.InstancedMesh(plane,mat,list.length);mesh.name='neon-billboard-displays';list.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();group.add(mesh);
  }
  for(const[mat,list]of batches){
    const cells=new Map<string,THREE.Matrix4[]>();
    for(const m of list){const key=Math.floor(m.elements[12]/512)+','+Math.floor(m.elements[14]/512);const cell=cells.get(key)??[];cell.push(m);cells.set(key,cell);}
    for(const cell of cells.values()){
      const mesh=new THREE.InstancedMesh(box,mat,cell.length);mesh.name='neon-city-instanced';
      cell.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.receiveShadow=true;
      // Cull distant neighbourhoods while keeping per-material shared geometry.
      group.add(mesh);
    }
  }
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    vertexShader:'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDir; void main(){vec3 d=normalize(vDir);float h=max(d.y,0.);vec3 c=mix(vec3(.04,.115,.15),vec3(.008,.025,.038),pow(h,.45));float cloud=sin(d.x*16.+sin(d.z*21.))*sin(d.z*15.+d.y*13.);c+=vec3(.009,.015,.025)*smoothstep(.0,1.,cloud)*(1.-h);gl_FragColor=vec4(c,1.); #include <tonemapping_fragment>\n #include <colorspace_fragment>}`.replace(' #include','\n #include')});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(2300,32,20),skyMat);sky.name='neon-sky';sky.frustumCulled=false;group.add(sky);
  const hemisphere=new THREE.HemisphereLight(0x93bbc7,0x283b43,.46);group.add(hemisphere);
  // One near moon-shadow cascade is enough in the emissive night city.
  // Contact shadows already ground every car; distant architecture is unlit.
  const sunLighting=new SunLighting({camera,parent:group,color:0x93bcc9,intensity:.6,sunDirection:new THREE.Vector3(-.3,.8,.4).normalize(),range:150,splits:[],shadowMapSize:1024});
  // Six roaming lights service the nearest street lamps, and each one fades
  // in over the last 45 m of its approach. Two lights that snapped to the two
  // nearest fixtures made every lamp appear to switch on as the car arrived.
  const lampLights=Array.from({length:6},()=>new THREE.PointLight(0xffd2a1,0,38,1.5));group.add(...lampLights);
  const [cyan,pink]=lampLights;
  // Cinematic tier: the flat blue fill leaves the car and its patch of road too
  // dark to read, so a soft cool fill rides above the player like a practical
  // camera light. Off on every other tier.
  const carFill=new THREE.PointLight(0x9fc3e6,0,40,1.6);carFill.name='neon-cinematic-car-fill';carFill.visible=false;group.add(carFill);
  let cinematic=false;
  const airTraffic=createNeonAirTraffic(group,builder);
  const hologram=createNeonHologram(group,atmosphereLights,builder);
  return {group,ready:Promise.all([landmarks.ready,tunnel?.ready]).then(()=>{}),holograms:hologram.audioScene,koiHolograms:hologram.koiAudioScene,billboardAudio:videoBillboard?.audioScene,disposeExtraResources:()=>{wetRoad.getRenderTarget().dispose();hologram.dispose();videoBillboard?.dispose();landmarks.dispose();tunnel?.dispose();billboards.dispose();},sun:sunLighting.sun,sunLighting,sky,
    update(focus,seconds=0){
      updateNeonLedSigns(seconds);
      wheel?.update(seconds);
      const progress=focus?builder.spline.nearestSample(focus,tunnelCache).index/builder.spline.count:0;
      const inTunnel=neonTunnelAt(progress);

      hologram.update(focus);
      videoBillboard?.update(focus);
      landmarks.update(focus,seconds);
      tunnel?.update(focus,seconds);
      shops.update(focus,seconds);
      wetRoad.material.uniforms.uTime.value=seconds;rainMaterial.uniforms.uTime.value=seconds;
      if(focus){rain.position.set(focus.x,hilly?focus.y-6:0,focus.z);}
      steam.forEach((sprite,i)=>{sprite.position.y=(sprite.userData.ground??0)+2.7+Math.sin(seconds*.4+i)*.6;sprite.scale.y=8+Math.sin(seconds*.5+i)*1.5;});
      if(focus){
        sky.position.copy(focus);
        const nearest=streetLamps.map(p=>({p,d:p.distanceToSquared(focus)})).sort((a,b)=>a.d-b.d);
        lampLights.forEach((light,i)=>{
          const lamp=nearest[i];light.position.copy(lamp?.p??focus);
          const reach=lamp?THREE.MathUtils.smoothstep(Math.sqrt(lamp.d),95,140):1;
          light.intensity=inTunnel?0:75*(1-reach)*(cinematic?1.35:1);light.color.setHex(0xffd2a1);
        });
      }
      if(focus && inTunnel){
        const station=Math.round(progress*builder.spline.count/3)*3;
        for(const [lamp,index] of [[cyan,station],[pink,station+3]] as const){
          const s=builder.spline.sampleAt(index);lamp.position.copy(s.position).addScaledVector(s.normal,NEON_TUNNEL.clearance-.5);
        }
      }
      if(inTunnel){
        cyan.color.setHex(0xbbe4ec);pink.color.setHex(0xffd6a2);
        cyan.intensity=24*(cinematic?1.35:1);pink.intensity=18*(cinematic?1.35:1);
      }
      if(focus&&cinematic){carFill.position.set(focus.x,focus.y+7,focus.z);carFill.intensity=inTunnel?40:70;}
      for(const t of trains){const travel=((seconds*12+t.phase*240)%240)-120;t.mesh.position.copy(t.center).addScaledVector(t.right,travel);}
      airTraffic.update(seconds);
    },
    createSkyProbeScene(){const probe=new THREE.Scene();probe.add(new THREE.Mesh(new THREE.SphereGeometry(40,32,16),skyMat));return probe;},
    updateShadows:()=>sunLighting.update(),prepareShadowMaterials:root=>sunLighting.prepareMaterials(root),
    setShadows:enabled=>{sunLighting.setShadows(enabled);wetRoad.visible=enabled;if(scene.fog instanceof THREE.FogExp2&&!scene.userData.neonCinematic)scene.fog.density=enabled?.0022:.0058;},setShadowMapSize:size=>sunLighting.setShadowMapSize(size),updateStandings:()=>{},
    // Neon Signal lighting is nearly flat: ambient #5a95d9 at .22 and one blue
    // architectural fill #689ccf, no key light to speak of. Signs and windows
    // carry the image, with denser street steam and utility looms overhead.
    setCinematic(enabled){
      hemisphere.color.setHex(enabled?0x5a95d9:0x93bbc7);hemisphere.groundColor.setHex(enabled?0x0b1520:0x283b43);hemisphere.intensity=enabled?.36:.46;
      sunLighting.setColor(enabled?0x689ccf:0x93bcc9);sunLighting.setIntensity(enabled?.55:.6);
      steamMaterial.opacity=enabled?.42:.24;
      cinematic=enabled;carFill.visible=enabled;if(!enabled)carFill.intensity=0;
      looms.visible=enabled;
      setNeonLedCinematic(enabled);billboards.setCinematic(enabled);
    },
  };
}
