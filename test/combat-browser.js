'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{createServer}=require('../server/server'),{BUNDLE}=require('../server/engine');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/combat-browser-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'}),base=`http://127.0.0.1:${app.server.address().port}`;
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    const auth=await context.request.post(base+'/api/account/register',{data:{username:'fight_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});assert.equal(auth.status(),200);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    let baseline=true;
    await page.route('**/'+BUNDLE,async route=>{
      const response=await route.fetch();let body=baseline?fs.readFileSync(path.join(__dirname,'../florr-local-site',BUNDLE),'utf8'):await response.text();
      // Test-only observation; no gameplay or timing code is replaced.
      body=body.replace('connect(){this.disposed||this.connection.connect()}', 'connect(){globalThis.__observedEngine=this;this.disposed||this.connection.connect()}');
      await route.fulfill({response,body});
    });
    async function start(){
      // Each comparison deliberately starts a new life; transport-resume is
      // covered separately and would otherwise skip the Ready screen on reload.
      for(const c of app.clients.values())c.engine.state='lobby';
      await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).click();
      await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing');
      const c=[...app.clients.values()][0];c.room.mobs=[];app.world.bind(c);c.engine.spawnTimer=-100000;
      await page.waitForTimeout(700);return c;
    }
    async function measure(){return page.evaluate(()=>new Promise(resolve=>{
      const samples=[],start=performance.now();let previous;
      function frame(now){const e=globalThis.__observedEngine,p=e.petals[0],point={x:p.x-e.x,y:p.y-e.y};
        if(previous)samples.push({dt:now-previous.at,moved:Math.hypot(point.x-previous.x,point.y-previous.y)>.001});
        previous={...point,at:now};if(now-start<2000)requestAnimationFrame(frame);else resolve({frames:samples.length,changed:samples.filter(s=>s.moved).length,changeRatio:samples.filter(s=>s.moved).length/samples.length,rafMsP95:samples.map(s=>s.dt).sort((a,b)=>a-b)[Math.floor(samples.length*.95)]});
      }requestAnimationFrame(frame);
    }));}
    await start();const before=await measure();
    baseline=false;const c=await start(),after=await measure();
    assert.ok(after.changeRatio>.85,JSON.stringify(after));assert.ok(after.changeRatio>before.changeRatio+.25,JSON.stringify({before,after}));
    const e=c.engine;e.addMob('Rock',e.x+104,e.y,0);const mob=e.mobs.at(-1);mob.radius=30;mob.hp=mob.maxHp=1000;const id=mob.id;
    await page.keyboard.down(' ');
    await page.waitForFunction(id=>{const m=globalThis.__observedEngine.mobs.find(m=>m.id===id);return m&&m.hp<1000;},id,{timeout:10000});
    assert.equal(e.mode,'attack');assert.ok(mob.hp<1000);
    await page.waitForFunction(()=>globalThis.__observedEngine.particles.some(p=>p.text),null,{timeout:5000});
    const feedback=await page.evaluate(id=>({mobHp:globalThis.__observedEngine.mobs.find(m=>m.id===id)?.hp,numbers:globalThis.__observedEngine.particles.filter(p=>p.text).map(p=>p.text)}),id);
    await page.screenshot({path:'test-results/combat-feedback.png'});
    e.rng=()=>0;mob.hp=1;const kills=e.sessionKills,collected=Object.values(e.sessionCollected).reduce((n,v)=>n+v,0);
    for(let i=0;i<100&&e.sessionKills===kills;i++)await page.waitForTimeout(100);
    assert.ok(e.sessionKills>kills);assert.ok(c.room.drops.some(d=>d.ownerId===c.id)||Object.values(e.sessionCollected).reduce((n,v)=>n+v,0)>collected,'kill loot is owned or already collected');
    assert.deepEqual(errors,[]);
    const report={ok:true,before,after,feedback,kills:e.sessionKills,deathAck:c.room.deathSeq,errors};
    fs.writeFileSync('test-results/combat-motion-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
