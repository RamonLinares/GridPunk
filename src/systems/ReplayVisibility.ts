import * as THREE from 'three';

/** Only solid track structures: avoid raycasting the entire decorative city. */
export function collectReplayObstructions(scene:THREE.Object3D):THREE.Object3D[] {
  const result:THREE.Object3D[]=[];
  scene.updateMatrixWorld(true);
  scene.traverseVisible(object=>{
    if(!(object instanceof THREE.Mesh))return;
    let inTunnel=false;
    for(let parent=object.parent;parent;parent=parent.parent)
      if(parent.name==='neon-transit-tunnel')inTunnel=true;
    if(inTunnel||/concrete-.*-(front|rear)$|wall-cap|barrier-advertising|escape.*barrier|flyover-(deck|pier)|underpass-(steel-ribs|girder-flanges)|^road$|^shoulder$/.test(object.name))
      result.push(object);
  });
  return result;
}

const BODY_POINTS=[[0,.65,0],[-.8,.5,-1.6],[.8,.5,-1.6],[-.8,.5,1.6],[.8,.5,1.6]];
// All positions are relative to the car, so a bend cannot leave the fallback
// parked on the wrong side of a barrier like a fixed trackside camera can.
const ALTERNATIVES=[[0,3.2,-8],[0,2.4,8],[-4.5,2.7,-5],[4.5,2.7,-5],
  [0,5.5,-5],[0,2,-5],[0,4,0],[0,1.8,5],[0,2.6,0]];

/** Circuit ribbons have bounds spanning the whole map. Split their index buffers
 * into small, bounded raycast meshes once, without changing rendered geometry. */
function localRaycastMeshes(objects:THREE.Object3D[]):THREE.Object3D[]{
  const result:THREE.Object3D[]=[],vertex=new THREE.Vector3();
  for(const object of objects){
    if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||Array.isArray(object.material)){
      result.push(object);continue;
    }
    const source=object.geometry,index=source.index,positions=source.getAttribute('position');
    if(!index||index.count<576||source.groups.length||source.drawRange.start!==0||Number.isFinite(source.drawRange.count)){
      result.push(object);continue;
    }
    for(let start=0;start<index.count;start+=288){
      const geometry=new THREE.BufferGeometry(),bounds=new THREE.Box3();
      const indices=index.array.slice(start,Math.min(start+288,index.count));
      geometry.setAttribute('position',positions);
      geometry.setIndex(new THREE.BufferAttribute(indices,1));
      for(const i of indices)bounds.expandByPoint(vertex.fromBufferAttribute(positions,i));
      geometry.boundingBox=bounds;geometry.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      const mesh=new THREE.Mesh(geometry,object.material);
      mesh.matrixAutoUpdate=false;mesh.matrixWorld.copy(object.matrixWorld);mesh.name=object.name;
      result.push(mesh);
    }
  }
  return result;
}

export class ReplayVisibility {
  private readonly ray=new THREE.Raycaster();
  private readonly direction=new THREE.Vector3();
  private readonly targets=BODY_POINTS.map(()=>new THREE.Vector3());
  private readonly candidate=new THREE.Vector3();
  private readonly best=new THREE.Vector3();
  private readonly obstructions:THREE.Object3D[];
  constructor(obstructions:THREE.Object3D[],
    private readonly surfaceHeightAt:(x:number,z:number,hintY:number)=>number|undefined){
    this.obstructions=localRaycastMeshes(obstructions);
  }

  private liftAboveRoad(position:THREE.Vector3,car:THREE.Vector3){
    const ground=this.surfaceHeightAt(position.x,position.z,car.y);
    if(ground!==undefined)position.y=Math.max(position.y,ground+.65);
  }

  private visiblePoints(position:THREE.Vector3){
    let clear=0;
    for(const target of this.targets){
      this.direction.subVectors(position,target);
      const distance=this.direction.length();
      this.direction.normalize();
      this.ray.set(target,this.direction);
      this.ray.near=0;
      // Leave space around the lens instead of accepting a camera inside a wall.
      this.ray.far=distance+.35;
      if(this.ray.intersectObjects(this.obstructions,false).length===0)clear++;
    }
    return clear;
  }

  /** Mutates the requested position only when blocked. Stateless selection keeps
   * seeking and exported frames identical to playback at the same timestamp. */
  resolve(position:THREE.Vector3,car:THREE.Vector3,rotation:THREE.Quaternion):number {
    BODY_POINTS.forEach(([x,y,z],i)=>this.targets[i].set(x,y,z).applyQuaternion(rotation).add(car));
    this.liftAboveRoad(position,car);
    if(this.visiblePoints(position)===this.targets.length)return 0;
    let bestScore=-1,choice=1;
    for(let i=0;i<ALTERNATIVES.length;i++){
      this.candidate.fromArray(ALTERNATIVES[i]).applyQuaternion(rotation).add(car);
      this.liftAboveRoad(this.candidate,car);
      const score=this.visiblePoints(this.candidate);
      if(score>bestScore){bestScore=score;choice=i+1;this.best.copy(this.candidate);}
      if(score===this.targets.length)break;
    }
    position.copy(this.best);
    return choice;
  }
}
