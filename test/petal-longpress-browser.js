'use strict';
const {createServer}=require('../server/server'),{chromium}=require('playwright');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/petal-longpress-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const errors=[];
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const user='lp_'+crypto.randomBytes(4).toString('hex');
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
    assert.ok(c);
    c.room.mobs.length=0;
    c.engine.save.inventory['Rose:0']=20;
    c.engine.save.loadout=Array.from({length:c.engine.save.loadout.length},()=>null);
    c.engine.save.reserve=Array.from({length:c.engine.save.reserve.length},()=>null);
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.waitForTimeout(1700);
    assert.equal(c.engine.state,'playing');
    c.engine.invuln=100000;
    await page.keyboard.press('z');
    await page.waitForTimeout(700);
    const rose=page.locator('.inventory-native-ui button.petal-card, .inventory-panel:not([inert]) button.petal-card').first();
    await rose.waitFor({state:'visible',timeout:8000});
    await page.waitForFunction(()=>typeof window.ashArmPetalLongPress==='function',null,{timeout:5000});
    await rose.evaluate(async(el)=>{
      const r=el.getBoundingClientRect();
      const x=r.left+r.width/2,y=r.top+r.height/2;
      el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,composed:true,pointerType:'touch',pointerId:41,isPrimary:true,clientX:x,clientY:y,button:0,buttons:1}));
      await new Promise(r=>setTimeout(r,520));
      el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,composed:true,pointerType:'touch',pointerId:41,isPrimary:true,clientX:x,clientY:y,button:0,buttons:0}));
      el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0}));
    });
    await page.waitForTimeout(300);
    const diag=await page.evaluate(()=>({
      tip:!!document.querySelector('.petal-tooltip'),
      latch:!!window.ashPetalTipLatch,
      alt:!!window.ashAltMode,
      label:document.querySelector('.inventory-native-ui button.petal-card, .inventory-panel:not([inert]) button.petal-card')?.getAttribute('aria-label')
    }));
    assert.equal(diag.tip||diag.latch,true,JSON.stringify(diag));
    assert.equal(c.engine.save.loadout.filter(Boolean).length,0,JSON.stringify(c.engine.save.loadout));
    assert.ok((c.engine.save.inventory['Rose:0']??0)>=20);
    await page.screenshot({path:'test-results/petal-longpress-mobile.png'});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,tipVisible:!!diag.tip,latched:!!diag.latch,didNotEquip:true,diag},null,2));
  }catch(e){
    try{
      const pages=browser.contexts()[0]?.pages()??[];
      if(pages[0]){
        const info=await pages[0].evaluate(()=>({
          arm:typeof window.ashArmPetalLongPress,
          panels:[...document.querySelectorAll('.inventory-panel')].map(p=>({inert:p.hasAttribute('inert'),cards:p.querySelectorAll('button.petal-card').length})),
          tip:!!document.querySelector('.petal-tooltip'),
          latch:!!window.ashPetalTipLatch,
          errors:window.__ashErrors||null
        }));
        console.error('diagnostics',info);
        await pages[0].screenshot({path:'test-results/petal-longpress-fail.png',fullPage:true});
      }
    }catch(err){console.error('diag failed',err);}
    throw e;
  }finally{
    await browser.close();
    await app.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
