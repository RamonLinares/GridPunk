import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/kairo-videos';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const records=[];
try {
 for(const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});page.on('request',r=>requests.push(r.url()));
  await page.goto('http://127.0.0.1:5198/?circuit=kairo');
  await page.waitForFunction(()=>window.__game&&document.querySelector('#loading').hidden,null,{timeout:60000});
  await page.locator('[data-quality="quality"]').click();await page.locator('#session-primary').click();
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.started);
  await page.waitForTimeout(2200);
  await page.evaluate(()=>window.__game.loop.stop());
  const placement=await page.evaluate(()=>{
   const g=window.__game,b=g.scene.getObjectByName('kairo-mars-billboard');
   if(!b)throw Error('No building-mounted Mars billboard');
   const groups=[];g.environment.group.traverse(o=>{if(/hologram/.test(o.name))groups.push(o.name)});
   return {billboard:{...b.userData,visible:b.visible,position:b.position.toArray()},groups};
  });
  assert.equal(placement.groups.length,4);assert.ok(placement.groups.every(n=>/kairo-(ramen|bonsai)/.test(n)));
  assert.ok(placement.billboard.visible);assert.ok(placement.billboard.roadClearance>=18);
  assert.ok(Math.abs(placement.billboard.screen.width/placement.billboard.screen.height-688/464)<.00001);
  const sources=[];
  for(const [name,slot,kind,fraction,distance] of [['ramen','holograms','geisha',.04,80],['bonsai','koiHolograms','koi',.27,60],['mars','billboardAudio','billboard',placement.billboard.progress,40]]) {
   await page.evaluate(({fraction,distance,slot,kind})=>{
    const g=window.__game;g.car.resetAt(Math.round((fraction-distance/g.spline.length)*g.spline.count),0);g.cameraRig.snap(g.car);
    g.environment.update(g.car.physics.position,12);g.audio.updateHolograms(g.environment[slot],g.car.physics.position,g.car.physics.velocity,1,0,kind);g.render();
   },{fraction,distance,slot,kind});
   await page.waitForFunction(({slot,kind})=>{const g=window.__game;return g.environment[slot].video.readyState>=2&&!g.environment[slot].video.paused&&g.audio.getDiagnostics()[kind==='geisha'?'hologram':kind]?.status==='ready';},{slot,kind},{timeout:30000});
   const before=await page.evaluate(slot=>window.__game.environment[slot].video.currentTime,slot);
   await page.waitForTimeout(1300);
   const state=await page.evaluate(({slot,kind})=>{
    const g=window.__game,scene=g.environment[slot];g.environment.update(g.car.physics.position,13.3);g.audio.updateHolograms(scene,g.car.physics.position,g.car.physics.velocity,1,0,kind);g.render();
    return {src:scene.video.currentSrc,audio:scene.audioUrl,time:scene.video.currentTime,duration:scene.video.duration,frames:scene.video.getVideoPlaybackQuality().totalVideoFrames,emitters:scene.positions.length,diagnostics:g.audio.getDiagnostics()[kind==='geisha'?'hologram':kind]};
   },{slot,kind});
   assert.ok(state.time!==before);assert.ok(state.frames>0);assert.ok(state.diagnostics.active>=0);assert.ok(state.diagnostics.gain>=0);
   sources.push({name,...state});await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-${name}.png`});
   if(name==='mars'&&!mobile){
    await page.evaluate(()=>{const g=window.__game,b=g.scene.getObjectByName('kairo-mars-billboard');const center=g.scene.getObjectByName('kairo-mars-video-screen').getWorldPosition(b.position.clone());const normal=b.position.clone().set(Math.sin(b.rotation.y),0,Math.cos(b.rotation.y));g.camera.position.copy(center).addScaledVector(normal,65);g.camera.lookAt(center);g.render();});
    await page.screenshot({path:`${out}/billboard-front.png`});
   }
  }
  const controls=await page.evaluate(()=>{
   const g=window.__game,scenes=[g.environment.holograms,g.environment.koiHolograms,g.environment.billboardAudio];
   const far=g.car.physics.position.clone().set(1e5,0,1e5);g.environment.update(far,15);
   const distantPaused=scenes.every(s=>s.video.paused);g.audio.setPaused(true);const paused=g.audio.getDiagnostics().paused;
   g.audio.setPaused(false);const muted=g.audio.toggleMute();g.audio.toggleMute();
   return {distantPaused,paused,muted,audio:g.audio.getDiagnostics(),renderer:g.renderer.info.render};
  });
  assert.ok(controls.distantPaused&&controls.paused&&controls.muted);
  assert.ok(!requests.some(url=>/neon-(geisha|koi)/.test(url)));assert.deepEqual(errors,[]);
  records.push({mobile,placement,sources,controls,errors});await page.close();
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5198/?circuit=neon');
 await page.waitForFunction(()=>window.__game&&document.querySelector('#loading').hidden,null,{timeout:60000});
 const neon=await page.evaluate(()=>{const g=window.__game;return {primary:g.environment.holograms.video.src,secondary:g.environment.koiHolograms.video.src,billboard:!!g.environment.billboardAudio}});
 assert.match(neon.primary,/neon-geisha/);assert.match(neon.secondary,/neon-koi/);assert.equal(neon.billboard,false);await page.close();
} finally {await writeFile(`${out}/verification.json`,JSON.stringify(records,null,2));await browser.close();}
console.log(JSON.stringify(records.map(r=>({mobile:r.mobile,billboardProgress:r.placement.billboard.progress,sources:r.sources.map(s=>({name:s.name,frames:s.frames,active:s.diagnostics.active})),errors:r.errors})),null,2));
