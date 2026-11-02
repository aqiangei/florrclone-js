'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const api=loadEngine(path.join(__dirname,'../florr-local-site'));
function client(world,id){const c={id,inputAck:0,account:{},lastInput:Date.now(),events:[],engine:new api.Engine(api.normalize({...api.defaults(),biome:'Jungle'}),()=>.5,false)};world.join(c);c.engine.start();c.engine.invuln=10000;c.engine.spawnTimer=-10000;c.engine.portalCooldown=0;world.bind(c);return c;}
test('standing on a termite mound enters a shared isolated nest and clearing it returns everyone once',()=>{
  const world=new World(api),a=client(world,'a'),b=client(world,'b'),observer=client(world,'observer'),parent=a.room;
  parent.mobs=[];for(const c of parent.clients)world.bind(c);
  a.engine.addMob('Termite Mound',a.engine.x,a.engine.y,1);const mound=parent.mobs[0];
  a.engine.x=mound.x-12;b.engine.x=mound.x+12;b.engine.y=mound.y;observer.engine.x=mound.x+5000;
  for(let i=0;i<17;i++)world.tick(1/30);assert.equal(a.room,parent,'crossing the entrance briefly must not enter');
  for(let i=0;i<5;i++)world.tick(1/30);
  assert.ok(a.engine.moundVisit);assert.equal(a.room,b.room);assert.notEqual(a.room,parent);assert.equal(observer.room,parent);
  const nest=a.room;assert.ok(nest.mobs.some(m=>m.type==='Termite Overmind'));assert.ok(parent.mobs.includes(mound));assert.ok(!parent.mobs.some(m=>m.type==='Soldier Termite'));
  const frame=snapshot(a,nest,api);assert.equal(frame.map.dungeon.kind,'termite');assert.equal(frame.map.dungeon.rarity,1);assert.ok(api.validate(frame),JSON.stringify(api.snapshotSchema.safeParse(frame).error?.issues));
  nest.mobs.length=0;for(let i=0;i<155;i++)world.tick(1/30);
  assert.equal(a.room,parent);assert.equal(b.room,parent);assert.equal(a.engine.moundVisit,undefined);assert.equal(mound.hp,0);assert.equal(world.rooms.has(nest.key),false);
  assert.equal(a.engine.sessionKills+b.engine.sessionKills,1,'the cleared nest reward is granted only once');
});
test('an occupied nest keeps its overworld and entrance alive even when every player goes inside',()=>{
  const world=new World(api),a=client(world,'only'),parent=a.room;parent.mobs=[];world.bind(a);
  a.engine.addMob('Termite Mound',a.engine.x,a.engine.y,1);const mound=parent.mobs[0];
  for(let i=0;i<25;i++)world.tick(1/30);
  assert.ok(a.room.dungeon);assert.ok(world.rooms.has(parent.key));assert.equal(parent.clients.size,0);
  for(let i=0;i<180;i++){a.engine.invuln=1000;world.tick(1/30);}
  assert.ok(parent.mobs.includes(mound));assert.equal(parent.latent.records.has(mound.id),false);
});
