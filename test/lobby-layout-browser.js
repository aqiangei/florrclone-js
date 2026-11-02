'use strict';
const {createServer}=require('../server/server');
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/lobby-layout-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
  try{
    const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const res=await ctx.request.post(base+'/api/account/register',{data:{username:'lobby_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});
    assert.equal(res.status(),200);
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'networkidle'});
    const prompt=page.locator('.ash-display-prompt');
    await prompt.getByRole('button',{name:'Landscape game',exact:true}).waitFor();
    assert.equal(await prompt.getByRole('button',{name:'Enter fullscreen'}).count(),0);
    for(const [width,height] of [[844,390],[740,320],[915,412],[390,844]]){
      await page.setViewportSize({width,height});
      await page.waitForFunction(()=>{
        const shell=document.querySelector('.game-shell.is-lobby');
        if(!shell)return false;
        const scale=parseFloat(getComputedStyle(shell).getPropertyValue('--lobby-scale'));
        return Number.isFinite(scale)&&scale>0&&scale<=.7;
      },null,{timeout:5000});
      await page.waitForTimeout(200);
      const info=await page.evaluate(()=>{
        const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,top:r.top,bottom:r.bottom};};
        const shell=document.querySelector('.game-shell');
        return{
          ready:box(document.querySelector('.play-button')),
          biome:box(document.querySelector('.biome-picker')),
          credits:box(document.querySelector('.credits-button')),
          brand:box(document.querySelector('.brand')),
          prompt:box(document.querySelector('.ash-display-prompt')),
          shell:box(shell),
          scale:getComputedStyle(shell).getPropertyValue('--lobby-scale').trim(),
          zoom:getComputedStyle(shell).getPropertyValue('--ash-lobby-zoom').trim(),
          view:{w:innerWidth,h:innerHeight}
        };
      });
      const within=r=>r&&r.top>=-2&&r.bottom<=height+2;
      assert.ok(info.ready&&info.ready.h>12,JSON.stringify({width,height,info}));
      assert.ok(within(info.ready),JSON.stringify({width,height,part:'ready',info}));
      assert.ok(within(info.brand),JSON.stringify({width,height,part:'brand',info}));
      if(info.biome)assert.ok(within(info.biome),JSON.stringify({width,height,part:'biome',info}));
      if(info.credits)assert.ok(within(info.credits),JSON.stringify({width,height,part:'credits',info}));
      assert.ok(info.prompt&&within(info.prompt),JSON.stringify({width,height,part:'prompt',info}));
      assert.ok(info.shell.h<=height+1&&info.shell.w<=width+1,JSON.stringify({width,height,info}));
      await page.screenshot({path:`test-results/lobby-layout-${width}x${height}.png`});
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,errors},null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
