'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebSocket}=require('ws'),Wire=require('../server/wire'),{createServer}=require('../server/server');
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<100;i++){if(fn())return;await delay(20);}assert.ok(fn(),'condition timed out');}
test('delayed movement bursts do not kick; excessive controls remain limited and can resume the fight',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-input-')),app=createServer({dbPath:path.join(dir,'db.json')}),sockets=[];
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  try{
    const res=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'input_burst',password:'local-test-password'})}),cookie=res.headers.get('set-cookie').split(';')[0];
    async function connect(){const ws=new WebSocket(base.replace('http','ws')+'/ws',[Wire.PROTOCOL],{headers:{Cookie:cookie,Origin:base}}),frames=[],decoder=new Wire.Decoder();sockets.push(ws);ws.on('message',(data,binary)=>{if(binary)frames.push(decoder.decode(data));});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});await until(()=>frames.length>0);return{ws,frames};}
    const a=await connect();a.ws.send(JSON.stringify({type:'start'}));await until(()=>[...app.clients.values()][0].engine.state==='playing');const c=[...app.clients.values()][0],engine=c.engine;engine.invuln=1000;
    for(let seq=1;seq<=240;seq++)a.ws.send(JSON.stringify({type:'input',seq,x:1,y:0,mode:'normal',defend:false}));
    await until(()=>a.frames.at(-1).inputAck===240);assert.equal(a.ws.readyState,WebSocket.OPEN);assert.equal(c.engine,engine);assert.equal(engine.state,'playing');
    const closed=new Promise(resolve=>a.ws.once('close',resolve));for(let i=0;i<85;i++)a.ws.send(JSON.stringify({type:'combatReset'}));assert.equal(await closed,4008);await until(()=>c.disconnectedAt);
    const b=await connect();assert.equal(b.frames[0].self.state,'playing');assert.equal(c.engine,engine);assert.equal(c.inputAck,0);
    b.ws.close();await until(()=>c.disconnectedAt);const d=await connect();assert.equal(d.frames[0].self.state,'playing');assert.equal(c.engine,engine);
  }finally{for(const ws of sockets)ws.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
