import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'artifacts/kairo-steam'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error(m.text()); } });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto('http://127.0.0.1:5198/?circuit=steam&car=shinsei&hq&go');
    await page.waitForFunction(() => window.__game && window.__THREE_GAME_DIAGNOSTICS__?.started, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.loop.stop());
    const model = await page.evaluate(async () => {
      const { grandstandTrackClearance } = await import('/src/game/SolarGrandstand.ts');
      const g = window.__game, root = g.scene.getObjectByName('steam-city');
      const clearance = grandstandTrackClearance(g.spline.samples);
      const gears = [], ships = [], clockFaces = [], materials = new Set(), geometries = new Set(); let triangles = 0, instances = 0, meshes = 0;
      root.traverse(o => {
        if (o.name === 'steam-flywheel') gears.push(o.children[0]); if (o.name === 'steam-dirigible') ships.push(o);
        if (o.name === 'steam-clock-face') clockFaces.push(o);
        if (!o.isMesh) return; meshes++; materials.add(o.material); geometries.add(o.geometry);
        const n = o.isInstancedMesh ? o.count : o.geometry.isInstancedBufferGeometry ? o.geometry.instanceCount : 1; if (o.isInstancedMesh) instances += n;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * n;
      });
      g.environment.update(g.car.physics.position, 0); const initial = gears.map(o => o.rotation.z), initialShip = ships.map(o => o.position.clone());
      g.environment.update(g.car.physics.position, 60);
      return { circuit: g.spline.circuitId, length: g.spline.length, corners: g.builder.corners.length, ...root.userData.scenery,
        landmarks: root.userData.landmarks.map(o => ({ ...o, clearance: clearance(o.x, o.z) - o.r })),
        minimumBuildingClearance: Math.min(...root.userData.buildingFootprints.map(o => clearance(o.x, o.z) - o.r)),
        roadsideStyles: [...new Set(root.userData.buildingFootprints.filter(o => o.near).map(o => o.style))],
        gearsVisible: gears.every(o => o.visible && o.parent.visible), clockFacesVisible: clockFaces.length === 4 && clockFaces.every(o => o.visible),
        gearsMove: gears.every((o, i) => o.rotation.z !== initial[i]), shipsMove: ships.every((o, i) => o.position.distanceTo(initialShip[i]) > 1),
        steamTime: root.getObjectByName('steam-plumes').material.uniforms.time.value,
        steamVisible: root.getObjectByName('steam-plumes').visible,
        brassWorks: g.scene.getObjectByName('steam-brassworks')?.visible === true,
        solarPresent: !!g.scene.getObjectByName('solar-city'), rain: g.rainExposureAt(0), meshes, instances, triangles, geometries: geometries.size, materials: materials.size };
    });
    assert.equal(model.circuit, 'steam'); assert.equal(model.corners, 18); assert.equal(model.landmarks.length, 4); assert.ok(model.brassWorks);
    assert.ok(model.gearsMove && model.shipsMove && model.gearsVisible && model.clockFacesVisible); assert.equal(model.steamTime, 60); assert.equal(model.rain, 0); assert.equal(model.solarPresent, false);
    model.landmarks.forEach(site => assert.ok(site.clearance >= 17));
    assert.ok(model.steamVisible && model.pressureVents > 0 && model.facadeGears < 20);
    assert.ok(model.minimumBuildingClearance >= 15); assert.equal(model.roadsideStyles.length, 6);
    for (const feature of ['water-towers', 'loading-cranes', 'fire-escapes', 'workshop-boilers', 'copper-domes', 'glass-vaults']) assert.ok(model.features[feature] > 0);
    const captures = [];
    for (const fraction of (mobile ? [.182, .534, .738, .84] : [0, .10, .182, .32, .42, .534, .64, .738, .84, .90])) {
      const stats = await page.evaluate(f => {
        const g = window.__game; g.car.resetAt(Math.round(f * g.spline.count), 0); g.cameraRig.snap(g.car);
        g.environment.update(g.car.physics.position, 60); g.environment.updateShadows();
        for (let i = 0; i < 3; i++) g.render();
        return { render: { ...g.renderer.info.render }, memory: { ...g.renderer.info.memory } };
      }, fraction);
      await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-${fraction.toFixed(3)}.png` }); captures.push({ fraction, ...stats });
    }
    assert.deepEqual(errors, []); results.push({ mobile, model, captures, errors }); console.log(JSON.stringify({ mobile, model, errors })); await page.close();
  }
  await writeFile(`${out}/verification.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
