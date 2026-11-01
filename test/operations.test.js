'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebSocket}=require('ws');const {createServer}=require('../server/server');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('guilds, squad readiness, private chat, crafting and combat history work through real authenticated connections',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-ops-')),dbPath=path.join(dir,'db.json'),app=createServer({dbPath}),sockets=[];
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(player,url,data){const res=await fetch(base+url,{method:data===undefined?'GET':'POST',headers:{Cookie:player?.cookie??'','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,body:await res.json()};}
 async function connect(name){const res=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,password:'operations-test-password'})}),account=await res.json(),cookie=res.headers.get('set-cookie').split(';')[0],messages=[];
 const ws=new WebSocket(base.replace('http','ws')+'/ws',{headers:{Cookie:cookie,Origin:base}});sockets.push(ws);ws.on('message',d=>messages.push(JSON.parse(d)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});await wait(100);return {cookie,account,ws,messages,c:app.clients.get(account.account.id),send:m=>ws.send(JSON.stringify(m))};}
 try{
  const a=await connect('leader'),b=await connect('member'),outsider=await connect('outsider');
  assert.equal((await request(null,'/api/guild')).status,401);
  assert.equal((await request(a,'/api/guild/create',{name:'花园公会'})).status,200);
  assert.equal((await request(a,'/api/guild/invite',{username:'member'})).status,200);
  assert.equal((await request(b,'/api/guild')).body.view.invites[0].guild,'花园公会');
  assert.equal((await request(b,'/api/guild/respond',{accept:true})).body.view.guild.members.length,2);
  assert.equal((await request(b,'/api/guild/invite',{username:'outsider'})).status,409);
  assert.equal((await request(a,'/api/guild/squad-invite',{target:b.c.id})).status,200);await wait(100);assert.ok(b.messages.some(m=>m.type==='squadInvite'));
  assert.equal((await request(b,'/api/guild/squad-respond',{accept:true})).status,200);
  await wait(100);assert.equal(a.c.squadCode,b.c.squadCode);assert.ok(app.api.validate(a.messages.filter(m=>m.type==='snapshot').at(-1)));
  a.send({type:'chat',channel:'Guild',text:'guild-private'});await wait(80);assert.ok(b.messages.some(m=>m.text==='guild-private'));assert.ok(!outsider.messages.some(m=>m.text==='guild-private'));
  a.send({type:'chat',channel:'Public',text:'hello-public'});await wait(80);
  assert.ok(b.messages.some(m=>m.channel==='Public'&&m.text==='hello-public'));
  assert.ok(outsider.messages.some(m=>m.channel==='Public'&&m.text==='hello-public'));
  b.send({type:'squadPublic',public:true});await wait(80);assert.equal(app.social.squad(a.c).public,false);
  a.send({type:'squadReady',ready:true});b.send({type:'squadReady',ready:true});await wait(80);assert.equal(app.social.squad(a.c).phase,'countdown');
  b.send({type:'squadReady',ready:false});await wait(80);assert.equal(app.social.squad(a.c).phase,'waiting');
  b.send({type:'squadReady',ready:true});await wait(3300);assert.equal(a.c.engine.state,'playing');assert.equal(b.c.engine.state,'playing');
  const e=a.c.engine;e.roomHost=false;a.c.room.mobs.length=0;e.addMob('Rock',e.x+200,e.y,0);const mob=e.mobs.at(-1);mob.hp=mob.maxHp=1000;
  const dealt=e.recordMobDamage(mob,123);assert.equal(a.c.combatStats.dealt,dealt);e.invuln=0;e.payPlayerDamage(10,'Test');assert.equal(a.c.combatStats.taken,10);
  e.hp=0;await wait(100);assert.equal(e.state,'dead');assert.equal(a.c.combatStats.deaths,1);const savedStats={...a.c.combatStats};
  a.send({type:'start'});await wait(100);assert.equal(e.state,'playing');assert.deepEqual(a.c.combatStats,savedStats);
  const equipped=JSON.stringify(e.save.loadout);e.save.inventory['Rose:0']=2000000;e.save.inventory['Rose:7']=20;
  a.send({type:'craftBatch',scope:'inventory',maxRarity:0});await wait(100);assert.equal(a.c.craftJob.running,true);assert.ok(a.c.craftJob.attempts>0&&a.c.craftJob.attempts<2000);
  a.send({type:'craftCancel'});await wait(80);assert.equal(a.c.craftJob.status,'cancelled');const count=e.save.inventory['Rose:0'];await wait(80);assert.equal(e.save.inventory['Rose:0'],count);assert.equal(e.save.inventory['Rose:7'],20);assert.equal(JSON.stringify(e.save.loadout),equipped);
  e.save.inventory['Rose:0']=25;a.send({type:'craftBatch',scope:'selected',item:{type:'Rose',rarity:0},maxRarity:0});await wait(200);assert.equal(a.c.craftJob.running,false);assert.ok(e.save.inventory['Rose:0']<5);
  const total=()=>['loadout','reserve'].flatMap(key=>e.save[key]).filter(Boolean).length+Object.values(e.save.inventory).reduce((n,v)=>n+v,0),before=total();a.send({type:'swapAll'});await wait(100);assert.equal(total(),before);
  await app.persist();const disk=JSON.parse(fs.readFileSync(dbPath));assert.equal(Object.values(disk.guilds)[0].members.length,2);assert.deepEqual(disk.accounts[a.c.id].combatStats,savedStats);
  a.send({type:'combatReset'});await wait(100);assert.equal(a.c.combatStats.dealt,0);assert.equal(a.c.combatStats.deaths,0);
  a.ws.close(1000);await wait(100);assert.equal(app.social.squad(b.c).leaderId,b.c.id);assert.ok(!b.messages.filter(m=>m.onlineRoster).at(-1).onlineRoster.some(p=>p.id===a.c.id));
 }finally{for(const s of sockets)s.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
