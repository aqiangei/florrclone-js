'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('a newly equipped petal keeps moving between packets when dropped is omitted from the wire',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server/client-motion.js'),'utf8')+';globalThis.motion={recordOnlineMotion,smoothOnlineMotion}',context);
  let now=0;
  const engine={clock:{now:()=>now},x:100,y:100,petals:[{type:'Basic',rarity:7,spawnTime:0,dropped:false,x:148,y:100}],remotePlayers:[]};
  const frame=(x,y)=>({map:{roomId:'Garden'},rates:{snapshotHz:20},self:{x:100,y:100,state:'playing',petals:[{type:'Basic',rarity:7,spawnTime:0,x,y}]},players:[]});
  context.motion.recordOnlineMotion(engine,frame(148,100));now=50;context.motion.recordOnlineMotion(engine,frame(146,110));
  now=90;context.motion.smoothOnlineMotion(engine);const before={x:engine.petals[0].x,y:engine.petals[0].y};
  now=106;context.motion.smoothOnlineMotion(engine);
  assert.ok(engine.petals[0].y>before.y);assert.ok(engine.petals[0].x<before.x);
});
