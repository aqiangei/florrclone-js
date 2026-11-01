'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world');
const api=loadEngine(path.join(__dirname,'../florr-local-site'));

function measure(type,withLentil=true){
  const world=new World(api);
  const client={id:'lentil-'+type,events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(client);client.engine.start();world.bind(client);
  const e=client.engine;
  e.save.loadout=[{type,rarity:3},withLentil?{type:'Lentil',rarity:5}:null,null,null,null];
  e.rebuildPetals();e.mode='attack';e.mobs.length=0;e.spawnTimer=-10000;e.invuln=10000;
  for(let i=0;i<240;i++)e.update(1/60);
  const petal=e.petals.find(p=>p&&p.type===type);
  assert.ok(petal&&petal.cd<=0&&petal.hp>0,`${type} not ready`);
  const lentil=e.petals.find(p=>p&&p.type==='Lentil');
  if(lentil){lentil.cd=0;lentil.hp=Math.max(1,lentil.hp);}
  // Hold the target by reference: adventure respawns can reshuffle e.mobs.
  const mob={id:9001,type:'Rock',rarity:0,x:e.x+30,y:e.y,radius:20,hp:1e9,maxHp:1e9,speed:0,damage:0,angle:0,friendly:false,aggro:false,pushX:0,pushY:0,poison:0,poisonTime:0};
  e.mobs.push(mob);
  let minD=Infinity;const samples=[];
  for(let i=0;i<90;i++){
    e.mobs.length=0;e.mobs.push(mob);
    e.update(1/60);
    const p=e.petals.find(x=>x&&x.type===type);
    if(!p||p.cd>0)continue;
    samples.push({x:p.x-e.x,y:p.y-e.y});
    minD=Math.min(minD,Math.hypot(p.x-mob.x,p.y-mob.y));
  }
  return {attractRange:e.attractRange,minD,samples};
}

test('Lentil attracts Leaf / Yucca / Starfish combat hybrids',()=>{
  for(const type of ['Leaf','Yucca','Starfish','Basic','Fang']){
    const {attractRange,minD}=measure(type);
    assert.ok(attractRange>18,`${type} lentil range`);
    assert.ok(minD<45,`${type} should be pulled toward the mob (minD=${minD})`);
  }
});

test('Lentil still skips burst-heal supports and Jelly',()=>{
  for(const type of ['Rose','Dahlia','Jelly']){
    // Healing petals can naturally pass near the target. Compare trajectories
    // to isolate Lentil's effect instead of assuming a fixed orbit distance.
    assert.deepEqual(measure(type).samples,measure(type,false).samples,`${type} trajectory must not change with Lentil`);
  }
});
