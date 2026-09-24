import * as THREE from 'three';
import type {TrackBuilder} from './track/TrackBuilder';

/** Recessed street-level rooms; shared instanced props and pavement light pools. */
export function createNeonShopfronts(parent: THREE.Group, builder: TrackBuilder) {
  const group = new THREE.Group(); group.name = 'neon-shopfronts'; parent.add(group);
  const box = new THREE.BoxGeometry(1,1,1), plane = new THREE.PlaneGeometry(1,1);
  const dummy = new THREE.Object3D();
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const make = (color:number, emission=0, intensity=0) => new THREE.MeshStandardMaterial({color, emissive:emission, emissiveIntensity:intensity, roughness:.82});
  const frame=make(0x1a292c), timber=make(0x4d3425), counter=make(0x282c2d), stone=make(0x69716b);
  const warmWall=make(0x4b3021,0x8d5025,.8), coolWall=make(0x253d3f,0x387d8d,.55);
  const amber=make(0xcab58c,0xffc47a,2.4), cool=make(0x91adb3,0xa3dee8,1.7);
  const monitor=make(0x1b3e46,0x4fa8b8,.65);
  const products=[make(0x8d4835,0x6d2818,.18),make(0x527067,0x235444,.16),make(0xc0a472,0x7e5b2a,.2)];
  const floors=[make(0x392a21,0x6d4823,.35),make(0x28383a,0x315c67,.24)];
  const fronts:{position:THREE.Vector3;color:THREE.Color;intensity:number}[]=[];
  const pools:{matrix:THREE.Matrix4;color:THREE.Color}[]=[];
  let total=0,litCount=0;
  const hash=(n:number)=>{const a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a)};
  const record=(mat:THREE.Material)=>{dummy.updateMatrix();const b=batches.get(mat)??[];b.push(dummy.matrix.clone());batches.set(mat,b)};
  const addBuilding=(x:number,z:number,w:number,d:number,angle:number,id:number,exterior:THREE.MeshStandardMaterial,ground=0)=>{
    const co=Math.cos(angle),si=Math.sin(angle),front=d/2;
    const at=(u:number,y:number,v:number)=>new THREE.Vector3(x+co*u+si*v,y+ground,z-si*u+co*v);
    const block=(mat:THREE.Material,u:number,y:number,v:number,sx:number,sy:number,sz:number)=>{
      dummy.position.copy(at(u,y,v));dummy.rotation.set(0,angle,0);dummy.scale.set(sx,sy,sz);record(mat);
    };
    // Ground floor is hollow, with solid side/rear walls rather than a facade
    // slab blocking the interior. Visible rooms are 2.4 m deep behind glazing.
    for(const side of[-1,1])block(exterior,side*(w/2-.2),2.225,0,.4,3.95,d);
    block(exterior,0,2.225,-d/2+.2,w,3.95,.4);
    for(let u=-w/2+2,slot=0;u<w/2-1;u+=4.5,slot++){
      const n=id*17+slot*3,lit=hash(n)>.56,kind=Math.floor(hash(n+1)*4),isCool=kind===2;
      total++;if(lit)litCount++;
      const light=isCool?cool:amber,wall=isCool?coolWall:warmWall;
      block(exterior,u+2,2.225,front+.2,.45,3.95,.7);
      block(frame,u,3.92,front+.25,4,.25,.55);
      block(frame,u,.6,front+.25,4,.18,.55);
      if(!lit){
        block(frame,u,2.2,front+.12,3.6,3.1,.2);
        if(hash(n+2)>.3)for(let y=.85;y<3.7;y+=.18)block(stone,u,y,front+.25,3.5,.035,.05);
        else {block(counter,u,1.5,front+.28,3.1,1.3,.04);block(timber,u+.8,2.45,front+.29,.5,.75,.035);}
        continue;
      }
      block(wall,u,2.2,front-2.5,3.6,3.2,.15);
      for(const side of[-1,1])block(wall,u+side*1.78,2.2,front-1.1,.12,3.2,2.8);
      block(floors[isCool?1:0],u,.66,front-1.1,3.6,.12,2.8);
      block(frame,u,3.8,front-1.1,3.6,.12,2.8);
      // Asymmetric entrance and display panes, slim mullions, and a door handle.
      block(frame,u+.75,2.15,front+.34,.075,3,.1);
      block(stone,u+1.05,1.7,front+.41,.04,.45,.035);
      if(kind===1||kind===2)block(light,u-.35,3.63,front-1.2,2.2,.08,.23);
      if(kind===0){ // Noodle bar: counter, stools, bowls and two pendant shades.
        for(const q of[-1.05,0,1.05]){block(frame,u+q,2.5,front-2.38,.7,.9,.04);for(let row=0;row<4;row++)block(stone,u+q,2.22+row*.18,front-2.35,.48,.025,.025);}
        block(timber,u,1.55,front-1.05,3.3,.2,.72);
        block(counter,u,1.05,front-1.12,3.1,.85,.55);
        for(const q of[-1,0,1]){block(timber,u+q,1.13,front-.2,.4,.12,.4);block(frame,u+q,.87,front-.2,.07,.45,.07);block(stone,u+q,1.71,front-1.0,.24,.12,.24);}
        for(const q of[-.9,.8]){block(frame,u+q,3.24,front-1.25,.025,.85,.025);block(timber,u+q,2.92,front-1.25,.43,.22,.4);block(light,u+q,2.8,front-1.25,.31,.025,.28);}
      }else if(kind===1){ // Record/book shop: uneven shelves and display plinth.
        for(let row=0;row<3;row++){
          const y=1.2+row*.72;block(timber,u,y,front-2.25,3.3,.07,.42);
          for(let k=0;k<9;k++)block(products[(k+row)%3],u-1.35+k*.32,y+.24,front-2.17,.23,.32+hash(n+k+row)*.2,.23);
        }
        block(timber,u-.65,1.08,front-.55,1.5,.85,.62);
        block(products[0],u-.65,1.65,front-.55,.8,.5,.07);
      }else if(kind===2){ // Repair shop: workbench and three small lit displays.
        block(stone,u,1.45,front-1.8,3.2,.15,.65);
        for(let k=0;k<3;k++){block(frame,u-1+k,2.15,front-2.25,.8,.65,.1);block(monitor,u-1+k,2.15,front-2.18,.65,.48,.025);block(products[1],u-1+k,1.62,front-1.65,.38,.2,.3);}
        block(counter,u+.95,1.05,front-.45,.65,.8,.5);
      }else{ // Late cafe: banquette, off-centre table and a pendant.
        block(timber,u,1.02,front-1.95,3.1,.65,.65);block(wall,u,1.62,front-2.18,3.1,.65,.18);
        block(timber,u-.3,1.35,front-.8,1.7,.13,.75);block(frame,u-.3,.99,front-.8,.1,.65,.1);
        block(stone,u-.55,1.48,front-.8,.17,.17,.17);
        block(frame,u-.3,3.1,front-.8,.03,1.2,.03);block(light,u-.3,2.56,front-.8,.42,.08,.42);
      }
      // A soft window-shaped wash stays on the pavement behind the race wall.
      let reach=4.5;
      for(let v=.6;v<=4.5;v+=.3){let clear=true;for(const q of[-1.9,0,1.9]){const p=at(u+q,0,front+v);if(builder.distanceToTrack(p.x,p.z)<12.6)clear=false;}if(!clear){reach=Math.max(.5,v-.3);break;}}
      dummy.position.copy(at(u,.045,front+.35+reach/2));// Local +Y points back toward the facade.
      dummy.quaternion.setFromEuler(new THREE.Euler(0,angle,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
      dummy.scale.set(4.6,reach,1);dummy.updateMatrix();
      pools.push({matrix:dummy.matrix.clone(),color:new THREE.Color(isCool?0x83c8d9:0xe5ad6d)});
      fronts.push({position:at(u,2.65,front+.65),color:new THREE.Color(isCool?0x9ddae6:0xffc082),intensity:16+hash(n+2)*8});
    }
  };
  const build=()=>{
    for(const[material,matrices]of batches){const m=new THREE.InstancedMesh(box,material,matrices.length);m.name='neon-shop-interiors';matrices.forEach((v,i)=>m.setMatrixAt(i,v));m.computeBoundingSphere();group.add(m);}
    const spillMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7,
      vertexShader:`varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vColor;void main(){float toward=vUv.y;float width=mix(.49,.34,toward);float edge=1.-smoothstep(width-.12,width,abs(vUv.x-.5));float fade=smoothstep(0.,.9,toward);float bars=1.-.25*exp(-pow((vUv.x-.7)*45.,2.));gl_FragColor=vec4(vColor*.38,edge*fade*bars*.65);}`});
    const spill=new THREE.InstancedMesh(plane,spillMat,pools.length);spill.name='neon-shop-light-spill';spill.renderOrder=1;
    pools.forEach((p,i)=>{spill.setMatrixAt(i,p.matrix);spill.setColorAt(i,p.color)});spill.computeBoundingSphere();group.add(spill);
    group.userData.shopCount=total;group.userData.litShopCount=litCount;
  };
  // Two small local lights share a fixed shader budget. Static washes above
  // keep every lit shop readable; these add real light to nearby passing objects.
  const practicals=Array.from({length:2},()=>{const l=new THREE.PointLight(0xffc082,0,7,2);l.name='neon-shop-practical';group.add(l);return l});
  let nextUpdate=0;
  return {addBuilding,build,update(focus:THREE.Vector3|undefined,time:number){
    if(!focus||time<nextUpdate)return;nextUpdate=time+.3;
    const nearest=fronts.map(f=>({f,d:f.position.distanceToSquared(focus)})).sort((a,b)=>a.d-b.d);
    practicals.forEach((l,i)=>{const p=nearest[i];l.intensity=p&&p.d<900?p.f.intensity:0;if(p){l.position.copy(p.f.position);l.color.copy(p.f.color)}});
  }};
}
