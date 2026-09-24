import * as THREE from 'three';
import type { TrackSample } from './track/TrackSpline';

const WIDTH = 27.6;
const DEPTH = 10.8;
const ROWS = 6;
const ROW_DEPTH = 1.5;
const RISE = .55;
const CLEARANCE = 15;

export interface SolarGrandstand {
  group: THREE.Group;
  footprint: { x: number; z: number; r: number };
  contains(x: number, z: number, margin?: number): boolean;
}

/** Exact segment clearance: scenery's coarser point-sample lookup can overestimate
 * the space available midway between road samples, particularly on tight turns. */
export function grandstandTrackClearance(samples: readonly TrackSample[]): (x:number,z:number)=>number {
  const segments=samples.map((sample,i)=>{
    const a=sample.position,b=samples[(i+1)%samples.length].position;
    const dx=b.x-a.x,dz=b.z-a.z;
    return {x:a.x,z:a.z,dx,dz,lengthSquared:dx*dx+dz*dz};
  });
  return (x,z)=>{
    let squared=Infinity;
    for(const segment of segments) {
      const px=x-segment.x,pz=z-segment.z;
      const t=segment.lengthSquared>0 ? THREE.MathUtils.clamp((px*segment.dx+pz*segment.dz)/segment.lengthSquared,0,1) : 0;
      squared=Math.min(squared,(px-t*segment.dx)**2+(pz-t*segment.dz)**2);
    }
    return Math.sqrt(squared);
  };
}

/** A single local frame owns the decks, seats, spectators, stairs and footprint.
 * Local X runs along the circuit; +Z runs away from it; spectators face -Z.
 */
export function createSolarGrandstand(
  sample: TrackSample,
  side: number,
  distanceToTrack: (x: number, z: number) => number,
  seed = 1,
  /** Hilly layouts: the stand sits on the lowest ground under its footprint. */
  groundAt?: (x: number, z: number, radius: number) => number,
): SolarGrandstand | null {
  const away = sample.right.clone().multiplyScalar(side).setY(0).normalize();
  const along = new THREE.Vector3(away.z, 0, -away.x);
  const origin = sample.position.clone();
  let minClearance = Infinity;
  let placed = false;
  // Curves and nearby return lanes require checking the entire actual footprint.
  // A .5 m grid with an extra metre covers the distance between sample points.
  for (let offset = 16; offset <= 32; offset += 2) {
    origin.copy(sample.position).addScaledVector(away, offset);
    minClearance = Infinity;
    for (let x = -WIDTH / 2; x <= WIDTH / 2 + .01; x += .5) {
      for (let z = 0; z <= DEPTH + .01; z += .5) {
        minClearance = Math.min(minClearance, distanceToTrack(origin.x + along.x * x + away.x * z, origin.z + along.z * x + away.z * z));
      }
    }
    if (minClearance >= CLEARANCE + 1) { placed = true; break; }
  }
  if (!placed) return null;

  const group = new THREE.Group();
  group.name = 'solar-grandstand';
  group.position.copy(origin);
  if (groundAt) group.position.y = groundAt(origin.x + away.x * DEPTH / 2, origin.z + away.z * DEPTH / 2, Math.hypot(WIDTH, DEPTH) / 2);
  group.rotation.y = Math.atan2(away.x, away.z);
  group.userData.roadClearanceVerified = true;
  group.userData.preserveAuthoredElevation = true;
  group.userData.grandstand = { width: WIDTH, depth: DEPTH, rows: ROWS, rise: RISE, minClearance, seats: 0, spectators: 0 };
  const random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const concrete = new THREE.MeshStandardMaterial({color:0xc3c3b5,roughness:.92});
  const tread = new THREE.MeshStandardMaterial({color:0x888f83,roughness:.87});
  const steel = new THREE.MeshStandardMaterial({color:0x647268,roughness:.46,metalness:.65});
  const seatGreen = new THREE.MeshStandardMaterial({color:0x365e46,roughness:.67});
  const seatCream = new THREE.MeshStandardMaterial({color:0xc9cfb4,roughness:.67});
  const roof = new THREE.MeshStandardMaterial({color:0xeae8d8,roughness:.75});
  const solar = new THREE.MeshStandardMaterial({color:0x172f40,roughness:.26,metalness:.48});
  const pants = new THREE.MeshStandardMaterial({color:0x333c43,roughness:.9});
  const hair = new THREE.MeshStandardMaterial({color:0x443c32,roughness:1});
  const shirts = [0xeee7d5,0x385c83,0xbb5542,0xccb657,0x648875,0x666676,0xc58c9f]
    .map(color=>new THREE.MeshStandardMaterial({color,roughness:.9}));
  const skins = [0xe0b48c,0xb78560,0x7e5742].map(color=>new THREE.MeshStandardMaterial({color,roughness:.93}));
  const box = new THREE.BoxGeometry(1,1,1);
  const sphere = new THREE.SphereGeometry(1,8,6);
  const limb = new THREE.CylinderGeometry(.85,1,1,6);
  const dummy = new THREE.Object3D();
  const batches = new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[]}>();
  const part = (name:string,material:THREE.Material,geometry:THREE.BufferGeometry,x:number,y:number,z:number,w:number,h:number,d:number,tilt=0) => {
    dummy.position.set(x,y,z);dummy.rotation.set(tilt,0,0);dummy.scale.set(w,h,d);dummy.updateMatrix();
    const key = `${name}:${material.uuid}`;
    const batch=batches.get(key)??{geometry,material,matrices:[]};batch.matrices.push(dummy.matrix.clone());batches.set(key,batch);
  };
  const slab=(name:string,mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>part(name,mat,box,x,y,z,w,h,d);
  // A low front concourse separates the first seating row from the garden verge.
  slab('concourse',concrete,0,.12,DEPTH/2,WIDTH,.24,DEPTH);
  const seatPositions: {x:number;y:number;z:number}[]=[];
  for(let row=0;row<ROWS;row++) {
    const front=.7+row*ROW_DEPTH, top=.24+(row+1)*RISE;
    for (const bank of [-1,1]) {
      slab('terrace-risers',concrete,bank*7.15,top/2,front+ROW_DEPTH/2,12.7,top,ROW_DEPTH);
      slab('terrace-treads',tread,bank*7.15,top+.025,front+ROW_DEPTH/2,12.65,.05,ROW_DEPTH-.05);
    }
    // Two seating banks leave a full-width central access aisle.
    for(const bank of [-1,1]) for(let column=0;column<13;column++) {
      const x=bank*(1.55+column*.86), z=front+.93;
      const seatMat=(column+row)%5===0?seatCream:seatGreen;
      slab('seat-pan',seatMat,x,top+.46,z,.53,.10,.48);
      slab('seat-back',seatMat,x,top+.74,z+.23,.53,.53,.075);
      slab('seat-mount',steel,x,top+.22,z+.12,.07,.44,.07);
      seatPositions.push({x,y:top,z});
      if(random()<.20)continue;
      const shirt=shirts[Math.floor(random()*shirts.length)],skin=skins[Math.floor(random()*skins.length)];
      // Seated anatomy: feet rest on this row, thighs meet the seat, torso above it.
      const lean=(random()-.5)*.10;
      part('spectator-torso',shirt,limb,x,top+.84,z,.20,.57,.15,lean);
      part('spectator-head',skin,sphere,x,top+1.27,z-.025,.12,.155,.12);
      part('spectator-hair',hair,sphere,x,top+1.34,z+.005,.123,.09,.123);
      for(const arm of [-1,1]) {
        part('spectator-arm',shirt,limb,x+arm*.24,top+.85,z-.05,.065,.32,.065,-.20);
        part('spectator-forearm',skin,limb,x+arm*.23,top+.67,z-.18,.048,.29,.048,-1.0);
        part('spectator-thigh',pants,limb,x+arm*.105,top+.49,z-.16,.085,.43,.085,Math.PI/2);
        part('spectator-shin',pants,limb,x+arm*.105,top+.25,z-.36,.065,.42,.065);
        slab('spectator-shoes',pants,x+arm*.105,top+.065,z-.43,.15,.10,.26);
      }
      group.userData.grandstand.spectators++;
    }
    // Three ordinary stair treads for each seating rise, instead of giant stairs.
    for(let step=0;step<3;step++) {
      const height=.24+row*RISE+(step+1)*RISE/3;
      slab('aisle-steps',concrete,0,height/2,front+(step+.5)*ROW_DEPTH/3,1.6,height,ROW_DEPTH/3);
      slab('aisle-nosings',roof,0,height+.015,front+step*ROW_DEPTH/3+.04,1.55,.03,.08);
    }
    for(const edge of [-1,1]) {
      const x=edge*(WIDTH/2-.22);
      slab('side-curbs',concrete,x,top+.14,front+ROW_DEPTH/2,.22,.28,ROW_DEPTH);
      slab('side-posts',steel,x,top+.64,front+.18,.045,1.05,.045);
      slab('side-handrail',steel,x,top+1.15,front+ROW_DEPTH/2,.05,.05,ROW_DEPTH);
      slab('aisle-posts',steel,edge*.84,top+.55,front+.22,.035,1.05,.035);
      part('aisle-handrail',steel,box,edge*.84,top+.84,front+ROW_DEPTH/2,.04,.04,Math.hypot(ROW_DEPTH,RISE),-Math.atan2(RISE,ROW_DEPTH));
    }
  }
  group.userData.grandstand.seats=seatPositions.length;
  group.userData.seatPositions=seatPositions;
  const backHeight=.24+ROWS*RISE;
  slab('rear-parapet',concrete,0,backHeight+.40,10.25,WIDTH,.8,.25);
  slab('rear-rail',steel,0,backHeight+1.06,10.25,WIDTH,.055,.055);
  // Slim cantilevered solar canopy with posts at the outside of the seat banks.
  for(const x of [-13.45,13.45])for(const z of [1.0,9.9]){
    slab('canopy-posts',steel,x,3.2,z,.14,6.4,.14);
  }
  slab('canopy-soffit',roof,0,6.4,5.4,WIDTH,.20,DEPTH);
  for(const x of [-13.35,0,13.35])slab('canopy-beams',steel,x,6.22,5.4,.10,.18,DEPTH-.25);
  for(let x=-12;x<=12;x+=3)for(let z=1.6;z<10;z+=2.8){
    slab('solar-panel-frames',steel,x,6.54,z,2.75,.08,2.5);
    slab('solar-panel-cells',solar,x,6.60,z,2.63,.04,2.38);
  }
  for(const [key,batch] of batches){
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);
    mesh.name=`solar-grandstand-${key.split(':')[0]}`;
    mesh.userData.preserveAuthoredElevation=true;
    batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  group.updateMatrixWorld(true);
  const center=origin.clone().addScaledVector(away,DEPTH/2);
  return {
    group,footprint:{x:center.x,z:center.z,r:Math.hypot(WIDTH,DEPTH)/2+1},
    contains(x,z,margin=0){
      const dx=x-origin.x,dz=z-origin.z;
      return Math.abs(dx*along.x+dz*along.z)<WIDTH/2+margin && dx*away.x+dz*away.z>-margin && dx*away.x+dz*away.z<DEPTH+margin;
    },
  };
}
