'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function fixture(){
  const world=new World(api),client={id:'attacker',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(client);client.engine.start();world.bind(client);client.room.mobs.length=0;client.engine.mode='attack';
  return {world,client,engine:client.engine};
}
test('petal overlap applies damage and sends the health, damage number, death and owned loot',()=>{
  const {world,client,engine:e}=fixture();e.addMob('Rock',e.x+104,e.y,0);const mob=e.mobs[0];mob.radius=30;mob.hp=mob.maxHp=1000;
  let sawDamage=false,sawNumber=false;
  for(let step=0;step<120;step++){
    world.tick(1/30);const frame=snapshot(client,client.room,api);assert.ok(api.validate(frame));
    sawDamage||=mob.hp<1000;sawNumber||=frame.self.particles.some(p=>p.damage?.target===mob.id&&p.damage.amount>0);
  }
  assert.ok(sawDamage);assert.ok(sawNumber);
  mob.hp=1;
  for(let step=0;step<180&&mob.hp>0;step++)world.tick(1/30);
  assert.equal(mob.hp,0);assert.equal(e.sessionKills,1);assert.ok(e.save.xp>0);
  const frame=snapshot(client,client.room,api);assert.ok(api.validate(frame));assert.equal(frame.deathAck,1);assert.equal(frame.deaths[0].id,mob.id);
  assert.ok(client.room.drops.some(d=>d.ownerId===client.id));
});
test('the server separates overlapping players instead of fighting client collision correction',()=>{
  const {world,client:a,engine:e}=fixture();
  const b={id:'peer',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};world.join(b);b.engine.start();world.bind(b);
  world.tick(1/30);
  assert.ok(Math.hypot(e.x-b.engine.x,e.y-b.engine.y)>=e.radius+b.engine.radius-1e-5);
  const position={x:e.x,y:e.y};for(let i=0;i<30;i++)world.tick(1/30);
  assert.ok(Math.hypot(e.x-position.x,e.y-position.y)<.1);
  assert.ok(api.validate(snapshot(a,a.room,api)));
});
test('a second player can damage a mob simulated by the first and receives their own kill credit',()=>{
  const {world,client:a,engine:e}=fixture();e.save.loadout=Array(5).fill(null);e.rebuildPetals();e.x+=40;
  const b={id:'second-attacker',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(b);b.engine.start();world.bind(b);b.engine.mode='attack';
  e.addMob('Rock',b.engine.x+104,b.engine.y,0);const mob=e.mobs.at(-1);mob.radius=30;mob.hp=mob.maxHp=1000;
  for(let i=0;i<120;i++)world.tick(1/30);
  assert.equal(mob.serverOwner,a.id);assert.ok(mob.hp<1000);assert.equal(mob.lastHitBy,b.id);
  mob.hp=1;for(let i=0;i<180&&mob.hp>0;i++)world.tick(1/30);
  assert.equal(b.engine.sessionKills,1);assert.equal(e.sessionKills,0);
  assert.ok(b.room.drops.some(d=>d.ownerId===b.id));
});
