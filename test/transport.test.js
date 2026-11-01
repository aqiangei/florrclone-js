'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {WebSocket}=require('ws'),{createServer}=require('../server/server');
const Wire=require('../server/wire');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<80;i++){if(check())return;await delay(25);}assert.ok(check(),'condition timed out');}

test('transport stalls and invalid server frames recover without losing the authoritative fight',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-transport-'));
  const app=createServer({dbPath:path.join(dir,'db.json')}),sockets=[];
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  try{
    const res=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'transport',password:'local-test-password'})});
    const cookie=res.headers.get('set-cookie').split(';')[0];
    async function connect(){
      const ws=new WebSocket(base.replace('http','ws')+'/ws',[Wire.PROTOCOL,'florr-batch-v1'],{headers:{Cookie:cookie,Origin:base}}),frames=[],decoder=new Wire.Decoder();
      sockets.push(ws);ws.on('message',(data,binary)=>frames.push(binary?decoder.decode(data):JSON.parse(data)));
      await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
      await until(()=>frames.length>0);return {ws,frames};
    }
    const a=await connect(),c=[...app.clients.values()][0];
    assert.equal(a.ws.protocol,Wire.PROTOCOL);
    a.ws.send(JSON.stringify({type:'start',name:'Transport'}));await until(()=>c.engine.state==='playing');
    c.engine.invuln=100;const engine=c.engine,room=c.room;
    a.ws.send(JSON.stringify({type:'input',seq:90,x:0,y:0,mode:'normal',defend:false}));await until(()=>c.inputAck===90);
    a.ws.terminate();await until(()=>c.disconnectedAt);
    const b=await connect();
    assert.equal(c.engine,engine);assert.equal(c.room,room);assert.equal(engine.state,'playing');
    assert.ok(b.frames[0].save);assert.ok(b.frames[0].onlineRoster);assert.ok(b.frames[0].loadoutPresets);
    b.ws.send(JSON.stringify({type:'input',seq:1,x:0,y:0,mode:'normal',defend:false}));await until(()=>c.inputAck===1);
    await delay(50);assert.equal(app.clients.get(c.id),c,'old socket close must not remove the resumed client');

    // A brief blocked downstream must skip samples, keeping the connection.
    const serverSocket=c.ws;Object.defineProperty(serverSocket,'bufferedAmount',{configurable:true,value:300*1024});
    await until(()=>app.stats.skippedSnapshots>=3);delete serverSocket.bufferedAmount;
    const sent=app.stats.snapshotCount;await until(()=>app.stats.snapshotCount>sent);
    assert.equal(b.ws.readyState,WebSocket.OPEN);

    // Reproduce more than the previous nine-failure kick threshold.
    const log=t.mock.method(console,'error',()=>{}),validate=app.api.validate;
    app.api.validate=()=>false;
    await until(()=>app.stats.snapshotErrors>=12);
    assert.equal(b.ws.readyState,WebSocket.OPEN);assert.equal(app.clients.get(c.id).engine,engine);
    app.api.validate=validate;
    const count=b.frames.length;await until(()=>b.frames.length>count);
    assert.equal(c.snapshotFails,0);assert.ok(log.mock.callCount()<=2,'error logs are rate limited');
    log.mock.restore();
    c.engine.addParticle({x:c.engine.x,y:c.engine.y,vx:0,vy:0,life:2,max:2,color:'#fff',size:10,text:'wire-event'});
    await until(()=>b.frames.some(f=>f.visuals?.some(v=>v.particle?.text==='wire-event')));
    await delay(150);
    assert.equal(b.frames.flatMap(f=>f.visuals??[]).filter(v=>v.particle?.text==='wire-event').length,1,'a visual is transmitted once');
    assert.equal(c.engine.particles.length,0,'server does not animate event particles');
    b.ws.send(JSON.stringify({type:'clientDiagnostic',phase:'snapshot',message:'test playback interruption'}));
    await until(()=>c.lastDiagnosticAt);
    b.ws.close(4002,'Snapshot playback failed');await until(()=>c.disconnectedAt);
    const resumed=await connect();assert.equal(resumed.frames[0].self.state,'playing');assert.equal(c.engine,engine);
  }finally{for(const ws of sockets)ws.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
