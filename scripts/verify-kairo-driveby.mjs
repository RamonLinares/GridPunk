import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/kairo-fixes';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const records=[];
try {
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto('http://127.0.0.1:5198/?circuit=kairo');await page.waitForFunction(()=>window.__game&&document.querySelector('#loading').hidden,null,{timeout:60000});
  await page.locator('[data-quality="performance"]').click();await page.locator('#session-primary').click();await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.started);
  await page.keyboard.down('w');await page.waitForTimeout(3500);await page.keyboard.up('w');await page.evaluate(()=>window.__game.loop.stop());
  for(const quality of ['performance','quality']) {
   await page.locator('[data-action="pause"]').click();await page.locator(`[data-quality="${quality}"]`).click();await page.locator('#session-primary').click();
   for(const fraction of [.05,.075,.105]) {
    const framing=await page.evaluate(({fraction})=>{const g=window.__game;g.car.resetAt(Math.round(fraction*g.spline.count),0);g.cameraRig.snap(g.car);g.environment.update(g.car.physics.position,60);g.render();const board=g.scene.getObjectByName('kairo-mars-billboard'),screen=g.scene.getObjectByName('kairo-mars-video-screen'),wheel=g.scene.getObjectByName('kairo-ferris-wheel');const center=screen.getWorldPosition(board.position.clone());const heading=g.spline.sampleAt(Math.round(fraction*g.spline.count)).tangent;const to=center.clone().sub(g.car.physics.position);to.y=0;to.normalize();return {fraction,billboardAhead:heading.dot(to),screenNdc:center.project(g.camera).toArray(),clearance:board.userData.roadClearance,wheel:wheel.userData};},{fraction});
    assert.ok(framing.billboardAhead>.94);assert.ok(framing.clearance>=18);assert.ok(Math.abs(framing.screenNdc[0])<.8);assert.ok(Math.abs(framing.screenNdc[1])<.95);
    await page.waitForTimeout(250);await page.evaluate(()=>window.__game.render());await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-${quality}-${fraction}.png`});records.push({mobile,quality,...framing});
   }
  }
  // Keep the real Web Audio graph running, and move a listener through both trees.
  await page.evaluate(()=>{const g=window.__game,scene=g.environment.koiHolograms;g.audio.updateHolograms(scene,scene.positions[0],{x:0,y:0,z:0},1,0,'koi');});
  await page.waitForFunction(()=>window.__game.audio.getDiagnostics().koi?.status==='ready');
  await page.evaluate(()=>{const g=window.__game;const analyser=g.audio.ctx.createAnalyser();analyser.fftSize=2048;g.audio.koi.output.connect(analyser);window.__bonsaiMeter=analyser;});
  const audio=[];
  for(const fraction of [.27,.75])for(const distance of [-120,-50,0,50,100]) {
   await page.evaluate(({fraction,distance})=>{const g=window.__game,s=g.spline.sampleAt(Math.round((fraction+distance/g.spline.length)*g.spline.count));const velocity=s.tangent.clone().multiplyScalar(45);g.environment.update(s.position,70);g.audio.updateHolograms(g.environment.koiHolograms,s.position,velocity,s.right.x,s.right.z,'koi');},{fraction,distance});await page.waitForTimeout(350);
   const reading=await page.evaluate(()=>{const data=new Float32Array(window.__bonsaiMeter.fftSize);window.__bonsaiMeter.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length);return {...window.__game.audio.getDiagnostics().koi,rms,db:rms?20*Math.log10(rms):-120};});
   assert.ok(reading.active>=0);assert.ok(reading.rms>.002);if(distance===0)assert.ok(reading.rms>.012);if(distance===100)assert.ok(reading.departureGain>.2);audio.push({fraction,...reading,along:distance});
  }
  const quiet=await page.evaluate(()=>{const g=window.__game;g.audio.setPaused(true);const paused=g.audio.getDiagnostics().paused;g.audio.setPaused(false);g.audio.updateHolograms(g.environment.koiHolograms,{x:1e5,y:0,z:1e5},{x:0,y:0,z:0},1,0,'koi');g.audio.koi.output.disconnect(window.__bonsaiMeter);return {paused,active:g.audio.getDiagnostics().koi.active};});assert.ok(quiet.paused);assert.equal(quiet.active,-1);
  assert.deepEqual(errors,[]);records.push({mobile,audio,errors});await page.close();
 }
}finally{await writeFile(`${out}/driveby.json`,JSON.stringify(records,null,2));await browser.close();}
console.log(JSON.stringify(records.filter(r=>r.audio).map(r=>({mobile:r.mobile,audio:r.audio.map(a=>({fraction:a.fraction,distance:a.distance,db:a.db,departure:a.departureGain})),errors:r.errors})),null,2));
