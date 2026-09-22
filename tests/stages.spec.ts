import { test, expect } from '@playwright/test';
import { CIRCUITS, STAGES, circuitFor, circuitsForStage, isDryCircuit, isKairoLayout, selectedCircuit } from '../src/game/track/circuits';
import { TrackSpline } from '../src/game/track/TrackSpline';

test('each stage has both exact layouts, including District banking and independent identities', () => {
  const identities = new Set();
  for (const stage of Object.values(STAGES)) {
    expect(circuitsForStage(stage.id).map(c => c.layout)).toEqual(['neon', 'kairo']);
    for (const layout of ['neon', 'kairo'] as const) {
      const circuit = circuitFor(stage.id, layout), original = CIRCUITS[layout];
      identities.add(circuit.id);
      expect(selectedCircuit(`?stage=${stage.id}&circuit=${layout}`)).toBe(circuit);
      expect(selectedCircuit(`?circuit=${circuit.id}`)).toBe(circuit);
      expect(isDryCircuit(circuit.id)).toBe(stage.id !== 'cyberpunk');
      expect(isKairoLayout(circuit.id)).toBe(layout === 'kairo');
      expect(circuit.points).toBe(original.points);
      expect(circuit.bankingAt).toBe(original.bankingAt);
      expect(circuit.surfaceLiftAt).toBe(original.surfaceLiftAt);
      expect(circuit.sectorFractions).toEqual(original.sectorFractions);
      const a = new TrackSpline(circuit), b = new TrackSpline(original);
      expect(a.length).toBe(b.length);
      expect(a.samples.map(s => [s.position.toArray(), s.normal.toArray(), s.right.toArray()]))
        .toEqual(b.samples.map(s => [s.position.toArray(), s.normal.toArray(), s.right.toArray()]));
    }
  }
  expect(identities.size).toBe(6);
  expect(selectedCircuit('?stage=unknown&circuit=solar')).toBe(CIRCUITS.solar);
  expect(selectedCircuit('?circuit=unknown')).toBe(CIRCUITS.neon);
});

test('stage navigation retains layout, car and distinct lap records; each stage lists only its two circuits', async ({ page, isMobile }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('gridpunk:neon-solar-sprint-best-v1:easy', '91.234');
    localStorage.setItem('gridpunk:neon-steam-sprint-best-v1:easy', '103.456');
  });
  await page.goto('/?circuit=neon-solar&car=k89&at=.12');
  const ready = async (id: string) => page.waitForFunction(id => window.__THREE_GAME_DIAGNOSTICS__?.circuit === id && document.querySelector<HTMLElement>('#loading')?.hidden, id);
  const activate = async (selector: string) => { if (isMobile) await page.locator(selector).tap(); else await page.locator(selector).click(); };
  await ready('neon-solar');
  await expect(page.locator('[data-circuit]')).toHaveCount(2);
  await expect(page.locator('[data-stage]')).toHaveCount(3);
  await expect(page.locator('[data-circuit="neon-solar"]')).toContainText('NEON DISTRICT');
  await expect(page.locator('[data-circuit="solar"]')).toContainText('KAIRO LOOP');
  await activate('[data-stage="steampunk"]'); await ready('neon-steam');
  await expect(page.locator('[data-stage="steampunk"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-circuit="neon-steam"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-car="k89"]')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).searchParams.get('at')).toBe('.12');
  expect(await page.locator('[data-stage], [data-circuit]').evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/stages/${info.project.name}-stage-picker.png` });
  await activate('#session-primary'); await expect(page.locator('#hud-best')).toHaveText('1:43.456');
  await activate('[data-action="pause"]');
  await activate('[data-circuit="steam"]'); await ready('steam');
  await expect(page.locator('[data-circuit="steam"]')).toHaveAttribute('aria-pressed', 'true');
  await activate('[data-stage="cyberpunk"]'); await ready('kairo');
  await expect(page.locator('[data-circuit="kairo"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('gridpunk:neon-solar-sprint-best-v1:easy'))).toBe('91.234');
  expect(await page.evaluate(() => localStorage.getItem('gridpunk:neon-steam-sprint-best-v1:easy'))).toBe('103.456');
});
