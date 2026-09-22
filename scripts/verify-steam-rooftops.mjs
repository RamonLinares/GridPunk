import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'artifacts/steam-rooftops'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (const circuit of ['steam', 'neon-steam']) {
    await page.goto(`http://127.0.0.1:5198/?circuit=${circuit}&car=k89&hq&go`);
    await page.waitForFunction(() => window.__game && window.__THREE_GAME_DIAGNOSTICS__?.started, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.loop.stop());
    for (const at of circuit === 'steam' ? [.182,.64] : [.12,.58]) {
      await page.evaluate(at => {
        const g = window.__game; g.car.resetAt(Math.round(at*g.spline.count),0); g.cameraRig.snap(g.car);
        g.environment.update(g.car.physics.position,60); g.environment.updateShadows(); for(let n=0;n<3;n++)g.render();
      }, at);
      await page.screenshot({ path: `${out}/${circuit}-${at}.png` });
    }
  }
  const contacts = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { createSteamMaterials } = await import('/src/game/SteamMaterials.ts');
    const { createSteamBuildingKit } = await import('/src/game/SteamBuildings.ts');
    const m = createSteamMaterials(), geometry = { box:new THREE.BoxGeometry(1,1,1), cylinder:new THREE.CylinderGeometry(1,1,1,12), sphere:new THREE.SphereGeometry(1,20,12), cone:new THREE.ConeGeometry(1,1,12), ring:new THREE.TorusGeometry(1,.08,6,32) };
    const kit = createSteamBuildingKit(m,geometry), contacts=[];
    for(const style of [3,5])for(const width of [16,22,28])for(const height of [17,29,42]) {
      const group = new THREE.Group(), roofs=[],legs=[];let tank;
      kit.build((geo,mat,x,y,z,w,h,d,rotation=[0,0,0])=>{
        const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.rotation.set(...rotation);group.add(mesh);
        if(geo===geometry.box&&((style===5&&mat===m.roof&&h===.45)||(style===3&&mat===m.slate&&h===.6)))roofs.push(mesh);
        if(geo===geometry.box&&mat===m.iron&&w===.32&&d===.32)legs.push(mesh);
        if(geo===geometry.cylinder&&mat===m.copper&&h===5&&w===3.1)tank=mesh;
      },width,20,height,style,true);
      group.updateMatrixWorld(true);
      for(const leg of legs){
        const ray = new THREE.Raycaster(new THREE.Vector3(leg.position.x,height+100,leg.position.z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObjects(roofs)[0];
        contacts.push({style,width,height,roof:hit?.point.y,foot:leg.position.y-leg.scale.y/2,top:leg.position.y+leg.scale.y/2,tankBottom:tank.position.y-tank.scale.y/2});
      }
      if(style===5&&width===22&&height===29){
        const scene=new THREE.Scene();scene.background=new THREE.Color(0x899697);scene.add(group);
        scene.add(new THREE.HemisphereLight(0xffffff,0x555555,2));const sun=new THREE.DirectionalLight(0xffe1bb,3);sun.position.set(-20,60,25);scene.add(sun);
        const camera=new THREE.PerspectiveCamera(40,1440/900,.1,300);camera.position.set(32,42,37);camera.lookAt(4,34,0);
        window.__roofPreview={scene,camera};
      }
    }
    const g=window.__game;g.renderer.render(window.__roofPreview.scene,window.__roofPreview.camera);
    return contacts;
  });
  assert.equal(contacts.length,72);
  for(const c of contacts){assert.ok(Number.isFinite(c.roof));assert.ok(c.foot<=c.roof&&c.roof-c.foot<.3,JSON.stringify(c));assert.ok(c.top>=c.tankBottom);}
  await page.screenshot({path:`${out}/mill-roof-contact.png`});
  assert.deepEqual(errors,[]);results.push({contacts:contacts.length,maximumEmbed:Math.max(...contacts.map(c=>c.roof-c.foot)),circuits:['steam','neon-steam'],errors});
  await writeFile(`${out}/verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally { await browser.close(); }
