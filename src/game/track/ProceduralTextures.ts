import * as THREE from 'three';

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  return { canvas, ctx };
}

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function hashP(x: number, y: number, px: number, py: number): number {
  const wx = ((x % px) + px) % px;
  const wy = ((y % py) + py) % py;
  return hash(wx, wy);
}

/** Seamlessly tileable value noise: integer coordinates wrap on px/py. */
function valueNoise(x: number, y: number, px: number, py: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashP(xi, yi, px, py);
  const b = hashP(xi + 1, yi, px, py);
  const c = hashP(xi, yi + 1, px, py);
  const d = hashP(xi + 1, yi + 1, px, py);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fbm. `baseFreq` is the integer period of the first octave. */
function fbm(x: number, y: number, octaves: number, baseFreq = 8, gain = 0.5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise(x * freq, y * freq, freq, freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

function canvasTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

function heightToNormal(height: Float32Array, size: number, strength = 1.6): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const o = (y * size + x) * 4;
      image.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      image.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      image.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export interface TextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function createAsphaltTextures(size = 512): TextureSet {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const grain = fbm(u, v, 3, 192);
      const patch = fbm(u, v, 3, 8);
      const crackNoise = fbm(u, v, 3, 24);
      let base = 72 + grain * 12 + patch * 6;
      // Darker polished racing line down the centre third.
      const centre = Math.exp(-Math.pow((u - 0.5) / 0.16, 2));
      base -= centre * 10;
      // Oil/tyre streaks along the direction of travel.
      base -= Math.max(0, crackNoise - 0.62) * 30 * (0.4 + centre);
      let r = base;
      let g = base * 1.01;
      let b = base * 1.06;

      // Painted edge lines.
      const lineWidth = 0.012;
      const isLine = u > 1 - lineWidth - 0.02 && u < 1 - 0.02;
      const isLine2 = u > 0.02 && u < 0.02 + lineWidth;
      if (isLine || isLine2) {
        const wear = 0.75 + fbm(u, v, 3, 96) * 0.25;
        r = 226 * wear;
        g = 226 * wear;
        b = 222 * wear;
      }
      const o = (y * size + x) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 255;
      height[y * size + x] = grain * 0.7 + crackNoise * 0.3 - centre * 0.25 + (isLine ? 0.4 : 0);
    }
  }
  ctx.putImageData(image, 0, 0);
  const map = canvasTexture(canvas, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(height, size, 2.2);

  const rough = makeCanvas(size);
  const rimg = rough.ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const centre = Math.exp(-Math.pow((u - 0.5) / 0.16, 2));
      const val = 205 - centre * 60 + fbm(u, v, 3, 64) * 30;
      const o = (y * size + x) * 4;
      rimg.data[o] = val;
      rimg.data[o + 1] = val;
      rimg.data[o + 2] = val;
      rimg.data[o + 3] = 255;
    }
  }
  rough.ctx.putImageData(rimg, 0, 0);
  const roughnessMap = canvasTexture(rough.canvas, 1);
  return { map, normalMap, roughnessMap };
}

export function createKerbTextures(size = 256, yellow = false): TextureSet {
  const { canvas, ctx } = makeCanvas(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const band = Math.floor((y / size) * 8) % 2 === 0;
      const grain = fbm(x / size, y / size, 3, 96);
      const r = band ? 208 : 236;
      const g = band ? 40 : yellow ? 192 : 236;
      const b = band ? 36 : yellow ? 25 : 232;
      ctx.fillStyle = `rgb(${Math.floor(r * (0.86 + grain * 0.14))},${Math.floor(g * (0.86 + grain * 0.14))},${Math.floor(b * (0.86 + grain * 0.14))})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i += 1) height[i] = fbm((i % size) / size, Math.floor(i / size) / size, 3, 48);
  const map = canvasTexture(canvas, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: heightToNormal(height, size, 1.2), roughnessMap: map.clone() };
}

export function createGrassTextures(size = 256, dry = false): TextureSet {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const blades = fbm(u, v, 3, 192);
      const clumps = fbm(u, v, 3, 32);
      const patch = fbm(u, v, 3, 16);
      const g = dry ? 132 + clumps * 25 + blades * 13 - patch * 10 : 94 + clumps * 28 + blades * 13 - patch * 8;
      const r = g * (dry ? 1.17 : 0.76) + blades * 8;
      const b = g * (dry ? .62 : .39) + 7;
      const o = (y * size + x) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 255;
      height[y * size + x] = blades * 0.7 + clumps * 0.3;
    }
  }
  ctx.putImageData(image, 0, 0);
  const map = canvasTexture(canvas, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: heightToNormal(height, size, 1.0), roughnessMap: map.clone() };
}

export function createGravelTextures(size = 256, pale = false): TextureSet {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const pebbles = fbm(u, v, 4, 128);
      const base = 132 + pebbles * 44;
      const o = (y * size + x) * 4;
      image.data[o] = base * 1.06;
      image.data[o + 1] = base * (pale ? 1.01 : .88);
      image.data[o + 2] = base * (pale ? .94 : .69);
      image.data[o + 3] = 255;
      height[y * size + x] = pebbles;
    }
  }
  ctx.putImageData(image, 0, 0);
  const map = canvasTexture(canvas, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: heightToNormal(height, size, 0.9), roughnessMap: map.clone() };
}

export function createConcreteTextures(size = 256, tint = 168): TextureSet {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const grime = fbm(u, v, 4, 48);
      const stain = fbm(u, v, 3, 8);
      const val = tint + grime * 30 - stain * 26;
      const o = (y * size + x) * 4;
      image.data[o] = val;
      image.data[o + 1] = val * 0.99;
      image.data[o + 2] = val * 0.96;
      image.data[o + 3] = 255;
      height[y * size + x] = grime;
    }
  }
  ctx.putImageData(image, 0, 0);
  const map = canvasTexture(canvas, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: heightToNormal(height, size, 1.4), roughnessMap: map.clone() };
}

export function createCrowdTexture(size = 128): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#1b1e24';
  ctx.fillRect(0, 0, size, size);
  const palette = [
    '#d94f4f', '#e0b24a', '#4f7fd9', '#e8e2d0', '#3fa06a', '#c2564f',
    '#8a5fd0', '#d98a3f', '#dcdcdc', '#f0c040', '#e88f8f', '#7fb0e8',
  ];
  // Dense rows of spectators (heads/torsos), a little colour noise between.
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 1) {
      if (hash(x * 0.53, y * 0.71) > 0.4) {
        ctx.fillStyle = palette[Math.floor(hash(x + 3, y + 7) * palette.length)];
        const w = 1 + (hash(x + 1, y + 2) > 0.7 ? 1 : 0);
        ctx.fillRect(x, y, w, 2);
      }
    }
  }
  const texture = canvasTexture(canvas, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(12, 1);
  return texture;
}

export function createAsphaltRunoffTextures(size = 512): TextureSet {
  const set = createAsphaltTextures(size);
  set.map.repeat.set(1, 1);
  return set;
}
