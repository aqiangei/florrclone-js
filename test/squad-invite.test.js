'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebSocket}=require('ws'),{createServer}=require('../server/server');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('player-name and guild quick invitations form a live squad without restarting either fight',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'florr-invite-')),app=createServer({dbPath:path.join(dir,'db.json')}),players=[];
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(p,action,body){const r=await fetch(base+'/api/guild/'+action,{method:'POST',headers:{Cookie:p.cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
  try{
    for(const username of ['invite_leader','invite_member','invite_guest','invite_extra']){
      const r=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'squad-invite-test-password'})}),account=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];
      const ws=new WebSocket(base.replace('http','ws')+'/ws',{headers:{Cookie:cookie,Origin:base}}),p={cookie,ws,messages:[]};players.push(p);ws.on('message',d=>p.messages.push(JSON.parse(d)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});p.client=app.clients.get(account.account.id);
    }
    const [leader,member,guest,extra]=players;
    assert.equal((await request(leader,'create',{name:'quick invite guild'})).status,200);
    await request(leader,'invite',{username:'invite_member'});await request(member,'respond',{accept:true});
    for(const p of players){p.client.engine.start();p.client.room.mobs=[];app.world.bind(p.client);p.client.engine.invuln=1000;p.client.engine.spawnTimer=-10000;}
    const e=member.client.engine;e.sessionKills=23;const position=e.geometry.projectInside(e.x+400,e.y,e.radius);e.x=position.x;e.y=position.y;
    assert.equal((await request(leader,'squad-invite',{target:guest.client.id})).status,409,'guild button must enforce guild membership');
    const sent=await request(leader,'squad-invite',{target:member.client.id});assert.equal(sent.status,200);assert.equal(sent.body.message,'Squad invitation sent.');
    await delay(30);assert.ok(member.messages.some(m=>m.type==='squadInvite'));
    assert.equal((await request(member,'squad-respond',{accept:true})).status,200);
    assert.equal(leader.client.squadCode,member.client.squadCode);assert.equal(e.state,'playing');assert.equal(e.sessionKills,23);assert.equal(e.x,position.x);assert.equal(e.y,position.y);
    assert.equal((await request(member,'squad-invite',{username:'invite_guest'})).status,409,'only leader can invite');
    assert.equal((await request(leader,'squad-invite',{username:'invite_guest'})).status,200,'ordinary player invitations do not require a shared guild');
    assert.equal((await request(guest,'squad-respond',{accept:true})).status,200);assert.equal(guest.client.squadCode,leader.client.squadCode);
    assert.equal((await request(leader,'squad-invite',{username:'invite_extra'})).status,200);
    assert.equal((await request(extra,'squad-respond',{accept:false})).status,200);assert.equal(extra.client.squadCode,undefined);
    await request(leader,'squad-invite',{username:'invite_extra'});app.social.invites.get(extra.client.id).until=0;
    assert.equal((await request(extra,'squad-respond',{accept:true})).status,409);
    assert.equal((await request(leader,'squad-invite',{username:'invite_leader'})).status,409);
    assert.equal((await request(leader,'squad-invite',{username:'not_online'})).status,409);
  }finally{for(const p of players)p.ws.terminate();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
