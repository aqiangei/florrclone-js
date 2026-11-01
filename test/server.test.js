'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {WebSocket}=require('ws');const {createServer}=require('../server/server');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('real protocol 3 clients share authoritative rooms and persistent sessions',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-server-')),dbPath=path.join(dir,'db.json');
  const app=createServer({dbPath});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const sockets=[];
  try{
    async function connect(){const res=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'user_'+sockets.length,password:'local-test-password'})}),session=await res.json(),cookie=res.headers.get('set-cookie').split(';')[0];
      assert.equal(app.api.session.safeParse(session).success,true);
      assert.equal(session.account.role,'player');assert.equal(session.save.debug,undefined);
      assert.equal(Object.entries(session.save.inventory).filter(([key])=>key.endsWith(':7')).reduce((n,[,v])=>n+v,0),20);
      const ws=new WebSocket(base.replace('http','ws')+'/ws',['florr-batch-v1','florr-delta-v1'],{headers:{Cookie:cookie,Origin:base}});sockets.push(ws);
      const frames=[];ws.on('message',(data,binary)=>{const frame=JSON.parse(binary?zlib.gunzipSync(data):data);if(frame.type==='snapshot'){assert.ok(app.api.validate(frame));frames.push(frame);}});
      await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,frames,cookie,session};}
    const a=await connect(),b=await connect();await delay(300);
    assert.ok(a.frames.length>0);assert.equal(a.ws.protocol,'florr-batch-v1');
    const send=(client,m)=>client.ws.send(JSON.stringify(m));send(a,{type:'start',name:'Alice'});send(b,{type:'start',name:'Bob'});
    await delay(350);assert.equal(a.frames.at(-1).players[0].name,'Bob');assert.equal(b.frames.at(-1).players[0].name,'Alice');
    const before=a.frames.at(-1).self;send(a,{type:'input',seq:1,x:1,y:0,mode:'attack',defend:false});
    await delay(350);const after=a.frames.at(-1);assert.ok(after.self.x>before.x);assert.equal(after.inputAck,1);
    assert.ok(b.frames.at(-1).players[0].x>before.x);assert.ok(after.mobs.length>0);
    send(a,{type:'input',seq:0,x:-1,y:0,mode:'normal',defend:false});await delay(100);assert.equal(a.frames.at(-1).inputAck,1);
    await app.persist();assert.equal(JSON.parse(fs.readFileSync(dbPath)).accounts[a.session.account.id].save.name,'Alice');
    const restored=await (await fetch(base+'/api/session',{headers:{Cookie:a.cookie}})).json();assert.equal(restored.account.id,a.session.account.id);
    const unauth=new WebSocket(base.replace('http','ws')+'/ws');await new Promise(resolve=>unauth.on('unexpected-response',(_,r)=>{assert.equal(r.statusCode,401);r.destroy();resolve();}));
    send(b,{type:'input',seq:2,x:'invalid',y:0,mode:'normal',defend:false});await new Promise(resolve=>b.ws.once('close',code=>{assert.equal(code,4002);resolve();}));
    assert.equal((await fetch(base+'/server/server.js')).status,404);
    send(a,{type:'lobby'});send(a,{type:'biome',biome:'Desert'});
    for(let i=0;i<30&&a.frames.at(-1).map.biome!=='Desert';i++)await delay(100);
    assert.equal(a.frames.at(-1).map.biome,'Desert');assert.equal(a.frames.at(-1).players.length,0);
    assert.ok(a.frames.filter(f=>f.save).length<a.frames.length/2,'unchanged saves must not be sent every frame');
  }finally{for(const ws of sockets)ws.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('database survives a complete process lifecycle and crafting uses captured rules',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-save-')),dbPath=path.join(dir,'db.json');
  let app=createServer({dbPath});
  try{
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const auth=(action,password='local-test-password')=>fetch(base+'/api/account/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Persistent',password})});
    assert.equal((await fetch(base+'/api/account')).status,401);
    const res=await auth('register'),cookie=res.headers.get('set-cookie').split(';')[0],session=await res.json();
    assert.equal((await auth('register')).status,409);assert.equal((await auth('login','incorrect-password')).status,401);
    const loggedIn=await(await auth('login')).json();assert.deepEqual(loggedIn.save.inventory,session.save.inventory);
    assert.equal(session.account.role,'player');
    const disk=JSON.parse(fs.readFileSync(dbPath));assert.equal(disk.accounts[session.account.id].starterReward.count,20);assert.ok(disk.accounts[session.account.id].passwordHash);assert.ok(!JSON.stringify(disk).includes('local-test-password'));
    const inventory={'Rose:0':5};const result=app.api.craft(inventory,{type:'Rose',rarity:0},()=>0,1);
    assert.equal(result.successes,1);assert.equal(inventory['Rose:1'],1);assert.equal(inventory['Rose:0'],0);
    await app.close();app=createServer({dbPath});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const restored=await(await fetch(`http://127.0.0.1:${app.server.address().port}/api/session`,{headers:{Cookie:cookie}})).json();
    assert.equal(restored.account.id,session.account.id);assert.deepEqual(restored.save,session.save);
  }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
