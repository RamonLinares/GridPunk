import { neonRainExposure } from './track/NeonProfile';
import { neonWetSurfaceGLSL } from './NeonWetSurface';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {Reflector} from 'three/examples/jsm/objects/Reflector.js';
import type {TrackBuilder} from './track/TrackBuilder';

/** One low-resolution planar reflection shared by the flat portions of the street loop. */
export function createWetRoad(builder:TrackBuilder):Reflector & {material:THREE.ShaderMaterial} {
 const road=builder.group.getObjectByName('road') as THREE.Mesh;
 const geometry=road.geometry.clone();geometry.translate(0,-.04,0);geometry.rotateX(Math.PI/2);
 const wetness=new Float32Array(geometry.getAttribute('position').count);
 for(let i=0;i<wetness.length;i++)wetness[i]=neonRainExposure((Math.floor(i/2)%builder.spline.count)/builder.spline.count,builder.spline.length);
 geometry.setAttribute('weatherWetness',new THREE.BufferAttribute(wetness,1));
 const shader={name:'NeonWetRoad',uniforms:{color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},uTime:{value:0},uExtreme:{value:0}},vertexShader:`
 attribute float weatherWetness;uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vWorld;varying vec3 vView;varying float vPlanar;
 #include <common>
 #include <fog_pars_vertex>
 void main(){vPlanar=weatherWetness*(1.-smoothstep(.02,.12,abs(normal.x)+abs(normal.y)));vUv=textureMatrix*vec4(position,1.);vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vView=cameraPosition-world.xyz;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
 }`,fragmentShader:`
 uniform sampler2D tDiffuse;uniform float uTime,uExtreme;varying vec4 vUv;varying vec3 vWorld;varying vec3 vView;varying float vPlanar;
 #include <common>
 #include <fog_pars_fragment>
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
 ${neonWetSurfaceGLSL}
 void main(){vec2 uv=vUv.xy/vUv.w;float ripple=sin(vWorld.x*4.1+vWorld.z*7.+uTime*2.)*.0009;vec2 shift=vec2(ripple,sin(vWorld.z*9.-uTime)*.0005);
 float puddle=smoothstep(.28,.72,noise(vWorld.xz*.22));
 vec2 spread=vec2(.0024,.007);
 // Distort only reflected light, never the camera image. Rougher patches
 // scatter highlights more broadly; puddles preserve a clearer reflection.
 if(uExtreme>.5){
  puddle=wetPuddle(vWorld.xz);
  vec2 irregular=vec2(wetNoise(vWorld.xz*1.7+uTime*.13),wetNoise(vWorld.zx*2.1-uTime*.11))-.5;
  shift+=irregular*.006;
  spread=mix(vec2(.006,.016),vec2(.0015,.003),puddle);
 }
 vec3 reflected=texture2D(tDiffuse,uv+shift).rgb*.4;
 reflected+=texture2D(tDiffuse,uv+shift+vec2(spread.x,0)).rgb*.15;
 reflected+=texture2D(tDiffuse,uv+shift-vec2(spread.x,0)).rgb*.15;
 reflected+=texture2D(tDiffuse,uv+shift+vec2(0,spread.y)).rgb*.15;
 reflected+=texture2D(tDiffuse,uv+shift-vec2(0,spread.y)).rgb*.15;
 float fresnel=pow(1.-abs(normalize(vView).y),2.);
 gl_FragColor=vec4(reflected,mix(.035,.30,puddle)*(.38+.62*fresnel)*vPlanar);
 #include <fog_fragment>
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`};
 const mesh=new Reflector(geometry,{textureWidth:512,textureHeight:320,multisample:0,clipBias:.001,shader}) as Reflector & {material:THREE.ShaderMaterial};
 mesh.name='neon-wet-road';mesh.rotation.x=-Math.PI/2;mesh.position.y=.045;mesh.material.transparent=true;mesh.material.depthWrite=false;mesh.material.fog=true;mesh.material.uniforms={...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),...mesh.material.uniforms};mesh.material.polygonOffset=true;mesh.material.polygonOffsetFactor=-5;mesh.material.polygonOffsetUnits=-5;mesh.renderOrder=1;
 // Merge static vehicle geometry only for the small, rough reflection. This
 // preserves the actual silhouette/livery without submitting hundreds of tiny
 // suspension/steering meshes a second time every frame.
 const proxies=new Map<THREE.Object3D,THREE.Mesh>();
 // Proxy geometry has no UVs, so bake the mean base-map reflectance into its
 // vertex colour. Keeping only material.color turns textured black tyres white.
 const reflectances=new WeakMap<THREE.Material,THREE.Color>();
 const proxyColor=(material:THREE.MeshStandardMaterial)=>{
   const cached=reflectances.get(material);if(cached)return cached;
   const color=material.color.clone();
   if(material.map?.image){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
     const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
     try{
       ctx.drawImage(material.map.image as CanvasImageSource,0,0,16,16);
       const pixels=ctx.getImageData(0,0,16,16).data,sample=new THREE.Color(),mean=new THREE.Color(0,0,0);
       for(let i=0;i<pixels.length;i+=4){sample.setRGB(pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,material.map.colorSpace);mean.add(sample);}
       color.multiply(mean.multiplyScalar(1/256));
     }catch{ /* Unreadable external maps retain their authored material tint. */ }
   }
   reflectances.set(material,color);return color;
 };
 const reflectionRender=mesh.onBeforeRender;
 mesh.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
   mesh.material.uniforms.uExtreme.value=scene.userData.neonExtreme?1:0;
   // Sub-HD, blurred wet reflections retain building masses, signage and
   // Blender landmarks. Tiny room fittings do not warrant a second submission.
   const facadeDetail=scene.getObjectByName('neon-industrial-architecture');
   const detailVisible=facadeDetail?.visible;
   if(facadeDetail&&!scene.userData.neonExtreme)facadeDetail.visible=false;
   const cars=scene.children.filter(o=>o.name==='car'&&o.visible);
   for(const car of cars){
     let proxy=proxies.get(car);
     if(!proxy){
       car.updateMatrixWorld(true);const inverse=car.matrixWorld.clone().invert(),parts:THREE.BufferGeometry[]=[];
       car.traverse(o=>{const object=o as THREE.Mesh;if(!object.isMesh||!object.visible)return;
         const material=Array.isArray(object.material)?object.material[0]:object.material;
         if(!(material instanceof THREE.MeshStandardMaterial)||material.transparent)return;
         const source=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();source.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
         const clean=new THREE.BufferGeometry();clean.setAttribute('position',source.getAttribute('position').clone());clean.setAttribute('normal',source.getAttribute('normal').clone());
         const count=source.getAttribute('position').count,colors=new Float32Array(count*3),color=proxyColor(material);for(let i=0;i<count;i++)color.toArray(colors,i*3);clean.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(clean);source.dispose();
       });
       const merged=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());
       if(merged){proxy=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.1}));proxy.name='neon-car-reflection';proxy.matrixAutoUpdate=false;proxy.visible=false;scene.add(proxy);proxies.set(car,proxy);}
     }
     if(proxy){proxy.matrix.copy(car.matrixWorld);proxy.matrixWorldNeedsUpdate=true;proxy.visible=true;car.visible=false;}
   }
   try{reflectionRender.call(this,renderer,scene,camera,geometry,material,group);}
   finally{if(facadeDetail)facadeDetail.visible=detailVisible!;for(const car of cars){car.visible=true;const proxy=proxies.get(car);if(proxy)proxy.visible=false;}}
 };
 // The reflector itself has no lights/shadows; reuse the already rendered
 // shadow maps and a fixed sub-HD reflection target. No SSR ray marching.
 return mesh;
}
