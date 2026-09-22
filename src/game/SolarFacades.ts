import * as THREE from 'three';

/** Shared window bays for the city blocks and service cores that used to be bare plaster.
 * The instanced unit boxes map in metres, so tall walls do not stretch a single window. */
export function createSolarFacades() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const heightCanvas = document.createElement('canvas'); heightCanvas.width = heightCanvas.height = 512;
  const c = canvas.getContext('2d')!, relief = heightCanvas.getContext('2d')!;
  c.fillStyle = '#cfcbb9'; c.fillRect(0, 0, 512, 512);
  relief.fillStyle = '#aaaaaa'; relief.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const x = col * 256, y = row * 256;
    // Inset reveal, slim frame and cool glazing with a subdued interior reflection.
    c.fillStyle = '#747b71'; c.fillRect(x + 45, y + 43, 166, 168);
    c.fillStyle = '#e6dfc8'; c.fillRect(x + 49, y + 47, 158, 160);
    const gradient = c.createLinearGradient(0, y + 50, 0, y + 204);
    gradient.addColorStop(0, '#789ba0'); gradient.addColorStop(.35, '#4d777e'); gradient.addColorStop(1, '#294d56');
    c.fillStyle = gradient; c.fillRect(x + 54, y + 52, 148, 150);
    c.fillStyle = '#c9d0ba'; c.fillRect(x + 125, y + 52, 4, 150); c.fillRect(x + 54, y + 123, 148, 3);
    c.fillStyle = 'rgba(215,228,214,.16)'; c.fillRect(x + 60, y + 54, 13, 145);
    relief.fillStyle = '#333333'; relief.fillRect(x + 54, y + 52, 148, 150);
    // Exterior sunshade, sill and horizontal floor joint supply scale on all four sides.
    c.fillStyle = '#a4a590'; c.fillRect(x + 40, y + 34, 176, 12);
    c.fillStyle = '#ece3c9'; c.fillRect(x + 36, y + 31, 184, 7);
    c.fillStyle = '#e5ddc3'; c.fillRect(x + 42, y + 207, 172, 10);
    c.fillStyle = '#b6b6a4'; c.fillRect(x, y + 245, 256, 3);
    relief.fillStyle = '#eeeeee'; relief.fillRect(x + 36, y + 31, 184, 7); relief.fillRect(x + 42, y + 207, 172, 10);
    if ((row + col) % 2 === 0) {
      // Timber louvers alternate with planted window boxes to break the repeated grid.
      for (let slat = 0; slat < 6; slat++) {
        c.fillStyle = slat % 2 ? '#8b795b' : '#a3936b'; c.fillRect(x + 172, y + 52 + slat * 25, 28, 18);
      }
    } else {
      c.fillStyle = '#767c55'; c.fillRect(x + 60, y + 204, 135, 17);
      for (let leaf = 0; leaf < 60; leaf++) {
        c.fillStyle = ['#517041', '#6f8c4d', '#859856'][leaf % 3];
        c.beginPath(); c.ellipse(x + 64 + (leaf * 37 % 128), y + 203 - (leaf * 13 % 14), 5, 8, leaf * .7, 0, Math.PI * 2); c.fill();
      }
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(heightCanvas);
  for (const texture of [map, bumpMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; }
  const make = (name: string, color: number, floorHeight = 3.6) => {
    const material = new THREE.MeshStandardMaterial({ name, map, bumpMap, bumpScale: .075, color, roughness: .76, metalness: .04, envMapIntensity: .3 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vec3 facadeScale = vec3(1.);
        #ifdef USE_INSTANCING
          facadeScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #endif
        vec3 facadePosition = (position + vec3(.5)) * facadeScale;
        float facadeHorizontal = abs(normal.x) > .5 ? facadePosition.z : facadePosition.x;
        // Two 3.6 m window bays in each atlas direction; roofs stay plain plaster.
        vec2 facadeUv = abs(normal.y) > .5 ? vec2(.01) : vec2(facadeHorizontal, facadePosition.y) / vec2(7.2, ${(floorHeight * 2).toFixed(1)});
        #ifdef USE_MAP
          vMapUv = facadeUv;
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = facadeUv;
        #endif
      `);
    };
    material.customProgramCacheKey = () => `solar-facade-metres-v1-${floorHeight}`;
    return material;
  };
  const tints = [make('solar-windowed-blush', 0xf6d0bf), make('solar-windowed-sage', 0xdbe7cb), make('solar-windowed-ochre', 0xf6dcae)];
  return { cool: make('solar-windowed-plaster', 0xffffff), warm: make('solar-windowed-sandstone', 0xf4dcc0), tower: make('solar-windowed-tower-core', 0xffffff, 4), tints,
    dispose: () => { map.dispose(); bumpMap.dispose(); } };
}
