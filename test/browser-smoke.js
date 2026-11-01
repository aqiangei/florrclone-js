'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {createServer}=require('../server/server');
const crypto=require('node:crypto'),zlib=require('node:zlib');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const app=createServer({dbPath:'test-results/browser-db.json'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const errors=[],failed=[],frames=[[],[]];
  try{
    const pages=[];
    for(let i=0;i<2;i++){
      const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();pages.push(page);
      const auth=await context.request.post(`http://127.0.0.1:${app.server.address().port}/api/account/register`,{data:{username:'test_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});assert.equal(auth.status(),200);
      const registered=await auth.json();assert.equal(registered.account.role,'player');assert.equal(Object.values(registered.save.inventory).reduce((a,b)=>a+b,0),20);
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
      page.on('websocket',ws=>ws.on('framereceived',frame=>{try{frames[i].push(JSON.parse(typeof frame.payload==='string'?frame.payload:zlib.gunzipSync(frame.payload)));}catch{}}));
      await page.goto(`http://127.0.0.1:${app.server.address().port}`,{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Ready',exact:true}).waitFor();
    }
    // Account discovery runs after the asset warmup and then joins the socket.
    for(let i=0;i<100&&app.clients.size!==2;i++)await new Promise(r=>setTimeout(r,200));
    assert.equal(app.clients.size,2);
    for(const page of pages)await page.getByRole('button',{name:'Ready',exact:true}).click();
    await new Promise(r=>setTimeout(r,1500));
    assert.ok([...app.clients.values()].every(c=>c.engine.state==='playing'));
    const client=[...app.clients.values()][0],x=client.engine.x,y=client.engine.y;
    await pages[0].keyboard.down('d');await pages[0].waitForTimeout(500);await pages[0].keyboard.up('d');
    assert.ok(Math.hypot(client.engine.x-x,client.engine.y-y)>5);
    await pages[0].screenshot({path:'test-results/online-playing.png'});
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.ok(frames.every(f=>f.length>5));
    assert.ok(frames.every(f=>f.filter(frame=>frame.save).length<f.length/2));
    console.log(JSON.stringify({ok:true,clients:app.clients.size,states:[...app.clients.values()].map(c=>c.engine.state),frames:frames.map(f=>f.length),saveFrames:frames.map(f=>f.filter(frame=>frame.save).length),health:await(await fetch(`http://127.0.0.1:${app.server.address().port}/api/health`)).json(),errors,failed,screenshot:'test-results/online-playing.png'},null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
