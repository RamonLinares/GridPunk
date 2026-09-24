import * as THREE from 'three';
import type { createSteamMaterials } from './SteamMaterials';
import type { SteamKit, Sketch, V3 } from './SteamKit';

type Materials = ReturnType<typeof createSteamMaterials>;
type GearSpec = { p: V3; r: number; yaw: number; rate: number };
type Archetype = { name: string; w: number; d: number; vents: V3[]; gears: GearSpec[]; valves: { p: V3; along: V3 }[] };

const SQRT2 = Math.SQRT2;
/**
 * Beyond LOD_DISTANCE an instance drops to its massing LOD (parts at least
 * LOD_MIN_PART m across) and stops casting shadows; beyond DRAW_DISTANCE it
 * is left to the skyline behind it.
 */
const LOD_DISTANCE = 220, DRAW_DISTANCE = 1000, LOD_MIN_PART = 3.6;

/**
 * Characterful street buildings for the Steampunk circuits. Each archetype is a
 * small set piece with a trade and a silhouette, modelled once in the Brass &
 * Co. vocabulary and instanced along the lap. Local frame: +z faces the road,
 * the footprint is centred on the origin and stays within w × d.
 */
export function createSteamStreetBuildings(m: Materials, kit: SteamKit) {
  const { iron, brass, copper, verdigris, bronze, glass, warmGlass, glow, paving, stone, slate, wood } = kit.mat;
  const clockFace = kit.canvasMaterial(256, 256, c => {
    c.fillStyle = '#e8d6a8'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#3a2c1c'; c.lineWidth = 8; c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#2a2016';
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.fillRect(128 + Math.sin(a) * 96 - 4, 128 - Math.cos(a) * 96 - 10, 8, 20); }
    c.lineCap = 'round'; c.strokeStyle = '#1c1610'; c.lineWidth = 9;
    c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 50, 128 - 30); c.stroke();
    c.lineWidth = 6; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 - 18, 128 - 86); c.stroke();
  });

  /** Pitched roof: a solid gable prism with slate slabs, ridge along x or z. */
  const pitched = (s: Sketch, cx: number, top: number, cz: number, halfSpan: number, length: number, ridgeAlongZ: boolean, walls: THREE.Material = m.brick, roof: THREE.Material = slate) => {
    const prism = halfSpan * SQRT2;
    if (ridgeAlongZ) {
      s.add(s.prism, walls, [cx, top, cz], [halfSpan, halfSpan, length]);
      for (const side of [-1, 1]) s.add(s.box, roof, [cx + side * halfSpan / 2, top + halfSpan / 2 + .12, cz], [prism + .5, .28, length + .6], [0, 0, -side * Math.PI / 4]);
      s.add(s.box, iron, [cx, top + halfSpan + .25, cz], [.3, .3, length + .6]);
    } else {
      s.add(s.prism, walls, [cx, top, cz], [halfSpan, halfSpan, length], [0, Math.PI / 2, 0]);
      for (const side of [-1, 1]) s.add(s.box, roof, [cx, top + halfSpan / 2 + .12, cz + side * halfSpan / 2], [length + .6, .28, prism + .5], [side * Math.PI / 4, 0, 0]);
      s.add(s.box, iron, [cx, top + halfSpan + .25, cz], [length + .6, .3, .3]);
    }
  };
  const plinth = (s: Sketch, w: number, d: number) => s.add(s.box, paving, [0, .15, 0], [w, .3, d]);
  const door = (s: Sketch, f: THREE.Matrix4, x: number, width: number, height: number) => {
    const body = height - width / 2;
    s.add(s.box, bronze, [x, .3 + body / 2, .08], [width, body, .12], [0, 0, 0], f);
    s.add(s.halfDisc, glow, [x, .3 + body, .1], [width / 2, width / 2, 1], [0, 0, 0], f);
    s.add(s.halfTorus, iron, [x, .3 + body, .16], [width / 2 + .25, width / 2 + .25, 10], [0, 0, 0], f);
    for (const side of [-1, 1]) s.add(s.box, iron, [x + side * (width / 2 + .25), .3 + body / 2, .16], [.4, body, .4], [0, 0, 0], f);
    s.add(s.box, glow, [x, .3 + body * .62, .16], [width * .6, body * .35, .02], [0, 0, 0], f);
  };
  const sign = (s: Sketch, f: THREE.Matrix4, board: THREE.Material, x: number, y: number, width: number) => {
    s.add(s.plane, board, [x, y, .2], [width, width / 4, 1], [0, 0, 0], f);
    s.add(s.box, brass, [x, y, .12], [width + .3, width / 4 + .3, .1], [0, 0, 0], f);
  };
  const clock = (s: Sketch, f: THREE.Matrix4, x: number, y: number, r: number) => {
    s.add(s.disc, clockFace, [x, y, .06], [r, r, 1], [0, 0, 0], f);
    s.add(s.band, brass, [x, y, .08], [r + .08, r + .08, 12], [0, 0, 0], f);
  };
  /** A lattice column pair braced with X members, between two points on the ground plane. */
  const lattice = (s: Sketch, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, step = 3) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), f = s.face(yaw, (x0 + x1) / 2, (z0 + z1) / 2);
    for (let y = y0; y < y1 - .1; y += step) {
      const h = Math.min(step, y1 - y), diag = Math.atan2(h, len);
      for (const sgn of [-1, 1]) s.add(s.box, iron, [0, y + h / 2, 0], [Math.hypot(len, h), .12, .12], [0, 0, sgn * diag], f);
      s.add(s.box, iron, [0, y + h, 0], [len, .14, .14], [0, 0, 0], f);
    }
  };

  const archetypes: ((s: Sketch) => Archetype)[] = [
    // 1. Guild of Engineers: a hall with a square clock spire.
    s => {
      plinth(s, 22, 17);
      s.add(s.box, m.brick, [0, 6.3, -2], [18, 12, 12]);
      for (const y of [.8, 6.4, 12.2]) s.add(s.box, stone, [0, y, -2], [18.5, .5, 12.5]);
      pitched(s, 0, 12.3, -2, 6.1, 18, false);
      const hf = s.front(4);
      for (const x of [-6.5, -3.6, 3.6, 6.5]) { s.archWindow(hf, x, 1.5, 1.7, 3.8); s.archWindow(hf, x, 7.3, 1.7, 3.8); }
      for (const u of [-1.5, 2, 5.5]) s.archWindow(s.right(9), u, 2, 1.6, 3.6);
      for (const u of [-5.5, -2, 1.5]) s.archWindow(s.left(-9), u, 2, 1.6, 3.6);
      // Tower with stone quoins, clock stage and verdigris spire.
      s.add(s.box, m.brick, [0, 11, 5.5], [6, 22, 5]);
      for (const x of [-3, 3]) for (const z of [3, 8]) s.add(s.box, stone, [x, 11, z], [.7, 22, .7]);
      s.add(s.box, iron, [0, 24.2, 5.5], [6.8, 4.4, 5.8]);
      for (const y of [22, 26.4]) s.add(s.box, brass, [0, y, 5.5], [7.1, .3, 6.1]);
      clock(s, s.front(8.42), 0, 24.2, 1.85); clock(s, s.right(3.42), -5.5, 24.2, 1.85); clock(s, s.left(-3.42), 5.5, 24.2, 1.85);
      s.add(s.pyramid, verdigris, [0, 29.8, 5.5], [3.4 * SQRT2, 6.4, 3.4 * SQRT2], [0, Math.PI / 4, 0]);
      s.add(s.cylLow, brass, [0, 34.2, 5.5], [.08, 3, .08]); s.add(s.rivet, brass, [0, 33.4, 5.5], [.35, .35, .35]);
      for (const x of [-3.4, 3.4]) for (const z of [2.6, 8.4]) { s.add(s.cone, verdigris, [x, 27.6, z], [.45, 1.6, .45]); }
      const tf = s.front(8);
      door(s, tf, 0, 2.6, 4.4);
      sign(s, tf, kit.nameboard('GUILD OF ENGINEERS', 'EST. 1851'), 0, 6.6, 5.6);
      for (const y of [9.5, 14.5]) s.archWindow(tf, 0, y, 1.6, 3.4);
      s.lamp(-4.2, 9.3); s.lamp(4.2, 9.3);
      return { name: 'guild-hall', w: 22, d: 17, vents: [], gears: [], valves: [] };
    },
    // 2. Kairo Gasworks: a lattice-guided gasholder and a valve house.
    s => {
      plinth(s, 24, 20);
      const gx = -4.5, gz = -1.5, gr = 7.2;
      s.add(s.cyl, iron, [gx, 5.2, gz], [gr, 10, gr]);
      s.add(s.dome, iron, [gx, 10.2, gz], [gr, 1.6, gr]);
      s.bands(gx, gz, gr, [1, 4.6, 8.2], 2);
      const cols = 8;
      for (let k = 0; k < cols; k++) {
        const a = k / cols * Math.PI * 2, b = (k + 1) / cols * Math.PI * 2, R = gr + .9;
        s.add(s.cylLow, iron, [gx + Math.cos(a) * R, 8, gz + Math.sin(a) * R], [.32, 16, .32]);
        s.add(s.rivet, brass, [gx + Math.cos(a) * R, 16.2, gz + Math.sin(a) * R], [.4, .4, .4]);
        lattice(s, gx + Math.cos(a) * R, gz + Math.sin(a) * R, gx + Math.cos(b) * R, gz + Math.sin(b) * R, 5.3, 16, 5.3);
      }
      s.add(s.band, brass, [gx, 16, gz], [gr + .95, gr + .95, 14], [Math.PI / 2, 0, 0]);
      // Valve house.
      s.add(s.box, m.brick, [7.5, 3.6, 3], [7, 7, 7]);
      pitched(s, 7.5, 7.1, 3, 3.6, 7, true);
      const vf = s.front(6.5);
      door(s, vf, 7.5, 2, 3.6);
      sign(s, vf, kit.nameboard('KAIRO GASWORKS', 'LIGHT FOR THE CITY'), 7.5, 5.6, 5.4);
      s.archWindow(s.right(11), -3, 2, 1.4, 3.2); s.archWindow(s.right(11), -.2, 2, 1.4, 3.2);
      s.add(s.cyl, m.brick, [9.5, 11, 1], [.9, 8, .9]); s.bands(9.5, 1, .9, [8, 14.6], 1.5);
      // Mains between the valve house and the holder, with a hand wheel.
      s.tube([[4, 1.6, 4.5], [1, 1.6, 4.5], [-.5, 1.6, 3.5], [gx + gr * .6, 1.6, gz + gr * .7]], .45, copper, [.2, .8]);
      s.add(s.cylLow, copper, [2.6, 3, 4.5], [.3, 2.8, .3]);
      s.staticGear([2.6, 4.6, 4.9], .7, 0, bronze);
      s.crate(10.2, .3, 8.6, 1.3, .3); s.crate(-11, .3, 8.4, 1.2, -.2);
      s.lamp(0, 9.2);
      return { name: 'gasworks', w: 24, d: 20, vents: [[9.5, 15.3, 1]], gears: [], valves: [{ p: [2.6, 5.2, 5.3], along: [1, 0, 0] }] };
    },
    // 3. Pumping Station No. 3: a beam engine house with flywheel and stack.
    s => {
      plinth(s, 21, 18);
      s.add(s.box, m.brick, [0, 8, -1], [8, 16, 12]);
      for (const x of [-4, 4]) for (const z of [-7, 5]) s.add(s.box, stone, [x, 8, z], [.6, 16, .6]);
      pitched(s, 0, 16, -1, 4.1, 12, true);
      const ef = s.front(5);
      s.archWindow(ef, 0, 5, 3.4, 9);
      door(s, ef, 0, 2.2, 3.4);
      sign(s, s.front(5.05), kit.nameboard('PUMPING STATION No.3', 'WATER WORKS'), 0, 17, 4.6);
      for (const u of [-3.5, 1.5]) s.archWindow(s.right(4), u, 3, 1.6, 7);
      // Beam over the side wall, pump rod and flywheel.
      s.add(s.box, iron, [6.2, 16.8, -1.5], [9, .9, .7], [0, 0, -.08]);
      s.add(s.box, iron, [4, 15.6, -1.5], [1.2, 2.4, 1.2]);
      s.add(s.cylLow, iron, [10.3, 12, -1.5], [.18, 9, .18]);
      s.add(s.cyl, copper, [10.3, 3.4, -1.5], [1.1, 6.2, 1.1]); s.bands(10.3, -1.5, 1.1, [1, 5.8], 1.2);
      s.add(s.box, iron, [8.8, 12.65, -3.6], [.4, 7.9, .4], [0, 0, -.31]);
      for (const side of [-1, 1]) s.add(s.box, iron, [7.6 + side * 1.2, 4.6, -4.8], [.4, 9, .4], [0, 0, side * .18]);
      s.add(s.cylLow, brass, [7.6, 8.9, -4.6], [.25, 1.2, .25], [Math.PI / 2, 0, 0]);
      // Boiler house and chimney.
      s.add(s.box, m.brick, [-7.2, 3.5, -1], [6.4, 7, 11]);
      pitched(s, -7.2, 7, -1, 3.2, 11, false);
      for (const z of [-4, 0, 3.8]) s.archWindow(s.left(-10.4), z, 1.4, 1.4, 3.4);
      s.add(s.cyl, m.brick, [-7.5, 15, -5], [1.4, 30, 1.4]);
      s.bands(-7.5, -5, 1.4, [8, 16, 24, 29.5], 2);
      s.add(s.cyl, iron, [-7.5, 30.3, -5], [1.7, .8, 1.7]);
      s.lamp(-3.6, 8.2); s.lamp(3.6, 8.2);
      return { name: 'pumping-station', w: 21, d: 18, vents: [[-7.5, 31, -5]], gears: [{ p: [7.6, 8.9, -4.1], r: 3.3, yaw: 0, rate: .22 }], valves: [] };
    },
    // 4. Royal Observatory: copper dome with a brass telescope, portico and orrery.
    s => {
      plinth(s, 20, 20);
      s.add(s.cyl, stone, [0, 5, -1.5], [7, 9.4, 7]);
      s.bands(0, -1.5, 7, [9.6], 3);
      s.add(s.dome, verdigris, [0, 9.7, -1.5], [7.2, 6.6, 7.2]);
      for (let k = 0; k < 8; k++) s.add(s.halfTorus, brass, [0, 9.7, -1.5], [7.26, 6.66, 4], [0, k * Math.PI / 8, 0]);
      s.add(s.box, m.dark, [0, 15.2, 3.1], [1.8, 5.5, .3], [-.87, 0, 0]);
      s.add(s.cyl, brass, [0, 16.6, 3.2], [.7, 9, .7], [.95, 0, 0]);
      s.add(s.band, iron, [0, 19.2, 6.86], [.78, .78, 20], [-.62, 0, 0]);
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * .42;
        s.archWindow(s.face(a + Math.PI / 2, Math.cos(a) * 6.95, -1.5 - Math.sin(a) * 6.95), 0, 2.6, 1.2, 3.4);
      }
      // Portico.
      s.add(s.box, stone, [0, 4, 6.8], [8, 8, 3.2]);
      const pf = s.front(8.4);
      door(s, pf, 0, 2.2, 4);
      for (const x of [-3.2, 3.2]) s.add(s.cyl, iron, [x, 3.7, 9.4], [.35, 7, .35]);
      s.add(s.box, stone, [0, 7.6, 8.6], [8.6, .8, 2.2]);
      s.add(s.prism, stone, [0, 8, 8.6], [4.3, 2.2, 2.2]);
      sign(s, s.front(10), kit.nameboard('ROYAL OBSERVATORY', 'CELESTIAL NAVIGATION'), 0, 6.4, 5.4);
      // Orrery tower.
      s.add(s.cylLow, iron, [7.6, 8.5, -6], [.5, 17, .5]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.add(s.box, iron, [7.6 + dx * .9, 4, -6 + dz * .9], [.16, 8.4, .16], [dz * .2, 0, -dx * .2]);
      s.add(s.sphere, brass, [7.6, 18.6, -6], [1.1, 1.1, 1.1]);
      for (const [r, tilt] of [[2.4, .3], [3.4, -.25], [4.3, .1]] as [number, number][]) {
        s.add(s.band, brass, [7.6, 18.6, -6], [r, r, 5], [Math.PI / 2 + tilt, 0, 0]);
        s.add(s.rivet, copper, [7.6 + r, 18.6, -6], [.35, .35, .35]);
      }
      s.lamp(-4.5, 9.2); s.lamp(4.5, 9.2);
      return { name: 'observatory', w: 20, d: 20, vents: [], gears: [], valves: [] };
    },
    // 5. Airship Chandlery: a shop with a mooring mast and a moored dirigible.
    s => {
      plinth(s, 22, 20);
      s.add(s.box, m.brick, [-3, 4.6, -1], [13, 9, 11]);
      pitched(s, -3, 9.1, -1, 5.5, 13, false, m.brick, verdigris);
      const sf = s.front(4.5);
      s.add(s.box, glass, [-3, 3, .02], [10, 4.2, .04], [0, 0, 0], sf);
      s.add(s.box, glow, [-3, 2.2, .06], [9.6, 2.6, .02], [0, 0, 0], sf);
      for (let x = -8; x <= 2; x += 2) s.add(s.box, iron, [x, 3, .15], [.16, 4.4, .16], [0, 0, 0], sf);
      s.add(s.box, copper, [-3, 5.6, .9], [11, .2, 2], [.25, 0, 0], sf);
      sign(s, sf, kit.nameboard('AIRSHIP CHANDLERY', 'ROPES  /  GAS  /  CHARTS'), -3, 7.3, 6.4);
      // Mooring mast: four legs converging, platform, ring and lamp.
      const mx = 7, mz = -1.5, top = 24;
      // Legs taper from 2.1 m to 0.5 m off the mast axis.
      const lean = Math.atan2(1.6, top);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.add(s.box, iron, [mx + dx * 1.3, top / 2, mz + dz * 1.3], [.22, top + .4, .22], [-dz * lean, 0, dx * lean]);
      for (let y = 3; y < top; y += 4) {
        const w = 2.1 - 1.6 * y / top;
        for (const side of [-1, 1]) { s.add(s.box, iron, [mx, y, mz + side * w], [w * 2, .12, .12]); s.add(s.box, iron, [mx + side * w, y, mz], [.12, .12, w * 2]); }
      }
      s.add(s.cyl, iron, [mx, top, mz], [1.9, .3, 1.9]);
      s.railing(mx - 1.9, mz + 1.9, mx + 1.9, mz + 1.9, top + .15, .9); s.railing(mx - 1.9, mz - 1.9, mx + 1.9, mz - 1.9, top + .15, .9);
      s.add(s.cylLow, brass, [mx, top + 2, mz], [.12, 3.6, .12]);
      s.add(s.band, brass, [mx - .4, top + 3, mz], [.6, .6, 12], [0, Math.PI / 2, 0]);
      s.add(s.box, glow, [mx, top + 4, mz], [.4, .5, .4]);
      // Dirigible nosed into the mast, hull over the shop.
      const hx = mx - 9.4, hy = top + 3;
      s.add(s.sphere, stone, [hx, hy, mz], [9, 2.8, 2.8]);
      for (const x of [-5, -1.7, 1.7, 5]) { const rr = 2.85 * Math.sqrt(1 - (x / 9) ** 2); s.add(s.band, copper, [hx + x, hy, mz], [rr, rr, 8], [0, Math.PI / 2, 0]); }
      for (const side of [-1, 1]) s.add(s.box, verdigris, [hx - 7.8, hy + side * 1.8, mz], [2.4, 1.8, .15], [0, 0, side * .5]);
      s.add(s.box, verdigris, [hx - 7.8, hy, mz], [2.4, .15, 3.4]);
      s.add(s.box, bronze, [hx + 1, hy - 3.4, mz], [4.2, 1.1, 1.4]);
      for (const x of [-.5, 1, 2.5]) s.add(s.box, glow, [hx + x, hy - 3.4, mz + .72], [.8, .5, .04]);
      for (const x of [-1, 3]) s.add(s.cylLow, iron, [hx + x, hy - 2.3, mz], [.03, 1.6, .03]);
      s.crate(-9.6, .3, 7.6, 1.2, .2); s.crate(-8.2, .3, 8.4, 1, -.3);
      s.lamp(1.6, 8.6);
      return { name: 'airship-chandlery', w: 22, d: 20, vents: [], gears: [], valves: [] };
    },
    // 6. Kairo Gazette: printing works with a rose window, sawtooth roof and water tank.
    s => {
      plinth(s, 22, 18);
      s.add(s.box, m.brick, [0, 6.5, -1.5], [20, 12.5, 13]);
      const pf = s.front(5);
      for (const x of [-9.6, -3.2, 3.2, 9.6]) s.pilaster(pf, x, .3, 12.7);
      s.add(s.box, iron, [0, 12.9, -1.5], [20.6, .6, 13.6]);
      // Round rose window over the press hall.
      s.add(s.cyl, iron, [0, 8.4, 5.2], [3.1, .3, 3.1], [Math.PI / 2, 0, 0]);
      s.add(s.disc, glow, [0, 8.4, 5.38], [2.6, 2.6, 1]);
      for (let k = 0; k < 8; k++) s.add(s.box, iron, [Math.cos(k * Math.PI / 8) * 0, 8.4, 5.45], [5.2, .12, .08], [0, 0, k * Math.PI / 8]);
      s.add(s.band, brass, [0, 8.4, 5.46], [2.7, 2.7, 10]); s.add(s.band, brass, [0, 8.4, 5.46], [1.1, 1.1, 8]);
      for (const x of [-6.4, 6.4]) { s.archWindow(pf, x, 6.6, 2.2, 4.8); door(s, pf, x, 3, 4.6); }
      door(s, pf, 0, 2, 3.4);
      sign(s, pf, kit.nameboard('KAIRO GAZETTE', 'PRINTED BY STEAM'), 0, 4.2, 5.2);
      s.staticGear([-8.6, 10.6, 5.25], 1.2, 0);
      // Sawtooth northlights.
      for (const x of [-6.6, 0, 6.6]) {
        s.add(s.box, slate, [x - .4, 14.5, -1.5], [6.9, .3, 13.4], [0, 0, .5]);
        s.add(s.box, glass, [x + 2.9, 14.4, -1.5], [.2, 3, 13]);
      }
      // Rooftop tank on iron stilts.
      const tx = 6, tz = -4.5;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.add(s.box, iron, [tx + dx * 1.6, 15.2, tz + dz * 1.6], [.25, 4.5, .25]);
      s.add(s.cyl, copper, [tx, 19.3, tz], [2.3, 3.6, 2.3]); s.bands(tx, tz, 2.3, [17.8, 20.8], 1.3);
      s.add(s.cone, verdigris, [tx, 22, tz], [2.6, 1.8, 2.6]);
      s.add(s.cyl, m.brick, [-7, 17, -6], [.9, 8, .9]); s.bands(-7, -6, .9, [15, 20.6], 1.3);
      s.lamp(-3.8, 8); s.lamp(3.8, 8);
      return { name: 'gazette-works', w: 22, d: 18, vents: [[-7, 21.4, -6]], gears: [], valves: [{ p: [-9.6, 5.2, 5.6], along: [1, 0, 0] }] };
    },
    // 7. Bank of Kairo: dressed stone temple front with a copper dome.
    s => {
      s.add(s.box, stone, [0, 1, -1], [21, 2, 17]);
      for (let i = 0; i < 4; i++) s.add(s.box, stone, [0, .25 + i * .5, 8 - i * .6], [12 - i * .4, .5, 1.2]);
      s.add(s.box, stone, [0, 8.5, -2.5], [18, 13, 11]);
      s.add(s.box, stone, [0, 15.2, -2.5], [18.8, .8, 11.8]);
      // Portico: brass-capped iron columns, entablature and pediment.
      for (let i = 0; i < 6; i++) {
        const x = -6.25 + i * 2.5;
        s.add(s.cyl, iron, [x, 7.4, 5.5], [.48, 10.8, .48]);
        s.add(s.box, brass, [x, 12.9, 5.5], [1.3, .4, 1.3]); s.add(s.box, brass, [x, 2.2, 5.5], [1.2, .4, 1.2]);
      }
      s.add(s.box, stone, [0, 13.7, 4.2], [15, 1.3, 3.8]);
      s.add(s.prism, stone, [0, 14.35, 4.2], [7.5, 2.6, 3.8]);
      s.add(s.disc, brass, [0, 15.6, 6.05], [1, 1, 1]); s.add(s.band, brass, [0, 15.6, 6.08], [1.1, 1.1, 8]);
      sign(s, s.front(6.1), kit.nameboard('BANK OF KAIRO', 'SOUND AS BRASS'), 0, 13.6, 6.8);
      const bf = s.front(3);
      door(s, bf, 0, 2.6, 5.4);
      for (const x of [-4.8, 4.8]) s.archWindow(bf, x, 3.4, 1.6, 4.2);
      for (const [f, c] of [[s.right(9), 2.5], [s.left(-9), -2.5]] as [THREE.Matrix4, number][]) for (const u of [-3.5, 0, 3.5]) { s.archWindow(f, c + u, 3.4, 1.5, 4); s.archWindow(f, c + u, 9.2, 1.5, 3.6); }
      // Dome on a drum.
      s.add(s.cyl, stone, [0, 17.2, -3.5], [4.2, 3.2, 4.2]);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; s.add(s.box, glow, [Math.cos(a) * 4.22, 17.3, -3.5 + Math.sin(a) * 4.22], [.9, 1.8, .06], [0, -a + Math.PI / 2, 0]); }
      s.add(s.dome, copper, [0, 18.8, -3.5], [4.4, 4.2, 4.4]);
      s.add(s.cyl, verdigris, [0, 23.5, -3.5], [.8, 1.4, .8]); s.add(s.cone, verdigris, [0, 24.9, -3.5], [.95, 1.4, .95]);
      s.add(s.cylLow, brass, [0, 26.6, -3.5], [.06, 2.4, .06]);
      s.lamp(-9, 6.6, 4.6, 2); s.lamp(9, 6.6, 4.6, 2);
      return { name: 'bank', w: 21, d: 17, vents: [], gears: [], valves: [] };
    },
    // 8. Kairo Railway Depot: twin glazed sheds, a locomotive and a water tower.
    s => {
      plinth(s, 24, 20);
      s.add(s.box, m.brick, [0, 4.3, -3.5], [22, 8, 12]);
      for (const x of [-5.5, 5.5]) {
        s.add(s.vault, glass, [x, 8.3, -3.5], [5.4, 12.2, 5.4], [0, Math.PI / 2, -Math.PI / 2]);
        for (let z = -9.5; z <= 2.5; z += 2) s.add(s.halfTorus, iron, [x, 8.3, z], [5.46, 5.46, 4]);
      }
      const df = s.front(2.5);
      for (const x of [-5.5, 5.5]) {
        s.add(s.box, m.dark, [x, 3.2, .04], [4.4, 5.8, .08], [0, 0, 0], df);
        s.add(s.halfDisc, m.dark, [x, 6.1, .05], [2.2, 2.2, 1], [0, 0, 0], df);
        s.add(s.halfTorus, iron, [x, 6.1, .2], [2.5, 2.5, 12], [0, 0, 0], df);
        for (const side of [-1, 1]) s.add(s.box, iron, [x + side * 2.5, 3.2, .2], [.45, 5.8, .45], [0, 0, 0], df);
        s.add(s.halfDisc, warmGlass, [x, 8.3, .02], [5.3, 5.3, 1], [0, 0, 0], df);
        for (let k = 1; k < 6; k++) { const a = k / 6 * Math.PI; s.add(s.box, iron, [x + Math.cos(a) * 2.65, 8.3 + Math.sin(a) * 2.65, .06], [5.3, .1, .06], [0, 0, a], df); }
      }
      sign(s, df, kit.nameboard('KAIRO RAILWAY DEPOT', 'GOODS  /  PASSENGERS'), 0, 7.2, 4.6);
      // Rails and locomotive on the apron.
      for (const z of [5.8, 7.2]) s.add(s.box, iron, [-1, .38, z], [20, .16, .16]);
      for (let x = -10; x <= 8; x += 1.2) s.add(s.box, wood, [x, .33, 6.5], [.4, .08, 2.2]);
      const lx = -2, lz = 6.5;
      s.add(s.cyl, iron, [lx, 2.3, lz], [1.05, 5.2, 1.05], [0, 0, Math.PI / 2]);
      for (const x of [-1.6, 0, 1.6]) s.add(s.band, brass, [lx + x, 2.3, lz], [1.1, 1.1, 5], [0, Math.PI / 2, 0]);
      s.add(s.cylLow, iron, [lx + 2.1, 3.9, lz], [.32, 1.4, .32]); s.add(s.cone, iron, [lx + 2.1, 4.8, lz], [.55, .6, .55], [Math.PI, 0, 0]);
      s.add(s.dome, brass, [lx, 3.3, lz], [.55, .6, .55]);
      s.add(s.box, bronze, [lx - 3.3, 2.8, lz], [2, 3, 2.3]); s.add(s.box, iron, [lx - 3.3, 4.4, lz], [2.4, .2, 2.6]);
      s.add(s.box, glow, [lx - 3.3, 3.3, lz + 1.17], [1, .8, .04]);
      s.add(s.box, iron, [lx - .5, 1.1, lz], [7.6, .5, 1.9]);
      for (const side of [-1, 1]) for (const x of [-2.4, -.6, 1.2]) s.add(s.band, iron, [lx + x, 1.1, lz + side * .98], [.75, .75, 8]);
      s.add(s.disc, glow, [lx + 2.62, 2.3, lz], [.3, .3, 1], [0, Math.PI / 2, 0]);
      // Water tower.
      const wx = 9, wz = 5.5;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.add(s.box, iron, [wx + dx * 1.3, 3.6, wz + dz * 1.3], [.25, 7.2, .25]);
      s.add(s.cyl, copper, [wx, 8.7, wz], [2, 3, 2]); s.bands(wx, wz, 2, [7.4, 10], 1.2); s.add(s.cone, verdigris, [wx, 11, wz], [2.3, 1.6, 2.3]);
      s.tube([[wx - 1.9, 8, wz], [wx - 3.2, 7.4, wz], [wx - 3.6, 5.4, wz]], .2, iron);
      s.lamp(-11, 9.2);
      return { name: 'railway-depot', w: 24, d: 20, vents: [[lx + 2.1, 5.3, lz]], gears: [], valves: [] };
    },
  ];

  const built = archetypes.map(build => {
    const s = kit.sketch('lean'), spec = build(s);
    const lods = [s.merge(true), s.merge(true, LOD_MIN_PART)]; s.dispose();
    return { ...spec, r: Math.hypot(spec.w, spec.d) / 2 + 1.5, lods };
  });

  const placements: THREE.Matrix4[][] = built.map(() => []);
  const gearBases: { matrix: THREE.Matrix4; rate: number }[] = [];
  const placed: { x: number; z: number; r: number; style: number; angle: number }[] = [];
  const toWorld = (matrix: THREE.Matrix4, p: V3) => new THREE.Vector3(...p).applyMatrix4(matrix);

  return {
    archetypes: built.map(({ name, w, d, r }) => ({ name, w, d, r })),
    /** Records one instance; returns its chimney and valve outlets in world space. */
    place(style: number, x: number, z: number, angle: number) {
      const a = built[style], matrix = new THREE.Matrix4().makeRotationY(angle).setPosition(x, 0, z);
      placements[style].push(matrix); placed.push({ x, z, r: a.r, style, angle });
      for (const g of a.gears) gearBases.push({ matrix: matrix.clone().multiply(new THREE.Matrix4().makeRotationY(g.yaw).setPosition(...g.p)).scale(new THREE.Vector3(g.r, g.r, g.r * .9)), rate: g.rate });
      const yaw = new THREE.Matrix4().makeRotationY(angle);
      return {
        vents: a.vents.map(p => toWorld(matrix, p)),
        valves: a.valves.map(v => ({ origin: toWorld(matrix, v.p), alongFacade: new THREE.Vector3(...v.along).applyMatrix4(yaw) })),
      };
    },
    placed,
    /**
     * One instanced mesh per archetype, LOD and material. Instances are
     * redistributed between the full and massing LODs as the camera moves.
     */
    build(parent: THREE.Group) {
      const meshes: { style: number; lod: number; mesh: THREE.InstancedMesh }[] = [];
      built.forEach((a, style) => {
        if (!placements[style].length) return;
        a.lods.forEach((geometries, lod) => {
          for (const [mat, geometry] of geometries) {
            const mesh = new THREE.InstancedMesh(geometry, mat, placements[style].length);
            mesh.name = `steam-street-${a.name}${lod ? '-far' : ''}`; mesh.userData.preserveAuthoredElevation = true;
            mesh.castShadow = lod === 0 && kit.castsShadow(mat); mesh.receiveShadow = mat !== glow; mesh.count = 0;
            parent.add(mesh); meshes.push({ style, lod, mesh });
          }
        });
      });
      let gears: THREE.InstancedMesh | undefined;
      if (gearBases.length) {
        gears = new THREE.InstancedMesh(kit.leanGear, kit.mat.metalwork, gearBases.length); gears.name = 'steam-street-flywheels';
        const colour = new THREE.Color(0xc9a25a).convertSRGBToLinear(), data = new Float32Array(kit.leanGear.attributes.position.count * 3);
        for (let i = 0; i < data.length; i += 3) data.set([colour.r, colour.g, colour.b], i);
        if (!kit.leanGear.attributes.color) kit.leanGear.setAttribute('color', new THREE.BufferAttribute(data, 3));
        gears.castShadow = true; gears.frustumCulled = false; parent.add(gears);
      }
      const lastFocus = new THREE.Vector3(Infinity, 0, 0);
      const assign = (focus: THREE.Vector3) => {
        if (focus.distanceToSquared(lastFocus) < 64) return;
        lastFocus.copy(focus);
        const lods = placements.map(list => list.map(matrix => {
          const d = Math.hypot(matrix.elements[12] - focus.x, matrix.elements[14] - focus.z);
          return d < LOD_DISTANCE ? 0 : d < DRAW_DISTANCE ? 1 : -1;
        }));
        for (const { style, lod, mesh } of meshes) {
          let n = 0;
          placements[style].forEach((matrix, i) => { if (lods[style][i] === lod) mesh.setMatrixAt(n++, matrix); });
          mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
        }
      };
      const spin = new THREE.Matrix4(), out = new THREE.Matrix4();
      const update = (seconds: number, focus?: THREE.Vector3) => {
        if (focus) assign(focus);
        if (!gears) return;
        gearBases.forEach((g, i) => gears!.setMatrixAt(i, out.multiplyMatrices(g.matrix, spin.makeRotationZ(seconds * g.rate))));
        gears.instanceMatrix.needsUpdate = true;
      };
      assign(new THREE.Vector3());
      update(0);
      return { meshes: meshes.map(entry => entry.mesh), update, instances: placed.length, gears: gearBases.length };
    },
    dispose() { built.forEach(a => a.lods.forEach(lod => lod.forEach(g => g.dispose()))); },
  };
}
