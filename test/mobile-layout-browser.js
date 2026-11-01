'use strict';
const {createServer}=require('../server/server');
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/mobile-layout-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const res=await ctx.request.post(base+'/api/account/register',{data:{username:'mobile_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});
    assert.equal(res.status(),200);const account=await res.json();
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.locator('.touch-pad').waitFor();
    await page.getByRole('button',{name:'关闭公告',exact:true}).click();
    await page.waitForTimeout(1500);
    const client=app.clients.get(account.account.id);client.engine.invuln=100000;
    const results=[];
    for(const [width,height] of [[390,844],[844,390],[740,320],[915,412],[320,568],[390,844]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(600);
      const boxes=await page.evaluate(()=>Object.fromEntries(['.touch-stick','.touch-actions','.loadout','.player-hud','.side-actions'].map(s=>{
        const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height}];
      })));
      for(const [name,r] of Object.entries(boxes))assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1,JSON.stringify({width,height,name,r}));
      const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
      assert.ok(!overlap(boxes['.touch-stick'],boxes['.touch-actions']),JSON.stringify(boxes));
      assert.ok(!overlap(boxes['.loadout'],boxes['.touch-actions']),JSON.stringify(boxes));
      assert.ok(!overlap(boxes['.side-actions'],boxes['.touch-stick']),JSON.stringify(boxes));
      assert.ok(!overlap(boxes['.side-actions'],boxes['.loadout']),JSON.stringify(boxes));
      assert.ok(boxes['.loadout'].width<=width-100,JSON.stringify(boxes));
      // Interest radius is sent from the same effective zoom used to draw.
      const expected=Math.max(800,Math.hypot(width,height)/(2*Math.min(1,Math.min(width,height)/720)));
      assert.ok(Math.abs(client.viewRadius-expected)<3,JSON.stringify({width,height,actual:client.viewRadius,expected}));
      await page.screenshot({path:`test-results/mobile-layout-${width}x${height}.png`});
      results.push({width,height,boxes});
    }
    const stick=await page.getByLabel('Movement joystick').boundingBox(),session=await ctx.newCDPSession(page);
    const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y,id:1}]});
    await page.waitForTimeout(200);assert.ok(client.engine.input.x>.95);
    const knob=await page.locator('.touch-knob').boundingBox();assert.ok(knob.x+knob.width<=stick.x+stick.width+1);
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await page.waitForTimeout(150);assert.equal(client.engine.input.x,0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,results,errors},null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
