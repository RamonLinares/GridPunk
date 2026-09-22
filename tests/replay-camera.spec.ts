import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {ReplayVisibility,collectReplayObstructions} from '../src/systems/ReplayVisibility';
import {ReplayDirector} from '../src/systems/ReplayDirector';
import {capturePoses,type RecordedLap} from '../src/systems/LapReplay';
import type {Car} from '../src/entities/Car';
import type {TrackBuilder} from '../src/game/track/TrackBuilder';

const origin=new THREE.Vector3(),rotation=new THREE.Quaternion();
function wall(x:number,y:number,z:number,w:number,h:number,d:number,name='solar-concrete-1-front'){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.position.set(x,y,z);mesh.name=name;mesh.updateMatrixWorld(true);return mesh;
}
function resolver(obstacles:THREE.Object3D[]){return new ReplayVisibility(obstacles,()=>0);}

test('collects walls in every stage, advertising, bridges and unnamed tunnel portals',()=>{
  const scene=new THREE.Scene();
  for(const name of ['kairo-concrete-1-front','solar-concrete--1-rear','neon-steam-wall-cap-1','barrier-advertising-0','kairo-flyover-deck','kairo-flyover-pier'])
    scene.add(wall(0,0,0,1,1,1,name));
  const tunnel=new THREE.Group();tunnel.name='neon-transit-tunnel';tunnel.add(wall(0,0,0,1,1,1,''));scene.add(tunnel);
  const hidden=wall(0,0,0,1,1,1);hidden.visible=false;scene.add(hidden);
  scene.add(wall(0,0,0,1,1,1,'decorative-city'));
  expect(collectReplayObstructions(scene)).toHaveLength(7);
});

test('keeps clear shots and changes angle when a low wall hides part of the car',()=>{
  const requested=new THREE.Vector3(6,1.65,0);
  expect(resolver([]).resolve(requested,origin,rotation)).toBe(0);
  expect(requested.toArray()).toEqual([6,1.65,0]);
  // The center ray clears this wall, but the nearer wheels/body do not.
  const obstacle=wall(2.3,.48,0,.4,.96,20);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,.65,0),requested.clone().sub(new THREE.Vector3(0,.65,0)).normalize(),0,6);
  expect(ray.intersectObject(obstacle)).toHaveLength(0);
  expect(resolver([obstacle]).resolve(requested,origin,rotation)).toBeGreaterThan(0);
  expect(requested.x).toBe(0);
  expect(requested.z).toBe(-8);
});

test('rejects crane shots above tunnel roofs and tries another side when pursuit is blocked',()=>{
  const roof=wall(0,5,0,40,.5,40,'neon-tunnel-shell');
  const rear=wall(0,1.5,-3,20,3,.5);
  const requested=new THREE.Vector3(6,8,-3);
  expect(resolver([roof,rear]).resolve(requested,origin,rotation)).toBe(2);
  expect(requested.toArray()).toEqual([0,2.4,8]);
});

test('replay fallback cuts and out-of-order seeking preserve camera framing',()=>{
  const wheels=Object.fromEntries(['fl','fr','rl','rr'].map(key=>{
    const group=new THREE.Group();group.userData.spin=new THREE.Group();return[key,group];
  }));
  const car={group:new THREE.Group(),model:{wheels,steeringWheel:new THREE.Group(),drsFlap:new THREE.Group(),brakeLights:[],updateDisplay(){}}} as unknown as Car;
  const poses=capturePoses([car]);
  const telemetry={speed:0,gear:1,rpm:0,throttle:0,brake:0,steer:0};
  const lap={frames:[{time:0,worldTime:0,poses,telemetry},{time:30,worldTime:30,poses,telemetry}],duration:30,lap:1,valid:true} as RecordedLap;
  const camera=new THREE.PerspectiveCamera(50,16/9,.1,500);
  const director=new ReplayDirector(lap,[car],camera,{surfaceHeightAt:()=>0} as unknown as TrackBuilder,[wall(2.3,.5,0,.4,1,30)]);
  expect(director.renderAt(0).angle).toBeGreaterThan(0);
  const position=camera.position.clone(),quaternion=camera.quaternion.clone(),fov=camera.fov;
  expect(director.renderAt(.1).cut).toBe(false);
  director.renderAt(12);
  const sought=director.renderAt(0);
  expect(sought.cut).toBe(true);
  expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
  expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-7);
  expect(camera.fov).toBe(fov);
});
