'use strict';
const {createServer}=require('../server/server'),{chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/display-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
  try{
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const guest=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const guestPage=await guest.newPage();await guestPage.goto(base,{waitUntil:'networkidle'});
    await guestPage.locator('.ash-display-prompt').getByRole('button',{name:'Landscape game',exact:true}).waitFor();
    await guest.close();
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const res=await ctx.request.post(base+'/api/account/register',{data:{username:'display_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});
    assert.equal(res.status(),200);
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'关闭公告',exact:true}).click();
    const prompt=page.locator('.ash-display-prompt');
    await prompt.getByRole('button',{name:'Landscape game',exact:true}).waitFor();
    assert.equal(await prompt.locator('button').count(),1);
    assert.equal(await prompt.getByRole('button',{name:'Enter fullscreen'}).count(),0);
    assert.equal(await prompt.locator('button').first().evaluate(e=>getComputedStyle(e).animationName),'ash-display-pulse');
    await page.screenshot({path:'test-results/display-lobby.png'});
    // Real Chromium Fullscreen API via the single Landscape game action.
    await prompt.getByRole('button',{name:'Landscape game',exact:true}).click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    const settings=page.getByRole('dialog',{name:'Settings',exact:true});
    await settings.locator('.ash-display-settings').getByRole('button',{name:'Exit fullscreen',exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
    await settings.getByRole('button',{name:'Graphics',exact:true}).click();
    await settings.locator('.ash-display-settings').getByRole('button',{name:'Landscape game',exact:true}).click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    await settings.locator('.ash-display-settings').getByRole('button',{name:'Exit fullscreen',exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
    await page.screenshot({path:'test-results/display-settings.png'});
    await settings.getByRole('button',{name:'Close Settings',exact:true}).click();
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    await page.locator('.touch-pad').waitFor();
    await page.evaluate(()=>{
      window.displayTrace=[];
      for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,()=>window.displayTrace.push([name,!!document.fullscreenElement]));
      const native=document.documentElement.requestFullscreen;
      document.documentElement.requestFullscreen=function(...args){window.displayTrace.push(['request',new Error().stack]);return native.apply(this,args);};
    });
    // Explicit exit stays exited; resize and gameplay do not force re-entry.
    await page.evaluate(()=>document.exitFullscreen());
    await page.waitForFunction(()=>!document.fullscreenElement);
    await page.setViewportSize({width:844,height:390});
    await page.locator('.touch-stick').tap();
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,JSON.stringify(await page.evaluate(()=>window.displayTrace)));
    // Refusals remain actionable, including the existing window header action.
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new Error('blocked'));});
    await settings.getByRole('button',{name:'Fullscreen landscape',exact:true}).click();
    await settings.locator('.ash-display-settings').getByRole('status').getByText('Fullscreen was blocked. Tap Landscape game to retry.',{exact:true}).waitFor();
    await settings.locator('.ash-display-settings').getByRole('button',{name:'Landscape game',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,realFullscreen:true,settingsAcrossTabs:true,readyEntersFullscreen:true,manualExitRespected:true,rejectionVisible:true,singleLandscapeButton:true,errors}));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
