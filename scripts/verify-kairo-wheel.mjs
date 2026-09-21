import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:5198';
const out = 'artifacts/kairo-wheel'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const records = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? {width:390,height:844} : {width:1440,height:900}, isMobile:mobile,hasTouch:mobile });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto(`${base}/?circuit=kairo`);
    await page.waitForFunction(()=>window.__game&&document.querySelector('#loading').hidden,null,{timeout:60000});
    await page.locator('[data-quality="quality"]').click();
    await page.locator('#session-primary').click();
    await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.started);
    await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
    const state = await page.evaluate(()=>{
      const g=window.__game,w=g.scene.getObjectByName('kairo-ferris-wheel');
      if(!w)throw new Error('Kairo wheel missing');
      g.loop.stop();
      const pods=w.getObjectByName('kairo-wheel-cabin-glass');
      const before=Array.from(pods.instanceMatrix.array.slice(0,16));
      g.environment.update(g.car.physics.position,100);
      const after=Array.from(pods.instanceMatrix.array.slice(0,16));
      const a=w.userData.rotationAngle;
      g.environment.update(g.car.physics.position,110);
      const b=w.userData.rotationAngle;
      const matrix=Array.from(pods.instanceMatrix.array.slice(0,16));
      let meshes=0,triangles=0,instances=0;const geometries=new Set(),materials=new Set();
      w.traverse(o=>{if(!o.isMesh)return;meshes++;geometries.add(o.geometry.uuid);materials.add(o.material.uuid);const count=o.geometry.index?.count??o.geometry.attributes.position.count;triangles+=count/3*(o.isInstancedMesh?o.count:1);if(o.isInstancedMesh)instances+=o.count});
      const stats={...w.userData,meshes,triangles,instances,geometries:geometries.size,materials:materials.size,before,after,matrix,rotationDelta:b-a};
      g.environment.update(g.car.physics.position,0);g.render();return stats;
    });
    assert.equal(state.cabinCount,32);assert.ok(state.roadClearance>=20);assert.ok(state.rotationDelta>0);
    assert.notDeepEqual(state.before.slice(12,15),state.after.slice(12,15));
    assert.deepEqual([state.matrix[1],state.matrix[4],state.matrix[5],state.matrix[6],state.matrix[9]],[0,0,1,0,0]);
    assert.ok(state.meshes<45);assert.ok(state.triangles<130000);
    await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-opening.png`});
    for(const [name,fraction] of [['approach',.035],['approach-close',.075],['turn-one',.105]]) {
      await page.evaluate(({fraction})=>{const g=window.__game;g.car.resetAt(Math.round(g.spline.count*fraction),0);g.cameraRig.snap(g.car);g.environment.update(g.car.physics.position,60);g.render();},{fraction});
      await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-${name}.png`});
    }
    if(!mobile){
      await page.evaluate(()=>{const g=window.__game,w=g.scene.getObjectByName('kairo-ferris-wheel');g.scene.updateMatrixWorld(true);const center=w.position.clone();g.camera.position.copy(center).add({x:-200,y:128,z:-230});g.camera.lookAt(center.x,128,center.z);g.environment.update(g.camera.position,60);g.render();});
      await page.screenshot({path:`${out}/structure.png`});
    }
    assert.deepEqual(errors,[]);records.push({mobile,state,errors});await page.close();
  }
  const page=await browser.newPage();await page.goto(`${base}/?circuit=neon`);
  await page.waitForFunction(()=>window.__game&&document.querySelector('#loading').hidden,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>!!window.__game.scene.getObjectByName('kairo-ferris-wheel')),false);await page.close();
} finally {await writeFile(`${out}/results.json`,JSON.stringify(records,null,2));await browser.close();}
console.log(JSON.stringify(records.map(({mobile,state,errors})=>({mobile,meshes:state.meshes,triangles:state.triangles,clearance:state.roadClearance,errors})),null,2));
