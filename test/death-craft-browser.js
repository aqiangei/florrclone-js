'use strict';
const {createServer}=require('../server/server'),{chromium}=require('playwright');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');

function forceDead(client){
  const e=client.engine;
  e.invuln=0;
  e.undead=0;
  e.undeadPending=false;
  e.undeadTime=0;
  e.secondChanceCd=1e9;
  e.reviveCharges=0;
  e.hp=0;
  e.state='dead';
  e.deathAt=e.time;
  e.lastDamageSource=e.lastDamageSource||'Test Hornet';
  if(!client.events.includes('dead'))client.events.push('dead');
}

(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/death-craft-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const errors=[];
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const user='dc_'+crypto.randomBytes(4).toString('hex');
    const pass=crypto.randomBytes(12).toString('hex');
    const res=await ctx.request.post(base+'/api/account/register',{data:{username:user,password:pass}});
    assert.equal(res.status(),200,await res.text());
    const account=await res.json();
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Ready',exact:true}).waitFor({timeout:60000});
    await page.waitForTimeout(1200);
    let c=app.clients.get(account.account.id);
    for(let i=0;i<50&&!c;i++){await page.waitForTimeout(100);c=app.clients.get(account.account.id);}
    assert.ok(c,'online client missing after register+goto');
    c.room.mobs.length=0;
    c.engine.save.inventory['Rose:0']=20;
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.waitForTimeout(1700);
    assert.equal(c.engine.state,'playing');
    c.engine.sessionCollected={'Rose:0':3};
    c.engine.sessionMobKills={'Hornet:0':2};
    await page.keyboard.press('c');
    await page.locator('.craft-panel:not([inert])').waitFor({timeout:5000});
    forceDead(c);
    // Closed panels stay mounted with [inert]; wait until no live craft panel blocks Continue.
    await page.waitForFunction(()=>!document.querySelector('.craft-panel:not([inert])'),null,{timeout:8000});
    assert.equal(c.engine.state,'dead');
    const continueBtn=page.getByRole('button',{name:'Continue',exact:true});
    await continueBtn.waitFor({timeout:5000});
    const box=await continueBtn.boundingBox();
    assert.ok(box&&box.width>0&&box.height>0,JSON.stringify(box));
    const hit=await page.evaluate(({x,y})=>{
      const el=document.elementFromPoint(x,y);
      return {
        tag:el?.tagName,
        cls:String(el?.className||''),
        inSummary:!!el?.closest?.('.ash-death-summary'),
        inLiveCraft:!!el?.closest?.('.craft-panel:not([inert])')
      };
    },{x:box.x+box.width/2,y:box.y+box.height/2});
    assert.equal(hit.inSummary,false,JSON.stringify(hit));
    assert.equal(hit.inLiveCraft,false,JSON.stringify(hit));
    await continueBtn.click();
    await page.waitForTimeout(1000);
    assert.equal(c.engine.state,'playing');
    await page.screenshot({path:'test-results/death-craft-mobile.png'});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,craftClosedOnDeath:true,continueClickable:true,respawned:true,hit},null,2));
  }catch(e){
    try{
      const pages=browser.contexts()[0]?.pages()??[];
      if(pages[0]){
        const info=await pages[0].evaluate(()=>({
          liveCraft:!!document.querySelector('.craft-panel:not([inert])'),
          anyCraft:!!document.querySelector('.craft-panel'),
          death:!!document.querySelector('.death-dialog, [aria-label="Death controls"]'),
          summary:!!document.querySelector('.ash-death-summary'),
          continue:!![...document.querySelectorAll('button')].some(b=>b.textContent==='Continue')
        }));
        console.error('diagnostics',info);
        await pages[0].screenshot({path:'test-results/death-craft-fail.png',fullPage:true});
      }
    }catch(err){console.error('diag failed',err);}
    throw e;
  }finally{
    await browser.close();
    await app.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
