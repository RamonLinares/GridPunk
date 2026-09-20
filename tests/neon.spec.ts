import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';

test('standalone Neon loads, drives, pauses, restarts and changes cars', async ({ page, isMobile }, info) => {
  const errors: string[] = [], missing: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });
  const out = `artifacts/qa/${info.project.name}`;
  await mkdir(out, { recursive: true });
  // Legacy circuit parameters must never expose another circuit.
  await page.goto(isMobile ? '/?circuit=monaco' : '/');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__ && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page).toHaveTitle('GridPunk — Neon District');
  await expect(page.locator('#home, [data-pick]')).toHaveCount(0);
  await expect(page.locator('#session-primary')).toBeEnabled();
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.circuit)).toBe('neon');
  expect(await page.evaluate(() => '__game' in window)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${out}/garage.png` });

  const activate = async (selector: string) => {
    if (isMobile) await page.locator(selector).tap();
    else await page.locator(selector).click();
  };
  await activate('[data-quality="performance"]');
  await activate('#session-primary');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__!.started);
  const touch = isMobile ? await page.context().newCDPSession(page) : null;
  const hold = async (selector: string, key: string, ms: number) => {
    if (touch) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, id: 1 }] });
      await page.waitForTimeout(ms);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    }
  };
  await hold('[data-gas]', 'w', 2500);
  const moving = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(moving.player.speed).toBeGreaterThan(5);
  expect(moving.rivalSpeeds.some(speed => speed > 5)).toBe(true);
  expect(moving.playerRace).toBeGreaterThan(0);
  expect(moving.audio.state).toBe('running');
  await page.screenshot({ path: `${out}/driving.png` });
  const png = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  const colors = new Set<string>();
  for (let y = 20; y < png.height; y += 13) for (let x = 20; x < png.width; x += 13) {
    const i = (y * png.width + x) * 4;
    colors.add(`${png.data[i]! >> 4},${png.data[i + 1]! >> 4},${png.data[i + 2]! >> 4}`);
  }
  expect(colors.size).toBeGreaterThan(40);
  await hold('[data-brake]', 'Space', 2500);
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.speed)).toBeLessThan(1);
  await activate('[data-action="camera"]');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.camera)).not.toBe(moving.camera);
  await activate('[data-action="mute"]');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.audio.muted)).toBe(true);
  await activate('[data-action="pause"]');
  await expect(page.locator('#session-overlay')).toHaveAttribute('data-state', 'pause');
  await activate('#session-primary');
  await expect(page.locator('#session-overlay')).toBeHidden();
  await activate('[data-action="recover"]');
  await activate('[data-action="pause"]');
  await activate('#session-restart');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.countdown)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.lap)).toBe(1);
  await activate('[data-action="pause"]');
  await activate('[data-car="k89"]');
  await page.waitForURL('**car=k89');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__ && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page.locator('[data-car="k89"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('gridpunk:neon-car'))).toBe('k89');
  await activate('[data-quality="extreme"]');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.quality.preset)).toBe('extreme');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/extreme.png` });
  await activate('[data-quality="cinematic"]');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.quality.preset)).toBe('cinematic');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/cinematic.png` });
  await writeFile(`${out}/results.json`, JSON.stringify({ moving, canvasColors: colors.size, errors, missing }, null, 2));
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});
