'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function fixture(){const world=new World(api),save=api.defaults();save.loadout=[{type:'Coral',rarity:7},null,null,null,null];const c={id:'coral',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(save,()=>.5,false)};world.join(c);c.engine.start();world.bind(c);c.engine.localVisuals=true;return {c,e:c.engine};}
test('all generated Coral fragment break sprites are valid protocol events',()=>{
  const {c,e}=fixture(),p=e.petals[0];
  e.breakCoral(p,0);e.fadePetal(p,1);e.fadePetal(p,2);e.breakCoral(p,1);e.fadePetal(p,3);
  const types=e.visualEvents.records.filter(r=>r.kind==='break').map(r=>r.petal.type);
  for(const type of ['Coral','coral-piece-1a','coral-piece-1b','coral-piece-2'])assert.ok(types.includes(type),JSON.stringify(types));
  const frame=snapshot(c,c.room,api);assert.ok(api.validate(frame));assert.equal(api.snapshotSchema.safeParse(frame).success,true);assert.equal(c.invalidVisuals,0);
});
test('one corrupt cosmetic event is skipped without blocking authoritative snapshots',()=>{
  const {c,e}=fixture();
  e.visualEvents.emit({kind:'break',petal:{x:e.x,y:e.y,vx:0,vy:0,type:'invalid-art',radius:10,angle:0,born:e.time,duration:.5}},e.time,c.room.id,.5);
  e.addParticle({x:e.x,y:e.y,vx:0,vy:0,life:1,max:1,color:'#fff',size:10});
  const frame=snapshot(c,c.room,api);assert.ok(api.validate(frame));assert.equal(c.invalidVisuals,1);assert.ok(frame.visuals.some(v=>v.kind==='particle'));assert.equal(frame.visualAck,e.visualEvents.sequence);assert.equal(e.state,'playing');
});
