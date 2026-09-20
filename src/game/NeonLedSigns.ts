import * as THREE from 'three';

// One clock shared by all designs, including the track-builder gantry.
const ledTime={value:0};
export function updateNeonLedSigns(seconds:number){ledTime.value=seconds;}

// Original 5×7 dot-matrix alphabet. These are physical LED cells, not a
// nearest-filtered photograph or a screen-space filter over the whole game.
const glyphs:Record<string,string>={
 A:'01110/10001/10001/11111/10001/10001/10001',B:'11110/10001/10001/11110/10001/10001/11110',C:'01111/10000/10000/10000/10000/10000/01111',D:'11110/10001/10001/10001/10001/10001/11110',E:'11111/10000/10000/11110/10000/10000/11111',F:'11111/10000/10000/11110/10000/10000/10000',G:'01111/10000/10000/10111/10001/10001/01111',H:'10001/10001/10001/11111/10001/10001/10001',I:'11111/00100/00100/00100/00100/00100/11111',J:'00111/00010/00010/00010/00010/10010/01100',K:'10001/10010/10100/11000/10100/10010/10001',L:'10000/10000/10000/10000/10000/10000/11111',M:'10001/11011/10101/10101/10001/10001/10001',N:'10001/11001/10101/10011/10001/10001/10001',O:'01110/10001/10001/10001/10001/10001/01110',P:'11110/10001/10001/11110/10000/10000/10000',Q:'01110/10001/10001/10001/10101/10010/01101',R:'11110/10001/10001/11110/10100/10010/10001',S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100',U:'10001/10001/10001/10001/10001/10001/01110',V:'10001/10001/10001/10001/10001/01010/00100',W:'10001/10001/10001/10101/10101/11011/10001',X:'10001/10001/01010/00100/01010/10001/10001',Y:'10001/10001/01010/00100/00100/00100/00100',Z:'11111/00001/00010/00100/01000/10000/11111',
 '0':'01110/10011/10101/10101/11001/10001/01110','1':'00100/01100/00100/00100/00100/00100/01110','2':'01110/10001/00001/00010/00100/01000/11111','3':'11110/00001/00001/01110/00001/00001/11110','4':'00010/00110/01010/10010/11111/00010/00010','5':'11111/10000/10000/11110/00001/00001/11110','6':'01110/10000/10000/11110/10001/10001/01110','7':'11111/00001/00010/00100/01000/01000/01000','8':'01110/10001/10001/01110/10001/10001/01110','9':'01110/10001/10001/01111/00001/00001/01110','/':'00001/00010/00010/00100/01000/01000/10000','>':'10000/01000/00100/00010/00100/01000/10000','-':'00000/00000/00000/11111/00000/00000/00000',' ':'00000/00000/00000/00000/00000/00000/00000'
};
function pixelText(c:CanvasRenderingContext2D,text:string,cx:number,y:number,sx:number,sy=sx){
 const left=Math.round(cx-(text.length*6-1)*sx/2);
 Array.from(text.toUpperCase()).forEach((letter,i)=>(glyphs[letter]??glyphs[' ']).split('/').forEach((row,j)=>Array.from(row).forEach((bit,k)=>{if(bit==='1')c.fillRect(left+(i*6+k)*sx,y+j*sy,sx,sy)})));
}
export function createNeonRaceBoard(title:string,subtitle:string,color:string,compact=false){
 // Match both the 12.5m cabinets and 5m panels used on tighter bends.
 const columns=compact?208:512;
 const source=document.createElement('canvas');source.width=columns;source.height=32;const c=source.getContext('2d')!;
 c.fillStyle='#000';c.fillRect(0,0,columns,32);c.fillStyle=color;
 pixelText(c,title,columns/2,2,compact?2:4,3);pixelText(c,subtitle,columns/2,24,1);
 const margin=compact?17:47;pixelText(c,'>>>',margin,8,compact?1:2);pixelText(c,'>>>',columns-margin,8,compact?1:2);
 return createNeonLedMaterial(source,{columns,rows:32,intensity:4.8,motion:title==='START / FINISH'?'race-control':'ticker',name:`neon-led-${title.toLowerCase().replaceAll(' ','-')}${compact?'-compact':''}`});
}

interface LedOptions {columns:number;rows:number;intensity?:number;flipY?:boolean;name?:string;motion?:'ticker'|'race-control'|'vertical'|'horizontal'}
/** Static diode housing plus a GPU-driven signal: no per-frame canvas redraws
 * or texture uploads. Integer-cell motion keeps the physical matrix stationary. */
export function createNeonLedMaterial(source:HTMLCanvasElement,{columns,rows,intensity=4.2,flipY=true,name='neon-led-sign',motion=rows>columns?'vertical':'horizontal'}:LedOptions):THREE.MeshStandardMaterial{
 const raster=document.createElement('canvas');raster.width=columns;raster.height=rows;const r=raster.getContext('2d',{willReadFrequently:true})!;r.drawImage(source,0,0,columns,rows);const signal=r.getImageData(0,0,columns,rows).data;
 const scale=4,make=()=>{const c=document.createElement('canvas');c.width=columns*scale;c.height=rows*scale;return c;};
 const face=make(),emission=make(),f=face.getContext('2d')!,e=emission.getContext('2d')!;
 f.fillStyle='#0a1116';f.fillRect(0,0,face.width,face.height);e.fillStyle='#000';e.fillRect(0,0,face.width,face.height);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const i=(y*columns+x)*4,red=signal[i],green=signal[i+1],blue=signal[i+2];
  const level=Math.max(red,green,blue)/255,seed=((Math.imul(x+17,73856093)^Math.imul(y+11,19349663))>>>0),variation=.81+(seed%100)/100*.19;
  const cx=(x+.5)*scale,cy=(y+.5)*scale;
  // Inactive diode lenses are visible under ambient light, with no emission.
  f.fillStyle='#223039';f.beginPath();f.arc(cx,cy,1.42,0,Math.PI*2);f.fill();
  if(level<.22)continue;
  const power=variation*((seed%251===0)?.5:1);
  const color=`rgb(${Math.round(red*power)},${Math.round(green*power)},${Math.round(blue*power)})`;
  e.fillStyle=color;e.beginPath();e.arc(cx,cy,1.23,0,Math.PI*2);e.fill();
  e.fillStyle=`rgba(255,255,255,${.1*level})`;e.fillRect(cx-.4,cy-.6,.8,.7);
 }
 // Module joints sit BETWEEN cells, so they never erase a row of lettering.
 f.fillStyle='#02070b';for(let x=32;x<columns;x+=32)f.fillRect(x*scale-.3,0,.6,face.height);
 for(let y=32;y<rows;y+=32)f.fillRect(0,y*scale-.3,face.width,.6);
 // Dark metal edging with corner fasteners; never luminous, never a bright frame.
 const rim=rows>64?7:3;f.strokeStyle='#38454c';f.lineWidth=2;f.strokeRect(1,1,face.width-2,face.height-2);
 for(const context of[f,e]){context.fillStyle=context===f?'#0b1218':'#000';context.fillRect(0,0,face.width,rim);context.fillRect(0,face.height-rim,face.width,rim);context.fillRect(0,0,rim,face.height);context.fillRect(face.width-rim,0,rim,face.height);}
 for(const x of[5,face.width-5])for(const y of[5,face.height-5]){f.fillStyle='#667074';f.fillRect(x-1,y-1,2,2);}
 const tex=(canvas:HTMLCanvasElement)=>{const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.flipY=flipY;t.anisotropy=8;return t;};
 const material=new THREE.MeshStandardMaterial({map:tex(face),emissiveMap:tex(emission),emissive:0xffffff,emissiveIntensity:intensity,roughness:.62,metalness:.3});
 const hash=Array.from(name).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);
 const phase=((Math.imul(hash^(hash>>>16),2246822507)>>>0)%997)/997*9;
 const kind=motion==='race-control'?0:motion==='ticker'?1:motion==='vertical'?2:3;
 material.onBeforeCompile=shader=>{
  shader.uniforms.uLedTime=ledTime;
  shader.uniforms.uLedGrid={value:new THREE.Vector2(columns,rows)};
  shader.uniforms.uLedPhase={value:phase};
  shader.uniforms.uLedKind={value:kind};
  shader.uniforms.uLedFlip={value:flipY?1:0};
  shader.fragmentShader='uniform float uLedTime, uLedPhase, uLedKind, uLedFlip;\nuniform vec2 uLedGrid;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
   #ifdef USE_EMISSIVEMAP
    vec2 boardUv=vEmissiveMapUv;
    if(uLedFlip>0.5)boardUv.y=1.0-boardUv.y;
    vec2 signalUv=boardUv;
    float tick=floor((uLedTime+uLedPhase)*24.0)/24.0;
    float row=floor(boardUv.y*uLedGrid.y);
    float gain=1.0;
    if(uLedKind<1.5){
     // Continuous lower ticker; keep the start/finish title permanently legible.
     if(row>=23.0){signalUv.x=fract(signalUv.x+floor(tick*18.0)/uLedGrid.x);}
     else if(uLedKind>0.5){
      float travel=clamp((mod(tick,12.0)-9.0)/3.0,0.0,1.0);
      signalUv.x=fract(signalUv.x+floor(travel*uLedGrid.x)/uLedGrid.x);
     }
     // A gentle chase through the chevrons, never a whole-board flash.
     if(boardUv.x<0.15||boardUv.x>0.85){
      gain=0.68+0.32*smoothstep(-0.5,0.7,sin(floor(boardUv.x*uLedGrid.x/6.0)*1.8-tick*5.0));
     }
    }else{
     // Staggered hold-and-roll pages on architectural signs.
     float travel=clamp((mod(tick,11.0)-7.0)/4.0,0.0,1.0);
     if(uLedKind<2.5)signalUv.y=fract(signalUv.y+floor(travel*uLedGrid.y)/uLedGrid.y);
     else signalUv.x=fract(signalUv.x+floor(travel*uLedGrid.x)/uLedGrid.x);
     float sweep=fract(tick*0.13);
     gain=0.88+0.12*exp(-pow((boardUv.y-sweep)*12.0,2.0));
    }
    if(uLedFlip>0.5)signalUv.y=1.0-signalUv.y;
    vec3 ledSignal=texture2D(emissiveMap,signalUv).rgb;
    if(uLedKind<1.5 && row==23.0)ledSignal=vec3(0.0);
    // The physical perimeter stays dark even when a message crosses its edge.
    vec2 edge=min(boardUv,1.0-boardUv)*uLedGrid;
    float aperture=smoothstep(0.4,1.0,min(edge.x,edge.y));
    totalEmissiveRadiance*=ledSignal*gain*aperture;
   #endif
  `);
 };
 material.customProgramCacheKey=()=>'neon-led-motion-v1';
 material.name=name;material.userData.ledMatrix={columns,rows,static:false,motion,phase};return material;
}
