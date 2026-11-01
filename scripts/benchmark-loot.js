'use strict';
const fs=require('node:fs'),path=require('node:path'),{loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const api=loadEngine(path.join(__dirname,'../florr-local-site')),p95=values=>values.sort((a,b)=>a-b)[Math.floor(values.length*.95)],results=[];
for(const count of [1000,10000,20000]){
  const world=new World(api),c={id:'loot-bench',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(c);c.engine.start();world.bind(c);c.engine.invuln=10000;c.engine.spawnTimer=-10000;c.engine.localVisuals=true;c.room.mobs=[];world.bind(c);
  const {x,y}=c.engine;
  for(let i=0;i<count;i++)c.room.drops.push({id:world.nextId++,type:i%2?'Rock':'Basic',rarity:i%8,x:x+300+(i%100)*25,y:y+Math.floor(i/100)*25,life:120,ownerId:c.id});
  const times=[];for(let i=0;i<60;i++){const at=performance.now(),frame=snapshot(c,c.room,api);if(!api.validate(frame))throw Error('Invalid loot frame');times.push(performance.now()-at);}
  const ticks=[];for(let i=0;i<30;i++){c.lastInput=Date.now();const at=performance.now();world.tick(1/30);ticks.push(performance.now()-at);}
  const preserved=c.room.drops.length,frame=snapshot(c,c.room,api);
  results.push({initialDrops:count,preservedDrops:preserved,visibleDrops:frame.self.drops.length,snapshotMsP95:p95(times),tickMsP95:p95(ticks),queries:c.room.loot?.stats});
}
const output=process.argv[2]??'test-results/benchmark-loot.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
