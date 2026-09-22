import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'artifacts/solar-sky-life';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error(m.text()); } });
    await page.goto('http://127.0.0.1:5198/?circuit=solar&car=shinsei&hq&go');
    await page.waitForFunction(() => window.__game && window.__THREE_GAME_DIAGNOSTICS__?.started, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.loop.stop());
    const models = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const { grandstandTrackClearance } = await import('/src/game/SolarGrandstand.ts');
      const g = window.__game, root = g.scene.getObjectByName('solar-sky-life');
      const clearance = grandstandTrackClearance(g.spline.samples);
      const geometries = new Set(), materials = new Set(); let meshes = 0, triangles = 0;
      root.traverse(o => { if (!o.isMesh) return; meshes++; geometries.add(o.geometry); materials.add(o.material); triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
      const turbines = root.children.filter(o => o.name === 'solar-community-turbine');
      const ships = root.children.filter(o => o.name === 'solar-zeppelin');
      const before = ships.map(o => o.position.toArray());
      const rotation = turbines.map(o => o.getObjectByName('solar-turbine-rotor').rotation.z);
      let minAltitude = Infinity;
      for (const time of [0, 60, 180, 360, 700]) {
        g.environment.update(g.car.physics.position, time); root.updateMatrixWorld(true);
        ships.forEach(o => { minAltitude = Math.min(minAltitude, new THREE.Box3().setFromObject(o).min.y); });
      }
      const moved = ships.every((o, i) => o.position.distanceTo(new THREE.Vector3(...before[i])) > 1);
      const rotated = turbines.every((o, i) => o.getObjectByName('solar-turbine-rotor').rotation.z !== rotation[i]);
      const turbineResults = turbines.map(o => ({ ...o.userData.site, clearance: clearance(o.position.x, o.position.z) - o.userData.site.r, visible: o.visible,
        bladeCount: o.getObjectByName('solar-turbine-rotor').userData.bladeCount }));
      return { turbines: turbineResults, ships: ships.map(o => ({ visible: o.visible, progress: o.userData.progress })), minAltitude, moved, rotated, meshes, triangles, geometries: geometries.size, materials: materials.size };
    });
    assert.equal(models.turbines.length, 3); assert.equal(models.ships.length, 3);
    assert.ok(models.moved && models.rotated); assert.ok(models.minAltitude > 165);
    models.turbines.forEach(o => { assert.ok(o.visible && o.clearance >= 17); assert.equal(o.bladeCount, 3); });
    models.ships.forEach(o => assert.ok(o.visible));
    const captures = [];
    const views = mobile ? [.13, ...models.turbines.map(o => o.progress - .012)] : [.13, .182, .42, .64, .9, ...models.turbines.flatMap(o => [o.progress - .025, o.progress - .012])];
    for (const fraction of views) {
      const stats = await page.evaluate(f => {
        const g = window.__game; g.car.resetAt(Math.round(f * g.spline.count), 0); g.cameraRig.snap(g.car);
        g.environment.update(g.car.physics.position, 60); g.environment.updateShadows();
        for (let i = 0; i < 3; i++) g.render();
        return { render: { ...g.renderer.info.render }, memory: { ...g.renderer.info.memory } };
      }, fraction);
      await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-${fraction.toFixed(3)}.png` });
      captures.push({ fraction, ...stats });
    }
    if (!mobile) {
      await page.evaluate(() => {
        const g = window.__game, ship = g.scene.getObjectByName('solar-zeppelin');
        g.camera.position.copy(ship.position).add({ x: 35, y: -35, z: 130 }); g.camera.lookAt(ship.position);
        g.environment.updateShadows(); for (let i = 0; i < 3; i++) g.render();
      });
      await page.screenshot({ path: `${out}/zeppelin-detail.png` });
    }
    assert.deepEqual(errors, []); results.push({ mobile, models, captures, errors });
    console.log(JSON.stringify({ mobile, models, errors })); await page.close();
  }
  await writeFile(`${out}/verification.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
