import * as THREE from 'three';

/** Street-facing industrial kit. Shared room artwork and instancing keep it cheap. */
export function createNeonArchitecture(parent:THREE.Group) {
  const group=new THREE.Group();group.name='neon-industrial-architecture';parent.add(group);
  const box=new THREE.BoxGeometry(1,1,1),plane=new THREE.PlaneGeometry(1,1);
  const pipe=new THREE.CylinderGeometry(1,1,1,8);
  const batches=new Map<THREE.Material,Map<THREE.BufferGeometry,THREE.Matrix4[]>>();
  const dummy=new THREE.Object3D();
  const metal=new THREE.MeshStandardMaterial({color:0x334248,metalness:.65,roughness:.62});
  const trim=new THREE.MeshStandardMaterial({color:0x536061,metalness:.6,roughness:.54});
  const recess=new THREE.MeshStandardMaterial({color:0x101a20,roughness:.92});
  const copper=new THREE.MeshStandardMaterial({color:0x61524c,metalness:.65,roughness:.7});
  const amber=new THREE.MeshStandardMaterial({color:0xcbb588,emissive:0xffc685,emissiveIntensity:1.4});
  const hash=(n:number)=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v)};
  // Original room art: shaded soffits, shelves, blinds, furniture and warm
  // practicals rather than solid glowing window rectangles.
  const rooms=Array.from({length:4},(_,kind)=>{
    const c=document.createElement('canvas');c.width=512;c.height=320;const ctx=c.getContext('2d')!;
    const lit=kind!==3,cool=kind===2;
    ctx.fillStyle=lit?'#0c1115':'#0a1720';ctx.fillRect(0,0,512,320);
    if(lit){
      const glow=ctx.createLinearGradient(0,20,0,320);glow.addColorStop(0,'#151b1c');glow.addColorStop(.3,cool?'#415f65':'#806e4e');glow.addColorStop(1,cool?'#273c43':'#41362b');ctx.fillStyle=glow;ctx.fillRect(18,18,476,284);
      ctx.fillStyle=cool?'#c3edf0':'#ffe1a1';ctx.fillRect(28,41,310,5);ctx.fillRect(350,41,105,5);
      ctx.fillStyle='#121b1d';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(512,0);ctx.lineTo(474,38);ctx.lineTo(40,38);ctx.fill();
      ctx.fillStyle='#252a29';ctx.fillRect(32,123,145,9);ctx.fillRect(32,208,145,9);
      for(let k=0;k<13;k++){ctx.fillStyle=['#514334','#756453','#3c4543'][k%3];ctx.fillRect(39+k*10,82+hash(k+kind)*15,7,40);}
      ctx.fillStyle='#1c2629';ctx.fillRect(226,207,236,12);ctx.fillRect(249,215,7,70);ctx.fillRect(438,215,7,70);
      ctx.fillStyle='#10242a';ctx.fillRect(324,151,67,46);ctx.fillRect(350,194,9,14);
      ctx.fillStyle=cool?'#55777b':'#617265';ctx.fillRect(329,156,55,33);
      ctx.fillStyle='#202626';ctx.fillRect(254,245,40,14);ctx.fillRect(266,208,25,39);
      if(kind===1){ctx.fillStyle='#a99c7c88';for(let y=54;y<283;y+=9)ctx.fillRect(19,y,310,4);}
      if(kind===0){ctx.fillStyle='#33382ce0';ctx.fillRect(305,49,187,237);for(let x=310;x<490;x+=12){ctx.fillStyle='#72705b30';ctx.fillRect(x,49,3,237);}}
      // Unequal panels catch a little reflected street colour.
      ctx.fillStyle='#718a8f17';ctx.fillRect(192,15,92,285);
    }else{
      const g=ctx.createLinearGradient(0,0,512,320);g.addColorStop(0,'#1a3038');g.addColorStop(.5,'#0b171c');g.addColorStop(1,'#263c42');ctx.fillStyle=g;ctx.fillRect(12,14,488,292);
      ctx.fillStyle='#060e1480';for(let y=30;y<300;y+=17)ctx.fillRect(12,y,488,6);
    }
    ctx.fillStyle='#121c21';for(const x of[0,180,358,502])ctx.fillRect(x,0,10,320);ctx.fillRect(0,304,512,16);
    const shade=ctx.createRadialGradient(256,145,75,256,160,295);shade.addColorStop(0,'#00000000');shade.addColorStop(1,'#000000a0');ctx.fillStyle=shade;ctx.fillRect(0,0,512,320);
    for(let k=0;k<6000;k++){ctx.fillStyle=k%2?'#e8d6a90b':'#00000014';ctx.fillRect(hash(k+kind*9)*512,hash(k*3+kind)*320,1+hash(k+7)*2,1+hash(k+8)*3);}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
    const m=new THREE.MeshStandardMaterial({map:t,emissiveMap:lit?t:null,emissive:lit?0xffffff:0x000000,emissiveIntensity:lit?.55:0,roughness:.64,metalness:.15});m.name=`neon-recessed-room-${kind}`;return m;
  });
  let buildings=0,roomCount=0;
  const addBuilding=(x:number,z:number,w:number,d:number,h:number,angle:number,id:number,baseY=0,moduleScale=1)=>{
    buildings++;const co=Math.cos(angle),si=Math.sin(angle),front=d/2;
    const put=(mat:THREE.Material,u:number,y:number,v:number,sx:number,sy:number,sz:number,geo:THREE.BufferGeometry=box,rz=0,ry=0)=>{
      dummy.position.set(x+co*u+si*v,y+baseY,z-si*u+co*v);dummy.rotation.set(0,angle,0);dummy.rotateY(ry);dummy.rotateZ(rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
      let materials=batches.get(mat);if(!materials){materials=new Map();batches.set(mat,materials)}const list=materials.get(geo)??[];list.push(dummy.matrix.clone());materials.set(geo,list);
    };
    const module=[3.3,4.8,6.8,3.9][id%4]*moduleScale;
    const cols=Math.max(2,Math.floor(w/module)),bw=(w-1.2)/cols;
    const floors=Math.max(1,Math.floor((h-5)/((id%3===0?5.5:4.4)*moduleScale))),fh=(h-5)/floors;
    // Mask the old flat front; the visible glazing sits behind a deep frame.
    put(recess,0,(h+4.5)/2,front+.03,w,h-4.5,.12);
    for(let row=0;row<floors;row++){
      const y=5+row*fh;
      put(metal,0,y,front+.48,w+.3,.36,1.05);
      put(trim,0,y+.22,front+.92,w+.35,.075,.16);
      for(let col=0;col<cols;col++){
        const u=-w/2+.6+bw*(col+.5),key=id*109+row*17+col*7;
        const occupied=hash(key)>.66,kind=occupied?(hash(key+2)>.7?2:(row+col+id)%2):3;
        put(rooms[kind],u,y+fh*.5,front+.13,bw-.24,Math.min(fh-(id%4===2?1.6:.52),3.4),1,plane);roomCount++;
        put(metal,u-bw/2,y+fh*.5,front+.58,.17,fh,1);
        // Shutter banks alternate with rooms; maintain large dark areas.
        if(!occupied&&hash(key+4)>.68)for(let slat=0;slat<4;slat++)put(trim,u,y+.65+slat*.48,front+.3,bw-.38,.08,.16);
      }
      if(row%4===2){
        // A service catwalk actually attaches to its floor slab.
        put(metal,0,y-.22,front+1.2,w+.5,.2,2.6);
        put(trim,0,y+.85,front+2.35,w+.5,.075,.075);
        for(let u=-w/2;u<=w/2;u+=3.8)put(metal,u,y+.3,front+2.35,.07,1.1,.07);
        for(const u of[-w*.35,w*.35]){put(metal,u,y-.72,front+1.1,.16,1.35,.16,box,Math.PI/4);}
      }
    }
    // Return the industrial language around both corners. The oblique sides
    // occupy most of the driver's view, so they must not remain flat wallpaper.
    for(const side of[-1,1]){
      const bays=Math.max(2,Math.floor(d/(6*moduleScale))),span=(d-1)/bays;
      put(recess,side*(w/2+.03),(h+4.5)/2,0,.12,h-4.5,d);
      for(let row=0;row<floors;row++){
        const y=5+row*fh;
        put(metal,side*(w/2+.4),y,0,.9,.36,d+.2);
        for(let col=0;col<bays;col++){
          const v=-d/2+.5+span*(col+.5),key=id*83+row*23+col*13+side*7;
          const occupied=hash(key)>.7,kind=occupied?(hash(key+2)>.88?2:(row+col)%2):3;
          put(rooms[kind],side*(w/2+.14),y+fh*.5,v,span-.32,Math.min(fh-.6,3.4),1,plane,0,side*Math.PI/2);roomCount++;
        }
      }
      for(let col=0;col<=bays;col++)put(metal,side*(w/2+.5),(h+5)/2,-d/2+.5+span*col,.85,h-5,.18);
      put(copper,side*(w/2+.85),h*.5,-d*.27,.19,h-1,.19,pipe);
      for(let y=9;y<h;y+=11)put(trim,side*(w/2+.85),y,-d*.27,.27,.23,.27,pipe);
    }
    for(let row=0;row<floors;row++){
      const y=5+row*fh;
      put(metal,0,y,-front-.42,w+.3,.38,.95);
      for(let col=0;col<cols;col++){
        const u=-w/2+.6+bw*(col+.5),kind=hash(id*37+row*11+col*7)>.68?(row+col)%3:3;
        put(rooms[kind],u,y+fh*.5,-front-.13,bw-.3,Math.min(fh-.7,3.4),1,plane,0,Math.PI);roomCount++;
        put(metal,u-bw/2,y+fh*.5,-front-.5,.2,fh,.95);
      }
    }
    // Continuous utility risers with collars and a low transfer manifold.
    for(const [j,u]of[-w*.47,w*.39].entries()){
      put(j?metal:copper,u,h*.5,front+1.08,.16,h-1,.16,pipe);
      for(let y=6;y<h;y+=8)put(trim,u,y,front+1.08,.23,.2,.23,pipe);
    }
    put(copper,0,5,front+1.25,.22,w,.22,pipe,Math.PI/2);
    // An asymmetrical equipment bay adds a recognisable industrial silhouette.
    if(id%3===0){
      const u=w*.26,y=Math.min(h-4,14+id%4*4);
      put(metal,u,y,front+1.12,3.4,3.25,1.4);put(recess,u,y,front+1.85,2.8,2.7,.1);
      for(let k=0;k<7;k++)put(trim,u,y-1.1+k*.35,front+1.98,2.6,.09,.16);
      put(amber,u-1.2,y+1.75,front+1.8,.65,.08,.1);
    }
    // Exoskeleton uprights wrap the corners, including visible blank sides.
    for(const side of[-1,1]){put(metal,side*(w/2+.08),h/2,front-.3,.5,h,1.25);put(trim,side*(w/2+.35),h/2,front-.32,.12,h,.85);}
  };
  return {addBuilding,build(){
    let instances=0,draws=0;
    const structure=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.68,metalness:.45});
    const merged=new Map<THREE.Material,Map<THREE.BufferGeometry,{matrix:THREE.Matrix4;color:THREE.Color}[]>>();
    for(const [mat,geometries] of batches){
      const target=[metal,trim,recess,copper].includes(mat as THREE.MeshStandardMaterial)?structure:mat;
      const dst=merged.get(target)??new Map();merged.set(target,dst);
      for(const [geo,matrices]of geometries){const list=dst.get(geo)??[];dst.set(geo,list);for(const matrix of matrices)list.push({matrix,color:(mat as THREE.MeshStandardMaterial).color});}
    }
    for(const[mat,geometries]of merged)for(const[geo,items]of geometries){
      // Local batches let the frustum reject entire unseen neighbourhoods.
      const cells=new Map<string,typeof items>();
      for(const item of items){const m=item.matrix;const key=Math.floor(m.elements[12]/256)+','+Math.floor(m.elements[14]/256);const list=cells.get(key)??[];list.push(item);cells.set(key,list);}
      for(const list of cells.values()){
        const mesh=new THREE.InstancedMesh(geo,mat,list.length);mesh.name='neon-architecture-batch';list.forEach(({matrix,color},i)=>{mesh.setMatrixAt(i,matrix);if(mat===structure)mesh.setColorAt(i,color)});mesh.computeBoundingSphere();group.add(mesh);instances+=list.length;draws++;
      }
    }
    [metal,trim,recess,copper].forEach(m=>m.dispose());
    group.userData={buildings,rooms:roomCount,instances,draws};
  }};
}
