'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{World}=require('../server/world'),{Crystals,XP,CAPACITY}=require('../server/crystals'),{loadEngine}=require('../server/engine');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function setup(world,id){const c={id,account:{},events:[],lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};world.join(c);c.engine.start();world.bind(c);const p=world.crystals.portal(c.engine);c.engine.x=p.x;c.engine.y=p.y;c.engine.portalCooldown=0;return c;}
test('Crystal entrance creates one private room per player and exit preserves the shared Garden',()=>{
  const world=new World(api),a=setup(world,'a'),b=setup(world,'b'),garden=a.room,mobs=garden.mobs;
  assert.ok(world.crystals.enter(a));assert.ok(world.crystals.enter(b));assert.notEqual(a.room,b.room);assert.equal(a.room.clients.size,1);assert.equal(a.room.mobs.length,0);assert.equal(a.engine.width,2400);assert.equal(a.engine.geometry.isFreeCircle(1200,900,20),false);
  world.crystals.exit(a);assert.equal(a.room,garden);assert.strictEqual(a.room.mobs,mobs);assert.equal(a.engine.width,28800);assert.equal(a.engine.crystalVisit,undefined);
});
test('absorption uses Wiki XP, consumes energy and inventory atomically, and rejects restricted petals',()=>{
  const world=new World(api),c=setup(world,'absorb');world.crystals.enter(c);const e=c.engine;e.save.inventory['Rose:4']=3;const old=e.sessionXP;
  const r=world.crystals.absorb(c,{item:{type:'Rose',rarity:4},count:2});assert.equal(r.xpGained,20000);assert.equal(e.sessionXP-old,20000);assert.equal(e.save.inventory['Rose:4'],1);assert.ok(Math.abs(c.account.crystalEnergy.value-(CAPACITY-20000))<.1);
  for(const type of ['Basic','Square','Fragment'])assert.throws(()=>world.crystals.absorb(c,{item:{type,rarity:0}}),/cannot/);
  c.account.crystalEnergy.value=0;c.account.crystalEnergy.at=Date.now();assert.throws(()=>world.crystals.absorb(c,{item:{type:'Rose',rarity:4}}),/energy/);assert.equal(e.save.inventory['Rose:4'],1);
  world.crystals.exit(c);assert.throws(()=>world.crystals.absorb(c,{item:{type:'Rose',rarity:4}}),/Enter/);assert.equal(XP[7],5000000000);
});
test('Crystal energy survives leaving and recovers half the missing charge over twelve hours',()=>{
  const world=new World(api);let now=1000000;new Crystals(world,{now:()=>now});const c=setup(world,'energy');c.account.crystalEnergy={value:0,at:now};now+=12*3600000;assert.equal(world.crystals.status(c).energy,CAPACITY/2);
  world.crystals.enter(c);c.engine.state='dead';c.engine.hp=0;world.crystals.approach(c);assert.equal(c.room.biome,'Garden');assert.equal(c.engine.crystalVisit,undefined);
});
