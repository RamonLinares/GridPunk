import * as THREE from 'three';
import type { MaterialLibrary } from './Materials';
import type { TrackBuilder } from './track/TrackBuilder';

/** Continuous flyover structure beneath the road and its elevated pavements. */
export function createKairoCityBridge(builder: TrackBuilder, materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'kairo-loop-flyover';
  group.userData.intentionalOverpass = true;
  const vertices: number[] = [], indices: number[] = [];
  const first = Math.floor(.807 * builder.spline.count), last = Math.ceil(.891 * builder.spline.count);
  for (let i = first; i <= last; i++) {
    const sample = builder.spline.sampleAt(i);
    for (const depth of [.12, 1.1]) for (const side of [-1, 1]) {
      const p = sample.position.clone().addScaledVector(sample.right, side * 18);
      vertices.push(p.x, p.y - depth, p.z);
    }
    if (i === first) continue;
    const a = (i - first - 1) * 4, b = a + 4;
    indices.push(a, a + 1, b, a + 1, b + 1, b,
      a + 2, b + 2, a + 3, a + 3, b + 2, b + 3,
      a, b, a + 2, a + 2, b, b + 2,
      a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const deck = new THREE.Mesh(geometry, materials.concrete);
  deck.name = 'kairo-flyover-deck'; deck.castShadow = true; deck.receiveShadow = true;
  group.add(deck);

  // Split piers stay outside the upper racing walls AND every lower-road lane.
  const pierGeometry = new THREE.BoxGeometry(2, 1, 3);
  for (let i = first + 5; i < last; i += 10) {
    const sample = builder.spline.sampleAt(i);
    const height = sample.position.y - 1.1;
    if (height < 1) continue;
    for (const side of [-1, 1]) {
      const foot = sample.position.clone().addScaledVector(sample.right, side * 16);
      if (builder.distanceToTrack(foot.x, foot.z) < 14) continue;
      const pier = new THREE.Mesh(pierGeometry, materials.darkMetal);
      pier.name = 'kairo-flyover-pier';
      pier.position.set(foot.x, height / 2, foot.z);
      pier.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      pier.scale.y = height; pier.castShadow = true; pier.receiveShadow = true;
      group.add(pier);
    }
  }
  return group;
}
