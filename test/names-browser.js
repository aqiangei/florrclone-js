'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createServer}=require('../server/server');
const {BUNDLE}=require('../server/engine');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-names-')),app=createServer({dbPath:path.join(dir,'db.json')});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  async function join(label){
    const ctx=await browser.newContext({viewport:{width:1280,height:800}});
    const user='nm_'+crypto.randomBytes(3).toString('hex');
    assert.equal((await ctx.request.post(base+'/api/account/register',{data:{username:user,password:crypto.randomBytes(12).toString('hex')}})).status(),200);
    const page=await ctx.newPage();
    await page.addInitScript(()=>{
      const orig=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...rest){
        (globalThis.__drawnTexts??=[]).push(String(text));
        return orig.call(this,text,...rest);
      };
    });
    await page.route('**/'+BUNDLE,async route=>{
      const response=await route.fetch();
      let body=await response.text();
      body=body.replace('connect(){this.disposed||this.connection.connect()}','connect(){globalThis.__observedEngine=this;this.disposed||this.connection.connect()}');
      await route.fulfill({response,body});
    });
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing');
    const client=[...app.clients.values()].find(c=>c.account?.username===user);
    assert.ok(client);
    client.engine.save.name=label;
    client.engine.x=9600;client.engine.y=11300;
    return {page,ctx,user,client,label};
  }
  try{
    const a=await join('Alice'),b=await join('Bob');
    a.client.engine.x=b.client.engine.x=9600;
    a.client.engine.y=b.client.engine.y=11300;
    await a.page.waitForFunction(()=>globalThis.__observedEngine?.remotePlayers?.some(p=>p.name==='Bob'),null,{timeout:8000});
    await b.page.waitForFunction(()=>globalThis.__observedEngine?.remotePlayers?.some(p=>p.name==='Alice'),null,{timeout:8000});
    await a.page.evaluate(()=>{globalThis.__drawnTexts=[];});
    await b.page.evaluate(()=>{globalThis.__drawnTexts=[];});
    await a.page.waitForTimeout(700);
    await b.page.waitForTimeout(700);
    const aState=await a.page.evaluate(()=>({
      remotes:globalThis.__observedEngine.remotePlayers.map(p=>({name:p.name,x:p.x,y:p.y})),
      self:globalThis.__observedEngine.save.name,
      texts:(globalThis.__drawnTexts??[]).filter(t=>/Alice|Bob|Player/.test(t)),
    }));
    const bState=await b.page.evaluate(()=>({
      remotes:globalThis.__observedEngine.remotePlayers.map(p=>({name:p.name,x:p.x,y:p.y})),
      self:globalThis.__observedEngine.save.name,
      texts:(globalThis.__drawnTexts??[]).filter(t=>/Alice|Bob|Player/.test(t)),
    }));
    console.log(JSON.stringify({aState,bState},null,2));
    await a.page.screenshot({path:'test-results/names-Alice.png'});
    await b.page.screenshot({path:'test-results/names-Bob.png'});
    assert.ok(aState.remotes.some(p=>p.name==='Bob'));
    assert.ok(bState.remotes.some(p=>p.name==='Alice'));
    assert.ok(aState.texts.includes('Bob')||aState.texts.includes('Alice'),'Alice canvas missing names: '+JSON.stringify(aState.texts));
    assert.ok(bState.texts.includes('Alice')||bState.texts.includes('Bob'),'Bob canvas missing names: '+JSON.stringify(bState.texts));
    // Minimap is a separate 512 canvas; count Bob/Alice draws beyond the world plate.
    const minimapHits=await a.page.evaluate(()=>{
      const canvases=[...document.querySelectorAll('.minimap-wrap canvas, button.minimap-wrap canvas')];
      return {count:canvases.length, texts:(globalThis.__drawnTexts??[]).filter(t=>t==='Alice'||t==='Bob').length};
    });
    assert.ok(minimapHits.texts>=4,'expected world+minimap name draws, got '+minimapHits.texts);
    console.log('NAMES_OK', minimapHits);
  }finally{
    await browser.close();await app.close();fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exit(1);});
