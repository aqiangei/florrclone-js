'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot'),{LootField,PICKUP_BUDGET,VISIBLE_BUDGET}=require('../server/loot');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function fixture(){
  const world=new World(api),c={id:'loot-owner',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(c);c.engine.start();world.bind(c);c.room.mobs=[];world.bind(c);c.engine.spawnTimer=-10000;c.engine.invuln=10000;c.engine.localVisuals=true;return {world,c,e:c.engine};
}
function add(room,id,x,y,extra={}){const d={id,type:'Basic',rarity:0,life:120,x,y,ownerId:'loot-owner',...extra};room.drops.push(d);return d;}
test('20,000 unexpired drops survive; only 256 nearby owned drops enter a valid snapshot',()=>{
  const {world,c,e}=fixture();
  for(let i=0;i<20000;i++)add(c.room,world.nextId++,e.x+350+(i%80)*2,e.y+Math.floor(i/80)*2);
  world.tick(1/30);assert.equal(c.room.drops.length,20000);
  const frame=snapshot(c,c.room,api);assert.ok(api.validate(frame));assert.equal(frame.self.drops.length,VISIBLE_BUDGET);assert.equal(c.room.loot.stats.invalidDrops,0);
  const far=add(c.room,world.nextId++,e.x+10000,e.y,{rarity:7});world.tick(1/30);assert.ok(!snapshot(c,c.room,api).self.drops.some(d=>d.id===far.id));
  e.x=far.x;e.y=far.y+200;world.tick(1/30);assert.ok(snapshot(c,c.room,api).self.drops.some(d=>d.id===far.id));assert.equal(c.room.drops.length,20001);
});
test('mass pickup is bounded per tick and every reward is credited exactly once',()=>{
  const {world,c,e}=fixture(),before=e.save.inventory['Basic:0']??0,total=2000;
  for(let i=0;i<total;i++)add(c.room,world.nextId++,e.x,e.y);
  world.tick(1/30);assert.equal((e.save.inventory['Basic:0']??0)-before,PICKUP_BUDGET);assert.equal(c.room.drops.length,total-PICKUP_BUDGET);
  for(let i=0;i<30;i++)world.tick(1/30);
  assert.equal((e.save.inventory['Basic:0']??0)-before,total);assert.equal(e.sessionCollected['Basic:0'],total);assert.equal(c.room.drops.length,0);assert.equal(c.room.loot.ids.size,0);assert.equal(c.room.loot.cells.size,0);
});
test('ownership and squad sharing do not duplicate loot, and expiry remains normal',()=>{
  const {world,c,e}=fixture(),other={id:'other',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(other);other.engine.start();world.bind(other);other.engine.x=e.x+10;other.engine.y=e.y;other.engine.invuln=100;
  c.squadCode=other.squadCode='party';world.bind(c);world.bind(other);
  const beforeA=e.save.inventory['Basic:0']??0,beforeB=other.engine.save.inventory['Basic:0']??0;
  for(let i=0;i<400;i++)add(c.room,world.nextId++,e.x+5,e.y,{squadId:'party'});
  const privateDrop=add(c.room,world.nextId++,e.x,e.y,{ownerId:'third-player'});
  const expired=add(c.room,world.nextId++,e.x+800,e.y,{life:.01});
  for(let i=0;i<4;i++)world.tick(1/30);
  assert.equal((e.save.inventory['Basic:0']??0)-beforeA+(other.engine.save.inventory['Basic:0']??0)-beforeB,400);
  assert.deepEqual(c.room.drops.map(d=>d.id),[privateDrop.id]);assert.ok(!c.room.loot.ids.has(expired.id));assert.ok(!snapshot(c,c.room,api).self.drops.some(d=>d.id===privateDrop.id));
});
test('the spatial nearest selection matches a full sort across cells and item movement',()=>{
  const field=new LootField(api),drops=[],engine={x:-25,y:100,ownsWorldDrop:d=>d.ownerId==='loot-owner'};
  let seed=7;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<4000;i++)drops.push({id:i,type:'Basic',rarity:0,life:120,x:random()*6000-3000,y:random()*6000-3000,ownerId:i%3?'loot-owner':'other'});
  field.ensure(drops);
  function check(){const expected=drops.filter(d=>d.life>0&&engine.ownsWorldDrop(d)&&(d.x-engine.x)**2+(d.y-engine.y)**2<=900**2).sort((a,b)=>(a.x-engine.x)**2+(a.y-engine.y)**2-((b.x-engine.x)**2+(b.y-engine.y)**2)||a.id-b.id).slice(0,128).map(d=>d.id);assert.deepEqual(field.nearest(engine,900,128).map(d=>d.id),expected);}
  check();for(const d of drops.slice(0,100)){d.x=engine.x;d.y=engine.y;}field.moved(drops.slice(0,100));check();
});
test('a malformed drop is isolated instead of making every scene frame invalid',()=>{
  const {world,c,e}=fixture();add(c.room,world.nextId++,e.x+400,e.y);
  add(c.room,world.nextId++,NaN,e.y);add(c.room,world.nextId++,e.x,e.y,{type:'not-a-petal'});add(c.room,world.nextId++,e.x,e.y,{rarity:999});
  assert.ok(api.validate(snapshot(c,c.room,api)));assert.equal(c.room.loot.stats.invalidDrops,3);world.tick(1/30);assert.equal(c.room.drops.length,1);
});
test('200 simultaneous kills produce valid loot scenes without losing their rewards',()=>{
  const {world,c,e}=fixture();e.rng=()=>.25;
  for(let i=0;i<200;i++)e.addMob('Rock',e.x+400+i%10,e.y+Math.floor(i/10),4);
  for(const m of [...c.room.mobs]){m.lastHitBy=c.id;e.kill(m);}
  assert.equal(e.sessionKills,200);assert.ok(c.room.drops.length>=200);
  const count=c.room.drops.length;for(let i=0;i<10;i++){world.tick(1/30);assert.ok(api.validate(snapshot(c,c.room,api)));}
  assert.equal(c.room.drops.length,count);assert.equal(c.room.loot.stats.invalidDrops,0);
});
