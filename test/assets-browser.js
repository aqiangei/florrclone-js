'use strict';
const {createServer}=require('../server/server'),{BUNDLE}=require('../server/engine'),{chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const app=createServer({dbPath:'test-results/assets-browser-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage(),errors=[];let manifestFailures=0,imageFailures=0;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/'+BUNDLE,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+';globalThis.__assetProbe={load:gn,get:key=>on[key]};'});});
    await page.route('**/assets/manifest.json',async route=>{if(manifestFailures++===0)return route.abort();await route.continue();});
    await page.route('**/assets/wiki-petals/orange-audit10.png',async route=>{if(imageFailures++===0)return route.abort();await new Promise(r=>setTimeout(r,500));await route.continue();});
    await page.goto(`http://127.0.0.1:${app.server.address().port}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>globalThis.__assetProbe);
    await page.evaluate(()=>__assetProbe.load(['Flower','Orange','Yin Yang','Coral','Cutter','Lightning','Magic Missile']));
    const pixels=await page.evaluate(()=>Object.fromEntries(['Flower','Orange','Yin Yang','Coral','Cutter','Lightning','Magic Missile'].map(key=>{const sprite=__assetProbe.get(key);if(!sprite)return[key,0];const data=sprite.canvas.getContext('2d').getImageData(0,0,sprite.width,sprite.height).data;let visible=0;for(let i=3;i<data.length;i+=4)if(data[i]>0)visible++;return[key,visible];})));
    for(const [key,count]of Object.entries(pixels))assert.ok(count>100,`${key} must recover actual visible pixels`);
    assert.ok(manifestFailures>=2);assert.ok(imageFailures>=2);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,manifestRecovered:true,firstImageFailureRecovered:true,pixels,errors}));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
