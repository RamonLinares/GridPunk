import { test, expect } from '@playwright/test';
import { CIRCUITS, isDryCircuit, isKairoLayout, selectedCircuit } from '../src/game/track/circuits';
import { TrackSpline } from '../src/game/track/TrackSpline';

test('Steam preserves the entire Kairo layout with a separate circuit identity', () => {
  const steam = CIRCUITS.steam, solar = CIRCUITS.solar;
  expect(selectedCircuit('?circuit=steam')).toBe(steam);
  expect(selectedCircuit('?circuit=unknown')).toBe(CIRCUITS.neon);
  expect(isKairoLayout(steam.id)).toBe(true);
  expect(isDryCircuit(steam.id)).toBe(true);
  expect(steam.points).toBe(solar.points);
  expect(steam.cornerMarkers).toBe(solar.cornerMarkers);
  expect(steam.surfaceLiftAt).toBe(solar.surfaceLiftAt);
  expect(steam.sectorFractions).toEqual(solar.sectorFractions);
  const a = new TrackSpline(steam), b = new TrackSpline(solar);
  expect(a.length).toBe(b.length); expect(a.count).toBe(b.count);
  a.samples.forEach((sample, i) => expect(sample.position.toArray()).toEqual(b.samples[i].position.toArray()));
  expect(steam.id).not.toBe(solar.id);
});
