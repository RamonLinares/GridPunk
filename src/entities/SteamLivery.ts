import * as THREE from 'three';

/** Foundry sponsor plates on the existing Shinsei; geometry and handling stay shared. */
export function applySteamLivery(group: THREE.Group, title = 'Kairo Steam'): void {
  if (group.userData.design !== 'neon-shinsei-nd01') return;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#252a26'; c.fillRect(0, 0, 1024, 128); c.strokeStyle = '#bd965b'; c.lineWidth = 6; c.strokeRect(8, 8, 1008, 112);
  c.fillStyle = '#ebd2a1'; c.font = 'bold 64px Georgia'; c.textAlign = 'center'; c.fillText(title.toUpperCase(), 512, 71);
  c.fillStyle = '#c5a46b'; c.font = '19px Arial'; c.fillText('F O R G E D   I N   F I R E .   D R I V E N   B Y   S T E A M .', 512, 108);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map, roughness: .48, metalness: .25, side: THREE.DoubleSide });
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(1.97, .16), material);
  rear.name = 'steam-wing-sponsor'; rear.position.set(0, 1.22, -2.497); rear.rotation.y = Math.PI; group.add(rear);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(1.97, .30), material);
  top.name = 'steam-wing-top'; top.position.set(0, 1.253, -2.20); top.rotation.set(-Math.PI / 2, 0, Math.PI); group.add(top);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const mat = object.material as THREE.MeshStandardMaterial;
    if (mat.name?.startsWith('Shinsei_Wing')) { mat.map = null; mat.color.setHex(0x4d3927); mat.metalness = .55; mat.roughness = .4; }
    if (mat.name === 'Shinsei_BakedBody') { mat.color.setHex(0xe1b07a); mat.roughness = .4; mat.metalness = .45; }
    if (mat.name === 'led_cyan' || mat.name === 'underglow_blue') { mat.emissive.setHex(0xd8a05a); mat.emissiveIntensity = .3; }
    if (mat.name === 'decal_shinsei_wing' || mat.name === 'decal_neon_district') object.visible = false;
  });
}
