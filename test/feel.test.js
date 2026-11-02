'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadEngine,BUNDLE}=require('../server/engine'),{patchClient}=require('../server/client-patches'),{snapshot}=require('../server/snapshot'),{World}=require('../server/world');
const root=path.join(__dirname,'../florr-local-site'),api=loadEngine(root);
test('server and client use 1125 speed, 20Hz contact hits, and the same real cooldown multiplier',()=>{
  const source=patchClient(fs.readFileSync(path.join(root,BUNDLE),'utf8'));
  assert.ok(source.includes('V={speed:1125,attackRadius:104'));assert.ok(source.includes('contactInterval:1/20'));assert.ok(!source.includes('contactInterval:1/10'));assert.ok(source.includes('this.reloadMult=yt(c,this.save.talents)*.5,this.shortcutSuppressed'));
  assert.ok(source.includes('for(let roll=0;roll<rolls;roll++)this.grantLootRoll(e)'));
  assert.ok(!source.includes('t!==`Pharaoh\'s Crown`&&i&&(i.bonusUntil??0)>Date.now()&&e.rarity<7'));
  const world=new World(api),c={id:'feel',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(c);c.engine.start();world.bind(c);c.room.mobs.length=0;c.engine.spawnTimer=-10000;
  assert.equal(api.constants.speed,1125);assert.equal(api.constants.contactInterval,1/20);assert.equal(c.engine.reloadMult,.5);assert.equal(snapshot(c,c.room,api).motion.speed,1125);
  const p=c.engine.petals[0];p.hp=0;p.cd=1;
  for(let i=0;i<14;i++)world.tick(1/30);assert.ok(p.cd>0);world.tick(1/30);assert.ok(p.cd<1e-8);world.tick(1/30);assert.ok(p.hp>0);
});
test('loot performs 20 independent rolls, multiplied by daily and Super bonuses',()=>{
  const world=new World(api),save=api.defaults();
  save.shop={stars:0,claimedKills:0,bonusDay:0,bonusUntil:0,bonusCount:1,bought:[]};
  const c={id:'drop-feel',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(save,()=>.25,false)};
  world.join(c);c.engine.start();world.bind(c);c.room.mobs.length=0;c.engine.spawnTimer=-10000;
  const kill=(rarity,bonusCount,bonus)=>{
    c.room.drops.length=0;c.engine.drops=c.room.drops;c.engine.rewardedMobs=new WeakSet();
    c.engine.save.shop.bonusCount=bonusCount;
    c.engine.save.shop.bonusUntil=bonus?Date.now()+36e5:0;
    c.engine.addMob('Rock',c.engine.x+40,c.engine.y,rarity);const mob=c.engine.mobs.at(-1);
    mob.lastHitBy=c.id;c.engine.kill(mob);return c.room.drops.length;
  };
  let calls=0;const roll=c.engine.grantLootRoll;c.engine.grantLootRoll=function(m){calls++;return roll.call(this,m)};
  const base=kill(1,1,false);assert.equal(calls,20);calls=0;const double=kill(1,1,true),triple=kill(1,7,true),superBase=kill(7,1,false),superDouble=kill(7,1,true),superTriple=kill(7,7,true);
  assert.ok(base>=20,`expected >=20 base drops, got ${base}`);
  assert.equal(calls,40+60+60+120+180);
  assert.equal(double,base*2);
  assert.equal(triple,base*3);
  assert.ok(superBase>=60,`expected >=60 Super base drops, got ${superBase}`);
  assert.equal(superBase%60,0);
  assert.equal(superDouble,superBase*2);
  assert.equal(superTriple,superBase*3);
});
test('independent bonus rolls can produce different rarities instead of identical copies',()=>{
  let state=42;const rng=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/2**32),e=new api.Engine(api.defaults(),rng,false);
  e.playerId='loot-roll-test';e.start();e.mobs=[];e.drops=[];e.addMob('Rock',e.x+400,e.y,3);e.kill(e.mobs[0]);
  assert.equal(e.sessionKills,1);assert.equal(e.save.kills,1);assert.ok(new Set(e.drops.map(d=>d.rarity)).size>1,'each roll independently chooses its rarity');
  assert.equal(new Set(e.drops.map(d=>d.id)).size,e.drops.length);
});
