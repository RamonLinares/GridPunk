import * as THREE from 'three';
import type { TrackBuilder } from './track/TrackBuilder';
import type { NeonAtmosphereLight } from '../systems/NeonAtmospherePass';

/** User-authored Grok film, projected as light rather than an opaque screen. */
export function createNeonHologram(parent: THREE.Group, lights: NeonAtmosphereLight[], builder: TrackBuilder) {
  const geisha = createProjectionSet(parent, lights, builder, 'geisha', [null, .48]);
  const koi = createProjectionSet(parent, lights, builder, 'koi', [.27, .75]);
  return {
    audioScene: geisha.audioScene,
    koiAudioScene: {...koi.audioScene,audioUrl:'/circuits/neon-koi-music.mp3',gain:.28,syncVideo:false},
    update(focus?: THREE.Vector3) { geisha.update(focus); koi.update(focus); },
    dispose() { geisha.dispose(); koi.dispose(); },
  };
}

function createProjectionSet(parent: THREE.Group, lights: NeonAtmosphereLight[], builder: TrackBuilder,
  kind: 'geisha' | 'koi', stations: (number | null)[]) {
  const height = kind === 'koi' ? 20 : 27;
  const elevation = kind === 'koi' ? 15.5 : 25.5;
  const clearance = elevation - height / 2;
  const group = new THREE.Group();
  group.name = `neon-${kind}-hologram`;
  // Faces the opening straight. The face is left of centre in the source;
  // shifting the whole image places her above the racing line, text to its right.
  group.position.set(6, 25.5, -355);
  group.userData.intentionalOverpass = true;
  group.userData.clearance = clearance;

  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('playsinline', '');
  video.src = `/circuits/neon-${kind}.mp4`;
  const poster = new THREE.TextureLoader().load(`/circuits/neon-${kind}-poster.webp`);
  poster.colorSpace = THREE.SRGBColorSpace;
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    // Koi footage has a dimmer signal than the geisha; lift only its HDR emission.
    map: poster, color: new THREE.Color(1.8, 1.95, 2.2).multiplyScalar(kind === 'koi' ? 1.85 : 1),
    transparent: true, opacity: .86, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
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
  const ringMaterial = new THREE.MeshBasicMaterial({color: 0x53bdce, transparent: true,
    opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false});
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, .035, 4, 64), ringMaterial);
  ring.position.set(kind === 'geisha' ? -6 : 0, -height / 2 + .1, 0); ring.rotation.x = Math.PI / 2; ring.scale.y = .6;
  group.add(ring);
  const localLights: NeonAtmosphereLight[] = [];
  const groups: THREE.Group[] = [];
  // Each pair shares one material, geometry and decoder. Alternate the two
  // subjects around the lap, rather than filling every straight with faces.
  for (const [i, fraction] of stations.entries()) {
    const copy = i === 0 ? group : group.clone(true);
    copy.name = `neon-${kind}-hologram${i ? `-${i + 1}` : ''}`;
    let lightPosition = new THREE.Vector3(0, 25, -355);
    if (fraction !== null) {
      const sample = builder.spline.sampleAt(Math.round(fraction * builder.spline.count));
      copy.rotation.y = Math.atan2(-sample.tangent.x, -sample.tangent.z);
      const offset = new THREE.Vector3(kind === 'geisha' ? 6 : 0, 0, 0)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), copy.rotation.y);
      copy.position.copy(sample.position).add(offset); copy.position.y += elevation;
      lightPosition = sample.position.clone().add(new THREE.Vector3(0, elevation - .5, 0));
    }
    copy.userData.clearance = clearance;
    parent.add(copy); groups.push(copy);
    localLights.push({position: lightPosition, radiance: new THREE.Vector3(.09, .3, .55).multiplyScalar(kind === 'koi' ? 1.3 : 1)});
  }
  lights.push(...localLights);
  const positions=localLights.map(l=>l.position);

  let disposed = false, nearby = true, pending = false, blocked = false;
  const playback = () => {
    if (disposed) return;
    if (document.hidden || !nearby) { video.pause(); return; }
    if (pending || blocked || !video.paused) return;
    pending = true;
    void video.play().catch(() => { blocked = true; }).finally(() => {
      pending = false;
      if (disposed || document.hidden || !nearby) video.pause();
    });
  };
  const playing = () => { if (!disposed && material.map !== texture) { material.map = texture; material.needsUpdate = true; } };
  const retry = () => { blocked = false; playback(); };
  video.addEventListener('playing', playing);
  document.addEventListener('visibilitychange', playback);
  window.addEventListener('pointerdown', retry);
  window.addEventListener('keydown', retry);
  return {
    audioScene:{positions,video},
    update(focus?: THREE.Vector3) {
      nearby = !focus || groups.some(g=>Math.hypot(focus.x-g.position.x,focus.z-g.position.z)<550);
      playback();
    },
    dispose() {
      disposed = true;
      document.removeEventListener('visibilitychange', playback);
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      video.removeEventListener('playing', playing);
      video.pause(); video.removeAttribute('src'); video.load();
      texture.dispose(); poster.dispose();
      // Scene teardown owns geometries and materials; media owns its decoder.
      for(const local of localLights){const index=lights.indexOf(local);if(index>=0)lights.splice(index,1);}
    },
  };
}
