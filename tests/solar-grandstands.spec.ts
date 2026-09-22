import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createSolarGrandstand, grandstandTrackClearance } from '../src/game/SolarGrandstand';
import { TrackSpline } from '../src/game/track/TrackSpline';
import { CIRCUITS } from '../src/game/track/circuits';

for (const heading of [0,.71,Math.PI/2,2.8]) for (const side of [-1,1]) {
  test(`solar grandstand aligns its real footprint: heading ${heading}, side ${side}`,()=>{
    const tangent=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
    const right=tangent.clone().cross(new THREE.Vector3(0,1,0));
    const sample={index:0,position:new THREE.Vector3(120,0,-73),tangent,right,normal:new THREE.Vector3(0,1,0),curvature:0,distance:0};
    const distance=(x:number,z:number)=>Math.abs(new THREE.Vector3(x-120,0,z+73).dot(right));
    const stand=createSolarGrandstand(sample,side,distance,31)!;
    expect(stand).not.toBeNull();
    const matrix=new THREE.Matrix4(),vertex=new THREE.Vector3();
    let minimumVertexClearance = Infinity;
    // Test every actual transformed vertex, rather than a separately calculated rectangle.
    stand.group.traverse(object=>{
      const mesh=object as THREE.InstancedMesh;if(!mesh.isInstancedMesh)return;
      const p=mesh.geometry.attributes.position;
      for(let instance=0;instance<mesh.count;instance++){
        mesh.getMatrixAt(instance,matrix);matrix.premultiply(mesh.matrixWorld);
        for(let i=0;i<p.count;i++) {
          vertex.fromBufferAttribute(p,i).applyMatrix4(matrix);
          minimumVertexClearance=Math.min(minimumVertexClearance,distance(vertex.x,vertex.z));
        }
      }
    });
    expect(minimumVertexClearance).toBeGreaterThanOrEqual(15.99);
    // Seats sit on the correct row and face the track on either side of the road.
    const normal=new THREE.Vector3(0,0,-1).transformDirection(stand.group.matrixWorld);
    expect(normal.dot(right.clone().multiplyScalar(-side))).toBeCloseTo(1);
    expect(stand.group.userData.grandstand.seats).toBe(156);
    const decks=stand.group.getObjectByName('solar-grandstand-terrace-risers') as THREE.InstancedMesh;
    for(let i=0;i<decks.count;i++){
      decks.getMatrixAt(i,matrix);
      // The central stairs cannot be buried inside a full-width seating slab.
      expect(Math.abs(matrix.elements[12])-matrix.elements[0]/2).toBeCloseTo(.8);
    }
    expect(stand.contains(stand.footprint.x,stand.footprint.z,3)).toBe(true);
  });
}

test('solar grandstands clear every actual circuit return lane',()=>{
  const spline=new TrackSpline(CIRCUITS.solar);
  const distance=(x:number,z:number)=>{
    let best=Infinity;
    for(let i=0;i<spline.count;i++){
      const a=spline.sampleAt(i).position,b=spline.sampleAt(i+1).position;
      const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
      best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
    }
    return best;
  };
  const clearance = grandstandTrackClearance(spline.samples);
  let count=0;
  for(const [i,corner] of CIRCUITS.solar.cornerMarkers!.entries()){
    if(i%4!==1)continue;
    const sample=spline.sampleAt(Math.round(corner.progress*spline.count));
    const stand=createSolarGrandstand(sample,sample.curvature>0?-1:1,clearance,4112+i);
    if(!stand)continue;
    count++;
    expect(stand.group.userData.grandstand.minClearance).toBeGreaterThanOrEqual(16);
    const vertices=(stand.group.getObjectByName('solar-grandstand-terrace-risers') as THREE.InstancedMesh);
    const matrix=new THREE.Matrix4(),v=new THREE.Vector3();
    for(let k=0;k<vertices.count;k++){
      vertices.getMatrixAt(k,matrix);matrix.premultiply(vertices.matrixWorld);
      for(const x of [-.5,.5])for(const z of [-.5,.5]){
        v.set(x,0,z).applyMatrix4(matrix);expect(distance(v.x,v.z)).toBeGreaterThan(15);
      }
    }
  }
  expect(count).toBeGreaterThanOrEqual(3);
});

test('solar grandstand skips a site that cannot provide track clearance',()=>{
  const spline=new TrackSpline(CIRCUITS.solar);
  expect(createSolarGrandstand(spline.sampleAt(0),1,()=>10)).toBeNull();
});
