import type * as THREE from 'three';

export interface CarModel {
  group: THREE.Group;
  wheels: {
    fl: THREE.Group;
    fr: THREE.Group;
    rl: THREE.Group;
    rr: THREE.Group;
  };
  drsFlap: THREE.Object3D;
  brakeLights: THREE.Mesh[];
  body: THREE.Object3D;
  steeringWheel: THREE.Group;
  updateDisplay: (speed: number, gear: number, rpm: number) => void;
}
