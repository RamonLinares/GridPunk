import * as THREE from 'three';

/** Seeded, cut-out leaf sprays. All vegetation is spatially batched; no tree-sized solid crowns. */
export function createSolarVegetation(parent: THREE.Group, random: () => number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  // A branching spray has open sky between individual leaves, including at its silhouette.
  for (let b = 0; b < 13; b++) {
    const a = b * 2.39996, reach = 95 + random() * 140;
    const ex = 256 + Math.cos(a) * reach, ey = 270 + Math.sin(a) * reach;
    c.strokeStyle = '#6f7650'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(256, 300); c.quadraticCurveTo(260, 250, ex, ey); c.stroke();
    for (let k = 0; k < 22; k++) {
      const t = .2 + random() * .8;
      const x = 256 + (ex - 256) * t + (random() - .5) * 68;
      const y = 300 + (ey - 300) * t + (random() - .5) * 55;
      const light = 34 + random() * 33;
      c.save(); c.translate(x, y); c.rotate(a + (random() - .5) * 2.4);
      c.fillStyle = `hsl(${65 + random() * 28},${30 + random() * 25}%,${light}%)`;
      c.beginPath(); c.ellipse(0, 0, 5 + random() * 5, 10 + random() * 9, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(221,233,154,.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0,-9); c.lineTo(0,9); c.stroke(); c.restore();
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const leafMaterial = new THREE.MeshStandardMaterial({ map, color: 0xb1bd75, roughness: .88, side: THREE.DoubleSide, alphaTest: .42 });
  leafMaterial.shadowSide = THREE.DoubleSide;
  const bark = new THREE.MeshStandardMaterial({ color: 0x655547, roughness: .95 });
  const leaves: THREE.Matrix4[] = [], branches: THREE.Matrix4[] = [];
  const d = new THREE.Object3D(), tint = new THREE.Color();
  const branch = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    d.position.copy(a).add(b).multiplyScalar(.5); d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    d.scale.set(radius, a.distanceTo(b), radius); d.updateMatrix(); branches.push(d.matrix.clone());
  };
  const spray = (x: number, y: number, z: number, sx: number, sy: number, angle = random() * Math.PI * 2) => {
    d.position.set(x,y,z); d.rotation.set((random() - .5) * 1.5, angle, (random() - .5) * .7); d.scale.set(sx,sy,1); d.updateMatrix(); leaves.push(d.matrix.clone());
  };
  // Where each plant attaches (trunk foot, vine top, shrub base): kept for layout audits.
  const anchors: number[] = [];
  const tree = (x: number, y: number, z: number, s = 1) => {
    anchors.push(0, x, y, z);
    const root = new THREE.Vector3(x,y,z), fork = new THREE.Vector3(x+.1*s,y+3.6*s,z);
    branch(root,fork,.21*s);
    for(let b=0;b<7;b++) {
      const a=b*2.39996, radius=(1.1+random()*.8)*s;
      const tip=new THREE.Vector3(x+Math.cos(a)*radius,y+(4+random()*1.8)*s,z+Math.sin(a)*radius);
      branch(fork.clone().add(new THREE.Vector3(0,-random()*s,0)),tip,.065*s);
      for(let k=0;k<7;k++) {
        const az=random()*Math.PI*2, r=random()*1.25*s;
        spray(tip.x+Math.cos(az)*r,tip.y+(random()-.4)*1.9*s,tip.z+Math.sin(az)*r,2.3*s,2.25*s);
      }
    }
  };
  const drape = (x: number, y: number, z: number, width: number, height: number, angle: number) => {
    anchors.push(1, x, y, z);
    for(let u=-width/2;u<width/2;u+=.85) {
      const drop=height*(.3+random()*.7);
      for(let v=0;v<drop;v+=.85) {
        spray(x+Math.cos(angle)*u,y-v,z-Math.sin(angle)*u,1.45,1.8,angle);
      }
    }
  };
  const shrub = (x:number,y:number,z:number,s=1) => {
    anchors.push(2, x, y, z);
    for(let k=0;k<5;k++) spray(x+(random()-.5)*s,y+random()*.6*s,z+(random()-.5)*s,1.5*s,1.25*s);
  };
  const finish = () => {
    const submit = (list: THREE.Matrix4[], geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
      const cells = new Map<string,THREE.Matrix4[]>();
      for(const m of list) {
        const key=`${Math.floor(m.elements[12]/128)},${Math.floor(m.elements[14]/128)}`;
        const cell=cells.get(key)??[]; cell.push(m); cells.set(key,cell);
      }
      for(const cell of cells.values()) {
        const mesh=new THREE.InstancedMesh(geometry,material,cell.length); mesh.name=name;
        cell.forEach((m,i)=>{mesh.setMatrixAt(i,m); if(name==='solar-leaf-sprays') mesh.setColorAt(i,tint.setHSL(.19+random()*.035,.12+random()*.15,.64+random()*.27));});
        mesh.computeBoundingSphere(); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);
      }
    };
    submit(leaves,new THREE.PlaneGeometry(1,1),leafMaterial,'solar-leaf-sprays');
    submit(branches,new THREE.CylinderGeometry(.6,1,1,6),bark,'solar-tree-branches');
  };
  parent.userData.vegetationAnchors = anchors;
  return {tree,drape,shrub,finish,dispose:()=>map.dispose()};
}
