import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createSolarBay } from '../src/game/SolarSurfaces';
import { TrackSpline } from '../src/game/track/TrackSpline';
import { CIRCUITS } from '../src/game/track/circuits';

test('solar bay cannot cover either verge anywhere around the circuit', () => {
  const spline = new TrackSpline(CIRCUITS.solar);
  const water = createSolarBay(spline.samples.map(sample => sample.position));
  water.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const flooded: string[] = [];
  // Include the reported far bend, both road edges, verges and the land behind the walls.
  for (const sample of spline.samples) for (const offset of [-40, -12, -10, -8, 0, 8, 10, 12, 40]) {
    origin.copy(sample.position).addScaledVector(sample.right, offset);
    origin.y = 100;
    ray.set(origin, down);
    if (ray.intersectObject(water).length) flooded.push(`${sample.index}:${offset}`);
  }
  expect(flooded).toEqual([]);
  // The bay remains a visible, upward-facing surface beyond the city.
  const radius = (water.geometry as THREE.RingGeometry).parameters.innerRadius + 30;
  origin.set(water.position.x + Math.cos(Math.PI * .65123) * radius, 100,
    water.position.z - Math.sin(Math.PI * .65123) * radius);
  ray.set(origin, down);
  expect(ray.intersectObject(water)).toHaveLength(1);
  water.geometry.dispose();
  (water.material as THREE.Material).dispose();
});
