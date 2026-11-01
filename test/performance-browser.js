'use strict';
const {createServer}=require('../server/server'),{BUNDLE}=require('../server/engine'),Wire=require('../server/wire');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{
  const app=createServer({dbPath:'test-results/performance-browser-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`,browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
  try{
    for(const mobile of [false,true]){
      const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
      try{
        const response=await context.request.post(base+'/api/account/register',{data:{username:'perf_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});
        assert.equal(response.status(),200);const account=await response.json(),page=await context.newPage(),errors=[],frames=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('websocket',ws=>{const decoder=new Wire.Decoder();ws.on('framereceived',f=>{try{if(typeof f.payload!=='string')frames.push(decoder.decode(f.payload));}catch(e){errors.push(e.message);}});});
        await page.route('**/'+BUNDLE,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('connect(){this.disposed||this.connection.connect()}','connect(){globalThis.__observedEngine=this;this.disposed||this.connection.connect()}')});});
        await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing');
        const c=app.clients.get(account.account.id);c.room.mobs=[];app.world.bind(c);c.engine.spawnTimer=-10000;c.engine.invuln=100;
        await page.bringToFront();await page.waitForTimeout(1500);const start={x:c.engine.x,y:c.engine.y};
        if(mobile){
          const stick=page.getByLabel('Movement joystick');await stick.waitFor();const r=await stick.boundingBox(),session=await context.newCDPSession(page),center={x:r.x+r.width/2,y:r.y+r.height/2};
          await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...center,id:1}]});
          await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+40,y:center.y,id:1}]});await page.waitForTimeout(400);
          await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(150);
          assert.equal(c.engine.input.x,0);assert.equal(c.engine.input.y,0);
        }else{await page.keyboard.down('d');await page.waitForTimeout(400);await page.keyboard.up('d');}
        assert.ok(Math.hypot(c.engine.x-start.x,c.engine.y-start.y)>5,JSON.stringify({mobile,start,end:{x:c.engine.x,y:c.engine.y},input:c.engine.input,state:c.engine.state,ack:c.inputAck}));
        const framesBefore=frames.length;
        const render=await page.evaluate(()=>new Promise(resolve=>{
          const samples=[],start=performance.now();let last;
          function sample(now){const e=globalThis.__observedEngine,p=e.petals[0],at={x:p.x-e.x,y:p.y-e.y};if(last)samples.push({dt:now-last.at,moved:Math.hypot(at.x-last.x,at.y-last.y)>.001});last={...at,at:now};
            if(now-start<2000)requestAnimationFrame(sample);else resolve({frames:samples.length,movingFraction:samples.filter(s=>s.moved).length/samples.length,frameMsP95:samples.map(s=>s.dt).sort((a,b)=>a-b)[Math.floor(samples.length*.95)]});}requestAnimationFrame(sample);
        }));
        assert.ok(render.movingFraction>.85,JSON.stringify(render));assert.ok(frames.length-framesBefore>=25);assert.ok(frames.every(f=>f.rates.hz===30&&f.rates.snapshotHz===20));
        const original=c.engine;c.ws.terminate();await page.waitForFunction(()=>globalThis.__observedEngine?.connectionStatus==='reconnecting');
        await page.waitForFunction(()=>globalThis.__observedEngine?.connectionStatus==='online'&&globalThis.__observedEngine.state==='playing',null,{timeout:10000});
        assert.equal(app.clients.get(c.id).engine,original);assert.equal(original.state,'playing');assert.deepEqual(errors,[]);
        await page.evaluate(()=>globalThis.__observedEngine.sendCommand({type:'lobby'}));
        results.push({mobile,protocol:Wire.PROTOCOL,touchCancel:mobile?true:undefined,resumedFight:true,render,errors});
      }finally{await context.close();}
    }
    const report={ok:true,results};fs.writeFileSync('test-results/performance-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
