import * as THREE from 'three';
import type { Car } from '../entities/Car';
import type { Telemetry } from './VehiclePhysics';
import type { LapRecord } from './Timing';

export interface ReplayFrame { time:number; worldTime:number; poses:Float32Array; telemetry:Telemetry }
export interface RecordedLap { frames:ReplayFrame[]; duration:number; lap:number; valid:boolean }
const STRIDE=30;
const wheelKeys=['fl','fr','rl','rr'] as const;

export function capturePoses(cars:readonly Car[]):Float32Array;
export function capturePoses(cars:readonly Car[],precise:true):Float64Array;
export function capturePoses(cars:readonly Car[],precise=false):Float32Array|Float64Array {
  const data=precise?new Float64Array(cars.length*STRIDE):new Float32Array(cars.length*STRIDE);
  cars.forEach((car,i)=>{
    let o=i*STRIDE;car.group.position.toArray(data,o);o+=3;car.group.quaternion.toArray(data,o);o+=4;
    for(const key of wheelKeys){const w=car.model.wheels[key];w.position.toArray(data,o);o+=3;data[o++]=w.rotation.y;data[o++]=w.userData.spin.rotation.x;}
    data[o++]=car.model.steeringWheel.rotation.z;data[o++]=car.model.drsFlap.rotation.x;
    data[o]=(car.model.brakeLights[0]?.material as THREE.MeshStandardMaterial)?.emissiveIntensity??.4;
  });return data;
}
const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
export function applyPoses(cars:readonly Car[],a:Float32Array|Float64Array,b=a,alpha=0):void {
  cars.forEach((car,i)=>{
    let o=i*STRIDE;
    // Recoveries are cuts, never an interpolated flight across the circuit.
    const jump=Math.hypot(a[o]-b[o],a[o+1]-b[o+1],a[o+2]-b[o+2])>35;
    const t=jump?0:alpha;
    const lerp=(n:number)=>a[n]+(b[n]-a[n])*t;
    car.group.position.set(lerp(o),lerp(o+1),lerp(o+2));o+=3;
    qa.fromArray(a,o);qb.fromArray(b,o);car.group.quaternion.copy(qa).slerp(qb,t);o+=4;
    for(const key of wheelKeys){const w=car.model.wheels[key];w.position.set(lerp(o),lerp(o+1),lerp(o+2));o+=3;w.rotation.y=lerp(o++);w.userData.spin.rotation.x=lerp(o++);}
    car.model.steeringWheel.rotation.z=lerp(o++);car.model.drsFlap.rotation.x=lerp(o++);
    for(const light of car.model.brakeLights)(light.material as THREE.MeshStandardMaterial).emissiveIntensity=lerp(o);
  });
}

/** Bounded transform recording; no video capture or physics snapshots during racing. */
export class LapReplayRecorder {
  last:RecordedLap|null=null;
  private frames:ReplayFrame[]=[];
  private interval=1/30;
  private previousTime=0;
  reset(){this.last=null;this.frames=[];this.interval=1/30;this.previousTime=0;}
  record(time:number,worldTime:number,cars:readonly Car[],completed?:LapRecord):void {
    if(!completed&&time<this.previousTime-.01){this.frames=[];this.interval=1/30;}
    this.previousTime=time;
    const t=completed?completed.time:time;
    if(!completed&&this.frames.length&&t-this.frames.at(-1)!.time<this.interval)return;
    const frame={time:t,worldTime,poses:capturePoses(cars),telemetry:{...cars[0].physics.telemetry}};
    this.frames.push(frame);
    if(this.frames.length>18000){this.frames=this.frames.filter((_,i)=>i%2===0);this.interval*=2;}
    if(completed){
      if(this.frames.length>1)this.last={frames:this.frames,duration:completed.time,lap:completed.lap,valid:completed.valid};
      this.frames=[{...frame,time}];this.interval=1/30;
    }
  }
}

export function sampleReplay(lap:RecordedLap,time:number){
  const frames=lap.frames;let lo=0,hi=frames.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(frames[mid].time<=time)lo=mid;else hi=mid;}
  const a=frames[lo],b=frames[hi],alpha=THREE.MathUtils.clamp((time-a.time)/Math.max(.00001,b.time-a.time),0,1);
  const telemetry={...a.telemetry};
  for(const key of ['speed','rpm','throttle','brake','steer'] as const)telemetry[key]=THREE.MathUtils.lerp(a.telemetry[key],b.telemetry[key],alpha);
  return{a,b,alpha,telemetry,worldTime:THREE.MathUtils.lerp(a.worldTime,b.worldTime,alpha)};
}

/** Recorded visual motion, never the paused simulation body's velocity. */
export function replayMotion(lap:RecordedLap,time:number){
  const {a,b,alpha,telemetry,worldTime}=sampleReplay(lap,time),dt=b.time-a.time;
  const jump=Math.hypot(a.poses[0]-b.poses[0],a.poses[1]-b.poses[1],a.poses[2]-b.poses[2])>35;
  const p=(i:number)=>a.poses[i]+(b.poses[i]-a.poses[i])*(jump?0:alpha);
  const v=(i:number)=>dt>0&&!jump?(b.poses[i]-a.poses[i])/dt:0;
  const q=new THREE.Quaternion().fromArray(a.poses,3).slerp(new THREE.Quaternion().fromArray(b.poses,3),jump?0:alpha);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(q);
  return{position:new THREE.Vector3(p(0),p(1),p(2)),velocity:new THREE.Vector3(v(0),v(1),v(2)),right,telemetry,worldTime};
}
