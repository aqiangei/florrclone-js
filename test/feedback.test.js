'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const api=loadEngine(path.join(__dirname,'../florr-local-site'));
test('shared snapshot caching and direct binary encoding retain immutable playback baselines',()=>{
  const {Encoder,Decoder}=require('../server/wire'),world=new World(api),clients=[];
  for(let i=0;i<2;i++){const c={id:'snapshot-'+i,events:[],inputAck:0,engine:new api.Engine(api.defaults(),()=>.5,false)};world.join(c);c.engine.start();c.engine.invuln=1000;c.engine.spawnTimer=-10000;clients.push(c);}
  const [c,peer]=clients;c.room.mobs=[];world.bind(c);world.bind(peer);c.engine.addMob('Rock',c.engine.x+400,c.engine.y,0);const mob=c.room.mobs[0];mob.hp=mob.maxHp=100;
  const first=snapshot(c,c.room,api,30,true);first.save=JSON.parse(JSON.stringify(first.save));const encoder=new Encoder(),decoder=new Decoder(),packet=encoder.prepare(first,true);packet.commit();decoder.decode(packet.bytes);const baseline=JSON.stringify(encoder.previous);
  c.engine.face.gazeX=7;c.engine.sessionCollected['Basic:0']=3;c.engine.totemStacks.push(1);mob.hp=80;world.tick(1/30);
  assert.equal(JSON.stringify(encoder.previous),baseline,'world mutations must not alter an already-sent baseline');
  const next=snapshot(c,c.room,api,30,true);next.save=JSON.parse(JSON.stringify(next.save));const delta=encoder.prepare(next,true);delta.commit();const decoded=decoder.decode(delta.bytes);
  assert.equal(decoded.mobs.find(m=>m.id===mob.id).hp,80);assert.equal(decoded.self.sessionCollected['Basic:0'],3);
});
test('a landed Web survives schema decoding with its expanded state and radius',()=>{
  const world=new World(api),c={id:'web',events:[],inputAck:0,engine:new api.Engine(api.defaults(),()=>.5,false)};world.join(c);c.engine.start();world.bind(c);
  c.engine.projectiles=[{x:c.engine.x+100,y:c.engine.y,vx:0,vy:0,life:10,type:'Web',rarity:0,radius:180,webGround:true}];
  const frame=api.snapshotSchema.parse(snapshot(c,c.room,api));assert.equal(frame.self.projectiles[0].webGround,true);assert.equal(frame.self.projectiles[0].radius,180);assert.ok(api.validate(frame));
});
test('Powder-speed samples keep their interpolation history while room changes still reset it',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../server/client-motion.js'),'utf8');const context={};vm.createContext(context);vm.runInContext(code+';globalThis.sampleCount=e=>onlineMotionHistory.get(e).samples.length;',context);
  let now=0;const engine={clock:{now:()=>now}},frame=(x,room='adventure:Garden')=>({map:{roomId:room},self:{x,y:0,state:'playing'},motion:{speed:4000},players:[]});
  context.recordOnlineMotion(engine,frame(0));now=100;context.recordOnlineMotion(engine,frame(400));assert.equal(context.sampleCount(engine),2);
  now=200;context.recordOnlineMotion(engine,frame(800));assert.equal(context.sampleCount(engine),3);
  now=250;context.recordOnlineMotion(engine,frame(800,'adventure:Jungle'));assert.equal(context.sampleCount(engine),1);
});
test('Jungle now fills the nearby view instead of exhausting slots in the outer ring',()=>{
  let state=42;const rng=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/2**32),world=new World(api),c={id:'jungle-density',engine:new api.Engine(api.normalize({...api.defaults(),biome:'Jungle'}),rng,false)};
  world.join(c);c.engine.start();c.room.mobs=[];c.room.spawn.regions.clear();world.bind(c);for(let i=0;i<20;i++)c.engine.populateReferenceRegions();
  const nearby=c.engine.mobs.filter(m=>Math.hypot(m.x-c.engine.x,m.y-c.engine.y)<1800);
  assert.ok(nearby.length>=30,`expected a stocked Jungle, got ${nearby.length}`);
});
