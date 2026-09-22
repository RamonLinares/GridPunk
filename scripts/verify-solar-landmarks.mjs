import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = 'artifacts/solar-landmarks';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto('http://127.0.0.1:5198/?circuit=solar&car=shinsei&hq&go');
    await page.waitForFunction(() => window.__game && window.__THREE_GAME_DIAGNOSTICS__?.started, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.loop.stop());
    const models = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const { grandstandTrackClearance } = await import('/src/game/SolarGrandstand.ts');
      const g = window.__game, root = g.scene.getObjectByName('solar-landmarks');
      g.scene.updateMatrixWorld(true);
      const clearance = grandstandTrackClearance(g.spline.samples);
      const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
      return root.children.map(district => {
        const site = district.userData.landmark;
        let radius = 0, meshes = 0, instances = 0, triangles = 0;
        district.traverse(mesh => {
          if (!mesh.isMesh) return;
          meshes++;
          const points = mesh.geometry.attributes.position, count = mesh.isInstancedMesh ? mesh.count : 1;
          if (mesh.isInstancedMesh) instances += count;
          triangles += (mesh.geometry.index?.count ?? points.count) / 3 * count;
          for (let k = 0; k < count; k++) {
            if (mesh.isInstancedMesh) { mesh.getMatrixAt(k, matrix); matrix.premultiply(mesh.matrixWorld); }
            else matrix.copy(mesh.matrixWorld);
            for (let i = 0; i < points.count; i++) {
              vertex.fromBufferAttribute(points, i).applyMatrix4(matrix);
              radius = Math.max(radius, Math.hypot(vertex.x - site.x, vertex.z - site.z));
            }
          }
        });
        return { ...site, radius, clearance: clearance(site.x, site.z) - radius, meshes, instances, triangles, visible: root.visible && district.visible };
      });
    });
    assert.equal(models.length, 3);
    for (const model of models) {
      assert.ok(model.visible, `${model.kind} was culled`);
      assert.ok(model.radius <= model.r, `${model.kind} exceeds its reserved plot`);
      assert.ok(model.clearance >= 15, `${model.kind} intrudes on a road or return lane`);
    }
    const captures = [];
    // Identical locations to the baseline, then two approach views per district.
    const views = [ ...(!mobile ? [.18, .42, .7].map(fraction => ({ name: `comparison-${fraction}`, fraction })) : []),
      ...models.flatMap(site => [.018, .008].map(lead => ({ name: `${site.kind}-${lead}`, fraction: site.progress - lead }))) ];
    for (const view of views) {
      const stats = await page.evaluate(fraction => {
        const g = window.__game;
        g.car.resetAt(Math.round(fraction * g.spline.count), 0); g.cameraRig.snap(g.car);
        g.environment.update(g.car.physics.position, 60); g.environment.updateShadows?.(); g.render();
        return { render: { ...g.renderer.info.render }, memory: { ...g.renderer.info.memory } };
      }, view.fraction);
      await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-${view.name}.png` });
      captures.push({ ...view, ...stats });
    }
    assert.deepEqual(errors, []);
    results.push({ mobile, models, captures, errors });
    await page.close();
  }
  await writeFile(`${out}/verification.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(({ mobile, models, errors }) => ({ mobile, models, errors })), null, 2));
} finally { await browser.close(); }
