import * as THREE from 'three';

/** Keep the reflective bay outside the circuit, including its verges and city blocks. */
export function createSolarBay(trackPositions: readonly THREE.Vector3[]): THREE.Mesh {
  const bounds = new THREE.Box3().setFromPoints([...trackPositions]);
  const centre = bounds.getCenter(new THREE.Vector3());
  const trackRadius = Math.max(...trackPositions.map(p => Math.hypot(p.x - centre.x, p.z - centre.z)));
  const segments = 64, arc = Math.PI * .7, clearance = 120;
  // Ring edges are chords: compensate so their midpoints also retain the clearance.
  const innerRadius = Math.max(1040, (trackRadius + clearance) / Math.cos(arc / segments / 2));
  const water = new THREE.Mesh(
    new THREE.RingGeometry(innerRadius, Math.max(1900, innerRadius + 860), segments, 1, Math.PI * .3, arc),
    new THREE.MeshStandardMaterial({ color: 0x1e5f8e, roughness: .1, metalness: .6, envMapIntensity: 3 }),
  );
  water.name = 'solar-bay';
  water.rotation.x = -Math.PI / 2;
  water.position.set(centre.x, -.03, centre.z);
  return water;
}

/** World-space aggregate, repair stains and fine grain remain the same size across the ribbon. */
export function solarRoadSurface(material: THREE.MeshStandardMaterial): void {
  material.normalScale.set(.32,.32);
  material.roughness=.76;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSolarWorld;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSolarWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSolarWorld;
      float solarHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float solarNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(solarHash(i),solarHash(i+vec2(1,0)),f.x),mix(solarHash(i+vec2(0,1)),solarHash(i+vec2(1,1)),f.x),f.y);}
    `).replace('#include <color_fragment>',`#include <color_fragment>
      float grain=solarNoise(vSolarWorld.xz*95.);
      float aggregate=solarNoise(vSolarWorld.xz*11.);
      float patches=solarNoise(vSolarWorld.xz*.42);
      diffuseColor.rgb *= .65 + .43*aggregate + .25*grain + .30*patches;
    `);
  };
  material.customProgramCacheKey=()=> 'solar-dry-aggregate-v1';
}
