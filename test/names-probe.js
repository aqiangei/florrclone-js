const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
(async()=>{
  const base='http://127.0.0.1:8788';
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const ctxA=await browser.newContext(), ctxB=await browser.newContext();
  async function play(ctx,name){
    const u='n'+crypto.randomBytes(3).toString('hex');
    const res=await ctx.request.post(base+'/api/account/register',{data:{username:u,password:crypto.randomBytes(12).toString('hex')}});
    assert.equal(res.status(),200);
    const page=await ctx.newPage();
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing' || document.querySelector('.game-shell:not(.is-lobby)'));
    await page.waitForTimeout(800);
    // try set observed engine if helper exists
    const info=await page.evaluate(()=>{
      const eng=globalThis.__observedEngine || window.__engine;
      // find renderer remote players via react internals is hard; inspect canvas text via engine
      const e=document.querySelector('canvas.world-canvas');
      return {
        hasCanvas:!!e,
        remote: eng?.remotePlayers?.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y})) ?? null,
        selfName: eng?.save?.name ?? null,
        state: eng?.state ?? null,
      };
    });
    return {page,info,u};
  }
  // inject observe hook by evaluating after load - check if __observedEngine exists from tests
  const a=await play(ctxA,'A');
  const b=await play(ctxB,'B');
  await new Promise(r=>setTimeout(r,1500));
  const a2=await a.page.evaluate(()=>{
    // crawl for remotePlayers on any object hanging off canvas/game
    const out=[];
    const seen=new Set();
    function walk(o,depth){
      if(!o||typeof o!=='object'||depth>4||seen.has(o))return; seen.add(o);
      if(Array.isArray(o.remotePlayers)) out.push(o.remotePlayers.map(p=>({name:p.name,id:p.id,x:p.x,y:p.y,dead:p.dead})));
      for(const k of Object.keys(o)) { try{ walk(o[k],depth+1);}catch{} }
    }
    // try common globals
    for(const k of Object.keys(window)){ if(/engine|game|render/i.test(k)) try{walk(window[k],0);}catch{} }
    return {out:out.slice(0,5), keys:Object.keys(window).filter(k=>/engine|game|florr|ash/i.test(k)).slice(0,30)};
  });
  console.log('A first', JSON.stringify(a.info));
  console.log('B first', JSON.stringify(b.info));
  console.log('A crawl', JSON.stringify(a2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
