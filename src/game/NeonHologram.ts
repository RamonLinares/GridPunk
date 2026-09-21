import * as THREE from 'three';
import { createWorldVideo } from './WorldVideo';
import type { TrackBuilder } from './track/TrackBuilder';
import type { NeonAtmosphereLight } from '../systems/NeonAtmospherePass';

interface Projection {
  kind: 'geisha' | 'koi' | 'ramen' | 'bonsai';
  height: number; elevation: number; offset: number; brightness: number;
  radiance: [number, number, number]; stations: (number | null)[];
}

/** Each circuit has two campaigns, with one decoder shared by each pair. */
export function createNeonHologram(parent: THREE.Group, lights: NeonAtmosphereLight[], builder: TrackBuilder) {
  const kairo = builder.spline.circuitId === 'kairo';
  const primary = createProjectionSet(parent, lights, builder, kairo
    ? {kind:'ramen', height:24, elevation:21, offset:0, brightness:1.4, radiance:[.09,.3,.55], stations:[.04,.48]}
    : {kind:'geisha', height:27, elevation:25.5, offset:6, brightness:1, radiance:[.09,.3,.55], stations:[null,.48]});
  const secondary = createProjectionSet(parent, lights, builder, kairo
    ? {kind:'bonsai', height:20, elevation:15.5, offset:0, brightness:2.3, radiance:[.08,.48,.16], stations:[.27,.75]}
    : {kind:'koi', height:20, elevation:15.5, offset:0, brightness:1.85, radiance:[.117,.39,.715], stations:[.27,.75]});
  return {
    audioScene: {...primary.audioScene, audioUrl:kairo?'/circuits/kairo-ramen-audio.mp3':'/circuits/neon-geisha-voice.mp3'},
    koiAudioScene: {...secondary.audioScene, audioUrl:kairo?'/circuits/kairo-bonsai-music.mp3':'/circuits/neon-koi-music.mp3',gain:kairo?1.15:.28,syncVideo:false,...(kairo?{range:280,referenceDistance:100,departureDistance:110}:{})},
    update(focus?: THREE.Vector3) { primary.update(focus); secondary.update(focus); },
    dispose() { primary.dispose(); secondary.dispose(); },
  };
}

function createProjectionSet(parent: THREE.Group, lights: NeonAtmosphereLight[], builder: TrackBuilder,
  {kind, height, elevation, offset: horizontalOffset, brightness, radiance, stations}: Projection) {
  const prefix = kind === 'ramen' || kind === 'bonsai' ? 'kairo' : 'neon';
  const clearance = elevation - height / 2;
  const group = new THREE.Group();
  group.name = `${prefix}-${kind}-hologram`;
  // Faces the opening straight. The face is left of centre in the source;
  // shifting the whole image places her above the racing line, text to its right.
  group.position.set(6, 25.5, -355);
  group.userData.intentionalOverpass = true;
  group.userData.clearance = clearance;

  const material = new THREE.MeshBasicMaterial({
    // Preserve the source's green bonsai and blue ramen palette.
    color: (prefix === 'kairo' ? new THREE.Color(1,1,1) : new THREE.Color(1.8,1.95,2.2)).multiplyScalar(brightness),
    transparent: true, opacity: .86, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const media = createWorldVideo(`/circuits/${prefix}-${kind}.mp4`, `/circuits/${prefix}-${kind}-poster.webp`, material);
  // Additive blending removes black without a chroma-key fringe. Feathering
  // conceals the file edges; the source already contains animated scan lines.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float edge = smoothstep(0., .035, vMapUv.x) * smoothstep(0., .035, 1.-vMapUv.x)
        * smoothstep(0., .035, vMapUv.y) * smoothstep(0., .035, 1.-vMapUv.y);
      float signal = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      diffuseColor.rgb *= edge * smoothstep(.004, .045, signal);
    `);
  };
  material.customProgramCacheKey = () => 'geisha-hologram-v1';
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(height * 688 / 464, height), material);
  screen.name = `${kind}-video-projection`;
  group.add(screen);
  // A suspended emitter ring gives the projection a visible floating base.
  const ringMaterial = new THREE.MeshBasicMaterial({color: kind === 'bonsai' ? 0x73d596 : 0x53bdce, transparent: true,
    opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false});
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, .035, 4, 64), ringMaterial);
  ring.position.set(-horizontalOffset, -height / 2 + .1, 0); ring.rotation.x = Math.PI / 2; ring.scale.y = .6;
  group.add(ring);
  const localLights: NeonAtmosphereLight[] = [];
  const groups: THREE.Group[] = [];
  // Each pair shares one material, geometry and decoder. Alternate the two
  // subjects around the lap, rather than filling every straight with faces.
  for (const [i, fraction] of stations.entries()) {
    const copy = i === 0 ? group : group.clone(true);
    copy.name = `${prefix}-${kind}-hologram${i ? `-${i + 1}` : ''}`;
    let lightPosition = new THREE.Vector3(0, 25, -355);
    if (fraction !== null) {
      const sample = builder.spline.sampleAt(Math.round(fraction * builder.spline.count));
      copy.rotation.y = Math.atan2(-sample.tangent.x, -sample.tangent.z);
      const offset = new THREE.Vector3(horizontalOffset, 0, 0)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), copy.rotation.y);
      copy.position.copy(sample.position).add(offset); copy.position.y += elevation;
      lightPosition = sample.position.clone().add(new THREE.Vector3(0, elevation - .5, 0));
    }
    copy.userData.clearance = clearance;
    parent.add(copy); groups.push(copy);
    localLights.push({position: lightPosition, radiance: new THREE.Vector3(...radiance)});
  }
  lights.push(...localLights);
  const positions=localLights.map(l=>l.position);

  return {
    audioScene:{positions,video:media.video},
    update(focus?: THREE.Vector3) {
      media.update(!focus || groups.some(g=>Math.hypot(focus.x-g.position.x,focus.z-g.position.z)<550));
    },
    dispose() {
      media.dispose();
      // Scene teardown owns geometries and materials; media owns its decoder.
      for(const local of localLights){const index=lights.indexOf(local);if(index>=0)lights.splice(index,1);}
    },
  };
}
