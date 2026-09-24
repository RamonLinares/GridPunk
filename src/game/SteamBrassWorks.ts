import * as THREE from 'three';
import type { createSteamMaterials } from './SteamMaterials';
import type { SteamKit, V3 } from './SteamKit';

type Materials = ReturnType<typeof createSteamMaterials>;

/**
 * Brass & Co.: a riveted iron-and-brick engine house with a glazed barrel
 * vault, a clock-rose entrance pavilion, a copper fuel boiler with an arching
 * main, twin stacks, a domed weather-vane tower and a flywheel gantry.
 *
 * Local frame: +z faces the road, +x runs along the frontage, y is up from the
 * plaza kerb. Everything stays within 30 m of the origin. Parts are merged per
 * material (see SteamKit), so the whole landmark costs a couple of dozen draws.
 */
export function createBrassWorks(m: Materials, kit: SteamKit) {
  const root = new THREE.Group(); root.name = 'steam-brassworks';
  root.userData.roadClearanceVerified = true;

  const { iron, brass, copper, bronze, glass, warmGlass, glow, paving, wood } = kit.mat;
  const { canvasMaterial, goldText, plate } = kit;
  const sketch = kit.sketch('hero');
  const { add, box, cyl, cylLow, sphere, rivet, dome, band, halfTorus, halfDisc, disc, vault, cone, plane,
    face, front, right, left, back, archWindow, pilaster, railing, tube, bands, lamp, crate } = sketch;

  // ------------------------------------------------------------ Signs
  const nameSign = canvasMaterial(1024, 256, c => {
    plate(c, 1024, 256);
    c.textAlign = 'center'; c.fillStyle = goldText(c, 50, 170); c.font = 'bold 118px Georgia'; c.fillText('BRASS & CO.', 512, 160);
    c.fillStyle = '#c9a25f'; c.font = '34px Georgia'; c.fillText('I N D U S T R Y   M O V E S   T O M O R R O W', 512, 214);
  });
  const stackPlaque = (lines: string[]) => canvasMaterial(512, 512, c => {
    plate(c, 512, 512);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const y = 120 + i * 136;
      c.fillStyle = goldText(c, y - 40, y + 40); c.font = 'bold 76px Georgia'; c.fillText(line, 256, y);
      if (i < lines.length - 1) { c.fillStyle = '#9b7a45'; c.fillRect(196, y + 66, 120, 3); c.beginPath(); c.arc(256, y + 67, 6, 0, Math.PI * 2); c.fill(); }
    });
  });
  const fuelPlaque = stackPlaque(['FUEL', 'POWER', 'PROGRESS']);
  const steamPlaque = stackPlaque(['STEAM', 'PEOPLE', 'PURPOSE']);
  const wallMotto = canvasMaterial(512, 768, c => {
    c.clearRect(0, 0, 512, 768); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(236,224,196,.9)'; c.font = 'bold 76px Georgia';
    ['A', 'CLEANER', 'BRIGHTER', 'INDUSTRIAL', 'TOMORROW'].forEach((word, i) => c.fillText(word, 256, 130 + i * 128, 480));
  }, true);
  const vaneLetters = ['N', 'E', 'S', 'W'].map(letter => canvasMaterial(128, 128, c => {
    c.clearRect(0, 0, 128, 128); c.fillStyle = '#d2ad66'; c.font = 'bold 104px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, 64, 70);
  }, true));
  const roseMaterial = canvasMaterial(512, 512, c => {
    const g = c.createRadialGradient(256, 256, 20, 256, 256, 256);
    g.addColorStop(0, '#6b4b25'); g.addColorStop(.7, '#2f2417'); g.addColorStop(1, '#16110b');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
    // Clockwork glimpsed through the rose: interlocking gear silhouettes.
    const cog = (x: number, y: number, r: number, teeth: number, colour: string) => {
      c.fillStyle = colour; c.beginPath();
      for (let k = 0; k <= teeth * 4; k++) { const a = k / (teeth * 4) * Math.PI * 2, rr = k % 4 < 2 ? r : r * .85; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.fill(); c.fillStyle = '#231a10'; c.beginPath(); c.arc(x, y, r * .35, 0, Math.PI * 2); c.fill();
    };
    cog(170, 190, 90, 14, '#a57b3c'); cog(335, 175, 70, 11, '#8c6630'); cog(320, 340, 95, 15, '#b48a47'); cog(165, 355, 55, 9, '#7d5a2b');
    c.strokeStyle = '#d3ab62'; c.lineWidth = 10;
    for (const r of [245, 190]) { c.beginPath(); c.arc(256, 256, r, 0, Math.PI * 2); c.stroke(); }
  });

  const gears: THREE.Object3D[] = [], rates: number[] = [];
  const gear = (p: V3, radius: number, yaw: number, rate: number, mat = brass) => {
    const axle = new THREE.Group(); axle.name = 'steam-flywheel'; axle.position.set(...p); axle.rotation.y = yaw;
    const mesh = new THREE.Mesh(kit.heroGear, mat); mesh.scale.set(radius, radius, radius * .9); mesh.castShadow = true;
    axle.add(mesh); root.add(axle); gears.push(mesh); rates.push(rate);
  };

  // ------------------------------------------------------------ Plaza
  const plazaTop = .5;
  add(box, paving, [0, plazaTop / 2, -1], [52, plazaTop, 40]);
  add(box, iron, [0, plazaTop + .04, 19], [52, .08, .3]);
  railing(-26, 19, -6, 19, plazaTop, .9, true); railing(3, 19, 26, 19, plazaTop, .9, true);
  railing(-26, -21, -26, 19, plazaTop, .9, true); railing(26, -21, 26, 19, plazaTop, .9, true);
  // Steps up to the entrance.
  for (let i = 0; i < 3; i++) add(box, paving, [-2, plazaTop + .15 + i * .3, 12.6 - i * .8], [7.2 - i * .6, .3, 1]);
  for (const side of [-1, 1]) railing(-2 + side * 3.8, 13.2, -2 + side * 3.3, 10.4, plazaTop + .5, 1);

  // ------------------------------------------------------------ Main hall
  const hallX = 1, hallZ = -6, hallW = 28, hallD = 14, eave = 13;
  add(box, m.brick, [hallX, plazaTop + (eave - plazaTop) / 2, hallZ], [hallW, eave - plazaTop, hallD]);
  add(box, iron, [hallX, plazaTop + .6, hallZ], [hallW + .4, 1.2, hallD + .4]);
  for (const side of [-1, 1]) {
    add(box, iron, [hallX, eave + .1, hallZ + side * (hallD / 2 + .1)], [hallW + .6, .9, .8]);
    add(box, brass, [hallX, eave - .42, hallZ + side * (hallD / 2 + .42)], [hallW + .6, .14, .14]);
    railing(hallX - hallW / 2, hallZ + side * (hallD / 2 + .15), hallX + hallW / 2, hallZ + side * (hallD / 2 + .15), eave + .5, 1.1, true);
  }
  // Glazed barrel vault with iron ribs and purlins.
  const vr = 7.1, vy = eave + .5, vx0 = hallX - hallW / 2, vx1 = hallX + hallW / 2;
  add(vault, glass, [hallX, vy, hallZ], [vr, hallW, vr], [0, 0, -Math.PI / 2]);
  for (let x = vx0; x <= vx1 + .01; x += 2) {
    const heavy = Math.abs(x - vx0) < .1 || Math.abs(x - vx1) < .1 || Math.round(x - vx0) % 8 === 0;
    add(halfTorus, iron, [x, vy, hallZ], [vr + .06, vr + .06, heavy ? 6 : 3], [0, Math.PI / 2, 0]);
  }
  for (let a = 15; a < 180; a += 15) {
    const rad = a * Math.PI / 180;
    add(box, iron, [hallX, vy + Math.sin(rad) * (vr + .05), hallZ + Math.cos(rad) * (vr + .05)], [hallW, .09, .09], [-rad + Math.PI / 2, 0, 0]);
  }
  // Ridge walkway along the crown.
  add(box, iron, [hallX, vy + vr + .15, hallZ], [hallW - 2, .2, 1.6]);
  for (const side of [-1, 1]) railing(hallX - hallW / 2 + 1, hallZ + side * .8, hallX + hallW / 2 - 1, hallZ + side * .8, vy + vr + .25, 1, true);
  add(box, iron, [hallX + 4, vy + vr + .9, hallZ], [2.4, 1.2, 1.4]);
  add(box, bronze, [hallX + 4, vy + vr + 1.6, hallZ], [2.8, .2, 1.8]);
  // Gable ends: glazed fans with radial bars and a heavy arch.
  for (const side of [-1, 1]) {
    const f = side > 0 ? right(vx1 + .02) : left(vx0 - .02);
    add(halfDisc, warmGlass, [side > 0 ? -hallZ : hallZ, vy, 0], [vr, vr, 1], [0, 0, 0], f);
    add(halfTorus, iron, [side > 0 ? -hallZ : hallZ, vy, .08], [vr + .1, vr + .1, 9], [0, 0, 0], f);
    for (let k = 1; k < 8; k++) {
      const a = k / 8 * Math.PI;
      add(box, iron, [(side > 0 ? -hallZ : hallZ) + Math.cos(a) * vr / 2, vy + Math.sin(a) * vr / 2, .08], [vr, .1, .1], [0, 0, a], f);
    }
    add(halfTorus, iron, [side > 0 ? -hallZ : hallZ, vy, .08], [vr * .45, vr * .45, 4], [0, 0, 0], f);
  }
  // Hall elevations: piers and two tiers of arched windows on each long side and the ends.
  // (The front elevation is hidden behind the pavilion, wing and boiler.)
  const backFace = back(hallZ - hallD / 2);
  for (let i = 0; i <= 7; i++) pilaster(backFace, -hallX - hallW / 2 + i * hallW / 7, plazaTop, eave);
  for (let i = 0; i < 7; i++) for (const y of [2, 7.6]) archWindow(backFace, -hallX - hallW / 2 + (i + .5) * hallW / 7, y, 1.9, 4);
  for (const [f, centre] of [[right(vx1), -hallZ], [left(vx0), hallZ]] as [THREE.Matrix4, number][]) {
    for (const u of [-7, 0, 7]) pilaster(f, centre + u, plazaTop, eave);
    for (const u of [-3.5, 3.5]) for (const y of [2, 7.6]) archWindow(f, centre + u, y, 1.9, 4);
  }

  // ------------------------------------------------------------ Entrance pavilion
  const px = -2, pz0 = 1, pz1 = 9.2, pw = 12, ph = 17.6;
  add(box, m.brick, [px, (ph + plazaTop) / 2, (pz0 + pz1) / 2], [pw, ph - plazaTop, pz1 - pz0]);
  const pf = front(pz1);
  // Iron frontispiece: panel, corner towers and the arched crown.
  add(box, iron, [px, (ph + plazaTop) / 2, .12], [pw + .4, ph - plazaTop, .24], [0, 0, 0], pf);
  for (const side of [-1, 1]) {
    const x = px + side * (pw / 2 + .2);
    add(box, iron, [x, (ph + 2) / 2, .3], [1.5, ph + 2, 1.5], [0, 0, 0], pf);
    for (const y of [1, 6.2, 12.4, ph - .2, ph + 1.8]) add(box, brass, [x, y, .3], [1.8, .28, 1.8], [0, 0, 0], pf);
    add(box, glow, [x, ph + 2.8, .3], [.9, 1.3, .9], [0, 0, 0], pf);
    for (const u of [-.48, .48]) for (const v of [-.48, .48]) add(box, iron, [x + u, ph + 2.8, .3 + v], [.1, 1.4, .1], [0, 0, 0], pf);
    add(cone, iron, [x, ph + 4, .3], [.9, 1.1, .9], [0, Math.PI / 4, 0], pf);
    add(cylLow, brass, [x, ph + 5.1, .3], [.05, 1.4, .05], [0, 0, 0], pf);
    add(sphere, brass, [x, ph + 4.6, .3], [.18, .18, .18], [0, 0, 0], pf);
    // Wall lanterns flank the doorway.
    add(box, iron, [px + side * 3.3, 5.6, .45], [.12, .12, .6], [0, 0, 0], pf);
    add(box, glow, [px + side * 3.3, 5.3, .8], [.4, .6, .4], [0, 0, 0], pf);
    add(cone, iron, [px + side * 3.3, 5.8, .8], [.36, .4, .36], [0, 0, 0], pf);
  }
  // Pavilion glass vault running back into the hall.
  const pvr = pw / 2 - .2;
  add(vault, glass, [px, ph, (pz0 + pz1) / 2 - 1.5], [pvr, pz1 - pz0 + 3, pvr], [0, Math.PI / 2, -Math.PI / 2]);
  for (let z = pz0 - 3; z <= pz1; z += 1.8) add(halfTorus, iron, [px, ph, z], [pvr + .06, pvr + .06, 4]);
  for (let a = 22.5; a < 180; a += 22.5) {
    const rad = a * Math.PI / 180;
    add(box, iron, [px + Math.cos(rad) * (pvr + .05), ph + Math.sin(rad) * (pvr + .05), (pz0 + pz1) / 2 - 1.5], [.09, .09, pz1 - pz0 + 3]);
  }
  // Front crown: warm glazed fan inside a heavy riveted arch.
  add(halfDisc, warmGlass, [px, ph, .28], [pvr, pvr, 1], [0, 0, 0], pf);
  for (let k = 1; k < 10; k++) { const a = k / 10 * Math.PI; add(box, iron, [px + Math.cos(a) * pvr / 2, ph + Math.sin(a) * pvr / 2, .34], [pvr, .09, .08], [0, 0, a], pf); }
  for (const r of [pvr * .4, pvr * .72]) add(halfTorus, iron, [px, ph, .34], [r, r, 3], [0, 0, 0], pf);
  add(halfTorus, iron, [px, ph, .45], [pvr + .35, pvr + .35, 14], [0, 0, 0], pf);
  add(halfTorus, brass, [px, ph, .62], [pvr + .75, pvr + .75, 4], [0, 0, 0], pf);
  for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI; add(rivet, brass, [px + Math.cos(a) * (pvr + .35), ph + Math.sin(a) * (pvr + .35), .75], [.13, .13, .13], [0, 0, 0], pf); }
  add(cylLow, brass, [px, ph + pvr + 1.4, .3], [.07, 2.8, .07], [0, 0, 0], pf);
  add(sphere, brass, [px, ph + pvr + .5, .3], [.3, .3, .3], [0, 0, 0], pf);
  // The clock rose: dark clockwork glass, concentric brass rings, spokes and rivets.
  const rose = 3.2, ry = ph - 3.9;
  add(cyl, iron, [px, ry, .36], [rose + .75, .3, rose + .75], [Math.PI / 2, 0, 0], pf);
  add(band, brass, [px, ry, .52], [rose + .72, rose + .72, 10], [0, 0, 0], pf);
  add(disc, roseMaterial, [px, ry, .42], [rose, rose, 1], [0, 0, 0], pf);
  for (const [r, t] of [[rose, 9], [rose * .78, 4], [rose * .3, 4]] as [number, number][]) add(band, brass, [px, ry, .48], [r, r, t], [0, 0, 0], pf);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; add(box, brass, [px + Math.cos(a) * rose * .54, ry + Math.sin(a) * rose * .54, .5], [rose * .48, .1, .1], [0, 0, a], pf); }
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; add(rivet, brass, [px + Math.cos(a) * (rose + .38), ry + Math.sin(a) * (rose + .38), .45], [.12, .12, .12], [0, 0, 0], pf); }
    gear([px, ry, pz1 + .5], 1.25, 0, .12);
  gear([px + 1.55, ry + 1.1, pz1 + .46], .78, 0, -.19);
  gear([px - 1.3, ry - 1.4, pz1 + .46], .66, 0, -.23);
  // BRASS & CO. nameboard in a brass frame.
  add(plane, nameSign, [px, 8.85, .5], [7.8, 1.95, 1], [0, 0, 0], pf);
  add(box, brass, [px, 8.85, .42], [8.2, 2.3, .12], [0, 0, 0], pf);
  add(box, iron, [px, 7.55, .6], [9.2, .3, .6], [0, 0, 0], pf);
  // Arched doorway: glazed double doors, fanlight, heavy iron surround.
  const doorW = 4.2, doorBody = 3.3, doorTop = plazaTop + .9 + doorBody;
  add(box, m.dark, [px, plazaTop + .9 + doorBody / 2 + 1, .3], [doorW + .4, doorBody + 2.2, .2], [0, 0, 0], pf);
  for (const side of [-1, 1]) {
    add(box, bronze, [px + side * doorW / 4, plazaTop + .9 + doorBody / 2, .45], [doorW / 2 - .1, doorBody, .12], [0, 0, 0], pf);
    for (const y of [1.6, 2.9]) add(box, glow, [px + side * doorW / 4, plazaTop + .9 + y, .52], [doorW / 2 - .6, 1, .04], [0, 0, 0], pf);
    add(box, iron, [px + side * (doorW / 2 + .35), plazaTop + .9 + doorBody / 2, .6], [.7, doorBody, .7], [0, 0, 0], pf);
    add(rivet, brass, [px + side * .25, plazaTop + 2.6, .55], [.09, .09, .09], [0, 0, 0], pf);
  }
  add(halfDisc, glow, [px, doorTop, .44], [doorW / 2, doorW / 2, 1], [0, 0, 0], pf);
  for (let k = 1; k < 6; k++) { const a = k / 6 * Math.PI; add(box, iron, [px + Math.cos(a) * doorW / 4, doorTop + Math.sin(a) * doorW / 4, .5], [doorW / 2, .08, .06], [0, 0, 0], pf); }
  add(halfTorus, iron, [px, doorTop, .6], [doorW / 2 + .35, doorW / 2 + .35, 16], [0, 0, 0], pf);
  add(halfTorus, brass, [px, doorTop, .82], [doorW / 2 + .8, doorW / 2 + .8, 4], [0, 0, 0], pf);
  add(box, iron, [px, doorTop + doorW / 2 + .75, .9], [.5, .7, .4], [0, 0, 0], pf);
  // Pavilion flanks.
  // Only the west flank shows; the wing covers the east one.
  const flank = left(px - pw / 2 - .75), flankCentre = (pz0 + pz1) / 2;
  for (const y of [2, 7.6, 12.6]) archWindow(flank, flankCentre - 1.2, y, 1.6, 3.6);

  // ------------------------------------------------------------ Right wing and balcony tank
  const wx0 = px + pw / 2, wx1 = 15, wz0 = 1, wz1 = 7.4, wh = 12.4;
  add(box, m.brick, [(wx0 + wx1) / 2, (wh + plazaTop) / 2, (wz0 + wz1) / 2], [wx1 - wx0, wh - plazaTop, wz1 - wz0]);
  add(box, iron, [(wx0 + wx1) / 2, wh + .2, (wz0 + wz1) / 2], [wx1 - wx0 + .6, .7, wz1 - wz0 + .6]);
  railing(wx0, wz1 + .2, wx1, wz1 + .2, wh + .55, 1, true); railing(wx1 + .2, wz0, wx1 + .2, wz1, wh + .55, 1, true);
  const wf = front(wz1);
  for (const x of [wx0 + .5, (wx0 + wx1) / 2, wx1 - .4]) pilaster(wf, x, plazaTop, wh);
  add(box, iron, [(wx0 + wx1) / 2, 6.6, .3], [wx1 - wx0, .45, .6], [0, 0, 0], wf);
  for (const x of [wx0 + 2.4, wx1 - 2.4]) { archWindow(wf, x, 1.8, 2, 4); archWindow(wf, x, 7.5, 2, 3.8); }
  // Painted motto on the gable wall facing the side street.
  add(plane, wallMotto, [-(wz0 + wz1) / 2, 5.4, .08], [4.6, 6.9, 1], [0, 0, 0], right(wx1));
  pilaster(right(wx1), -wz1 + .4, plazaTop, wh); pilaster(right(wx1), -wz0 - .4, plazaTop, wh);
  // Cantilevered balcony carrying the STEAM tank.
  const by = 8.6, bx0 = 7, bx1 = 15.4, bz0 = wz1, bz1 = 11.2;
  add(box, iron, [(bx0 + bx1) / 2, by, (bz0 + bz1) / 2], [bx1 - bx0, .35, bz1 - bz0]);
  add(box, brass, [(bx0 + bx1) / 2, by - .25, bz1], [bx1 - bx0, .16, .16]);
  railing(bx0, bz1, bx1, bz1, by + .18, 1.1, true); railing(bx0, bz0, bx0, bz1, by + .18, 1.1); railing(bx1, bz0, bx1, bz1, by + .18, 1.1);
  for (const x of [bx0 + .5, bx1 - .5]) {
    add(box, iron, [x, (by + plazaTop) / 2, bz1 - .5], [.55, by - plazaTop, .55]);
    add(box, iron, [x, by * .55, (bz0 + bz1) / 2], [.22, Math.hypot(by * .9, bz1 - bz0), .22], [-Math.atan2(bz1 - bz0, by * .9), 0, 0]);
  }
  for (const side of [-1, 1]) add(box, iron, [(bx0 + bx1) / 2, by * .5, bz1 - .5], [.18, Math.hypot(bx1 - bx0 - 1, by * .8), .18], [0, 0, side * Math.atan2(bx1 - bx0 - 1, by * .8)]);
  const tx = 11.4, tz = 8.9, tr = 2.1, tb = by + .2, tt = tb + 6.4;
  add(cyl, bronze, [tx, (tb + tt) / 2, tz], [tr, tt - tb, tr]);
  add(dome, bronze, [tx, tt, tz], [tr, tr * .6, tr]);
  bands(tx, tz, tr, [tb + .3, tb + 2.2, tt - 1.8, tt - .1], 1.4);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(box, brass, [tx + Math.cos(a) * (tr + .03), (tb + tt) / 2, tz + Math.sin(a) * (tr + .03)], [.07, tt - tb, .07], [0, -a, 0]); }
  add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, -.42, .84), steamPlaque, [tx, tb + 3.2, tz], [tr + .08, 2.6, tr + .08]);
  add(cylLow, brass, [tx, tt + tr * .6 + .4, tz], [.18, .9, .18]);
  tube([[tx, tt + 1.4, tz], [tx, tt + 2.6, tz], [tx - 1.2, tt + 3.2, tz - 1.2], [tx - 3, tt + 2.2, wz1 - 1]], .32, copper, [.1, .9]);

  // ------------------------------------------------------------ Tower, flywheel gantry
  const towerX = 18.4, towerZ = -3.2, towerR = 2.3, towerTop = 21;
  add(box, m.brick, [towerX, 2.5, towerZ], [5.4, 4, 5.4]);
  add(cyl, iron, [towerX, (towerTop + 4.5) / 2, towerZ], [towerR, towerTop - 4.5, towerR]);
  bands(towerX, towerZ, towerR, [5, 9.5, 14, 18.5, towerTop - .2], 2);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    add(box, brass, [towerX + Math.cos(a) * (towerR + .06), (towerTop + 4.5) / 2, towerZ + Math.sin(a) * (towerR + .06)], [.14, towerTop - 4.5, .14], [0, -a, 0]);
  }
  for (const y of [7, 11.5, 16]) for (const a of [0, Math.PI / 2, Math.PI]) {
    const f = face(a, towerX + Math.sin(a) * (towerR - .05), towerZ + Math.cos(a) * (towerR - .05));
    archWindow(f, 0, y, .7, 2);
  }
  add(cyl, iron, [towerX, towerTop + .3, towerZ], [towerR + .35, .6, towerR + .35]);
  railing(towerX - towerR - .5, towerZ + towerR + .5, towerX + towerR + .5, towerZ + towerR + .5, towerTop + .6, .8);
  add(dome, iron, [towerX, towerTop + .6, towerZ], [towerR + .1, towerR * 1.05, towerR + .1]);
  for (let k = 0; k < 8; k++) add(halfTorus, brass, [towerX, towerTop + .6, towerZ], [towerR + .14, towerR * 1.07, 4], [0, k * Math.PI / 8, 0]);
  add(cylLow, iron, [towerX, towerTop + towerR + 1.1, towerZ], [.55, 1, .55]);
  add(sphere, iron, [towerX, towerTop + towerR + 1.75, towerZ], [.6, .45, .6]);
  // Weather vane: compass arms with letters, arrow and pennant.
  const vaneY = towerTop + towerR + 3.4;
  add(cylLow, brass, [towerX, vaneY - .2, towerZ], [.06, 3.4, .06]);
  add(sphere, brass, [towerX, vaneY - 1.2, towerZ], [.2, .2, .2]);
  for (const [k, a] of [0, Math.PI / 2, Math.PI, Math.PI * 1.5].entries()) {
    add(box, brass, [towerX + Math.sin(a) * .6, vaneY - .6, towerZ + Math.cos(a) * .6], [.05, .05, 1.2], [0, a, 0]);
    add(plane, vaneLetters[k], [towerX + Math.sin(a) * 1.4, vaneY - .6, towerZ + Math.cos(a) * 1.4], [.8, .8, 1], [0, a + Math.PI / 2, 0]);
  }
  add(box, brass, [towerX, vaneY + .6, towerZ], [2.6, .07, .07], [0, .5, 0]);
  add(cone, brass, [towerX - 1.2 * Math.cos(.5), vaneY + .6, towerZ + 1.2 * Math.sin(.5)], [.18, .5, .06], [0, .5, Math.PI / 2]);
  add(box, brass, [towerX + .95 * Math.cos(.5), vaneY + .85, towerZ - .95 * Math.sin(.5)], [1.1, .55, .04], [0, .5, 0]);
  // Tower main arches over into the vault.
  tube([[towerX - towerR * .6, 17, towerZ + 1.2], [towerX - 3.5, 18.6, towerZ + 1.4], [vx1 - .6, 19.8, hallZ + 2.5], [vx1 - 2.5, vy + 5.2, hallZ + 2.8]], .38, iron, [.15, .6]);
  // Flywheel gantry between tower and wing.
  const gy = 9.2, gx0 = 15.4, gx1 = 23.2, gz0 = -.4, gz1 = 6.2;
  add(box, iron, [(gx0 + gx1) / 2, gy, (gz0 + gz1) / 2], [gx1 - gx0, .35, gz1 - gz0]);
  for (const [x, z] of [[gx1 - .4, gz0 + .4], [gx1 - .4, gz1 - .4], [gx0 + 1.4, gz1 - .4]]) add(box, iron, [x, (gy + plazaTop) / 2, z], [.5, gy - plazaTop, .5]);
  add(box, iron, [gx1 - .4, gy / 2, (gz0 + gz1) / 2], [.16, Math.hypot(gz1 - gz0, gy), .16], [Math.atan2(gz1 - gz0, gy), 0, 0]);
  railing(gx0, gz1, gx1, gz1, gy + .18, 1.1, true); railing(gx1, gz0, gx1, gz1, gy + .18, 1.1, true);
  const flyX = 19.8, flyY = gy + 5.3, flyZ = 2.6, flyR = 4.2;
  for (const side of [-1, 1]) {
    add(box, iron, [flyX + side * 1.1, (gy + flyY) / 2, flyZ - .5], [.3, flyY - gy + .6, .3], [0, 0, side * .18]);
    add(box, iron, [flyX + side * 1.1, (gy + flyY) / 2, flyZ + .5], [.3, flyY - gy + .6, .3], [0, 0, side * .18]);
  }
  add(cylLow, brass, [flyX, flyY, flyZ], [.3, 1.8, .3], [Math.PI / 2, 0, 0]);
  gear([flyX, flyY, flyZ + .35], flyR, 0, .08, brass);
  gear([flyX - 3.3, gy + 2.6, flyZ + .35], 1.3, 0, -.26, bronze);
  // Crank and piston down to a copper pressure cylinder on the gantry.
  add(box, iron, [flyX - 1.4, flyY - 2.3, flyZ + .9], [.35, 5, .3], [0, 0, .62]);
  add(cyl, copper, [flyX - 3.2, gy + 1.9, flyZ + .9], [.7, 3, .7]);
  bands(flyX - 3.2, flyZ + .9, .7, [gy + .6, gy + 3.2], .8);
  add(box, brass, [flyX - 3.2, gy + 3.9, flyZ + .9], [.3, 1.6, .3]);
  // External stair from the plaza to the gantry.
  const steps = 12;
  for (let i = 0; i < steps; i++) add(box, iron, [24.4, plazaTop + (i + .5) * (gy - plazaTop) / steps, 15 - i * .75], [1.6, .1, .7]);
  for (const side of [-1, 1]) {
    const len = Math.hypot(steps * .75, gy - plazaTop);
    add(box, iron, [24.4 + side * .85, (gy + plazaTop) / 2, 15 - steps * .75 / 2], [.1, len, .3], [-Math.atan2(steps * .75, gy - plazaTop), 0, 0]);
    add(box, brass, [24.4 + side * .85, (gy + plazaTop) / 2 + 1.1, 15 - steps * .75 / 2], [.06, len, .06], [-Math.atan2(steps * .75, gy - plazaTop), 0, 0]);
  }
  add(box, iron, [23.8, gy, 5.4], [2.6, .3, 2.2]);

  // ------------------------------------------------------------ Fuel boiler, mains and stacks
  const bx = -17.6, bz = 2.2, br = 5, bTop = 16.2;
  add(cyl, copper, [bx, (bTop + plazaTop) / 2, bz], [br, bTop - plazaTop, br]);
  add(cyl, iron, [bx, plazaTop + .5, bz], [br + .3, 1, br + .3]);
  add(dome, copper, [bx, bTop, bz], [br, br * .62, br]);
  bands(bx, bz, br, [2, 5.2, 12.9, bTop - .1], 3);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    add(box, bronze, [bx + Math.cos(a) * (br + .04), (bTop + plazaTop) / 2, bz + Math.sin(a) * (br + .04)], [.1, bTop - plazaTop, .1], [0, -a, 0]);
  }
  add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, -.4, .8), fuelPlaque, [bx, 9.05, bz], [br + .1, 4.4, br + .1]);
  // Inspection door at the base, and a manway on the dome.
  const df = face(0, bx, bz + br - .1);
  add(box, m.dark, [0, 2.2, .1], [2, 3, .4], [0, 0, 0], df);
  add(halfDisc, m.dark, [0, 3.7, .31], [1, 1, 1], [0, 0, 0], df);
  add(halfTorus, brass, [0, 3.7, .4], [1.15, 1.15, 6], [0, 0, 0], df);
  for (const side of [-1, 1]) add(box, brass, [side * 1.15, 2.2, .4], [.2, 3, .2], [0, 0, 0], df);
  add(cyl, copper, [bx + 1.8, bTop + 2.6, bz - 1.5], [.7, 1, .7]);
  // The great main: up from the dome, over the yard and down into the header drum.
  const drumX = -11.2, drumY = 6.8, drumZ = 5.6;
  tube([[bx + .6, bTop + 2, bz + .5], [bx + .6, bTop + 5.2, bz + .8], [bx + 2.8, bTop + 7.4, bz + 1.6], [drumX - 1.6, bTop + 7.2, drumZ - .5], [drumX, bTop + 4.6, drumZ], [drumX, drumY + 3.2, drumZ], [drumX, drumY + 1.2, drumZ]], 1.05, copper, [.04, .3, .62, .9]);
  tube([[bx + br - .6, 12.5, bz + 1.4], [bx + br + 1.4, 14.2, bz + 1.8], [drumX + 1.2, 15, 1.9], [drumX + 1.8, eave + 1.3, pz0 - .6]], .42, copper, [.2, .8]);
  add(box, m.brick, [drumX, 2.9, drumZ], [4.6, 4.8, 3]);
  add(box, iron, [drumX, 5.35, drumZ], [4.9, .3, 3.3]);
  add(cyl, copper, [drumX, drumY, drumZ], [1.6, 4.2, 1.6], [0, 0, Math.PI / 2]);
  for (const side of [-1, 1]) add(sphere, copper, [drumX + side * 2.1, drumY, drumZ], [.7, 1.6, 1.6]);
  for (const x of [drumX - 1.4, drumX + 1.4]) add(band, brass, [x, drumY, drumZ], [1.68, 1.68, 4], [0, Math.PI / 2, 0]);
  add(cylLow, brass, [drumX + 1.2, drumY - 2.6, drumZ + 1.3], [.16, 3.6, .16]);
  add(cyl, iron, [drumX - 1.3, drumY + 1.9, drumZ + .6], [.3, 1.2, .3]);
  add(sphere, brass, [drumX - 1.3, drumY + 2.6, drumZ + .6], [.38, .26, .38]);
  // Gauge dial on the drum face.
  add(disc, glow, [drumX, drumY, drumZ + 1.66], [.5, .5, 1]);
  add(band, brass, [drumX, drumY, drumZ + 1.66], [.55, .55, 4]);
  const vents: THREE.Vector3[] = [];
  for (const [x, z, h] of [[-13.2, -8.5, 31], [-5.8, -11.6, 29]]) {
    add(box, m.brick, [x, 3, z], [4, 5, 4]);
    add(cyl, iron, [x, (h + 5.5) / 2, z], [1.55, h - 5.5, 1.55]);
    add(cyl, iron, [x, h + .4, z], [1.95, .9, 1.95]);
    bands(x, z, 1.55, [6.5, 12, 18, 24, h - .8], 3);
    for (const y of [h - 2.2, h + .85]) add(band, brass, [x, y, z], [1.98, 1.98, 5], [Math.PI / 2, 0, 0]);
    vents.push(new THREE.Vector3(x, h + 1.2, z));
  }

  // ------------------------------------------------------------ Crane, cargo and yard dressing
  const craneX = -24, craneZ = 8.5, mast = 12.6;
  for (const [u, v] of [[-.6, -.6], [-.6, .6], [.6, -.6], [.6, .6]]) add(box, iron, [craneX + u, (mast + plazaTop) / 2, craneZ + v], [.16, mast - plazaTop, .16]);
  for (let y = plazaTop + .8; y < mast - .5; y += 1.6) for (const [u, v, ry] of [[0, .6, 0], [0, -.6, 0], [.6, 0, Math.PI / 2], [-.6, 0, Math.PI / 2]])
    add(box, iron, [craneX + u, y + .8, craneZ + v], [1.7, .08, .08], [0, ry, .75]);
  const jib = 6, jibTilt = .1;
  for (const [dy, v] of [[0, -.35], [0, .35], [.9, 0]]) add(box, iron, [craneX - jib / 2, mast + dy + jib / 2 * jibTilt, craneZ + v], [jib, .14, .14], [0, 0, -jibTilt]);
  for (let k = 0; k < 5; k++) add(box, iron, [craneX - .6 - k * 1.1, mast + .45 + (k * 1.2 + .6) * jibTilt, craneZ], [.1, 1.2, .1], [0, 0, k % 2 ? .6 : -.6]);
  add(box, iron, [craneX + .5, mast + .6, craneZ], [1.6, 1.2, 1.4]);
  add(cylLow, iron, [craneX - jib + .3, mast - 2.3 + jib * jibTilt, craneZ], [.03, 4.8, .03]);
  crate(craneX - jib + .3, mast - 6.3 + jib * jibTilt, craneZ, 1.5, .3);
  for (const [x, z, s, yaw, stack] of [[-22.5, 13.5, 1.6, .1, 1], [-20.6, 14.2, 1.3, -.2, 0], [-23.4, 16.2, 1.4, .4, 0], [-19.2, 11, 1.2, .2, 0], [-14.4, 15.4, 1.1, .5, 0]] as number[][]) {
    crate(x, plazaTop, z, s, yaw); if (stack) crate(x + .1, plazaTop + s, z, s * .8, yaw + .3);
  }
  for (const [x, z] of [[-11.8, 12.2], [-12.9, 11.4], [16.4, 13.2]]) {
    add(cyl, bronze, [x, plazaTop + .6, z], [.45, 1.2, .45]);
    add(band, brass, [x, plazaTop + .25, z], [.47, .47, 3], [Math.PI / 2, 0, 0]); add(band, brass, [x, plazaTop + .95, z], [.47, .47, 3], [Math.PI / 2, 0, 0]);
  }
  for (const [x, z] of [[-7.5, 14.2], [3.5, 14.2], [-14, 17.2], [11.8, 16.8], [21, 17.2]]) lamp(x, z);
  // Hand cart parked by the steps.
  const cf = face(-.35, 7.8, 15.2);
  add(box, wood, [0, plazaTop + 1, 0], [2.6, .18, 1.4], [0, 0, 0], cf);
  for (const side of [-1, 1]) {
    add(box, wood, [0, plazaTop + 1.3, side * .7], [2.6, .45, .08], [0, 0, 0], cf);
    add(band, iron, [.4, plazaTop + .62, side * .82], [.6, .6, 6], [0, 0, 0], cf);
    for (let k = 0; k < 4; k++) add(box, iron, [.4, plazaTop + .62, side * .82], [1.15, .05, .05], [0, 0, k * Math.PI / 4], cf);
    add(box, iron, [-2.1, plazaTop + 1.25, side * .45], [1.8, .08, .08], [0, 0, -.3], cf);
  }
  add(box, iron, [-1, plazaTop + .6, 0], [.1, .9, .1], [0, 0, 0], cf);

  // ------------------------------------------------------------ Merge
  const merged = sketch.merge(); sketch.dispose();
  for (const [mat, geometry] of merged) {
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = `steam-brassworks-${(mat as THREE.MeshStandardMaterial).name}`;
    mesh.castShadow = kit.castsShadow(mat); mesh.receiveShadow = mat !== glow;
    mesh.userData.roadClearanceVerified = true;
    root.add(mesh);
  }

  return { root, vents, gears: gears.map((mesh, i) => ({ root: mesh, rate: rates[i] })) };
}
