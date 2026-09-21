import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:5198';
const out = 'artifacts/kairo';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${base}/?circuit=kairo`);
    await page.waitForFunction(() => window.__game && document.querySelector('#loading').hidden, null, { timeout: 60000 });
    assert.equal(await page.title(), 'GridPunk — Kairo Loop');
    assert.equal(await page.locator('[data-circuit="kairo"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#circuit-corners').textContent(), '18');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('[data-quality="performance"]').click();
    await page.locator('.session-panel').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-menu.png` });
    await page.locator('#session-primary').click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.started);
    if (mobile) {
      const box = await page.locator('[data-gas]').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
      await page.waitForTimeout(2200);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.keyboard.down('w'); await page.waitForTimeout(2200); await page.keyboard.up('w');
    }
    const moving = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    assert.ok(moving.player.speed > 5);
    assert.ok(moving.rivalSpeeds.some(speed => speed > 5));
    await page.screenshot({ path: `${out}/${mobile ? 'mobile' : 'desktop'}-driving.png` });
    const png = PNG.sync.read(await page.locator('#game-canvas').screenshot());
    const colors = new Set();
    for (let y = 20; y < png.height; y += 13) for (let x = 20; x < png.width; x += 13) {
      const i = (y * png.width + x) * 4;
      colors.add(`${png.data[i] >> 4},${png.data[i+1] >> 4},${png.data[i+2] >> 4}`);
    }
    assert.ok(colors.size > 40);
    await page.locator('[data-action="pause"]').click();
    assert.equal(await page.locator('#session-overlay').getAttribute('data-state'), 'pause');
    await page.locator('#session-restart').click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__.countdown > 0);

    let crossing;
    if (!mobile) {
      crossing = await page.evaluate(async () => {
        const g = window.__game; g.loop.stop();
        // Locate the crossing from actual resampled segment intersections.
        let hit;
        const n = g.spline.count;
        for (let i = Math.floor(n*.42); i < n*.46; i++) for (let j = Math.floor(n*.83); j < n*.87; j++) {
          const a=g.spline.sampleAt(i).position,b=g.spline.sampleAt(i+1).position,c=g.spline.sampleAt(j).position,d=g.spline.sampleAt(j+1).position;
          const dx=b.x-a.x,dz=b.z-a.z,ex=d.x-c.x,ez=d.z-c.z,det=dx*ez-dz*ex;
          if (Math.abs(det)<1e-6) continue;
          const t=((c.x-a.x)*ez-(c.z-a.z)*ex)/det,u=((c.x-a.x)*dz-(c.z-a.z)*dx)/det;
          if(t>=0&&t<=1&&u>=0&&u<=1) hit={x:a.x+t*dx,z:a.z+t*dz,lower:i,upper:j,lowY:a.y+t*(b.y-a.y),highY:c.y+u*(d.y-c.y)};
        }
        if (!hit) throw new Error('Missing figure-eight crossing');
        const deckHeights=[];
        for (const [index,y] of [[hit.lower,hit.lowY],[hit.upper,hit.highY]]) {
          g.car.resetAt(index,0);
          g.car.physics.position.set(hit.x,y,hit.z);
          for(let frame=0;frame<12;frame++) g.car.syncVisual(1/60);
          deckHeights.push(g.car.physics.position.y);
        }
        // Same XZ, different decks: no contact separation or progress jump.
        g.car.resetAt(hit.lower,0); g.car.physics.position.set(hit.x,hit.lowY+.04,hit.z); g.car.syncVisual();
        const other=g.rivals[0].car;other.resetAt(hit.upper,0);other.physics.position.set(hit.x,hit.highY+.04,hit.z);other.syncVisual();
        g.contacts.reset();g.contacts.resolve([g.car.physics,other.physics],1/60,true);
        const progress=[g.spline.progressAt(g.car.physics.position,{index:hit.lower}),g.spline.progressAt(other.physics.position,{index:hit.upper})];
        const collisionEvents=g.contacts.playerEvents;
        // Render a clean lower-road approach with the flyover directly ahead.
        g.car.resetAt(hit.lower-9,0);g.rivals.forEach(r=>r.car.group.visible=false);
        g.cameraRig.mode='chase';g.cameraRig.snap(g.car);g.environment.update(g.car.physics.position,0);g.post.render();
        return {hit,deckHeights,progress,collisionEvents,length:g.spline.length,corners:g.builder.corners.length,hasCity:!!g.scene.getObjectByName('neon-city'),hasBridge:!!g.scene.getObjectByName('kairo-loop-flyover'),hasNeonTunnel:!!g.scene.getObjectByName('neon-tunnel-shell')};
      });
      assert.ok(Math.abs(crossing.length-5807)<.1);
      assert.equal(crossing.corners,18);
      assert.ok(crossing.hasCity && crossing.hasBridge && !crossing.hasNeonTunnel);
      assert.ok(crossing.hit.highY-crossing.hit.lowY>7.9);
      assert.ok(Math.abs(crossing.deckHeights[0]-.04)<.1);
      assert.ok(Math.abs(crossing.deckHeights[1]-8.04)<.1);
      assert.ok(crossing.progress[1]-crossing.progress[0]>2000);
      assert.equal(crossing.collisionEvents,0);
      await page.screenshot({ path: `${out}/lower-crossing.png` });
      await page.evaluate(() => {const g=window.__game;g.toggleMap();g.updateMapCamera();g.scene.getObjectByName('neon-city').visible=false;g.post.render();});
      await page.screenshot({ path: `${out}/layout.png` });
    }
    await page.locator('[data-action="pause"]').click();
    await page.locator('[data-car="k89"]').click();
    await page.waitForURL('**car=k89');
    await page.waitForFunction(() => window.__game && document.querySelector('#loading').hidden, null, {timeout:60000});
    assert.equal(new URL(page.url()).searchParams.get('circuit'),'kairo');
    await page.locator('[data-circuit="neon"]').click();
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'neon' && document.querySelector('#loading').hidden, null, {timeout:60000});
    assert.equal(new URL(page.url()).searchParams.get('car'),'k89');
    assert.equal(await page.title(),'GridPunk — Neon District');
    assert.deepEqual(errors,[]);
    results.push({mobile,moving,colors:colors.size,crossing,errors});
    await page.close();
  }
} finally {
  await writeFile(`${out}/city-checks.json`,JSON.stringify(results,null,2));
  await browser.close();
}
console.log(JSON.stringify(results.map(({mobile,colors,crossing,errors})=>({mobile,colors,crossing,errors})),null,2));
