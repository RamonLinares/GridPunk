import * as THREE from 'three';
import type { TrackBuilder } from '../game/track/TrackBuilder';
import type { Car } from '../entities/Car';
import {applyPoses,sampleReplay,type RecordedLap} from './LapReplay';
import {ReplayVisibility} from './ReplayVisibility';

const SHOTS=[4.2,3.2,3.4,4.5,3.6,3];
const CYCLE=SHOTS.reduce((a,b)=>a+b,0);
/** Shots are sampled from the recorded trajectory, independent of playback FPS
 * and seek order. Cameras never inherit the car's roll or suspension movement. */
export class ReplayDirector {
  private previousShot=-1;
  private readonly offset=new THREE.Vector3();
  private readonly aim=new THREE.Vector3();
  private readonly visibility:ReplayVisibility;
  private readonly q=new THREE.Quaternion();
  constructor(private readonly lap:RecordedLap,private readonly cars:readonly Car[],private readonly camera:THREE.PerspectiveCamera,
    builder:TrackBuilder,obstructions:THREE.Object3D[]){
    this.visibility=new ReplayVisibility(obstructions,(x,z,y)=>builder.surfaceHeightAt(x,z,y));
  }
  private pose(time:number){
    const s=sampleReplay(this.lap,THREE.MathUtils.clamp(time,0,this.lap.duration));
    const p=new THREE.Vector3().fromArray(s.a.poses),next=new THREE.Vector3().fromArray(s.b.poses);
    const alpha=p.distanceTo(next)>35?0:s.alpha;p.lerp(next,alpha);
    this.q.fromArray(s.a.poses,3).slerp(new THREE.Quaternion().fromArray(s.b.poses,3),alpha);
    // A level camera platform lets the recorded chassis pitch and roll read.
    const yaw=Math.atan2(2*(this.q.w*this.q.y+this.q.x*this.q.z),1-2*(this.q.y*this.q.y+this.q.x*this.q.x));
    return{p,q:new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,yaw)};
  }
  renderAt(time:number){
    const sample=sampleReplay(this.lap,time);applyPoses(this.cars,sample.a.poses,sample.b.poses,sample.alpha);
    const car=this.cars[0];car.model.updateDisplay(sample.telemetry.speed,sample.telemetry.gear,sample.telemetry.rpm);
    const cycle=Math.floor(time/CYCLE);let start=cycle*CYCLE,shot=0;
    while(shot<SHOTS.length-1&&time>=start+SHOTS[shot])start+=SHOTS[shot++];
    const duration=SHOTS[shot],u=THREE.MathUtils.clamp((time-start)/duration,0,1),e=u*u*(3-2*u);
    const current=this.pose(time),lagged=this.pose(time-.10),anchor=this.pose(Math.min(this.lap.duration,start+duration*.52));
    const place=(pose:ReturnType<ReplayDirector['pose']>,x:number,y:number,z:number)=>this.offset.set(x,y,z).applyQuaternion(pose.q).add(pose.p);
    this.aim.copy(lagged.p);this.aim.y+=.65;
    if(shot===0){
      // Trackside pan: fixed world camera, approaching car grows then recedes.
      place(anchor,6.2,1.65,-1);this.aim.lerp(anchor.p.clone().add(new THREE.Vector3(0,.65,0)),.28);
      this.camera.fov=43;
    }else if(shot===1){
      // Overtaking camera vehicle pulls from behind to the front quarter.
      place(this.pose(time-.04),4.8,1.05+e*.7,THREE.MathUtils.lerp(-7,8,e));
      this.aim.copy(current.p).add(new THREE.Vector3(0,.65,.6-e*1.2).applyQuaternion(current.q));
      this.camera.fov=49;
    }else if(shot===2){
      // Front axle insert. The stable camera reveals actual wheel steering,
      // tyre rotation, vertical travel and chassis pitch against the horizon.
      place(this.pose(time-.018),-3.3-e*.65,.72+e*.35,2.7-e*1.5);
      this.aim.copy(current.p).add(new THREE.Vector3(-.65,.38,1.3).applyQuaternion(current.q));
      this.camera.fov=40;
    }else if(shot===3){
      // Crane anchored in the world, travelling on its own rail rather than
      // translating at the same speed as the race car.
      place(anchor,-3+e*5,7.5-e*2,-12+e*18);
      this.aim.lerp(anchor.p.clone().add(new THREE.Vector3(0,.7,0)),.12);
      this.camera.fov=48;
    }else if(shot===4){
      // Delayed pursuit: closing distance and lateral drift change throughout.
      place(this.pose(time-.20-e*.16),-2.8+e*4.8,1.3+Math.sin(u*Math.PI)*1.3,-5+e*3);
      this.aim.add(new THREE.Vector3(.7-e*1.4,0,1).applyQuaternion(current.q));
      this.camera.fov=38+e*7;
    }else{
      place(anchor,-5.6,.95,2);this.aim.lerp(anchor.p.clone().add(new THREE.Vector3(0,.5,0)),.07);
      this.camera.fov=47;
    }
    const angle=this.visibility.resolve(this.offset,current.p,current.q);
    if(angle){
      this.aim.copy(current.p).add(new THREE.Vector3(0,.65,0));
      // Keep the entire car in frame, including portrait replay exports.
      const fieldOfView=angle>=7?110:55;
      this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(fieldOfView)/2)/Math.min(1,this.camera.aspect)));
    }
    this.camera.position.copy(this.offset);this.camera.up.set(0,1,0);this.camera.lookAt(this.aim);this.camera.updateProjectionMatrix();
    const id=(cycle*SHOTS.length+shot)*10+angle,cut=id!==this.previousShot;this.previousShot=id;
    this.camera.updateMatrixWorld();
    return{...sample,cut,shot,angle};
  }
}
