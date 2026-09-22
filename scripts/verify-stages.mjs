import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'artifacts/stages'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mobile of [false, true]) for (const circuit of ['neon-solar', 'neon-steam']) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:5198/?circuit=${circuit}&car=shinsei&hq`);
    await page.waitForFunction(() => window.__game && document.querySelector('#loading')?.hidden, null, { timeout: 60000 });
    const menu = await page.evaluate(() => ({ stages: document.querySelectorAll('[data-stage]').length, circuits: document.querySelectorAll('[data-circuit]').length, fit: [...document.querySelectorAll('[data-stage], [data-circuit]')].every(n => n.scrollWidth <= n.clientWidth) }));
    assert.deepEqual(menu, { stages: 3, circuits: 2, fit: true });
    await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-${circuit}-menu.png` });
    if (mobile) await page.locator('#session-primary').tap(); else await page.locator('#session-primary').click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.started);
    const model = await page.evaluate(() => {
      const g = window.__game; g.loop.stop();
      const tunnel = g.scene.getObjectByName('neon-transit-tunnel');
      return { circuit: g.spline.circuitId, stage: g.spline.circuit.stage, layout: g.spline.circuit.layout,
        length: g.spline.length, corners: g.builder.corners.length, solar: !!g.scene.getObjectByName('solar-city'), steam: !!g.scene.getObjectByName('steam-city'),
        tunnel: !!tunnel && tunnel.visible && !!tunnel.getObjectByName('neon-tunnel-shell')?.visible, clearance: tunnel?.userData.clearance,
        bridge: !!g.scene.getObjectByName('kairo-flyover-deck'), rain: g.rainExposureAt(0), tunnelMix: g.tunnelMixAt(.34*g.spline.length),
        stageClass: document.body.classList.contains(g.spline.circuit.stage === 'solarpunk' ? 'solar-race' : 'steam-race') };
    });
    assert.equal(model.corners, 12); assert.equal(model.layout, 'neon'); assert.ok(Math.abs(model.length - 3744) < 1);
    assert.ok(model.tunnel && model.stageClass); assert.equal(model.clearance, 7.2); assert.equal(model.bridge, false); assert.equal(model.rain, 0); assert.equal(model.tunnelMix, 1);
    assert.equal(model.solar, circuit === 'neon-solar'); assert.equal(model.steam, circuit === 'neon-steam');
    const captures = [];
    for (const at of mobile ? [0,.12,.34,.75] : [0,.12,.29,.34,.40,.58,.75]) {
      const stats = await page.evaluate(at => {
        const g = window.__game; g.car.resetAt(Math.round(at*g.spline.count),0); g.cameraRig.snap(g.car);
        g.environment.update(g.car.physics.position,60); g.environment.updateShadows();
        for (let n=0;n<3;n++)g.render();
        return { render: { ...g.renderer.info.render }, memory: { ...g.renderer.info.memory } };
      }, at);
      await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-${circuit}-${at.toFixed(2)}.png` }); captures.push({ at,...stats });
    }
    assert.deepEqual(errors, []); results.push({ mobile, model, menu, captures, errors }); console.log(JSON.stringify({ mobile,model,menu,errors })); await page.close();
  }
  await writeFile(`${out}/verification.json`, JSON.stringify(results,null,2));
} finally { await browser.close(); }
