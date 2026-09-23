// Capture the real game for the lightweight menu. Run against `npm run dev`.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:5198/?circuit=${view.circuit}&car=shinsei&hq`);
    await page.waitForFunction(() => window.__game && document.querySelector('#loading')?.hidden, null, { timeout: 90000 });
    await page.addStyleTag({ content: '#app > :not(canvas), #hud-root { visibility:hidden!important; }' });
    const points = await page.evaluate(({ at }) => {
      const g = window.__game;
      g.loop.stop();
      g.setQualityPreset('quality', false);
      g.car.resetAt(Math.round(at * g.spline.count), 0);
      g.scene.getObjectByName('driving-guide')?.traverse(node => { node.visible = false; });
      for (const rival of g.rivals) rival.car.group.visible = false;
      g.environment.update(g.car.physics.position, 60);
      g.environment.updateShadows();
      g.updateContactShadows();
      return g.spline.samples.map(sample => [sample.position.x, sample.position.z]);
    }, view);
    maps[view.circuit === 'neon' ? 'neon' : 'kairo'] = points;
    for (const angle of ['front', 'chase']) {
      await page.evaluate(({ angle, stage }) => {
        const g = window.__game, p = g.car.group.position, q = g.car.group.quaternion;
        let target;
        if (angle === 'front' && stage === 'steampunk') {
          const site = g.scene.getObjectByName('steam-city').userData.landmarks.find(site => site.kind === 'clockworks');
          const toSite = p.clone().set(site.x-p.x, 0, site.z-p.z).normalize();
          const forward = p.clone().set(0,0,1).applyQuaternion(q);
          g.camera.position.copy(p).addScaledVector(toSite,-9).addScaledVector(forward,4);
          g.camera.position.y = p.y+2.5;
          target = p.clone().addScaledVector(toSite,1); target.y = p.y+1.2;
          g.camera.fov = 58;
        } else if (angle === 'front' && stage === 'cyberpunk') {
          g.camera.position.copy(p).add(p.clone().set(-5,2.5,8).applyQuaternion(q));
          target = p.clone().add(p.clone().set(0,1.3,-1).applyQuaternion(q));
          g.camera.fov = 58;
        } else {
          const offset = p.clone().set(angle === 'front' ? -7 : 7, angle === 'front' ? 2.8 : 3.6, angle === 'front' ? 10 : -12).applyQuaternion(q);
          g.camera.position.copy(p).add(offset);
          target = p.clone().add(p.clone().set(0, 1.1, 0).applyQuaternion(q));
          g.camera.fov = 52;
        }
        g.camera.lookAt(target);
        g.camera.updateProjectionMatrix();
        for (let i=0; i<3; i++) g.render();
      }, { angle, stage: view.stage });
      await page.screenshot({ path: `artifacts/menu-source/${view.stage}-${angle}.png` });
    }
    await page.close();
  }
  await writeFile('artifacts/menu-source/maps.json', JSON.stringify(maps));
} finally { await browser.close(); }

for (const view of views) {
  execFileSync('cwebp', ['-quiet', '-q', '78', `artifacts/menu-source/${view.stage}-front.png`, '-resize', '1600', '1000', '-o', `public/menu/${view.stage}.webp`]);
  execFileSync('cwebp', ['-quiet', '-q', '72', `artifacts/menu-source/${view.stage}-front.png`, '-resize', '800', '500', '-o', `public/menu/${view.stage}-small.webp`]);
  execFileSync('cwebp', ['-quiet', '-q', '70', `artifacts/menu-source/${view.stage}-front.png`, '-resize', '320', '200', '-o', `public/menu/${view.stage}-thumb.webp`]);
}
await import('./build-selection-maps.mjs');
