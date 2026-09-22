import * as THREE from 'three';

/** Circuit-specific sponsor finish on the existing owner-authored prototype. */
export function applySolarLivery(group: THREE.Group): void {
  if (group.userData.design !== 'neon-shinsei-nd01') return;
  const canvas=document.createElement('canvas'); canvas.width=1024;canvas.height=128;
  const c=canvas.getContext('2d')!;c.fillStyle='#17201d';c.fillRect(0,0,1024,128);
  c.fillStyle='#bddb8e';c.beginPath();c.moveTo(48,104);c.quadraticCurveTo(50,19,157,17);c.quadraticCurveTo(149,93,48,104);c.fill();
  c.strokeStyle='#17201d';c.lineWidth=6;c.beginPath();c.moveTo(47,109);c.lineTo(130,36);c.stroke();
  c.fillStyle='#eff1e7';c.font='600 59px Arial';c.textAlign='center';c.fillText('KAIRO SOLAR',583,69);
  c.font='19px Arial';c.fillStyle='#bbd799';c.fillText('R A C I N G   F O R   A   B R I G H T E R   T O M O R R O W',590,106);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const mat=new THREE.MeshStandardMaterial({map,roughness:.48,metalness:.16,side:THREE.DoubleSide});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.97,.16),mat);
  sign.name='solar-wing-sponsor';sign.position.set(0,1.22,-2.497);sign.rotation.y=Math.PI;group.add(sign);
  const top=new THREE.Mesh(new THREE.PlaneGeometry(1.97,.30),mat);top.name='solar-wing-top';top.position.set(0,1.253,-2.20);top.rotation.x=-Math.PI/2;top.rotation.z=Math.PI;group.add(top);
  // Rear carbon number panels and thin red lamps echo the reference's rear silhouette.
  const numberCanvas=document.createElement('canvas');numberCanvas.width=256;numberCanvas.height=384;
  const nc=numberCanvas.getContext('2d')!;nc.fillStyle='#161c1b';nc.fillRect(0,0,256,384);
  nc.fillStyle='#f1f0e6';nc.font='italic 700 116px Arial';nc.textAlign='center';nc.fillText('07',128,145);
  nc.fillStyle='#bfdc9c';nc.font='bold 28px Arial';nc.fillText('KAIRO',128,265);nc.fillText('SOLAR',128,302);
  const numberMap=new THREE.CanvasTexture(numberCanvas);numberMap.colorSpace=THREE.SRGBColorSpace;numberMap.anisotropy=8;
  const numberMat=new THREE.MeshStandardMaterial({map:numberMap,roughness:.6});
  const red=new THREE.MeshStandardMaterial({color:0xff1915,emissive:0xff0d08,emissiveIntensity:4,roughness:.25});
  for(const side of [-1,1]) {
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(.40,.59),numberMat);panel.name='solar-rear-number';
    panel.position.set(side*.79,.48,-2.505);panel.rotation.y=Math.PI;group.add(panel);
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.55,.016,.024),red);lamp.name='solar-rear-light';
    lamp.position.set(side*.72,.83,-2.52);group.add(lamp);
  }
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const m=o.material as THREE.MeshStandardMaterial;
    if(m.name.startsWith('Shinsei_Wing')) {m.map=null;m.color.setHex(m.name==='Shinsei_WingPaint'?0x561113:0x202724);m.roughness=.3;m.metalness=.5;}
    if(m.name==='Shinsei_BakedBody'){m.roughness=.3;m.metalness=.38;m.envMapIntensity=1.3;}
    if(m.name==='underglow_blue'||m.name==='led_cyan'){m.emissive.setHex(0xbcd69b);m.emissiveIntensity=.3;}
    if(m.name==='led_red'){m.emissive.setHex(0xff1612);m.emissiveIntensity=3;}
    if(m.name==='decal_shinsei_wing'||m.name==='decal_neon_district')o.visible=false;
  });
}
