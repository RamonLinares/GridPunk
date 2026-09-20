import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:5198';
const out='artifacts/neon';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{
 for(const circuit of ['neon'])for(const level of ['normal']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(`${base}/`);await page.waitForFunction(()=>window.__game&&document.querySelector('#loading').hidden,null,{timeout:45000});
  await page.locator(`[data-assist="${level}"]`).click();await page.locator('#session-primary').click();await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.started);
  await page.keyboard.down('w');await page.waitForTimeout(2500);await page.keyboard.up('w');
  const launch=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);await page.screenshot({path:`${out}/${circuit}-${level}-launch.png`});
  await page.evaluate(async()=>{
   const {AiDriver}=await import('/src/systems/AiDriver.ts');const {Timing}=await import('/src/systems/Timing.ts');
   const g=window.__game;g.loop.stop();g.beginSession();g.car.physics.setAssistLevel('normal');g.started=true;g.countdown=0;g.paused=false;g.timing.start(g.playerPrev);
   const driver=new AiDriver(g.spline,0,15.6,94);driver.setPace(1.08);driver.reset(g.builder.gridSlot(5).index);
   const cars=[g.car,...g.rivals.map(r=>r.car)];
   const records=cars.map(c=>{const cache={index:g.spline.nearestSample(c.physics.position,{index:0}).index};const prev=g.spline.progressAt(c.physics.position,cache);const timing=new Timing(g.spline);timing.start(prev);return{prev,cache,timing,distance:0,maxOffset:0,offroadSeconds:0,barriers:0,stoppedSeconds:0}});
   cars.forEach((c,i)=>{const update=c.update.bind(c);c.update=(...args)=>{const hit=update(...args);if(hit.collided)records[i].barriers++;return hit}});
   window.__raceQA={g,driver,cars,records,t:0,finished:false,twoLapGaps:null};
  });
  for(let block=0;block<50;block++){
   const state=await page.evaluate(()=>{
    const q=window.__raceQA,{g,cars,records,driver}=q;
    for(let frame=0;frame<600&&!q.finished;frame++){
     const input=driver.update(g.car,cars.slice(1).map(c=>({position:c.physics.position,speed:c.physics.telemetry.speed})),1/60);
     g.advanceCars(1/60,input);q.t+=1/60;
     cars.forEach((c,i)=>{const r=records[i],probe=g.spline.probe(c.physics.position,r.cache),prog=g.spline.progressAt(c.physics.position,r.cache);let delta=prog-r.prev;if(delta<-g.spline.length/2)delta+=g.spline.length;if(delta>g.spline.length/2)delta-=g.spline.length;r.distance+=delta;r.prev=prog;r.maxOffset=Math.max(r.maxOffset,Math.abs(probe.signedOffset));if(c.surfaceInfo.mu<1)r.offroadSeconds+=1/60;if(q.t>10&&c.physics.telemetry.speed<3)r.stoppedSeconds+=1/60;r.timing.update(1/60,prog,r.cache);if(c.surfaceInfo.mu<1)r.timing.invalidateLap();});
     if(!q.twoLapGaps&&records[0].distance>=2*g.spline.length)q.twoLapGaps=records.slice(1).map(r=>records[0].distance-r.distance);
     q.finished=records.every(r=>r.timing.getHistory().length>=2);
    }
    g.cameraRig.mode='chase';g.cameraRig.snap(g.car);g.post.render();
    return{t:q.t,finished:q.finished,length:g.spline.length,twoLapGaps:q.twoLapGaps,records:records.map(r=>({distance:r.distance,laps:r.timing.getHistory(),maxOffset:r.maxOffset,offroadSeconds:r.offroadSeconds,barriers:r.barriers,stoppedSeconds:r.stoppedSeconds})),contacts:g.contacts.playerEvents};
   });
   if(block%5===0)console.log(JSON.stringify({circuit,level,t:state.t,laps:state.records.map(r=>r.laps.length)}));
   if(block===0||state.finished)await page.screenshot({path:`${out}/${circuit}-${level}-${state.finished?'two-laps':'field'}.png`});
   if(state.finished||block===49){results.push({circuit,level,launch,state,errors});console.log(JSON.stringify({circuit,level,...state,errors}));break;}
  }
  await page.close();
 }
 await writeFile(`${out}/browser-races.json`,JSON.stringify(results,null,2));
 for (const result of results) { assert.deepEqual(result.errors,[]);assert.ok(result.state.finished,'All six cars complete two laps');assert.ok(result.state.records.every(r=>r.stoppedSeconds<5),'No car stuck');assert.ok(result.state.records.every(r=>r.barriers<5),'No repeated wall strikes'); }
}catch(error){console.error(error);throw error}finally{for(const context of browser.contexts())for(const page of context.pages())await page.close();await browser.close()}
