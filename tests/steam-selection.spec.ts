import { test, expect } from '@playwright/test';

test('Steam can be selected from Solar without losing the car or sharing lap records', async ({ page, isMobile }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('gridpunk:solar-sprint-best-v1:easy', '88.888');
    localStorage.setItem('gridpunk:steam-sprint-best-v1:easy', '123.456');
  });
  await page.goto('/?circuit=solar&car=k89&hq&at=.182');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__ && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page.locator('[data-circuit]')).toHaveCount(8);
  await expect(page.locator('[data-stage]')).toHaveCount(3);
  const choose = page.locator('[data-stage="steampunk"]');
  if (isMobile) await choose.tap(); else await choose.click();
  await page.waitForURL('**circuit=steam**');
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.circuit === 'steam' && document.querySelector<HTMLElement>('#loading')?.hidden);
  await expect(page).toHaveTitle('GridPunk — Kairo Steam');
  await expect(page.locator('[data-circuit="steam"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-car="k89"]')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).searchParams.get('at')).toBe('.182');
  expect(await page.locator('[data-circuit]').evaluateAll(buttons => buttons.every(b => b.scrollWidth <= b.clientWidth))).toBe(true);
  await page.screenshot({ path: `artifacts/kairo-steam/${info.project.name}-selection.png` });
  if (isMobile) await page.locator('#session-primary').tap(); else await page.locator('#session-primary').click();
  await expect(page.locator('#hud-best')).toHaveText('2:03.456');
  expect(await page.evaluate(() => localStorage.getItem('gridpunk:solar-sprint-best-v1:easy'))).toBe('88.888');
});
