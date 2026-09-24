import { test, expect } from '@playwright/test';

test('race selection stays lightweight until launch, then loads the chosen world', async ({ page }, info) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

  await page.goto('/');
  await expect(page.locator('#stage-select')).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeHidden();
  await expect(page.locator('[data-select-stage]')).toHaveCount(3);
  await expect(page.locator('[data-select-layout]')).toHaveCount(2);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__)).toBeUndefined();
  expect(requests.filter(path => path.startsWith('/assets/main-') || path.startsWith('/assets/src-') || path.startsWith('/circuits/'))).toEqual([]);

  await page.locator('[data-select-stage="solarpunk"]').click();
  await expect(page.locator('#selection-name')).toHaveText('Solarpunk · Neon District');
  await page.locator('[data-select-layout="kairo"]').click();
  await expect(page.locator('#selection-name')).toHaveText('Solarpunk · Kairo Loop');
  await page.locator('[data-select-stage="steampunk"]').click();
  await expect(page.locator('#selection-name')).toHaveText('Steampunk · Kairo Loop');
  await expect(page.locator('[data-select-stage="steampunk"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-select-layout="kairo"]')).toHaveAttribute('aria-pressed', 'true');
  expect(requests.filter(path => path.startsWith('/assets/main-') || path.startsWith('/circuits/'))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.selection-scene-image:last-child')?.src.endsWith('/steampunk.webp'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `artifacts/qa/${info.project.name}-race-selection.png` });

  await page.locator('#selection-launch').click();
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#stage-select')).toBeHidden();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'steam' && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page).toHaveTitle('GridPunk — Kairo Steam');
  await expect(page.locator('[data-circuit="steam"]')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).searchParams.get('stage')).toBe('steampunk');
  expect(requests.some(path => path.startsWith('/assets/main-'))).toBe(true);
  expect(errors).toEqual([]);
});

test('a circuit link launches directly with its matching stage', async ({ page }) => {
  await page.goto('/?circuit=neon-solar');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'neon-solar' && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page.locator('#stage-select')).toBeHidden();
  await expect(page.locator('[data-stage="solarpunk"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the chooser fits a narrow phone and keeps the launch action reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('#stage-select')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector<HTMLElement>('#stage-select')!.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-select-stage="solarpunk"]').click();
  await page.locator('[data-select-layout="kairo"]').click();
  await page.locator('#selection-launch').scrollIntoViewIfNeeded();
  await expect(page.locator('#selection-launch')).toBeInViewport();
  await expect(page.locator('#selection-name')).toHaveText('Solarpunk · Kairo Loop');
  await page.locator('#selection-launch').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'solar' && document.querySelector<HTMLElement>('#loading')?.hidden);
  expect(await page.locator('.session-specs').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.locator('.session-specs > div').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
});

test('a failed game download can recover with the selected race intact', async ({ page }) => {
  await page.route('**/assets/main-*.js', route => route.abort());
  await page.goto('/');
  await page.locator('[data-select-stage="steampunk"]').click();
  await page.locator('[data-select-layout="kairo"]').click();
  await page.locator('#selection-launch').click();
  await expect(page.locator('#selection-error')).toContainText('Reload to try again');
  await expect(page.locator('#selection-launch')).toContainText('RELOAD RACE');
  await page.unroute('**/assets/main-*.js');
  await page.locator('#selection-launch').click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'steam' && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page).toHaveTitle('GridPunk — Kairo Steam');
});

test('keyboard shortcuts browse worlds and circuits, and Enter starts the race', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#stage-select')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('#selection-name')).toHaveText('Solarpunk · Neon District');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#selection-name')).toHaveText('Steampunk · Neon District');
  await page.keyboard.press('q');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#selection-name')).toHaveText('Solarpunk · Kairo Loop');
  await expect(page.locator('[data-select-stage="solarpunk"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'solar' && document.querySelector<HTMLElement>('#loading')?.hidden);
});
