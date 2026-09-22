import * as THREE from 'three';
import type { createSteamMaterials } from './SteamMaterials';

type Materials = ReturnType<typeof createSteamMaterials>;
type Local = (geo: THREE.BufferGeometry, mat: THREE.Material, u: number, y: number, v: number, w: number, h: number, d: number, rotation?: number[]) => void;
type GeometryKit = { box: THREE.BufferGeometry; cylinder: THREE.BufferGeometry; sphere: THREE.BufferGeometry; cone: THREE.BufferGeometry; ring: THREE.BufferGeometry };
export const steamBuildingStyles = ['terraced-townhouses', 'sawtooth-foundry', 'glass-market', 'stepped-exchange', 'copper-observatory', 'brick-mill'] as const;

/** Shared silhouettes and furnishings. All parts stay inside the caller's reserved footprint. */
export function createSteamBuildingKit(m: Materials, g: GeometryKit) {
  const { box, cylinder, sphere, cone, ring } = g;
  const barrel = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -Math.PI / 2, Math.PI);
  const arch = new THREE.TorusGeometry(1, .025, 3, 20, Math.PI);
  const fanlight = new THREE.CircleGeometry(1, 24, 0, Math.PI);
  const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const styles: Record<string, number> = {}, features: Record<string, number> = {};
  const count = (key: string) => { features[key] = (features[key] ?? 0) + 1; };
  const build = (local: Local, w: number, d: number, height: number, index: number, near: boolean) => {
    const style = index % steamBuildingStyles.length, name = steamBuildingStyles[style];
    styles[name] = (styles[name] ?? 0) + 1;
    const h = style === 1 || style === 2 ? Math.min(height, 17) : height;
    const ledge = (y: number, width = w, depth = d) => local(box, m.stone, 0, y, 0, width + .7, .5, depth + .7);
    const pitched = (x: number, y: number, width: number, depth: number, mat = m.roof) => {
      for (const side of [-1, 1]) local(box, mat, x + side * width / 4, y + width * .14, 0, width * .58, .45, depth + .8, [0, 0, -side * .51]);
    };
    local(box, m.stone, 0, .5, 0, w + 1.6, 1, d + 1.6);
    if (style === 0) {
      // Individually stepped houses, alternating plaster/brick, dormers and chimney pots.
      const bay = w / 3;
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * bay, top = h * [.82, 1, .9][i];
        local(box, i === 1 ? m.facade : m.limestone, x, top / 2, 0, bay - .18, top, d);
        for (const y of [4, top - .4]) local(box, m.stone, x, y, 0, bay + .1, .5, d + .4);
        pitched(x, top, bay, d, m.slate);
        for (const end of [-1, 1]) {
          local(box, m.limestone, x, top + .9, end * d * .29, bay * .45, 2.2, 2.5);
          local(box, m.slate, x, top + 2.15, end * d * .29, bay * .54, .25, 2.8);
          local(box, m.dark, x, 2, end * (d / 2 + .06), 1.5, 3.6, .15);
          local(box, m.copper, x, 4, end * (d / 2 + .55), 2.8, .18, 1.25, [end * .12, 0, 0]);
        }
        local(box, m.brick, x - bay * .3, top + 2, -d * .2, 1.3, 4, 1.8);
        for (const v of [-.5, .5]) local(cylinder, m.copper, x - bay * .3, top + 4.3, -d * .2 + v, .27, .8, .27);
      }
      count('chimney-pot-rows');
    } else if (style === 1) {
      local(box, m.soot, 0, h / 2, 0, w, h, d);
      ledge(4); ledge(h);
      // Three asymmetric sawteeth, with tall glazed northlights and metal slopes.
      const bay = w / 3;
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * bay;
        local(box, m.roof, x, h + 1.9, 0, bay * 1.1, .4, d + .6, [0, 0, .40]);
        local(box, m.glazing, x + bay * .47, h + 1.85, 0, .3, 3.7, d);
        for (const end of [-1, 1]) local(box, m.iron, x, h + 1.9, end * (d / 2 + .22), bay * 1.1, .2, .2, [0, 0, .4]);
      }
      for (const end of [-1, 1]) {
        local(box, m.iron, 0, 3.8, end * (d / 2 + .15), w * .46, 6.8, .3);
        for (let y = 1; y < 7; y += .8) local(box, m.copper, 0, y, end * (d / 2 + .35), w * .44, .09, .09);
      }
      count('sawtooth-roofs');
    } else if (style === 2) {
      local(box, m.facade, 0, 2.4, 0, w, 4.8, d);
      local(box, m.glazing, 0, (h + 4) / 2, 0, w, h - 4, d);
      local(barrel, m.glass, 0, h, 0, w / 2, d, w / 2, [-Math.PI / 2, 0, 0]);
      const ribs = near ? 5 : 3;
      for (let i = 0; i <= ribs; i++) local(arch, m.brass, 0, h, (i / ribs - .5) * d, w / 2 + .12, w / 2 + .12, 1);
      for (const end of [-1, 1]) {
        local(fanlight, m.glass, 0, h, end * (d / 2 + .02), w / 2, w / 2, 1, [0, end === 1 ? 0 : Math.PI, 0]);
        for (let i = -2; i <= 2; i++) {
          const x = i * w / 5;
          local(box, m.iron, x, h / 2, end * (d / 2 + .12), .28, h, .28);
        }
        // Radial glazing bars follow the curved profile rather than projecting above it.
        for (let i = 1; i < 8; i++) {
          const a = i * Math.PI / 8, radius = w / 2;
          local(box, m.brass, Math.cos(a) * radius / 2, h + Math.sin(a) * radius / 2, end * (d / 2 + .14), radius, .13, .13, [0, 0, a]);
        }
      }
      ledge(4.5); count('glass-vaults');
    } else if (style === 3) {
      // A tall commercial exchange: recessed upper floors, roof terraces, corner finials.
      for (let level = 0; level < 3; level++) {
        const width = w * (1 - level * .18), depth = d * (1 - level * .16), top = h * (level + 1) / 3;
        local(box, level === 1 ? m.facade : m.limestone, 0, top - h / 6, 0, width, h / 3, depth);
        ledge(top, width, depth);
        for (const side of [-1, 1]) for (const end of [-1, 1]) local(cylinder, m.brass, side * (width / 2 - .4), top + 1.1, end * (depth / 2 - .4), .2, 2.2, .2);
      }
      local(box, m.slate, 0, h + .4, 0, w * .64, .6, d * .68);
      count('stepped-terraces');
    } else if (style === 4) {
      local(box, m.limestone, 0, h * .34, 0, w, h * .68, d);
      ledge(4); ledge(h * .68);
      const radius = Math.min(w, d) * .38, top = h * .68;
      local(cylinder, m.iron, 0, top + 1, 0, radius, 2, radius);
      local(dome, m.copper, 0, top + 2, 0, radius, radius * .8, radius);
      for (const rot of [0, Math.PI / 2]) local(arch, m.brass, 0, top + 2, 0, radius + .1, radius * .8 + .1, 1, [0, rot, 0]);
      local(cylinder, m.brass, 0, top + radius * .8 + 3, 0, .2, 3, .2);
      for (const side of [-1, 1]) for (const end of [-1, 1]) local(box, m.stone, side * (w / 2 - .6), top / 2, end * (d / 2 - .6), 1.4, top, 1.4);
      count('copper-domes');
    } else {
      local(box, m.facade, 0, h / 2, 0, w, h, d); ledge(4); ledge(h); pitched(0, h, w, d);
      for (const side of [-1, 1]) for (const end of [-1, 1]) local(box, m.brick, side * (w / 2 - .4), h / 2, end * (d / 2 - .4), 1.3, h, 1.3);
      // The mill's taller stair tower breaks the long roof ridge.
      local(box, m.soot, -w * .30, h * .62, -d * .15, w * .26, h * 1.24, d * .35);
      local(cone, m.roof, -w * .30, h * 1.24 + 3, -d * .15, w * .20, 6, w * .20);
      count('mill-towers');
    }
    if (!near) return { roofHeight: h, styles, features };
    // Keep close detail below roof level so it reads at racing speed.
    if (style !== 0 && style !== 2) for (const side of [-1, 1]) {
      local(cylinder, m.copper, side * (w / 2 - 1.7), h * .31, d / 2 + .45, .27, h * .62, .27);
      for (let y = 3; y < h * .62; y += 5) local(cylinder, m.brass, side * (w / 2 - 1.7), y, d / 2 + .45, .42, .25, .42);
    }
    // Rooftop cisterns are braced structures with a capped tank, not floating cylinders.
    if (style === 3 || style === 5) {
      const u = style === 5 ? w * .22 : 0;
      // The mill's roof slopes under the off-centre tank. Anchor each leg to
      // that roof plane, rather than suspending a fixed-height frame at the ridge.
      const roofAt = (x: number) => style === 5
        ? h + w * .14 - Math.tan(.51) * (x - w / 4) + .225 / Math.cos(.51)
        : h + .7;
      const base = Math.max(roofAt(u - 2.2), roofAt(u + 2.2)) + .25;
      for (const x of [-2.2, 2.2]) for (const z of [-2.2, 2.2]) {
        const foot = roofAt(u + x) - .18, top = base + 6;
        local(box, m.iron, u + x, (foot + top) / 2, z, .32, top - foot, .32);
        local(box, m.iron, u + x, roofAt(u + x) - .07, z, .7, .18, .7, [0, 0, style === 5 ? -.51 : 0]);
      }
      for (const z of [-2.2, 2.2]) for (const side of [-1, 1]) local(box, m.iron, u, base + 3, z, .2, 7.2, .2, [0, 0, side * .63]);
      local(box, m.iron, u, base + 5.4, 0, 5.2, .25, 5.2);
      local(cylinder, m.copper, u, base + 8, 0, 3.1, 5, 3.1);
      for (const y of [5.6, 8, 10.4]) local(ring, m.iron, u, base + y, 0, 3.15, 3.15, 1, [Math.PI / 2, 0, 0]);
      local(cone, m.roof, u, base + 11, 0, 3.5, 1.5, 3.5);
      count('water-towers');
    }
    if (style === 1) {
      // Roof-mounted loading crane; jib and suspended cargo remain over the factory footprint.
      const base = h + 4, mast = -w * .30, tip = w * .33;
      local(box, m.iron, mast, base + 4, 0, .6, 8, .6);
      local(box, m.brass, (mast + tip) / 2, base + 8, 0, tip - mast + 1, .65, 1.1);
      local(box, m.iron, mast + 1, base + 6.5, 0, .25, 3.5, .25, [0, 0, -.65]);
      local(cylinder, m.dark, tip, base + 4.7, 0, .06, 6.5, .06);
      local(box, m.brick, tip, base + .8, 0, 2.1, 1.8, 2.1);
      count('loading-cranes');
    }
    if (style === 5 || style === 3) {
      const u = w * .28;
      for (let y = 6; y < Math.min(h * .65, 22); y += 5) {
        local(box, m.iron, u, y, d / 2 + .75, 3.7, .18, 1.4);
        local(box, m.iron, u, y + .8, d / 2 + 1.4, 3.7, .12, .12);
        for (const x of [-1.7, 0, 1.7]) local(box, m.iron, u + x, y + .4, d / 2 + 1.4, .1, .8, .1);
        local(box, m.iron, u, y - 2.5, d / 2 + 1, .22, 5.6, .2, [0, 0, .40]);
      }
      count('fire-escapes');
    }
    if (style === 1 || style === 5) {
      // Street-facing boiler bank and red valve wheels beneath a metal workshop awning.
      for (const u of [-w * .25, 0, w * .25]) {
        local(cylinder, m.copper, u, 2.2, d / 2 + .7, .55, 3.8, .55);
        local(sphere, m.copper, u, 4.1, d / 2 + .7, .55, .35, .55);
        local(ring, m.brass, u, 2.8, d / 2 + 1.35, .45, .45, 1);
        local(box, m.iron, u, 2.8, d / 2 + 1.35, .75, .08, .1);
      }
      local(box, m.roof, 0, 5.1, d / 2 + .7, w * .75, .18, 1.7, [.12, 0, 0]);
      count('workshop-boilers');
    }
    // A shopfront lintel provides a recognisable ground-floor entrance on civic buildings.
    if (style === 2 || style === 4) {
      local(box, m.dark, 0, 2.2, d / 2 + .12, 4, 4.2, .2);
      local(box, m.copper, 0, 4.5, d / 2 + .65, 6, .25, 1.5);
      count('covered-entrances');
    }
    return { roofHeight: h, styles, features };
  };
  return { build, styles, features };
}
