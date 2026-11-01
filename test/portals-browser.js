'use strict';
const {chromium}=require('playwright'),{createServer}=require('../server/server'),{BUNDLE}=require('../server/engine');
const crypto=require('node:crypto'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});const app=createServer({dbPath:'test-results/portal-browser-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`,browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    const registered=await context.request.post(base+'/api/account/register',{data:{username:'portal_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});assert.equal(registered.status(),200);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/'+BUNDLE,async route=>{const response=await route.fetch();const body=(await response.text()).replace('connect(){this.disposed||this.connection.connect()}','connect(){globalThis.__observedEngine=this;this.disposed||this.connection.connect()}');await route.fulfill({response,body});});
    await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing');
    await page.waitForTimeout(1600);
    const c=[...app.clients.values()][0],inventory=JSON.stringify(c.engine.save.inventory);
    async function walkInto(to){
      const e=c.engine,portal=app.api.portals(e.save.biome,e.width,e.height).find(p=>p.to===to);assert.ok(portal);
      let approach;
      for(const [dx,dy,key]of [[1,0,'a'],[-1,0,'d'],[0,1,'w'],[0,-1,'s']]){
        const start=e.geometry.projectInside(portal.x+dx*110,portal.y+dy*110,e.radius),end=e.geometry.moveCircle(start.x,start.y,-dx*70,-dy*70,e.radius);
        if(Math.hypot(start.x-portal.x,start.y-portal.y)>75&&Math.hypot(end.x-portal.x,end.y-portal.y)<60){approach={...start,key};break;}
      }
      assert.ok(approach);e.x=approach.x;e.y=approach.y;e.input={x:0,y:0};e.moveVX=e.moveVY=e.pushX=e.pushY=0;e.invuln=100;e.spawnTimer=-10000;
      await page.waitForFunction(p=>{const s=globalThis.__observedEngine?.target?.self;return s&&Math.hypot(s.x-p.x,s.y-p.y)<20;},approach);
      await page.keyboard.down(approach.key);
      try{await page.waitForFunction(to=>globalThis.__observedEngine?.target?.map.biome===to,to,{timeout:15000});}
      catch(error){console.log(JSON.stringify({to,portal,approach,server:{x:e.x,y:e.y,input:e.input,state:e.state,biome:e.save.biome,cooldown:e.portalCooldown},client:await page.evaluate(()=>({x:globalThis.__observedEngine.x,y:globalThis.__observedEngine.y,input:globalThis.__observedEngine.input,status:globalThis.__observedEngine.connectionStatus}))}));await page.screenshot({path:'test-results/portal-failure.png'});throw error;}
      finally{await page.keyboard.up(approach.key);}
      assert.equal(c.engine.save.biome,to);assert.equal(c.engine.state,'playing');assert.equal(c.room.id,'adventure:'+to);assert.equal(JSON.stringify(c.engine.save.inventory),inventory);
    }
    await walkInto('Ant Hell');await page.waitForTimeout(500);await page.screenshot({path:'test-results/ant-hell-entered.png'});
    await page.waitForTimeout(1600);await walkInto('Garden');assert.deepEqual(errors,[]);
    const report={ok:true,entered:'Ant Hell',returned:'Garden',trigger:'keyboard movement through authored portals',inventoryPreserved:true,connectionStatus:await page.evaluate(()=>globalThis.__observedEngine.connectionStatus),errors};
    fs.writeFileSync('test-results/portal-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
