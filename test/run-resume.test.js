'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server/server'),{WebSocket}=require('ws'),Wire=require('../server/wire');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await delay(25);}assert.ok(check(),'condition timed out');}
test('a complete server restart resumes position and life statistics instead of returning to Ready',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-run-')),dbPath=path.join(dir,'db.json');let app=createServer({dbPath}),sockets=[];
  const listen=async()=>{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`;};
  let base=await listen();
  try{
    const response=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'restart_player',password:'local-test-password'})}),cookie=response.headers.get('set-cookie').split(';')[0];
    async function connect(){const ws=new WebSocket(base.replace('http','ws')+'/ws',[Wire.PROTOCOL],{headers:{Cookie:cookie,Origin:base}}),frames=[],decoder=new Wire.Decoder();sockets.push(ws);ws.on('message',(data,binary)=>{if(binary)frames.push(decoder.decode(data));});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});await until(()=>frames.length>0);return{ws,frames};}
    const a=await connect();a.ws.send(JSON.stringify({type:'start'}));await until(()=>[...app.clients.values()][0].engine.state==='playing');
    const c=[...app.clients.values()][0],e=c.engine;e.invuln=1000;const point=e.geometry.projectInside(e.x+180,e.y+50,e.radius);e.x=point.x;e.y=point.y;e.hp=37;e.sessionKills=23;e.sessionXP=99;e.sessionCollected={'Basic:0':7};e.sessionMobKills={'Rock:0':23};
    await app.close();app=createServer({dbPath});base=await listen();const b=await connect(),restored=[...app.clients.values()][0].engine;
    assert.equal(restored.state,'playing');assert.equal(b.frames[0].self.state,'playing');assert.ok(Math.hypot(restored.x-point.x,restored.y-point.y)<1);
    assert.equal(restored.hp,37);assert.equal(restored.sessionKills,23);assert.equal(restored.sessionXP,99);assert.equal(restored.sessionCollected['Basic:0'],7);assert.equal(restored.sessionMobKills['Rock:0'],23);
    b.ws.send(JSON.stringify({type:'lobby'}));await until(()=>restored.state==='lobby');await app.persist();assert.equal([...app.clients.values()][0].account.activeRun,undefined);
  }finally{for(const ws of sockets)ws.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
