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
test('60 TPS preserves damage cooldowns per second',()=>{
  const damage=[];
  for(const hz of [30,60]){
    const {world,engine:e}=fixture();e.addMob('Rock',e.x+104,e.y,0);const mob=e.mobs[0];mob.radius=30;mob.hp=mob.maxHp=1000;
    for(let i=0;i<hz*4;i++)world.tick(1/hz);
    damage.push(1000-mob.hp);
  }
  assert.ok(damage.every(d=>d>0));assert.ok(Math.abs(damage[0]-damage[1])<=18,JSON.stringify(damage));
});

test('Hornet missiles are serialized and Moon Rock intercepts their swept path before the flower',()=>{
  const {client,engine:e}=fixture();e.save.loadout=[{type:'Moon Rock',rarity:6},null,null,null,null];e.rebuildPetals();e.invuln=0;
  const moon=e.petals[0];moon.x=e.x-140;moon.y=e.y;moon.cd=0;moon.hp=10000;moon.motion=undefined;
  e.addMob('Hornet',e.x-400,e.y,0);const hornet=e.mobs.at(-1);hornet.shots=[{x:e.x+10,y:e.y,vx:12000,vy:0,radius:8,damage:9,life:2,hp:20,type:'Missile'}];
  const frame=snapshot(client,client.room,api);assert.ok(api.validate(frame));assert.equal(frame.mobs.find(m=>m.id===hornet.id).shots[0].type,'Missile');
  const hp=e.hp;e.collideMobShots(hornet,1/30);assert.equal(hornet.shots[0].life,0);assert.equal(e.hp,hp);assert.ok(moon.hp<10000);
  moon.cd=1;hornet.shots=[{x:e.x+10,y:e.y,vx:12000,vy:0,radius:8,damage:9,life:2,hp:20,type:'Missile'}];e.collideMobShots(hornet,1/30);assert.ok(e.hp<hp,'unprotected flower is hit');
});
test('Lightning arcs ride visualEvents like florr_clone-web strike bolts',()=>{
  const {world,client,engine:e}=fixture();
  e.localVisuals=true;e.visualScope=client.room.id;world.bind(client);
  e.save.loadout=[{type:'Lightning',rarity:6},null,null,null,null];e.rebuildPetals();e.mode='attack';
  for(let i=0;i<5;i++){e.addMob('Rock',e.x+90+i*35,e.y,0);const m=e.mobs.at(-1);m.radius=18;m.hp=m.maxHp=8000;}
  let arcs=0;
  for(let i=0;i<150;i++){
    world.tick(1/30);
    const frame=snapshot(client,client.room,api);
    assert.ok(api.validate(frame));
    arcs+=(frame.visuals||[]).filter(v=>v.kind==='arc').length;
    client.lastVisualAck=frame.visualAck??client.lastVisualAck;
  }
  assert.ok(arcs>0,`expected lightning arc visuals, got ${arcs}`);
});
test('a peer receives another player\'s lightning arcs',()=>{
  const {world,client:a,engine:ea}=fixture();
  ea.localVisuals=true;ea.visualScope=a.room.id;
  const b={id:'spectator',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(b);b.engine.start();world.bind(b);
  b.engine.localVisuals=true;b.engine.visualScope=b.room.id;world.bind(a);world.bind(b);
  ea.save.loadout=[{type:'Lightning',rarity:6},null,null,null,null];ea.rebuildPetals();ea.mode='attack';
  b.engine.save.loadout=Array(5).fill(null);b.engine.rebuildPetals();
  a.room.mobs.length=0;
  for(let i=0;i<5;i++){ea.addMob('Rock',ea.x+90+i*35,ea.y,0);const m=ea.mobs.at(-1);m.radius=18;m.hp=m.maxHp=8000;}
  let peerArcs=0;
  for(let i=0;i<150;i++){
    world.tick(1/30);
    const frame=snapshot(b,b.room,api);
    assert.ok(api.validate(frame));
    peerArcs+=(frame.visuals||[]).filter(v=>v.kind==='arc').length;
    b.lastVisualAck=frame.visualAck??b.lastVisualAck;
  }
  assert.ok(peerArcs>0,`spectator expected peer lightning arcs, got ${peerArcs}`);
});
test('Carrot launches on attack even while defend is also held',()=>{
  const {world,client,engine:e}=fixture();
  e.save.loadout=[{type:'Carrot',rarity:0},{type:'Missile',rarity:0},null,null,null];e.rebuildPetals();
  e.mode='attack';e.defendHeld=true;e.input={x:1,y:0};
  let carrotAt=-1,missileAt=-1;
  for(let i=0;i<90;i++){
    world.tick(1/30);
    if(carrotAt<0&&e.projectiles.some(p=>p.type==='Carrot'))carrotAt=i;
    if(missileAt<0&&e.projectiles.some(p=>p.type==='Missile'))missileAt=i;
  }
  assert.ok(carrotAt>=0,`Carrot did not launch under attack+defend (missileAt=${missileAt})`);
  assert.ok(missileAt>=0);
  const frame=snapshot(client,client.room,api);
  assert.ok(api.validate(frame));
  assert.ok(frame.self.projectiles.some(p=>p.type==='Carrot'));
});
