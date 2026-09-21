import * as THREE from 'three';

/** One muted decoder per campaign, with a poster until autoplay succeeds. */
export function createWorldVideo(src: string, posterUrl: string,
  material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial, emissive = false) {
  const video = document.createElement('video');
  video.muted = video.defaultMuted = video.loop = video.playsInline = true;
  video.preload = 'none'; video.setAttribute('playsinline', ''); video.src = src;
  const poster = new THREE.TextureLoader().load(posterUrl);
  poster.colorSpace = THREE.SRGBColorSpace;
  const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
  const setMap = (map: THREE.Texture) => {
    material.map = map;
    if (emissive && material instanceof THREE.MeshStandardMaterial) material.emissiveMap = map;
    material.needsUpdate = true;
  };
  setMap(poster);
  let disposed = false, nearby = false, pending = false, blocked = false;
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
  const playing = () => { if (!disposed && material.map !== texture) setMap(texture); };
  const retry = () => { blocked = false; playback(); };
  video.addEventListener('playing', playing);
  document.addEventListener('visibilitychange', playback);
  window.addEventListener('pointerdown', retry); window.addEventListener('keydown', retry);
  return {
    video,
    update(isNearby: boolean) { nearby = isNearby; playback(); },
    dispose() {
      disposed = true;
      document.removeEventListener('visibilitychange', playback);
      window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry);
      video.removeEventListener('playing', playing);
      video.pause(); video.removeAttribute('src'); video.load();
      texture.dispose(); poster.dispose();
    },
  };
}
