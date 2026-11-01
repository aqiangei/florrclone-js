'use strict';
const {createServer}=require('../server/server'),{BUNDLE}=require('../server/engine'),Wire=require('../server/wire');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});const app=createServer({dbPath:'test-results/loot-browser-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'}),base=`http://127.0.0.1:${app.server.address().port}`,results=[];
  try{
    for(const mobile of [false,true]){
      const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
      try{
        const response=await context.request.post(base+'/api/account/register',{data:{username:'loot_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});
        assert.equal(response.status(),200);const account=await response.json(),page=await context.newPage(),errors=[];let snapshots=0,maxVisible=0,closes=0;
        page.on('pageerror',e=>errors.push(e.message));
        page.on('websocket',ws=>{const decoder=new Wire.Decoder();ws.on('close',()=>closes++);ws.on('framereceived',f=>{try{if(typeof f.payload!=='string'){const s=decoder.decode(f.payload);snapshots++;maxVisible=Math.max(maxVisible,s.self.drops.length);}}catch(e){errors.push(e.message);}});});
        await page.route('**/'+BUNDLE,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('connect(){this.disposed||this.connection.connect()}','connect(){globalThis.__observedEngine=this;this.disposed||this.connection.connect()}')});});
        await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing');
        await page.bringToFront();await page.waitForTimeout(1200);
        const c=app.clients.get(account.account.id),e=c.engine;c.room.mobs=[];app.world.bind(c);e.spawnTimer=-10000;e.invuln=10000;e.rng=()=>.25;
        const start={x:e.x,y:e.y};
        for(let i=0;i<20000;i++){const d={id:app.world.nextId++,x:e.x+400+(i%100)*.1,y:e.y-100+Math.floor(i/100),type:'Basic',rarity:i%8,life:120,ownerId:c.id};c.room.drops.push(d);e.onDropCreated(d);}
        const beforeKills=e.sessionKills;
        for(let i=0;i<200;i++)e.addMob('Rock',e.x+400+i%10,e.y+Math.floor(i/10),4);
        const at=performance.now();for(const m of [...c.room.mobs]){m.lastHitBy=c.id;e.kill(m);}const killBurstMs=performance.now()-at;
        assert.equal(e.sessionKills-beforeKills,200);const drops=c.room.drops.length;assert.ok(drops>=20200);
        await page.waitForFunction(()=>globalThis.__observedEngine?.drops.length===256);
        const before=snapshots;
        const render=await page.evaluate(()=>new Promise(resolve=>{
          const start=performance.now(),times=[];let last;
          function frame(now){if(last!==undefined)times.push(now-last);last=now;if(now-start<2500)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);resolve({frames:times.length,frameMsP95:times[Math.floor(times.length*.95)],frameMsMax:times.at(-1),visibleDrops:globalThis.__observedEngine.drops.length,state:globalThis.__observedEngine.state,status:globalThis.__observedEngine.connectionStatus});}}
          requestAnimationFrame(frame);
        }));
        assert.equal(render.state,'playing');assert.equal(render.status,'online');assert.equal(c.engine,e);assert.equal(e.x,start.x);assert.equal(e.y,start.y);assert.equal(c.room.drops.length,drops);
        assert.equal(maxVisible,256);assert.ok(snapshots-before>=30);assert.equal(app.stats.snapshotErrors,0);assert.equal(closes,0);assert.deepEqual(errors,[]);
        const health=await(await fetch(base+'/api/health')).json();
        results.push({mobile,groundDrops:drops,killBurst:200,killBurstMs,snapshots:snapshots-before,maxVisible,render,tickMsP95:health.tickMsP95,snapshotMsP95:health.snapshotMsP95,snapshotErrors:health.snapshotErrors,connectionCloses:closes,errors});
        await page.evaluate(()=>globalThis.__observedEngine.sendCommand({type:'lobby'}));await page.waitForTimeout(100);
      }finally{await context.close();}
    }
    const report={ok:true,results};fs.writeFileSync('test-results/loot-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
