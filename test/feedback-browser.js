'use strict';
const {createServer}=require('../server/server'),{BUNDLE}=require('../server/engine'),{chromium,request}=require('playwright'),{WebSocket}=require('ws');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{
  const app=createServer({dbPath:'test-results/feedback-browser-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`,browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];let peer,peerContext;
  try{
    const context=await browser.newContext({viewport:{width:1280,height:800}}),response=await context.request.post(base+'/api/account/register',{data:{username:'art_'+crypto.randomBytes(4).toString('hex'),password:'art-browser-test-password'}}),account=await response.json(),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/'+BUNDLE,async route=>{const r=await route.fetch();let source=(await r.text()).replace('connect(){this.disposed||this.connection.connect()}','connect(){globalThis.__feedbackEngine=this;this.disposed||this.connection.connect()}');
      source+=';globalThis.__feedbackArt={square:0,web:0,guild:false};const feedbackSquare=ashDrawSquare;ashDrawSquare=(...args)=>{__feedbackArt.square++;return feedbackSquare(...args)};const feedbackWeb=Mx;Mx=(...args)=>{__feedbackArt.web++;return feedbackWeb(...args)};const feedbackNameplate=ashDrawPlayerNameplate;ashDrawPlayerNameplate=(ctx,p)=>{if(p.guildName)__feedbackArt.guild=true;return feedbackNameplate(ctx,p)};';await route.fulfill({response:r,body:source});});
    await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).waitFor();if(await page.locator('.ashflor-announce button').count())await page.locator('.ashflor-announce button').click();await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForFunction(()=>globalThis.__feedbackEngine?.state==='playing');
    const c=app.clients.get(account.account.id),e=c.engine;e.invuln=100000;e.spawnTimer=-10000;c.room.mobs=[];app.world.bind(c);
    const zoomBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('petal-garden-settings')||'{}').zoom??1);
    await page.mouse.move(1000,400);await page.mouse.wheel(0,120);
    await page.waitForFunction(before=>(JSON.parse(localStorage.getItem('petal-garden-settings')||'{}').zoom??1)<before,zoomBefore,{timeout:5000});
    await page.mouse.wheel(0,-120);await page.waitForFunction(before=>Math.abs((JSON.parse(localStorage.getItem('petal-garden-settings')||'{}').zoom??1)-before)<.001,zoomBefore);
    peerContext=await request.newContext();const peerResponse=await peerContext.post(base+'/api/account/register',{data:{username:'peer_'+crypto.randomBytes(4).toString('hex'),password:'art-browser-test-password'}}),peerAccount=await peerResponse.json(),cookie=(await peerContext.storageState()).cookies.map(c=>`${c.name}=${c.value}`).join('; ');
    peer=new WebSocket(base.replace('http','ws')+'/ws',{headers:{Cookie:cookie,Origin:base}});peer.on('message',()=>{});await new Promise((r,j)=>{peer.once('open',r);peer.once('error',j)});peer.send(JSON.stringify({type:'start'}));await page.waitForTimeout(150);
    const p=app.clients.get(peerAccount.account.id);p.engine.invuln=100000;p.engine.spawnTimer=-10000;p.engine.x=e.x+160;p.engine.y=e.y;
    const guild='测试'+crypto.randomBytes(3).toString('hex');await context.request.post(base+'/api/guild/create',{data:{name:guild}});await context.request.post(base+'/api/guild/invite',{data:{username:peerAccount.account.username}});await peerContext.post(base+'/api/guild/respond',{data:{accept:true}});
    e.projectiles=[{x:e.x-200,y:e.y-30,vx:0,vy:0,life:10,radius:145,type:'Web',rarity:0,webGround:true}];e.addMob('Square',e.x+280,e.y+100,7,true);const square=e.mobs.at(-1);square.life=100;square.aggro=false;
    await page.waitForFunction(()=>globalThis.__feedbackArt.square>0&&globalThis.__feedbackArt.web>0&&globalThis.__feedbackArt.guild);await page.waitForTimeout(1600);await page.screenshot({path:'test-results/feedback-art.png'});
    assert.equal(await page.evaluate(()=>__feedbackEngine.projectiles.find(p=>p.type==='Web').webGround),true);
    // Fast Powder motion is sampled through a real socket, with a brief gap.
    e.save.loadout=[{type:'Mysterious Powder',rarity:6},null,null,null,null];e.rebuildPetals();c.room.mobs=[];app.world.bind(c);e.projectiles=[];
    let start;for(let i=0;i<300&&!start;i++){const q=e.geometry.sampleFree(e.radius,Math.random);if(Array.from({length:30},(_,j)=>j*100).every(d=>e.geometry.isFreeCircle(q.x+d,q.y,e.radius)&&!app.api.findPortal(e.save.biome,q.x+d,q.y,e.width,e.height)))start=q;}
    assert.ok(start,'a clear straight corridor is available');e.portalCooldown=1000;e.x=start.x;e.y=start.y;p.engine.x=start.x-500;p.engine.y=start.y-500;await page.waitForTimeout(400);
    await page.evaluate(()=>{globalThis.__powderPath=[];const record=()=>{__powderPath.push({time:performance.now(),x:__feedbackEngine.x});if(__powderPath.length<75)requestAnimationFrame(record)};requestAnimationFrame(record)});await page.bringToFront();await page.evaluate(()=>{globalThis.__oldSampleInput=__feedbackEngine.sampleInput;__feedbackEngine.sampleInput=()=>({x:1,y:0,mode:'normal',defend:false});__feedbackEngine.tickSample()});await page.waitForTimeout(300);c.sending=true;await page.waitForTimeout(180);c.sending=false;await page.waitForTimeout(400);await page.evaluate(()=>{__feedbackEngine.sampleInput=__oldSampleInput;__feedbackEngine.tickSample({x:0,y:0,mode:'normal',defend:false})});
    const samples=await page.evaluate(()=>__powderPath),deltas=samples.slice(1).map((p,i)=>p.x-samples[i].x);assert.ok(samples.at(-1).x-samples[0].x>100,JSON.stringify({first:samples[0],last:samples.at(-1),serverInput:e.input,state:e.state,server:{x:e.x,y:e.y},local:await page.evaluate(()=>({input:__feedbackEngine.input,x:__feedbackEngine.x,y:__feedbackEngine.y}))}));assert.ok(Math.min(...deltas)>-15,'Powder must not snap back between snapshots');
    // The same socket and renderer must switch to actual dungeon geometry.
    peer.close(1000);e.setBiome('Jungle');e.start();app.world.join(c);c.room.mobs=[];app.world.bind(c);e.invuln=100000;e.spawnTimer=-10000;e.portalCooldown=0;e.addMob('Termite Mound',e.x,e.y,1);
    await page.waitForFunction(()=>!!__feedbackEngine.moundVisit,null,{timeout:8000});assert.ok(c.room.dungeon);await page.screenshot({path:'test-results/termite-mound-playing.png'});assert.equal(await page.evaluate(()=>__feedbackEngine.width),c.room.dungeon.size);
    assert.deepEqual(errors,[]);const report={ok:true,wheelZoom:true,vectorSquare:true,expandedWeb:true,guildNameplate:true,powderDistance:samples.at(-1).x-samples[0].x,powderMinFrameDelta:Math.min(...deltas),dungeonRenderer:true,errors};fs.writeFileSync('test-results/feedback-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{peer?.terminate();await peerContext?.dispose();await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
