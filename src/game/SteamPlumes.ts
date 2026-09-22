import * as THREE from 'three';

export type PressureVent = { origin: THREE.Vector3; alongFacade: THREE.Vector3 };

/** World-sized billboards avoid the hardware point-size cap on nearby steam. */
export function createSteamPlumes(chimneys: THREE.Vector3[], valves: PressureVent[]) {
  const origins: number[] = [], phases: number[] = [], kinds: number[] = [], seeds: number[] = [], flows: number[] = [];
  const emit = (origin: THREE.Vector3, flow: THREE.Vector3, kind: number, index: number) => {
    const count = kind ? 20 : 32;
    for (let k = 0; k < count; k++) {
      origins.push(origin.x, origin.y, origin.z); phases.push(k / count);
      kinds.push(kind); seeds.push(index * 2.39996); flows.push(flow.x, flow.y, flow.z);
    }
  };
  chimneys.forEach((origin, i) => emit(origin, new THREE.Vector3(5, 30, 2), 0, i));
  valves.forEach((vent, i) => emit(vent.origin, vent.alongFacade.clone().multiplyScalar(2).add(new THREE.Vector3(0, 12, 0)), 1, i + chimneys.length));
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry(); geometry.index = base.index;
  geometry.setAttribute('position', base.attributes.position); geometry.setAttribute('uv', base.attributes.uv);
  geometry.setAttribute('origin', new THREE.InstancedBufferAttribute(new Float32Array(origins), 3));
  geometry.setAttribute('phase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
  geometry.setAttribute('kind', new THREE.InstancedBufferAttribute(new Float32Array(kinds), 1));
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  geometry.setAttribute('flow', new THREE.InstancedBufferAttribute(new Float32Array(flows), 3));
  geometry.instanceCount = phases.length; base.dispose();
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute vec3 origin; attribute vec3 flow; attribute float phase; attribute float kind; attribute float seed;
      uniform float time; varying vec2 puffUv; varying float age; varying float opacity; varying float variation;
      void main(){
        float lifetime=mix(13.,5.,kind);
        age=fract(phase+time/lifetime+seed*.13);
        float birth=time-age*lifetime;
        float release=mod(birth+seed*2.,14.);
        float pulse=kind>.5 ? (1.-smoothstep(3.5,4.5,release)) : 1.;
        vec3 drift=flow*age;
        drift.x+=sin(seed+phase*24.+age*8.)*age*mix(2.4,.7,kind);
        drift.z+=cos(seed+phase*17.+age*7.)*age*mix(2.,.7,kind);
        vec4 center=modelViewMatrix*vec4(origin+drift,1.);
        float size=mix(3.2+age*13.,1.1+age*7.,kind);
        float turn=seed+age*.65, c=cos(turn), s=sin(turn);
        vec2 p=mat2(c,-s,s,c)*position.xy;
        center.xy+=p*size;
        gl_Position=projectionMatrix*center;
        puffUv=uv; variation=seed+phase*11.;
        opacity=pulse*smoothstep(0.,.06,age)*(1.-smoothstep(.55,1.,age));
        opacity*=1.-smoothstep(650.,1050.,-center.z);
      }`,
    fragmentShader: `varying vec2 puffUv; varying float age; varying float opacity; varying float variation;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){
        vec2 p=puffUv-.5; float n=noise(puffUv*5.+variation)+.4*noise(puffUv*11.-variation);
        float edge=length(p)+(n-.7)*.095;
        float a=(1.-smoothstep(.12,.49,edge))*opacity*.24;
        if(a<.004)discard;
        vec3 color=mix(vec3(.62,.65,.66),vec3(.95,.94,.89),clamp(puffUv.y*.65+n*.45,0.,1.));
        gl_FragColor=vec4(color,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'steam-plumes'; mesh.frustumCulled = false;
  mesh.userData.intentionalOverpass = true;
  mesh.userData.particles = phases.length;
  return { mesh, material };
}
