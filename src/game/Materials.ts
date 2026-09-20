import * as THREE from 'three';
import {
  createAsphaltTextures,
  createConcreteTextures,
  createCrowdTexture,
  createGrassTextures,
  createGravelTextures,
  createKerbTextures,
} from './track/ProceduralTextures';

export interface MaterialLibrary {
  asphalt: THREE.MeshStandardMaterial;
  runoffAsphalt: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  barrier: THREE.MeshStandardMaterial;
  tecpro: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  paintWhite: THREE.MeshStandardMaterial;
  paintRed: THREE.MeshStandardMaterial;
  paintBlue: THREE.MeshStandardMaterial;
  paintYellow: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  crowd: THREE.MeshStandardMaterial;
  grandstand: THREE.MeshStandardMaterial;
  seatRed: THREE.MeshStandardMaterial;
  seatGrey: THREE.MeshStandardMaterial;
  roofWhite: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  building: THREE.MeshStandardMaterial;
  facade: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  foliageLight: THREE.MeshStandardMaterial;
  shrub: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  earth: THREE.MeshStandardMaterial;
  distantHill: THREE.MeshStandardMaterial;
  distantHillLight: THREE.MeshStandardMaterial;
  tarmacPath: THREE.MeshStandardMaterial;
  astroturf: THREE.MeshStandardMaterial;
  emissivePanel: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  dispose(): void;
}

function pbr(
  textures: { map: THREE.CanvasTexture; normalMap?: THREE.CanvasTexture; roughnessMap?: THREE.CanvasTexture },
  options: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: textures.map,
    normalMap: textures.normalMap,
    // Albedo is sRGB; cloned color maps are not valid linear roughness maps.
    roughnessMap: textures.roughnessMap?.colorSpace === THREE.NoColorSpace ? textures.roughnessMap : null,
    ...options,
  });
}

/**
 * Add world-scaled colour history after the tiled texture is sampled. This keeps
 * the grass and painted runoff from reading as a single repeated material while
 * retaining their existing PBR maps and draw calls.
 */
function addWorldSurfaceVariation(material: THREE.MeshStandardMaterial, kind: 'grass' | 'gravel' | 'runoff'): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vSurfaceWorld;
       ${kind === 'grass' ? 'attribute float groundWear;\nvarying float vGroundWear;' : ''}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vSurfaceWorld = (modelMatrix * vec4(position, 1.0)).xyz;
       ${kind === 'grass' ? 'vGroundWear = groundWear;' : ''}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSurfaceWorld;
      ${kind === 'grass' ? 'varying float vGroundWear;' : ''}
      float surfaceHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float surfaceNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(surfaceHash(i), surfaceHash(i + vec2(1.0, 0.0)), f.x), mix(surfaceHash(i + vec2(0.0, 1.0)), surfaceHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
    `);
    const variation = kind === 'grass'
      ? `
        // The ribbon carries track-side use as a static attribute: outer corner
        // verges dry sooner than the mown inside. Fine world noise only softens
        // the transition, so it reads as land management rather than a tile.
        float grazing = surfaceNoise(vSurfaceWorld.xz * .070 + vec2(13.7, 4.1));
        float dryAmount = clamp(vGroundWear * .84 + (grazing - .5) * .12, 0.0, 1.0);
        vec3 grassTint = mix(vec3(1.03, .91, .66), vec3(1.10, .84, .56), dryAmount);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * grassTint, .50 + dryAmount * .25);
      `
      : kind === 'gravel'
        ? `
          float gravelBed = surfaceNoise(vSurfaceWorld.xz * .030);
          float gravelFine = surfaceNoise(vSurfaceWorld.xz * .21 + vec2(2.1, 9.4));
          vec3 warmGrey = mix(vec3(.76, .74, .64), vec3(.91, .84, .68), gravelBed);
          diffuseColor.rgb *= warmGrey * (.91 + gravelFine * .10);
        `
        : `
        float scuffPatch = surfaceNoise(vSurfaceWorld.xz * .16 + vec2(7.2, 19.4));
        float scuff = .04 + smoothstep(.58, .84, scuffPatch) * .12;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.06, .18, .11), scuff);
      `;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>${variation}`);
  };
  material.customProgramCacheKey = () => `gridpunk-${kind}-world-variation-v2`;
}

export function createMaterials(): MaterialLibrary {
  const asphaltTex = createAsphaltTextures(512);
  const asphalt = pbr(asphaltTex, { color: 0xf0f0f0, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.22, normalScale: new THREE.Vector2(0.12, 0.12), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

  const runoffTex = asphaltTex;
  const runoffAsphalt = pbr(runoffTex, { color: 0x8a8d90, roughness: 0.9, metalness: 0.0, normalScale: new THREE.Vector2(0.1, 0.1), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

  const kerb = pbr(createKerbTextures(256), { roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.16, 0.16), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  const grass = pbr(createGrassTextures(256), { color: 0xd3c996, roughness: 0.98, metalness: 0.0, normalScale: new THREE.Vector2(0.2, 0.2), polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  addWorldSurfaceVariation(grass, 'grass');

  const gravel = pbr(createGravelTextures(256), { color: 0xc9c1ab, roughness: 1.0, metalness: 0.0, normalScale: new THREE.Vector2(0.3, 0.3), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  addWorldSurfaceVariation(gravel, 'gravel');

  const concrete = pbr(createConcreteTextures(256, 172), { roughness: 0.85, metalness: 0.0, normalScale: new THREE.Vector2(0.35, 0.35) });

  const barrier = pbr(createConcreteTextures(256, 210), { color: 0xdfe3e6, roughness: 0.55, metalness: 0.15, normalScale: new THREE.Vector2(0.2, 0.2) });

  const tecproTex = createConcreteTextures(256, 225);
  const tecpro = new THREE.MeshStandardMaterial({
    map: tecproTex.map,
    normalMap: tecproTex.normalMap,
    roughness: 0.6,
    metalness: 0.05,
    color: 0xffffff,
  });

  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0c6, roughness: 0.35, metalness: 0.9 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.45, metalness: 0.85 });

  const paintWhite = new THREE.MeshStandardMaterial({ color: 0xf3f3ee, roughness: 0.5, metalness: 0.0 });
  const paintRed = new THREE.MeshStandardMaterial({ color: 0xd7372f, roughness: 0.5, metalness: 0.0 });
  const paintBlue = new THREE.MeshStandardMaterial({ color: 0x1e56c8, roughness: 0.5, metalness: 0.0 });
  const paintYellow = new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.5, metalness: 0.0 });

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x426579,
    roughness: 0.08,
    metalness: 0.0,
    transmission: 0.0,
    transparent: true,
    opacity: 0.86,
    envMapIntensity: 1.4,
  });

  const crowd = new THREE.MeshStandardMaterial({
    map: createCrowdTexture(256),
    roughness: 0.9,
    metalness: 0.0,
  });

  const grandstand = new THREE.MeshStandardMaterial({ color: 0xaeb5bb, roughness: 0.72, metalness: 0.06 });
  // Plastic bucket seats; the main tribuna is red, most others grey/blue.
  const seatRed = new THREE.MeshStandardMaterial({ color: 0xc0132c, roughness: 0.72, metalness: 0.04 });
  const seatGrey = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.75, metalness: 0.05 });
  const roofWhite = new THREE.MeshStandardMaterial({ color: 0xe4e8ec, roughness: 0.32, metalness: 0.55 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.4, metalness: 0.6 });
  const building = pbr(createConcreteTextures(256, 196), { roughness: 0.7, metalness: 0.05, normalScale: new THREE.Vector2(0.35, 0.35) });
  // Architectural and landscape accents intentionally sit in the warm, dry
  // Catalan palette rather than default grey/green primitives.
  const facade = pbr(createConcreteTextures(256, 184), { color: 0xd1c6b2, roughness: 0.82, metalness: 0.0, normalScale: new THREE.Vector2(0.22, 0.22) });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xaa4f35, roughness: 0.77, metalness: 0.02 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x264128, roughness: 0.96, metalness: 0.0, flatShading: true });
  const foliageLight = new THREE.MeshStandardMaterial({ color: 0x3f5e30, roughness: 0.95, metalness: 0.0, flatShading: true });
  const shrub = new THREE.MeshStandardMaterial({ color: 0x334b27, roughness: 0.98, metalness: 0.0 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x5b4631, roughness: 1.0, metalness: 0.0, flatShading: true });
  const earth = new THREE.MeshStandardMaterial({ color: 0x786548, roughness: 1.0, metalness: 0.0, flatShading: true });
  const distantHill = new THREE.MeshStandardMaterial({ color: 0x566452, roughness: 1.0, metalness: 0.0, flatShading: true, side: THREE.BackSide });
  const distantHillLight = new THREE.MeshStandardMaterial({ color: 0x78806b, roughness: 1.0, metalness: 0.0, flatShading: true, side: THREE.BackSide });

  const tarmacPath = new THREE.MeshStandardMaterial({ color: 0x4a4d51, roughness: 0.92, metalness: 0.0 });

  const astroturf = new THREE.MeshStandardMaterial({ color: 0x1d7058, roughness: 0.95, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  addWorldSurfaceVariation(astroturf, 'runoff');

  const emissivePanel = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    emissive: 0x2b6cff,
    emissiveIntensity: 1.6,
    roughness: 0.3,
    metalness: 0.2,
  });

  const rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.85, metalness: 0.0 });

  const carbon = new THREE.MeshPhysicalMaterial({
    color: 0x111316,
    roughness: 0.53,
    metalness: 0.12,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.28,
  });

  const all: (THREE.Material | undefined)[] = [
    asphalt, runoffAsphalt, kerb, grass, gravel, concrete, barrier, tecpro, metal, darkMetal,
    paintWhite, paintRed, paintBlue, paintYellow, glass, crowd, grandstand, seatRed, seatGrey, roofWhite, roof, building,
    facade, terracotta, foliage, foliageLight, shrub, bark, earth, distantHill, distantHillLight,
    tarmacPath, astroturf, emissivePanel, rubber, carbon,
  ];

  return {
    asphalt, runoffAsphalt, kerb, grass, gravel, concrete, barrier, tecpro, metal, darkMetal,
    paintWhite, paintRed, paintBlue, paintYellow, glass, crowd, grandstand, seatRed, seatGrey, roofWhite, roof, building,
    facade, terracotta, foliage, foliageLight, shrub, bark, earth, distantHill, distantHillLight,
    tarmacPath, astroturf, emissivePanel, rubber, carbon,
    dispose() {
      for (const material of all) {
        if (!material) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.normalMap?.dispose();
        m.roughnessMap?.dispose();
        m.dispose();
      }
    },
  };
}
