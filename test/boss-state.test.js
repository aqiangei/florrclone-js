'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{World}=require('../server/world'),BossState=require('../server/boss-state'),{snapshot}=require('../server/snapshot'),{loadEngine}=require('../server/engine');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function setup(world){const c={id:'boss-test',account:{},events:[],lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};world.join(c);c.engine.start();world.bind(c);c.room.mobs=[];world.bind(c);return c;}
test('crowded snapshots retain a living wounded Super ahead of ordinary monsters',()=>{
  const world=new World(api),c=setup(world),e=c.engine;e.addMob('Rock',e.x+1200,e.y,7);const boss=e.mobs[0];boss.hp=12345;
  for(let i=0;i<240;i++)e.addMob('Rock',e.x+i,e.y+100,0);
  const frame=snapshot(c,c.room,api);assert.equal(frame.mobs.length,200);assert.ok(frame.mobs.some(m=>m.id===boss.id&&m.hp===12345));
  world.leave(c);assert.ok(world.rooms.has('Garden'));
});
test('boss checkpoints keep identity, location, health, family and the existing target across restart',()=>{
  const world=new World(api),c=setup(world),e=c.engine;e.addMob('Rock',e.x+1200,e.y,7);const boss=e.mobs[0];boss.hp=12345;boss.poisonTime=4;e.addMob('Rock',boss.x+100,boss.y,6);e.mobs[1].summonerId=boss.id;c.room.superTarget=1;
  const data=BossState.capture(world),restarted=new World(api);BossState.restore(restarted,data);const room=restarted.rooms.get('Garden'),restored=room.mobs.find(m=>m.id===boss.id);
  assert.equal(restored.hp,12345);assert.equal(restored.x,boss.x);assert.equal(restored.poisonTime,4);assert.equal(room.mobs.length,2);assert.equal(room.superTarget,1);assert.ok(restarted.nextId>Math.max(...room.mobs.map(m=>m.id)));
});
