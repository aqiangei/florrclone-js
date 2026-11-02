'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{World}=require('../server/world'),{Npcs,RECIPES}=require('../server/npcs'),{loadEngine}=require('../server/engine');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function setup(biome){const world=new World(api),c={id:'npc-test',account:{},events:[],lastInput:Date.now(),engine:new api.Engine(api.normalize({...api.defaults(),biome}),()=>.5,false)};world.join(c);c.engine.start();world.bind(c);const npcs=new Npcs(world,{rng:()=>.5,now:()=>1000000});npcs.tick(c.room,0);c.engine.x=c.room.specialEntities[0].x;c.engine.y=c.room.specialEntities[0].y;return{world,c,npcs,n:c.room.specialEntities[0]};}
test('Factory has eight assemblers, with atomic recipes, stale-recipe checks and idempotent requests',()=>{
  const {c,npcs,n}=setup('Factory');assert.equal(c.room.specialEntities.length,8);n.recipe=RECIPES[5];const key=`Battery:${n.rarity}`;c.engine.save.inventory[key]=3;
  const command={id:n.id,recipe:n.recipe.id,requestId:'assembly-request'};const r=npcs.interact(c,command);
  assert.equal(c.engine.save.inventory[key],1);assert.equal(c.engine.save.inventory[`Lightning:${n.rarity}`],1);assert.strictEqual(npcs.interact(c,command),r);
  const restarted=new Npcs(npcs.world,{now:()=>1000001});assert.ok(restarted.interact(c,command).ok);assert.equal(c.engine.save.inventory[key],1);
  assert.throws(()=>npcs.interact(c,{...command,requestId:'new-request'}),/Not enough/);assert.equal(c.engine.save.inventory[key],1);
  assert.throws(()=>npcs.interact(c,{...command,requestId:'stale-request',recipe:0}),/changed/);
  c.engine.state='dead';assert.throws(()=>npcs.interact(c,{...command,requestId:'dead-request'}),/alive/);
});
test('Trader refuses restricted petals, persists the daily account cooldown and enforces reach',()=>{
  const {c,npcs,n}=setup('Desert');c.engine.save.inventory['Rose:7']=2;const command={id:n.id,item:{type:'Rose',rarity:7},requestId:'trade-request'};
  assert.throws(()=>npcs.interact(c,{...command,requestId:'basic-request',item:{type:'Basic',rarity:0}}),/cannot/);
  npcs.interact(c,command);assert.equal(c.engine.save.inventory['Rose:7'],1);assert.equal(c.engine.save.inventory['Coin:7'],1);assert.equal(c.account.traderReadyAt,87400000);
  assert.throws(()=>npcs.interact(c,{...command,requestId:'twice-request'}),/24 hours/);
  c.engine.x+=1000;assert.throws(()=>npcs.interact(c,{...command,requestId:'remote-request'}),/closer/);
});
test('Assemblers rotate identities and recipes without changing existing inventory',()=>{
  const {world,c,npcs,n}=setup('Factory');world.time=1801;const before=JSON.stringify(c.engine.save.inventory);npcs.tick(c.room,0);assert.notEqual(c.room.specialEntities[0].id,n.id);assert.equal(JSON.stringify(c.engine.save.inventory),before);
  for(const recipe of RECIPES)for(const type of [...Object.keys(recipe.input),...Object.keys(recipe.output)])assert.ok(Object.hasOwn(api.petals,type),type);
});
