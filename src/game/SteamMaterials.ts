import * as THREE from 'three';

export function createSteamRaceBoard(title = 'Kairo Steam', solar = false): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#27332e'; c.fillRect(0, 0, 1024, 128);
  c.strokeStyle = solar ? '#badb8e' : '#bc985f'; c.lineWidth = 6; c.strokeRect(6, 6, 1012, 116);
  c.fillStyle = solar ? '#f1f5e9' : '#efdab0'; c.textAlign = 'center'; c.font = 'bold 68px Georgia'; c.fillText('START / FINISH', 512, 75);
  c.fillStyle = solar ? '#badb8e' : '#c5a16a'; c.font = '18px Arial'; c.fillText(`${title.toUpperCase()}   /   RACE CONTROL`, 512, 109);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ name: solar ? 'solar-start-finish-sign' : 'steam-start-finish-sign', map, roughness: .7, metalness: .15 });
}

/** A shared brick/window atlas, mapped in metres on every side of the instanced city blocks. */
export function createSteamMaterials() {
  const textures: THREE.Texture[] = [];
  const texture = (canvas: HTMLCanvasElement) => {
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; textures.push(map); return map;
  };
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#67594b'; c.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 32; row++) for (let col = -1; col < 16; col++) {
    const x = col * 40 + (row % 2) * 20, y = row * 17;
    c.fillStyle = ['#83513b', '#986246', '#74503c', '#a16b50', '#86533d'][(row * 7 + col + 16) % 5];
    c.fillRect(x + 1, y + 1, 38, 15);
    c.fillStyle = 'rgba(230,187,128,.12)'; c.fillRect(x + 2, y + 1, 37, 2);
  }
  const brickMap = texture(canvas);
  const windows = document.createElement('canvas'); windows.width = windows.height = 512;
  const w = windows.getContext('2d')!; w.drawImage(canvas, 0, 0);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const x = col * 256, y = row * 256;
    w.strokeStyle = '#c9aa7a'; w.lineWidth = 14;
    w.beginPath(); w.moveTo(x + 49, y + 215); w.lineTo(x + 49, y + 100); w.arc(x + 128, y + 100, 79, Math.PI, 0); w.lineTo(x + 207, y + 215); w.closePath();
    w.fillStyle = '#24383a'; w.fill(); w.stroke();
    const glow = w.createLinearGradient(0, y + 45, 0, y + 215);
    glow.addColorStop(0, '#405459'); glow.addColorStop(.55, '#4c5650'); glow.addColorStop(1, (col + row) % 2 ? '#b48748' : '#86714e');
    w.fillStyle = glow; w.fillRect(x + 59, y + 105, 138, 102);
    w.strokeStyle = '#252e2b'; w.lineWidth = 6;
    for (const u of [82, 128, 174]) { w.beginPath(); w.moveTo(x + u, y + 63); w.lineTo(x + u, y + 209); w.stroke(); }
    for (const v of [106, 157]) { w.beginPath(); w.moveTo(x + 54, y + v); w.lineTo(x + 202, y + v); w.stroke(); }
    w.fillStyle = '#b59566'; w.fillRect(x + 38, y + 219, 180, 13);
    w.fillStyle = '#403b32'; w.fillRect(x, y + 246, 256, 10);
  }
  const facadeMap = texture(windows);
  const mapped = (map: THREE.Texture, name: string, metres: number) => {
    const mat = new THREE.MeshStandardMaterial({ name, map, roughness: .88, color: 0xffffff });
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vec3 steamScale=vec3(1.);
        #ifdef USE_INSTANCING
          steamScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        #endif
        vec3 steamP=(position+vec3(.5))*steamScale;
        vec2 steamUV=abs(normal.y)>.5?steamP.xz:vec2(abs(normal.x)>.5?steamP.z:steamP.x,steamP.y);
        #ifdef USE_MAP
          vMapUv=steamUV/${metres.toFixed(1)};
        #endif
      `);
    };
    mat.customProgramCacheKey = () => `steam-metre-facade-${metres}`;
    return mat;
  };
  const brick = mapped(brickMap, 'steam-brick', 5);
  const facade = mapped(facadeMap, 'steam-arched-facade', 8);
  // Distinct, metre-scaled elevations keep every side detailed, including distant blocks.
  const elevation = (kind: 'limestone' | 'soot' | 'glass') => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = kind === 'limestone' ? '#b9aa8e' : kind === 'soot' ? '#4e4840' : '#425c60';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = kind === 'limestone' ? '#92846e' : '#373c37'; ctx.lineWidth = 3;
    for (let y = 0; y < 512; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
      for (let x = (y % 64 ? 32 : 0); x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const x = col * 256, y = row * 256, inset = kind === 'glass' ? 8 : kind === 'soot' ? 27 : 58;
      ctx.fillStyle = kind === 'limestone' ? '#e0c9a1' : '#283936';
      ctx.fillRect(x + inset - 8, y + 24, 272 - inset * 2, 209);
      const pane = ctx.createLinearGradient(x, y + 35, x + 170, y + 220);
      pane.addColorStop(0, '#3d565a'); pane.addColorStop(.48, '#617774'); pane.addColorStop(1, (row + col) % 2 ? '#aa8956' : '#344543');
      ctx.fillStyle = pane; ctx.fillRect(x + inset, y + 35, 256 - inset * 2, 184);
      ctx.fillStyle = kind === 'limestone' ? '#bca37b' : '#23342f';
      for (let u = inset; u <= 256 - inset; u += (256 - inset * 2) / (kind === 'limestone' ? 2 : 4)) ctx.fillRect(x + u - 2, y + 35, 4, 184);
      for (const v of [94, 156]) ctx.fillRect(x + inset, y + v, 256 - inset * 2, 5);
      ctx.fillRect(x + inset - 12, y + 226, 280 - inset * 2, 10);
    }
    return mapped(texture(canvas), `steam-${kind}-facade`, kind === 'glass' ? 6 : 8);
  };
  const limestone = elevation('limestone'), soot = elevation('soot'), glazing = elevation('glass');
  const glass = new THREE.MeshStandardMaterial({ name: 'steam-roof-glass', color: 0x608782, roughness: .32, metalness: .35 });
  const slate = new THREE.MeshStandardMaterial({ name: 'steam-slate', color: 0x3d4652, roughness: .85 });
  const iron = new THREE.MeshStandardMaterial({ name: 'steam-riveted-iron', color: 0x33413d, metalness: .55, roughness: .64 });
  const copper = new THREE.MeshStandardMaterial({ name: 'steam-copper', color: 0xa96b3f, metalness: .65, roughness: .48 });
  const brass = new THREE.MeshStandardMaterial({ name: 'steam-brass', color: 0xc19a55, metalness: .6, roughness: .42 });
  const stone = new THREE.MeshStandardMaterial({ name: 'steam-sandstone', color: 0xae9875, roughness: .91 });
  const roof = new THREE.MeshStandardMaterial({ name: 'steam-patinated-roof', color: 0x3f7168, metalness: .35, roughness: .76 });
  const dark = new THREE.MeshStandardMaterial({ name: 'steam-recess', color: 0x242b29, roughness: .9 });
  const lamp = new THREE.MeshStandardMaterial({ name: 'steam-gaslight', color: 0xffd795, emissive: 0xffbc66, emissiveIntensity: 1.2, roughness: .6 });
  return { brick, facade, limestone, soot, glazing, glass, slate, iron, copper, brass, stone, roof, dark, lamp, textures, texture,
    dispose: () => textures.forEach(map => map.dispose()) };
}
