'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{LatentPopulation}=require('../server/latent');
const mob=(id,extra={})=>({id,type:'Rock',rarity:1,x:9000,y:9000,radius:30,hp:100,maxHp:100,angle:.3,specialTimer:1.7,spawnRegionId:4,...extra});
test('far mobs sleep outside active queries, then restore the same id, health, position and timers',()=>{
  const population=new LatentPopulation({grace:1}),room={mobs:[mob(10)]},viewers=[{x:0,y:0}];
  population.census(room,viewers,0);assert.equal(room.mobs.length,1);
  population.census(room,viewers,1.1);assert.equal(room.mobs.length,0);assert.equal(population.records.size,1);
  assert.ok(Buffer.isBuffer(population.records.get(10).data));
  population.census(room,[{x:9000,y:9000}],1.4);assert.deepEqual(room.mobs,[mob(10)]);assert.equal(population.records.size,0);
});
test('combatants, bosses, projectiles, summons and linked families cannot sleep',()=>{
  const population=new LatentPopulation({grace:0}),mobs=[mob(1,{hp:90}),mob(2,{rarity:7}),mob(3,{shots:[{life:1}]}),mob(4,{friendly:true}),mob(5,{aggro:true}),mob(6),mob(7,{leaderId:6}),mob(8,{poisonTime:2}),mob(9,{ownerId:'player'})],room={mobs};
  population.census(room,[{x:0,y:0}],0);assert.deepEqual(room.mobs,mobs);assert.equal(population.records.size,0);
});
test('all player and corpse viewports anchor population, with a bounded wake budget',()=>{
  const population=new LatentPopulation({grace:0,wakeBudget:2}),room={mobs:[mob(1),mob(2),mob(3)]};
  population.census(room,[{x:9000,y:9000,state:'dead'}],0);assert.equal(room.mobs.length,3);
  population.census(room,[],.3);assert.equal(population.records.size,3);
  population.census(room,[{x:9000,y:9000}],.6);assert.equal(room.mobs.length,2);assert.equal(population.records.size,1);
  population.census(room,[{x:9000,y:9000}],.9);assert.equal(room.mobs.length,3);
});
test('waking respects the active budget without deleting already active combatants',()=>{
  const population=new LatentPopulation({grace:0,activeLimit:2}),room={mobs:[mob(1),mob(2),mob(3)]};
  population.census(room,[],0);assert.equal(population.records.size,3);
  room.mobs.push(mob(4,{x:9000,hp:50}));
  population.census(room,[{x:9000,y:9000}],.3);
  assert.equal(room.mobs.length,2);assert.equal(population.records.size,2);assert.ok(room.mobs.some(m=>m.id===4));
});
test('world updates keep distant mobs active rather than sleeping or replacing them',()=>{
  const {loadEngine}=require('../server/engine'),{World}=require('../server/world');
  const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site')),world=new World(api);
  const c={id:'latent-census',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.normalize({...api.defaults(),biome:'Desert'}),()=>.5,false)};
  world.join(c);c.engine.start();world.bind(c);c.engine.spawnTimer=-10000;c.room.mobs.length=0;
  c.engine.addMob('Rock',c.engine.x+8000,c.engine.y,0);const m=c.engine.mobs.at(-1);
  const [region,state]=[...c.room.spawn.regions][0];m.spawnRegionId=region;state.alive.add(m.id);(state.groups??=[]).push(new Set([m.id]));
  c.room.latent.grace=0;world.tick(1/30);assert.equal(c.room.latent.records.size,0);assert.ok(c.room.mobs.some(n=>n.id===m.id));
  c.engine.populateReferenceRegions();assert.ok(state.alive.has(m.id),'living mobs retain their regional population credit');
});
