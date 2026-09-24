// Capture the real game for the lightweight menu. Run against `npm run dev`.
// Each world is shot with the cinematic quality tier: a low, long-lens hero
// angle with the car on the right third so the menu copy owns the left side.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await mkdir('artifacts/menu-source', { recursive: true });
await mkdir('public/menu', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const views = [
  { stage: 'cyberpunk', circuit: 'neon', at: .095 },
  { stage: 'solarpunk', circuit: 'solar', at: .182 },
  { stage: 'steampunk', circuit: 'steam', at: .20 },
];
const maps = {};
try {
  for (const view of views) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:5198/?circuit=${view.circuit}&car=shinsei&hq`);
    await page.waitForFunction(() => window.__game && document.querySelector('#loading')?.hidden, null, { timeout: 120000 });
    await page.addStyleTag({ content: '#app > :not(canvas), #hud-root { visibility:hidden!important; }' });
    const points = await page.evaluate(async ({ at }) => {
      const g = window.__game;
      g.loop.stop();
      g.setQualityPreset('cinematic', false);
      g.car.resetAt(Math.round(at * g.spline.count), 0);
      g.scene.getObjectByName('driving-guide')?.traverse(node => { node.visible = false; });
      for (const rival of g.rivals) rival.car.group.visible = false;
      const p = g.car.group.position, q = g.car.group.quaternion;
      g.camera.position.copy(p).add(p.clone().set(5.2, 0, 11.5).applyQuaternion(q));
      g.camera.position.y = p.y + .8;
      const target = p.clone().add(p.clone().set(-.9, 0, 0).applyQuaternion(q));
      target.y = p.y + .8;
      g.camera.fov = 29;
      g.camera.lookAt(target);
      g.camera.updateProjectionMatrix();
      g.environment.update(g.car.physics.position, 60);
      g.environment.updateShadows();
      g.updateContactShadows();
      g.post.setFocusDistance(g.camera.position.distanceTo(p));
      g.post.resetMotionHistory();
      // Let temporal passes (bloom history, film grain, mist) settle.
      for (let i = 0; i < 12; i++) {
        g.post.update(1 / 60, g.car.physics.telemetry);
        g.render();
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return g.spline.samples.map(sample => [sample.position.x, sample.position.z]);
    }, view);
    maps[view.circuit === 'neon' ? 'neon' : 'kairo'] = points;
    await page.screenshot({ path: `artifacts/menu-source/${view.stage}-hero.png` });
    await page.close();
  }
  // Keep outlines added by import-layouts.mjs; this capture refreshes Neon and Kairo.
  let existing = {};
  try { existing = JSON.parse(await readFile('artifacts/menu-source/maps.json', 'utf8')); } catch { /* first capture */ }
  await writeFile('artifacts/menu-source/maps.json', JSON.stringify({ ...existing, ...maps }));
} finally { await browser.close(); }

for (const view of views) {
  const source = `artifacts/menu-source/${view.stage}-hero.png`;
  execFileSync('cwebp', ['-quiet', '-q', '80', source, '-o', `public/menu/${view.stage}.webp`]);
  execFileSync('cwebp', ['-quiet', '-q', '74', source, '-resize', '960', '540', '-o', `public/menu/${view.stage}-small.webp`]);
  execFileSync('cwebp', ['-quiet', '-q', '72', source, '-crop', '240', '180', '1440', '810', '-resize', '480', '270', '-o', `public/menu/${view.stage}-thumb.webp`]);
}
await import('./build-selection-maps.mjs');
