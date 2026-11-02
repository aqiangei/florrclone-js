'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{World}=require('../server/world'),{POLICY,root}=require('../server/population'),{loadEngine}=require('../server/engine');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function setup(){let state=42;const rng=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/2**32),world=new World(api),save=api.defaults();save.loadout=Array.from({length:5},()=>({type:'Basic',rarity:7}));const c={id:'strong',account:{},lastInput:Date.now(),engine:new api.Engine(save,rng,false)};world.join(c);c.engine.start();world.bind(c);c.engine.invuln=100000;return{world,c,e:c.engine};}
function fill(world,c){for(let i=0;i<400;i++){world.time+=.1;world.population.tick(c.room,.1);}}
test('a Super loadout gets a maintained Super population, including after repeated field wipes',()=>{
  const {world,c,e}=setup();fill(world,c);
  assert.equal(c.room.mobs.filter(m=>root(m)&&m.rarity===7).length,POLICY.superTarget);
  assert.ok(c.room.mobs.filter(m=>root(m)&&m.rarity===6).length>=POLICY.ultraPerCluster);
  const survivors=c.room.mobs.filter(m=>root(m)&&m.rarity===7).slice(0,3);
  for(let wave=0;wave<3;wave++){c.room.mobs=c.room.mobs.filter(m=>survivors.includes(m));e.mobs=c.room.mobs;fill(world,c);assert.equal(c.room.mobs.filter(m=>root(m)&&m.rarity===7).length,POLICY.superTarget);for(const m of survivors)assert.ok(c.room.mobs.includes(m));}
  world.leave(c);assert.ok(world.rooms.has('Garden'),'living bosses keep their map alive between visitors');
});
test('every ordinary monster kill awards twenty times its captured XP without multiplying kill credit',()=>{
  const e=new api.Engine(api.defaults(),()=>.5,false);e.playerId='xp';e.mobs=[];
  for(const type of ['Rock','Worker Ant','Ladybug']){e.addMob(type,e.x+500,e.y,0);const m=e.mobs.at(-1),base=api.mobXp(m),before=e.sessionXP,kills=e.save.kills;e.grantKill(m,false,true);assert.equal(e.sessionXP-before,base*20);assert.equal(e.save.kills,kills+1);}
});
test('Super replacement waits thirty seconds, respects six roots, and spreads types and positions',()=>{
  const {world,c}=setup();fill(world,c);let bosses=c.room.mobs.filter(m=>root(m)&&m.rarity===7);assert.equal(bosses.length,6);assert.ok(new Set(bosses.map(m=>m.type)).size>1);
  const {deepUltra,contains}=require('../server/population');for(const boss of bosses){const region=api.spawnRegions[c.room.biome].find(r=>r.id===boss.spawnRegionId);assert.ok(deepUltra(region));assert.ok(contains(region,boss.spawnOrigin.x/c.engine.width,boss.spawnOrigin.y/c.engine.height));}
  for(let i=0;i<bosses.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(bosses[i].x-bosses[j].x,bosses[i].y-bosses[j].y)>=1000);
  const victim=bosses[0];victim.hp=0;
  for(let i=0;i<290;i++){world.time+=.1;world.population.tick(c.room,.1);}assert.equal(c.room.mobs.filter(m=>root(m)&&m.rarity===7).length,5);
  for(let i=0;i<30;i++){world.time+=.1;world.population.tick(c.room,.1);}assert.equal(c.room.mobs.filter(m=>root(m)&&m.rarity===7).length,6);
});
