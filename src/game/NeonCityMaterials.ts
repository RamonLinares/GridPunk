import * as THREE from 'three';

/** Weathered city surfaces with separate albedo, relief and window emission. */
export function createCityFacade(style:number, random:()=>number):THREE.MeshStandardMaterial {
  const size=1024,make=()=>{const c=document.createElement('canvas');c.width=c.height=size;return c;};
  const color=make(),emission=make(),relief=make(),c=color.getContext('2d')!,e=emission.getContext('2d')!,b=relief.getContext('2d')!;
  const walls=['#5a6262','#655e58','#4c595d','#444f53','#555456'];
  c.fillStyle=walls[style%walls.length];c.fillRect(0,0,size,size);e.fillStyle='#000';e.fillRect(0,0,size,size);b.fillStyle='#888';b.fillRect(0,0,size,size);
  // Stains, panel seams and mortar are part of the wall, not emissive windows.
  for(let i=0;i<22000;i++){const x=random()*size,y=random()*size,v=random();c.fillStyle=v>.5?'rgba(180,180,159,.06)':'rgba(9,21,23,.09)';c.fillRect(x,y,1+random()*5,1+random()*12);}
  // Keep the actual plaster before painting windows: blank ground-floor walls
  // must share the building's colour/weathering, not a universal pale concrete.
  const blank=document.createElement('canvas');blank.width=blank.height=256;
  blank.getContext('2d')!.drawImage(color,0,0,256,256);
  const cols=[7,11,5,12,8][style%5],rows=[13,18,10,17,15][style%5],cw=size/cols,rh=size/rows;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x=col*cw,y=row*rh,ww=cw*([.72,.4,.86,.55,.64][style%5]),wh=rh*([.68,.8,.38,.57,.74][style%5]),wx=x+(cw-ww)/2,wy=y+9;
    c.fillStyle='#363f40';c.fillRect(wx-4,wy-4,ww+8,wh+8);b.fillStyle='#454545';b.fillRect(wx-3,wy-3,ww+6,wh+6);
    c.fillStyle='#0b1920';c.fillRect(wx,wy,ww,wh);b.fillStyle='#606060';b.fillRect(wx,wy,ww,wh);
    const lit=random()>.72,light=random()>.7?'#74b9c4':random()>.2?'#d5b789':'#c6d8cc';
    if(lit){c.fillStyle=light;c.globalAlpha=.28+random()*.3;c.fillRect(wx+2,wy+2,ww-4,wh-4);c.globalAlpha=1;e.fillStyle=light;e.globalAlpha=(.2+random()*.65)*((row*13+col*7+style)%5<2?1:.14);e.fillRect(wx+2,wy+2,ww-4,wh-4);e.globalAlpha=1;}
    c.fillStyle='#84938c';c.fillRect(wx-4,wy+wh+2,ww+8,3);b.fillStyle='#bbb';b.fillRect(wx-4,wy+wh+2,ww+8,3);
    for(const ctx of[c,e]){ctx.fillStyle='#152328';ctx.fillRect(wx+ww*.48,wy,2,wh);if(random()>.45)for(let slat=5;slat<wh;slat+=5){ctx.globalAlpha=.5;ctx.fillRect(wx,wy+slat,ww,1);ctx.globalAlpha=1;}}
    const stain=c.createLinearGradient(0,wy+wh,0,y+rh+15);stain.addColorStop(0,'#111b2148');stain.addColorStop(1,'#111b2100');c.fillStyle=stain;c.fillRect(wx-4,wy+wh+5,ww+8,rh*.5);
    c.fillStyle='#17272955';c.fillRect(x,y+rh-2,cw,2);
    if(style===1){c.fillStyle='#738383';c.fillRect(x+6,y+20,6,rh);}
  }
  const tex=(canvas:HTMLCanvasElement,srgb=true)=>{const t=new THREE.CanvasTexture(canvas);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;};
  const material=new THREE.MeshStandardMaterial({color:0x959fa6,map:tex(color),emissiveMap:tex(emission),emissive:0xffffff,emissiveIntensity:.95,bumpMap:tex(relief,false),bumpScale:.12,roughness:.87,metalness:.12});
  const base=new THREE.MeshStandardMaterial({color:material.color.clone(),map:tex(blank),roughness:material.roughness,metalness:material.metalness});
  base.name=`neon-ground-floor-facade-${style}`;
  base.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    #ifdef USE_INSTANCING
      float width=abs(normal.x)>.5?length(instanceMatrix[2].xyz):length(instanceMatrix[0].xyz);
      vMapUv*=vec2(width,length(instanceMatrix[1].xyz))/8.;
    #endif`);};
  material.userData.groundFloorMaterial=base;
  material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    #ifdef USE_INSTANCING
      vec2 size=vec2((abs(normal.x)>.5?length(instanceMatrix[2].xyz):length(instanceMatrix[0].xyz))/24.,length(instanceMatrix[1].xyz)/52.);
      vMapUv*=size;vEmissiveMapUv*=size;vBumpMapUv*=size;
    #endif`);};return material;
}

export function createWeatheredConcrete(random:()=>number):THREE.MeshStandardMaterial {
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle='#818782';ctx.fillRect(0,0,256,256);
 for(let i=0;i<7500;i++){ctx.fillStyle=random()>.5?'#323e3828':'#ced0bc20';ctx.fillRect(random()*256,random()*256,random()*4+1,random()*8+1);}
 for(let x=0;x<256;x+=64){ctx.fillStyle='#26343155';ctx.fillRect(x,0,2,256);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
 return new THREE.MeshStandardMaterial({map:t,color:0x929da0,roughness:.86,metalness:.08});
}
