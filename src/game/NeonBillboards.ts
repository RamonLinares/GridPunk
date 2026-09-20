import * as THREE from 'three';
import {ledTime} from './NeonLedSigns';

/** Cinematic tier: Neon Signal display model, 128-column LED cells with round apertures, dead pixels and flicker. */
const billboardCinematic={value:0};

// Atlas order: original portraits, then six original product/travel campaigns.
export const NEON_CAMPAIGNS = ['echo', 'akari', 'noctiluca', 'midnight', 'orbital', 'pulse', 'synapse', 'nightshift', 'aerial'] as const;
const colours = [
  [.08,.42,.62], [.8,.065,.045], [.08,.42,.62], [.65,.23,.04],
  [.12,.3,.58], [.65,.04,.2], [.3,.13,.58], [.3,.38,.08], [.6,.26,.065],
];

/** One compressed image, shared GPU uploads per UV convention; no extra lights. */
export function createNeonBillboards() {
  const atlas = new THREE.TextureLoader().load('/circuits/neon-billboard-atlas-v2.webp');
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  const palette = (flipY:boolean, intensity:number) => NEON_CAMPAIGNS.map((name,index) => {
    const texture = atlas.clone();
    texture.flipY = flipY;
    // Four-pixel gutters keep adjacent ads out of filtered billboard edges.
    const column=index%3, row=Math.floor(index/3);
    texture.repeat.set(504/1536,1016/3072);
    texture.offset.set((column*512+4)/1536,((flipY?2-row:row)*1024+4)/3072);
    const material = new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:intensity,roughness:.5});
    material.onBeforeCompile=shader=>{
      shader.uniforms.uBbCinematic=billboardCinematic;
      shader.uniforms.uBbTime=ledTime;
      shader.uniforms.uBbTile={value:new THREE.Vector4(texture.offset.x,texture.offset.y,texture.repeat.x,texture.repeat.y)};
      shader.fragmentShader='uniform float uBbCinematic,uBbTime;uniform vec4 uBbTile;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',`
       #ifdef USE_EMISSIVEMAP
        vec4 emissiveColor;
        if(uBbCinematic>0.5){
         vec2 cells=vec2(128.0,258.0);
         vec2 tile=(vEmissiveMapUv-uBbTile.xy)/uBbTile.zw;
         vec2 cell=floor(tile*cells);vec2 f=fract(tile*cells)-0.5;
         emissiveColor=texture2D(emissiveMap,uBbTile.xy+(cell+0.5)/cells*uBbTile.zw);
         float aperture=1.0-smoothstep(0.30,0.40,length(f));
         float cellHash=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
         float dead=step(0.995,cellHash);
         float flicker=0.9+0.1*fract(sin(cellHash*91.7+floor(uBbTime*23.0)*0.37)*15731.743);
         emissiveColor.rgb*=mix(1.0,aperture*1.55,0.85)*(1.0-dead)*flicker;
        }else emissiveColor=texture2D(emissiveMap,vEmissiveMapUv);
        totalEmissiveRadiance*=emissiveColor.rgb;
       #endif`);
    };
    material.customProgramCacheKey=()=>'neon-billboard-cells-v1';
    material.name=`neon-campaign-${name}`;
    material.userData.campaign=name;
    return material;
  });
  const materials=palette(true,4.1), gltfMaterials=palette(false,2.6);
  const placements:{x:number;z:number;index:number}[]=[], counts=NEON_CAMPAIGNS.map(()=>0);
  return {
    materials,gltfMaterials,placements,
    setCinematic(enabled:boolean){billboardCinematic.value=enabled?1:0;},
    radiance(index:number) { return new THREE.Vector3(...colours[index] as [number,number,number]); },
    pick(x:number,z:number) {
      // Choose once when building the city. Penalize nearby repeats strongly,
      // then balance overall usage; sharing a building model no longer fixes its ad.
      let best=0, bestScore=Infinity;
      for(let index=0;index<NEON_CAMPAIGNS.length;index++) {
        let score=counts[index];
        for(const p of placements) if(p.index===index) score+=Math.max(0,180-Math.hypot(x-p.x,z-p.z))*4;
        if(score<bestScore){best=index;bestScore=score;}
      }
      counts[best]++;placements.push({x,z,index:best});return best;
    },
    dispose() {
      for(const m of [...materials,...gltfMaterials]){m.map?.dispose();m.dispose();}
      atlas.dispose();
    },
  };
}
export type NeonBillboards = ReturnType<typeof createNeonBillboards>;
