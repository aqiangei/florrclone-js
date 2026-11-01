'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebSocket}=require('ws'),Wire=require('../server/wire'),{createServer}=require('../server/server');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<160;i++){if(check())return;await delay(25);}assert.ok(check(),'condition timed out');}
test('8,000 pickup rewards keep the socket and location while inventory sync is throttled',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-loot-')),app=createServer({dbPath:path.join(dir,'db.json')});let ws;
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  try{
    const res=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'loot_network',password:'local-test-password'})}),cookie=res.headers.get('set-cookie').split(';')[0];
    ws=new WebSocket(base.replace('http','ws')+'/ws',[Wire.PROTOCOL],{headers:{Cookie:cookie,Origin:base}});const frames=[],decoder=new Wire.Decoder();
    ws.on('message',(data,binary)=>{if(binary)frames.push(decoder.decode(data));});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    ws.send(JSON.stringify({type:'start'}));await until(()=>[...app.clients.values()][0]?.engine.state==='playing');
    const c=[...app.clients.values()][0],e=c.engine;c.room.mobs.length=0;e.spawnTimer=-10000;e.invuln=10000;e.save.equipDrops=false;
    const before=e.save.inventory['Basic:0']??0,start={x:e.x,y:e.y},at=frames.length;
    for(let i=0;i<8000;i++){const d={id:app.world.nextId++,type:'Basic',rarity:0,x:e.x,y:e.y,life:120,ownerId:c.id};c.room.drops.push(d);e.onDropCreated(d);}
    await until(()=>(e.save.inventory['Basic:0']??0)-before===8000);
    await until(()=>frames.some(f=>(f.save?.inventory['Basic:0']??0)-before===8000));
    const received=frames.slice(at),saves=received.filter(f=>f.save);
    assert.ok(received.length>=20);assert.ok(saves.length<received.length/2,JSON.stringify({frames:received.length,saves:saves.length}));
    assert.equal(ws.readyState,WebSocket.OPEN);assert.equal(c.engine,e);assert.equal(e.state,'playing');assert.equal(e.x,start.x);assert.equal(e.y,start.y);
    assert.equal(e.sessionCollected['Basic:0'],8000);assert.equal(c.room.drops.length,0);assert.equal(app.stats.snapshotErrors,0);
    assert.ok(received.every(f=>f.self.drops.length<=256));
  }finally{ws?.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
