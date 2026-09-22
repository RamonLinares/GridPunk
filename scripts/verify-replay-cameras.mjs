import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/replay-cameras';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
  for(const circuit of ['neon-solar','solar','neon-steam','steam','neon','kairo']){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:5198/?circuit=${circuit}&car=shinsei&hq&go`);
    await page.waitForFunction(()=>window.__game&&window.__THREE_GAME_DIAGNOSTICS__?.started,null,{timeout:90000});
    await page.evaluate(async()=>{
      const g=window.__game;g.loop.stop();g.setPaused(true);
      const {capturePoses}=await import('/src/systems/LapReplay.ts');
      const cars=[g.car,...g.rivals.map(r=>r.car)],frames=[];
      for(let i=0;i<=720;i++){
        g.car.resetAt(Math.floor((i%720)/720*g.spline.count),Math.sin(i*.11)*8);
        frames.push({time:i/6,worldTime:i/6,poses:capturePoses(cars),telemetry:{...g.car.physics.telemetry}});
      }
      g.replayRecorder.last={frames,duration:120,lap:1,valid:true};
      g.setPaused(true);
    });
    await page.locator('#session-replay').click();
    const result=await page.evaluate(async()=>{
      const g=window.__game;if(!g.replay)throw new Error('Replay did not start');g.setReplayPlaying(false);
      const THREE=await import('/node_modules/three/build/three.module.js');
      const {collectReplayObstructions}=await import('/src/systems/ReplayVisibility.ts');
      const obstacles=collectReplayObstructions(g.scene),blocked=[],fallbacks=[],angles={};
      let duration=0;
      for(let i=0;i<360;i++){
        const t=i/3,before=performance.now(),frame=g.replay.director.renderAt(t);duration+=performance.now()-before;
        angles[frame.angle]=(angles[frame.angle]??0)+1;
        if(frame.angle)fallbacks.push({t,angle:frame.angle,shot:frame.shot});
        // Independent camera-to-body ray; use actual chassis orientation.
        const target=new THREE.Vector3(0,.65,0).applyQuaternion(g.car.group.quaternion).add(g.car.group.position);
        const delta=target.clone().sub(g.camera.position),ray=new THREE.Raycaster(g.camera.position,delta.clone().normalize(),0,delta.length()-.05);
        const hit=ray.intersectObjects(obstacles,false)[0];
        if(hit)blocked.push({t,angle:frame.angle,name:hit.object.name});
      }
      const at=fallbacks.find(f=>f.t>5)?.t??10;
      g.seekReplay(at);const pose=[...g.camera.position.toArray(),...g.camera.quaternion.toArray(),g.camera.fov];
      g.seekReplay(90);g.seekReplay(at);
      const repeat=[...g.camera.position.toArray(),...g.camera.quaternion.toArray(),g.camera.fov];
      g.render();
      return{circuit:g.spline.circuitId,obstacles:obstacles.length,angles,blocked,fallbacks:fallbacks.length,screenshotTime:at,seekError:Math.max(...pose.map((v,i)=>Math.abs(v-repeat[i]))),meanDirectorMs:duration/360};
    });
    await page.screenshot({path:`${out}/${circuit}.png`});
    results.push({...result,errors});console.log(JSON.stringify({...result,errors}));
    await page.close();
  }
  await writeFile(`${out}/verification.json`,JSON.stringify(results,null,2));
  for(const result of results){assert.deepEqual(result.errors,[]);assert.deepEqual(result.blocked,[]);assert.equal(result.seekError,0);}
}finally{await browser.close();}
