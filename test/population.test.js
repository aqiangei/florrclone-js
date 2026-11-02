'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world');
const api=loadEngine(path.join(__dirname,'../florr-local-site'));
function setup(biome){
  let state=42;const rng=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/2**32);
  const world=new World(api),c={id:'population',lastInput:Date.now(),engine:new api.Engine(api.normalize({...api.defaults(),biome}),rng,false)};
  world.join(c);c.engine.start();
  c.room.mobs=[];c.room.spawn.regions.clear();world.bind(c);
  return {world,c,e:c.engine};
}
test('distant retained wounded mobs and bosses cannot block local replenishment',()=>{
  const {c,e}=setup('Garden');
  for(let i=0;i<180;i++)e.addMob('Rock',e.x+10000,e.y, i%2?7:1);
  const retained=[...e.mobs];for(const m of retained)m.hp=m.maxHp/2;
  e.populateReferenceRegions();
  assert.ok(e.mobs.length>180,'the retained field must leave room for local spawns');
  assert.ok(e.mobs.some(m=>Math.hypot(m.x-e.x,m.y-e.y)<1800),'new mobs must reach the player viewport');
  for(const m of retained){assert.ok(e.mobs.includes(m));assert.equal(m.hp,m.maxHp/2);}
  assert.equal(c.room.latent.records.size,0);
});
test('large regions spend their spawn budget around players instead of across the whole region',()=>{
  for(const biome of ['Garden','Jungle','Sewers']){
    const {e}=setup(biome);
    for(let i=0;i<20;i++)e.populateReferenceRegions();
    const roots=e.mobs.filter(m=>!m.segment&&m.leaderId===undefined&&m.summonerId===undefined&&m.carrierId===undefined);
    assert.ok(roots.some(m=>Math.hypot(m.x-e.x,m.y-e.y)<1800),biome+' needs visible mobs');
    assert.ok(roots.every(m=>Math.hypot(m.x-e.x,m.y-e.y)<=3000),biome+' must not spend slots outside the spawn window');
  }
});
test('nearby retained mobs still consume the local population cap',()=>{
  const {e}=setup('Garden');
  for(let i=0;i<e.referenceSeedCap;i++)e.addMob('Rock',e.x+600,e.y,1);
  const ids=e.mobs.map(m=>m.id);e.populateReferenceRegions();
  assert.deepEqual(e.mobs.map(m=>m.id),ids);
});
