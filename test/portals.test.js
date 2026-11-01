'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const api=loadEngine(path.join(__dirname,'../florr-local-site'));
function add(world,id,biome='Garden'){
  const save=api.normalize({...api.defaults(),biome}),c={id,events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(save,Math.random,false)};
  world.join(c);c.engine.start();world.bind(c);c.engine.spawnTimer=-10000;return c;
}
function atDoor(c,to){const e=c.engine,portal=api.portals(e.save.biome,e.width,e.height).find(p=>p.to===to);assert.ok(portal);e.x=portal.x;e.y=portal.y;e.input={x:0,y:0};e.moveVX=e.moveVY=e.pushX=e.pushY=0;}
test('Garden gateway enters the shared Ant Hell room and leaves Garden players and mobs intact',()=>{
  const world=new World(api),a=add(world,'traveller'),b=add(world,'garden-peer'),resident=add(world,'ant-peer','Ant Hell');
  const origin=a.room,destination=resident.room,mobs=origin.mobs;atDoor(a,'Ant Hell');
  const time=a.engine.time;world.tick(1/60);
  assert.equal(a.engine.save.biome,'Ant Hell');assert.equal(a.room,destination);assert.equal(b.room,origin);
  assert.ok(!origin.clients.has(a));assert.ok(destination.clients.has(a));assert.equal(b.engine.mobs,origin.mobs);assert.ok(mobs.length>0&&origin.mobs.length>0);
  assert.ok(Math.abs(a.engine.time-time-1/60)<1e-8,'a traveller steps once');
  const frame=snapshot(a,a.room,api);assert.ok(api.validate(frame));assert.equal(frame.map.biome,'Ant Hell');assert.equal(frame.map.roomId,'adventure:Ant Hell');
  assert.ok(frame.players.some(p=>p.id===resident.id));assert.ok(!frame.players.some(p=>p.id===b.id));assert.ok(a.engine.portalCooldown>0);
});
test('portal cooldown blocks bounce, then the Ant Hell exit returns to Garden',()=>{
  const world=new World(api),c=add(world,'round-trip');atDoor(c,'Ant Hell');world.tick(1/60);assert.equal(c.engine.save.biome,'Ant Hell');
  atDoor(c,'Garden');world.tick(1/60);assert.equal(c.engine.save.biome,'Ant Hell');
  c.engine.portalCooldown=0;world.tick(1/60);assert.equal(c.engine.save.biome,'Garden');assert.equal(c.room.id,'adventure:Garden');
  assert.ok(api.validate(snapshot(c,c.room,api)));assert.equal(world.rooms.size,1);
});
test('lobby, dead and paused players cannot activate a map portal',()=>{
  for(const state of ['lobby','dead','paused']){
    const world=new World(api),c=add(world,'blocked-'+state);atDoor(c,'Ant Hell');c.engine.state=state;
    if(state==='paused'){c.engine.state='playing';c.engine.paused=true;}
    world.tick(1/60);assert.equal(c.engine.save.biome,'Garden');
  }
});
test('death respawn stays in the current biome instead of restoring previousBiome',()=>{
  for(const biome of ['Ant Hell','Desert','Ocean','Jungle','Sewers']){
    const world=new World(api),c=add(world,'respawn-'+biome,biome);
    c.engine.save.previousBiome='Garden';
    c.engine.hp=0;for(let i=0;i<180;i++)c.engine.update(1/60);
    assert.equal(c.engine.state,'dead');assert.equal(c.engine.save.biome,biome);
    // Mirrors server start handling: clear portal memory before Engine.start().
    c.engine.save.previousBiome=undefined;c.engine.start();world.join(c);
    assert.equal(c.engine.state,'playing');assert.equal(c.engine.save.biome,biome);assert.equal(c.room.id,'adventure:'+biome);
  }
});
test('death respawn revives at the death position instead of the biome spawn',()=>{
  const world=new World(api),c=add(world,'inplace-respawn','Desert');
  const spawnX=c.engine.x,spawnY=c.engine.y;
  c.engine.x=c.engine.width*0.72;c.engine.y=c.engine.height*0.28;
  assert.ok(Math.hypot(c.engine.x-spawnX,c.engine.y-spawnY)>100);
  c.engine.hp=0;for(let i=0;i<180;i++)c.engine.update(1/60);
  assert.equal(c.engine.state,'dead');
  const deathX=c.engine.x,deathY=c.engine.y;
  c.engine.save.previousBiome=undefined;c.engine.start();world.join(c);
  assert.equal(c.engine.state,'playing');
  assert.ok(Math.hypot(c.engine.x-deathX,c.engine.y-deathY)<1,'respawn should stay at death position');
  assert.ok(Math.hypot(c.engine.x-spawnX,c.engine.y-spawnY)>100,'respawn must not snap to biome spawn');
});
test('death keeps nearby mobs even when another player hosts elsewhere',()=>{
  const world=new World(api),victim=add(world,'victim','Desert'),host=add(world,'host','Desert');
  victim.engine.x=victim.engine.width*0.75;victim.engine.y=victim.engine.height*0.25;
  host.engine.x=host.engine.width*0.2;host.engine.y=host.engine.height*0.8;
  assert.ok(Math.hypot(victim.engine.x-host.engine.x,victim.engine.y-host.engine.y)>5000);
  const planted=[];
  for(let i=0;i<8;i++){
    const ang=i*Math.PI/4;
    victim.engine.addMob('Beetle',victim.engine.x+Math.cos(ang)*420,victim.engine.y+Math.sin(ang)*420,1);
    planted.push(victim.engine.mobs.at(-1).id);
  }
  world.bind(victim);world.bind(host);
  victim.engine.hp=0;for(let i=0;i<180;i++)world.tick(1/60);
  assert.equal(victim.engine.state,'dead');
  for(let i=0;i<180;i++)world.tick(1/60);
  const survived=planted.filter(id=>victim.room.mobs.some(m=>m.id===id&&m.hp>0));
  assert.equal(survived.length,planted.length,'corpse-area packs must survive far-cull while dead');
});
test('death respawn keeps nearby mobs instead of reseeding the field',()=>{
  const world=new World(api),c=add(world,'keep-mobs','Garden');
  c.engine.x=c.engine.width*0.55;c.engine.y=c.engine.height*0.55;
  const planted=[];
  for(let i=0;i<10;i++){
    const ang=i*Math.PI/5;
    c.engine.addMob('Rock',c.engine.x+Math.cos(ang)*380,c.engine.y+Math.sin(ang)*380,0);
    planted.push(c.engine.mobs.at(-1).id);
  }
  world.bind(c);
  c.engine.hp=0;for(let i=0;i<180;i++)c.engine.update(1/60);
  assert.equal(c.engine.state,'dead');
  c.engine.save.previousBiome=undefined;c.engine.start();world.join(c);
  const survived=planted.filter(id=>c.room.mobs.some(m=>m.id===id&&m.hp>0));
  assert.equal(survived.length,planted.length,'in-place Continue must not wipe the surrounding pack');
  const offline=new api.Engine(api.defaults(),()=>.5,false);
  offline.setBiome('Garden');offline.start();
  offline.x=offline.width*0.55;offline.y=offline.height*0.55;
  const offlineIds=[];
  for(let i=0;i<8;i++){
    const ang=i*Math.PI/4;
    offline.addMob('Bee',offline.x+Math.cos(ang)*350,offline.y+Math.sin(ang)*350,0);
    offlineIds.push(offline.mobs.at(-1).id);
  }
  offline.hp=0;for(let i=0;i<180;i++)offline.update(1/60);
  offline.start();
  assert.equal(offlineIds.filter(id=>offline.mobs.some(m=>m.id===id&&m.hp>0)).length,offlineIds.length);
});
test('without clearing previousBiome, Engine.start restores Garden after Ant Hell death',()=>{
  const world=new World(api),c=add(world,'legacy-restore');atDoor(c,'Ant Hell');world.tick(1/60);
  assert.equal(c.engine.save.biome,'Ant Hell');assert.equal(c.engine.save.previousBiome,'Garden');
  c.engine.hp=0;for(let i=0;i<180;i++)c.engine.update(1/60);c.engine.start();
  assert.equal(c.engine.save.biome,'Garden');
});
test('portal exits land outside the return trigger so cooldown cannot bounce the player',()=>{
  for(const [from,to] of [['Jungle','Ocean'],['Garden','Ant Hell'],['Garden','Desert'],['Ant Hell','Garden']]){
    const world=new World(api),c=add(world,`exit-${from}-${to}`,from);atDoor(c,to);world.tick(1/60);
    assert.equal(c.engine.save.biome,to);
    assert.equal(api.findPortal(to,c.engine.x,c.engine.y,c.engine.width,c.engine.height),undefined);
    c.engine.input={x:0,y:0};c.engine.portalCooldown=0;
    for(let i=0;i<30;i++)world.tick(1/60);
    assert.equal(c.engine.save.biome,to,`${from}->${to} bounced back while standing still`);
  }
});
