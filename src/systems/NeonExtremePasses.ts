import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {neonWetSurfaceGLSL} from '../game/NeonWetSurface';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const target=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
const copyMaterial=()=>new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{t:{value:null}},vertexShader:vertex,fragmentShader:'varying vec2 vUv;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,vUv);}'});

/** Camera velocity from scene depth, overwritten by rigid moving-object velocity.
 * Only moving meshes get a second draw, and scene depth rejects hidden surfaces.
 */
export class NeonVelocityPass extends Pass {
 readonly target=target();
 private readonly base=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{depth:{value:null},inverseVP:{value:new THREE.Matrix4()},previousVP:{value:new THREE.Matrix4()}},vertexShader:vertex,
 fragmentShader:`#include <packing>
 varying vec2 vUv;uniform sampler2D depth;uniform mat4 inverseVP,previousVP;
 void main(){float d=unpackRGBAToDepth(texture2D(depth,vUv));vec4 w=inverseVP*vec4(vUv*2.-1.,d*2.-1.,1.);w/=w.w;vec4 p=previousVP*w;vec3 ndc=p.xyz/max(p.w,.0001);gl_FragColor=vec4(vUv-(ndc.xy*.5+.5),ndc.z*.5+.5,1.);}`});
 private readonly moving=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,side:THREE.DoubleSide,uniforms:{depth:{value:null},previousMVP:{value:new THREE.Matrix4()},resolution:{value:new THREE.Vector2()},near:{value:.3},far:{value:5000}},
 vertexShader:`uniform mat4 previousMVP;varying vec4 vPrevious;void main(){vPrevious=previousMVP*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`#include <packing>
 varying vec4 vPrevious;uniform sampler2D depth;uniform vec2 resolution;uniform float near,far;
 void main(){vec2 uv=gl_FragCoord.xy/resolution;float d=unpackRGBAToDepth(texture2D(depth,uv));float a=perspectiveDepthToViewZ(d,near,far),b=perspectiveDepthToViewZ(gl_FragCoord.z,near,far);if(abs(a-b)>.12)discard;vec3 ndc=vPrevious.xyz/max(vPrevious.w,.0001);gl_FragColor=vec4(uv-(ndc.xy*.5+.5),ndc.z*.5+.5,1.);}`});
 private readonly quad=new FullScreenQuad(this.base);
 private readonly motionScene=new THREE.Scene();
 private readonly previous=new Map<THREE.Mesh,THREE.Matrix4>();
 private readonly proxies=new Map<THREE.Mesh,THREE.Mesh>();
 private readonly previousVP=new THREE.Matrix4();
 private valid=false;
 constructor(private readonly scene:THREE.Scene,private readonly camera:THREE.PerspectiveCamera,depth:THREE.Texture){super();this.needsSwap=false;this.base.uniforms.depth.value=depth;this.moving.uniforms.depth.value=depth;}
 prepare(current:THREE.Matrix4,previous:THREE.Matrix4,valid:boolean){this.valid=valid;this.base.uniforms.inverseVP.value.copy(current).invert();this.base.uniforms.previousVP.value.copy(valid?previous:current);this.previousVP.copy(valid?previous:current);}
 override setSize(w:number,h:number){this.target.setSize(w,h);this.moving.uniforms.resolution.value.set(w,h);}
 override render(renderer:THREE.WebGLRenderer){
  renderer.setRenderTarget(this.target);this.quad.render(renderer);
  for(const p of this.proxies.values())p.visible=false;
  this.scene.updateMatrixWorld(true);
  for(const root of this.scene.children.filter(o=>o.name==='car').concat(this.scene.getObjectByName('neon-city')?.children.filter(o=>o.name==='neon-skytrain')??[])){
   root.traverseVisible(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh||mesh instanceof THREE.InstancedMesh)return;const mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;if(mat.transparent)return;
    let proxy=this.proxies.get(mesh);if(!proxy){proxy=new THREE.Mesh(mesh.geometry,this.moving);proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;proxy.onBeforeRender=()=>{this.moving.uniforms.previousMVP.value.multiplyMatrices(this.previousVP,this.valid?(this.previous.get(mesh)??mesh.matrixWorld):mesh.matrixWorld);this.moving.uniformsNeedUpdate=true;};this.proxies.set(mesh,proxy);this.motionScene.add(proxy);}
    proxy.visible=true;proxy.matrix.copy(mesh.matrixWorld);proxy.matrixWorldNeedsUpdate=true;
   });
  }
  this.moving.uniforms.near.value=this.camera.near;this.moving.uniforms.far.value=this.camera.far;
  const clear=renderer.autoClear;try{renderer.autoClear=false;renderer.render(this.motionScene,this.camera);}finally{renderer.autoClear=clear;}
  for(const mesh of this.proxies.keys()){let m=this.previous.get(mesh);if(!m){m=new THREE.Matrix4();this.previous.set(mesh,m);}m.copy(mesh.matrixWorld);}
 }
 override dispose(){this.target.dispose();this.base.dispose();this.moving.dispose();this.quad.dispose();this.proxies.clear();this.previous.clear();this.motionScene.clear();}
}

/** Jittered temporal reconstruction, with motion reprojection, depth rejection
 * and neighborhood clipping so moving cars and video ads do not leave trails. */
export class NeonTemporalPass extends Pass {
 private readonly history=target();
 private readonly historyDepth=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
 private valid=false;
 private readonly material:THREE.ShaderMaterial;
 private readonly copy=copyMaterial();
 private readonly quad:FullScreenQuad;
 constructor(private readonly depth:THREE.Texture,velocity:THREE.Texture){super();this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{current:{value:null},history:{value:this.history.texture},historyDepth:{value:this.historyDepth.texture},velocity:{value:velocity},texel:{value:new THREE.Vector2()},valid:{value:0}},vertexShader:vertex,
 fragmentShader:`#include <packing>
 varying vec2 vUv;uniform sampler2D current,history,historyDepth,velocity;uniform vec2 texel;uniform float valid;
 void main(){vec3 c=texture2D(current,vUv).rgb;vec3 vel=texture2D(velocity,vUv).xyz;vec2 prev=vUv-vel.xy;vec3 lo=c,hi=c;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 n=texture2D(current,clamp(vUv+vec2(float(x),float(y))*texel,texel,1.-texel)).rgb;lo=min(lo,n);hi=max(hi,n);}
 float d=unpackRGBAToDepth(texture2D(historyDepth,prev));float inside=step(0.,prev.x)*step(0.,prev.y)*step(prev.x,1.)*step(prev.y,1.);
 float weight=valid*inside*(abs(d-vel.z)<.00035?1.:0.)*mix(.88,.65,smoothstep(.001,.025,length(vel.xy)));
 vec3 old=clamp(texture2D(history,prev).rgb,lo,hi);gl_FragColor=vec4(mix(c,old,weight),1.);}`});this.quad=new FullScreenQuad(this.material);}
 reset(){this.valid=false;}
 override setSize(w:number,h:number){this.history.setSize(w,h);this.historyDepth.setSize(w,h);this.material.uniforms.texel.value.set(1/w,1/h);this.reset();}
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
  this.material.uniforms.current.value=read.texture;this.material.uniforms.valid.value=this.valid?1:0;
  renderer.setRenderTarget(write);this.quad.material=this.material;this.quad.render(renderer);
  this.quad.material=this.copy;this.copy.uniforms.t.value=write.texture;renderer.setRenderTarget(this.history);this.quad.render(renderer);
  this.copy.uniforms.t.value=this.depth;renderer.setRenderTarget(this.historyDepth);this.quad.render(renderer);this.valid=true;
 }
 override dispose(){this.history.dispose();this.historyDepth.dispose();this.material.dispose();this.copy.dispose();this.quad.dispose();}
}

/** Selective screen-space ray tracing on the actual wet road, including banks.
 * Its wetness mask excludes the dry tunnel; offscreen rays fade to the planar fallback. */
export class NeonRoadReflectionPass extends Pass {
 private readonly mask=target();
 private readonly reflection=target();
 private readonly maskScene=new THREE.Scene();
 private readonly maskMaterial:THREE.ShaderMaterial;
 private readonly trace:THREE.ShaderMaterial;
 private readonly composite:THREE.ShaderMaterial;
 private readonly quad:FullScreenQuad;
 private readonly proxy?:THREE.Mesh;
 constructor(scene:THREE.Scene,private readonly camera:THREE.PerspectiveCamera,depth:THREE.Texture){
  super();
  this.maskMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,side:THREE.DoubleSide,uniforms:{depth:{value:depth},resolution:{value:new THREE.Vector2()},near:{value:camera.near},far:{value:camera.far}},
  vertexShader:`attribute float weatherWetness;varying vec3 vNormal,vWorld;varying float vWet;void main(){vNormal=normalize(normalMatrix*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;vWet=weatherWetness;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`#include <packing>
  uniform sampler2D depth;uniform vec2 resolution;uniform float near,far;varying vec3 vNormal,vWorld;varying float vWet;
  ${neonWetSurfaceGLSL}
  void main(){float d=unpackRGBAToDepth(texture2D(depth,gl_FragCoord.xy/resolution));if(abs(perspectiveDepthToViewZ(d,near,far)-perspectiveDepthToViewZ(gl_FragCoord.z,near,far))>.18)discard;gl_FragColor=vec4(normalize(vNormal)*.5+.5,vWet*mix(.28,1.,wetPuddle(vWorld.xz)));}`});
  const road=scene.getObjectByName('neon-wet-road') as THREE.Mesh|undefined;
  if(road){road.updateWorldMatrix(true,false);this.proxy=new THREE.Mesh(road.geometry,this.maskMaterial);this.proxy.matrixAutoUpdate=false;this.proxy.matrix.copy(road.matrixWorld);this.maskScene.add(this.proxy);}
  this.trace=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{depth:{value:depth},mask:{value:this.mask.texture},colour:{value:null},projection:{value:new THREE.Matrix4()},inverseProjection:{value:new THREE.Matrix4()},texel:{value:new THREE.Vector2()}},vertexShader:vertex,
  fragmentShader:`#include <packing>
  varying vec2 vUv;uniform sampler2D depth,mask,colour;uniform mat4 projection,inverseProjection;uniform vec2 texel;
  vec3 positionAt(vec2 uv){float d=unpackRGBAToDepth(texture2D(depth,uv));vec4 v=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return v.xyz/v.w;}
  void main(){vec4 m=texture2D(mask,vUv);if(m.a<.02){gl_FragColor=vec4(0.);return;}
   vec3 origin=positionAt(vUv),n=normalize(m.xyz*2.-1.);if(dot(n,-origin)<0.)n=-n;vec3 direction=reflect(normalize(origin),n);float previous=0.;vec2 hit=vec2(0.);float found=0.;
   for(int i=1;i<=32;i++){float t=160.*pow(float(i)/32.,2.);vec3 p=origin+n*.15+direction*t;if(p.z>-.3)break;vec4 clip=projection*vec4(p,1.);vec2 uv=clip.xy/clip.w*.5+.5;if(any(lessThan(uv,vec2(.002)))||any(greaterThan(uv,vec2(.998))))break;
    vec3 surface=positionAt(uv);float delta=surface.z-p.z;
    if(delta>0.&&delta<3.5&&t>.5){float low=previous,high=t;for(int j=0;j<5;j++){float mid=(low+high)*.5;vec3 q=origin+n*.15+direction*mid;vec4 c=projection*vec4(q,1.);vec2 u=c.xy/c.w*.5+.5;if(positionAt(u).z>q.z)high=mid;else low=mid;}
     vec3 q=origin+n*.15+direction*high;vec4 c=projection*vec4(q,1.);hit=c.xy/c.w*.5+.5;float error=abs(positionAt(hit).z-q.z);found=(1.-smoothstep(.3,1.8,error))*(1.-high/160.);break;}
    previous=t;
   }
   float edge=smoothstep(0.,.08,min(min(hit.x,hit.y),min(1.-hit.x,1.-hit.y)));
   vec3 reflected=texture2D(colour,hit).rgb*.4;reflected+=(texture2D(colour,hit+texel*vec2(2.,0.)).rgb+texture2D(colour,hit-texel*vec2(2.,0.)).rgb)*.15;reflected+=(texture2D(colour,hit+texel*vec2(0.,3.)).rgb+texture2D(colour,hit-texel*vec2(0.,3.)).rgb)*.15;
   float fresnel=.12+.68*pow(1.-max(0.,dot(n,normalize(-origin))),3.);gl_FragColor=vec4(reflected,found*edge*m.a*fresnel*.8);
  }`});
  this.composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{colour:{value:null},reflection:{value:this.reflection.texture},mask:{value:this.mask.texture}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D colour,reflection,mask;void main(){vec4 r=texture2D(reflection,vUv);float wet=texture2D(mask,vUv).a;gl_FragColor=vec4(mix(texture2D(colour,vUv).rgb,r.rgb,r.a*wet),1.);}`});
  this.quad=new FullScreenQuad(this.trace);
 }
 override setSize(w:number,h:number){this.mask.setSize(w,h);this.reflection.setSize(Math.max(1,Math.round(w*.5)),Math.max(1,Math.round(h*.5)));this.maskMaterial.uniforms.resolution.value.set(w,h);this.trace.uniforms.texel.value.set(1/w,1/h);}
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
  const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  try{renderer.setClearColor(0,0);renderer.setRenderTarget(this.mask);renderer.clear();renderer.render(this.maskScene,this.camera);}finally{renderer.setClearColor(color,alpha);}
  this.trace.uniforms.colour.value=read.texture;this.trace.uniforms.projection.value.copy(this.camera.projectionMatrix);this.trace.uniforms.inverseProjection.value.copy(this.camera.projectionMatrixInverse);
  renderer.setRenderTarget(this.reflection);this.quad.material=this.trace;this.quad.render(renderer);
  this.composite.uniforms.colour.value=read.texture;renderer.setRenderTarget(write);this.quad.material=this.composite;this.quad.render(renderer);
 }
 override dispose(){this.mask.dispose();this.reflection.dispose();this.maskMaterial.dispose();this.trace.dispose();this.composite.dispose();this.quad.dispose();this.maskScene.clear();}
}

/** Analogue tape treatment in display space, after AgX/output conversion.
 * `uCinematic` switches to the Neon Signal composite model: a 480-line raster
 * whose luma stays sharp while chroma is bled sideways with a binomial kernel
 * (bleed 0.7), 0.57 scanlines, 0.14 signal noise and 0.016 film grain. */
export function createNeonTapePass(){return new ShaderPass({uniforms:{tDiffuse:{value:null},time:{value:0},resolution:{value:new THREE.Vector2(1,1)},uCinematic:{value:0}},vertexShader:vertex,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float time,uCinematic;uniform vec2 resolution;varying vec2 vUv;
 float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
 vec3 yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312)));}
 vec3 rgb(vec3 c){return vec3(c.x+.956*c.y+.621*c.z,c.x-.272*c.y-.647*c.z,c.x-1.106*c.y+1.703*c.z);}
 void main(){vec2 c=vUv-.5;vec2 uv=.5+c*(1.+dot(c,c)*.035)/1.009;float frame=floor(time*30.);
 // Stable optics: no animated UV displacement or travelling tracking band.
 uv=clamp(uv,vec2(.003),vec2(.997));
 vec2 ab=c*dot(c,c)*.012;vec3 signal=texture2D(tDiffuse,uv).rgb;signal.r=texture2D(tDiffuse,clamp(uv-ab,vec2(.001),vec2(.999))).r;signal.b=texture2D(tDiffuse,clamp(uv+ab,vec2(.001),vec2(.999))).b;
 if(uCinematic>.5){
  float aspect=resolution.x/resolution.y;float texel=1./(480.*aspect);float w=.7*6.*texel;float shift=w*.65;
  vec3 chroma=vec3(0.);float k[5];k[0]=1./16.;k[1]=4./16.;k[2]=6./16.;k[3]=4./16.;k[4]=1./16.;
  for(int i=0;i<5;i++)chroma+=yiq(texture2D(tDiffuse,clamp(uv+vec2(w*float(i-2)-shift,0.),vec2(.001),vec2(.999))).rgb)*k[i];
  vec3 y=yiq(signal);y.yz=chroma.yz;signal=rgb(y);
  float line=.5+.5*sin(vUv.y*480.*6.2831853);signal*=1.-line*.57*.16;
  float row=floor(vUv.y*480.),col=floor(vUv.x*480.*aspect);
  signal+=(hash(vec2(col+frame*37.,row+frame*13.))-.5)*.14*.06;
  float luma=clamp(dot(signal,vec3(.299,.587,.114)),0.,1.);
  float grain=hash(floor(vUv*resolution/1.75)+vec2(frame*.71,frame))-.5;
  signal+=grain*.016*(.25+.75*(1.-luma));
  gl_FragColor=vec4(clamp(signal,0.,1.),1.);return;
 }
 vec3 chroma=vec3(0.);for(int i=-2;i<=2;i++)chroma+=yiq(texture2D(tDiffuse,clamp(uv+vec2((float(i)*2.5+2.)/resolution.x,0.),vec2(.001),vec2(.999))).rgb)/5.;
 // Slight loss of peripheral resolving power, using the existing tape taps.
 signal=mix(signal,rgb(chroma),smoothstep(.04,.4,dot(c,c))*.16);
 vec3 y=yiq(signal);y.yz=mix(y.yz,chroma.yz,.72*.83);signal=rgb(y);
 float line=.5+.5*sin(vUv.y*min(resolution.y,720.)*3.14159265);signal*=1.-line*.035;
 float luminance=clamp(dot(signal,vec3(.299,.587,.114)),0.,1.);
 float grain=hash(floor(vUv*resolution)+vec2(frame,frame*.17))-.5;
 float coarse=hash(floor(vUv*resolution/2.7)+vec2(frame*.71,frame))-.5;
 signal+=(grain*.023+coarse*.009)*(.45+sqrt(luminance)*(1.-luminance));
 signal*=1.-smoothstep(.12,.48,dot(c,c))*.075;
 signal=(signal-.5)*1.025+.5;signal=mix(vec3(dot(signal,vec3(.299,.587,.114))),signal,1.1);signal=pow(max(signal*.95,0.),vec3(.93));gl_FragColor=vec4(clamp(signal,0.,1.),1.);}`});}

/** Neon Signal anamorphic streak: HDR light above `threshold` smeared along a
 * squeezed horizontal line plus a soft oval, added on top of the frame. Runs
 * before bloom, as in the reference chain. The reference samples 65 taps
 * across ±3.5% of the width with exp(-3|x|) weights; 33 taps keep the same
 * kernel shape at half the cost. Its threshold (1.2) assumes signs several
 * times brighter than this city's, so the default here sits lower. */
export function createNeonAnamorphicPass(){return new ShaderPass({uniforms:{tDiffuse:{value:null},resolution:{value:new THREE.Vector2(1,1)},squeeze:{value:2.05},flare:{value:.17},oval:{value:.43},threshold:{value:.55}},vertexShader:vertex,
 fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 resolution;uniform float squeeze,flare,oval,threshold;varying vec2 vUv;
 vec3 bright(vec2 uv){return max(texture2D(tDiffuse,clamp(uv,vec2(0.),vec2(1.))).rgb-threshold,vec3(0.));}
 void main(){vec4 base=texture2D(tDiffuse,vUv);float aspect=resolution.x/resolution.y;vec3 center=bright(vUv);
  vec3 streak=vec3(0.);float total=0.;
  for(int i=-16;i<=16;i++){float x=float(i)/16.;float w=exp(-abs(x)*3.);streak+=bright(vUv+vec2(squeeze*.035*x/aspect,0.))*w;total+=w;}
  streak/=total;
  vec3 ring=vec3(0.);
  for(int i=0;i<8;i++){float a=float(i)*.7853982;ring+=bright(vUv+vec2(cos(a)*6./squeeze/resolution.x,squeeze*sin(a)*6./resolution.y))/8.;}
  gl_FragColor=vec4(max(base.rgb+(streak-center)*flare+(ring-center)*oval,vec3(0.)),base.a);}`});}
