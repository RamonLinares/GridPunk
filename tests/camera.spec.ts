import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { CameraRig } from '../src/systems/CameraRig';
import type { Car } from '../src/entities/Car';

test('close chase keeps its framing while accelerating and stays distinct from far', ({ viewport }) => {
  const car = {
    group: new THREE.Group(),
    physics: { telemetry: { speed: 0 }, forwardVector: new THREE.Vector3(0, 0, 1), yaw: 0 },
  } as unknown as Car;
  const aspect = viewport ? viewport.width / viewport.height : 16 / 9;
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  const rig = new CameraRig(camera);
  rig.snap(car);
  const restingOffset = camera.position.clone().sub(car.group.position);
  const restingAim = camera.quaternion.clone();
  const restingFov = camera.fov;
  const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(restingFov) / 2) * aspect);
  expect(THREE.MathUtils.radToDeg(horizontalFov)).toBeGreaterThanOrEqual(60 - 1e-8);

  // Vary frame duration and accelerate to racing speed: neither physical
  // follow lag nor a widening lens should make the car recede.
  for (let frame = 0; frame < 300; frame++) {
    const dt = frame % 2 ? 1 / 30 : 1 / 120;
    car.physics.telemetry.speed = frame / 3;
    car.group.position.z += car.physics.telemetry.speed * dt;
    rig.update(dt, car);
    expect(camera.position.clone().sub(car.group.position).distanceTo(restingOffset)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(restingAim)).toBeLessThan(1e-6);
    expect(camera.fov).toBe(restingFov);
  }

  rig.cycleMode();
  rig.snap(car);
  expect(rig.mode).toBe('far');
  expect(camera.position.distanceTo(car.group.position)).toBeGreaterThan(restingOffset.length() * 2);
  expect(camera.fov).not.toBe(restingFov);

  // Cycling back at speed must restore the close lens immediately.
  rig.cycleMode();
  rig.cycleMode();
  rig.cycleMode();
  rig.snap(car);
  expect(rig.mode).toBe('chase');
  expect(camera.fov).toBe(restingFov);
  expect(camera.position.clone().sub(car.group.position).distanceTo(restingOffset)).toBeLessThan(1e-8);
});
