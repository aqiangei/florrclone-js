'use strict';
// Deterministic, offline workload. No accounts or production state are read.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world'),{snapshot}=require('../server/snapshot');
const {TICK_HZ,SNAPSHOT_HZ}=require('../server/config');
const Wire=require('../server/wire');
const api=loadEngine(path.join(__dirname,'../florr-local-site'));
function rng(seed){return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);}
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const results=[];
for(const players of [1,2]){
  const random=Math.random;Math.random=rng(42);
  try{
    const world=new World(api),clients=[];
    for(let i=0;i<players;i++){
      const save=api.defaults();save.level=100;save.loadout=['Basic','Missile','Carrot','Leaf','Rose','Peas','Lightning','Uranium','Web','Root'].filter(type=>api.petals[type]).map(type=>({type,rarity:7}));
      const c={id:'bench'+i,events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(save,Math.random,false)};
      world.join(c);c.engine.start();world.bind(c);c.engine.mode='attack';c.engine.localVisuals=true;c.encoder=new Wire.Encoder();clients.push(c);
    }
    const room=clients[0].room;room.mobs=[];for(const c of clients)world.bind(c);
    const host=clients[0].engine;
    for(let i=0;i<150;i++){const angle=i*2.399,dist=i<60?250+i*8:4000+i*12;host.addMob(i%3?'Rock':'Hornet',host.x+Math.cos(angle)*dist,host.y+Math.sin(angle)*dist,i%5);}
    const timings=[],encode=[],frames=[];let bytes=0,count=0,acc=0;
    const cpu=process.cpuUsage(),start=performance.now();
    for(let tick=0;tick<TICK_HZ*12;tick++){
      for(const c of clients){c.lastInput=Date.now();c.engine.invuln=100;}
      const at=performance.now();world.tick(1/TICK_HZ);timings.push(performance.now()-at);acc+=1/TICK_HZ;
      if(acc+1e-9>=1/SNAPSHOT_HZ){acc-=1/SNAPSHOT_HZ;for(const c of clients){
        const at=performance.now(),frame=snapshot(c,c.room,api),next=JSON.stringify(frame.save);if(next===c.saveJSON)delete frame.save;c.saveJSON=next;
        if(!api.validate(frame))throw Error(JSON.stringify(api.snapshotSchema.safeParse(frame).error?.issues));
        const packet=c.encoder.prepare(frame);bytes+=packet.bytes.length;packet.commit();c.lastVisualAck=frame.visualAck;count++;encode.push(performance.now()-at);
        if(players===1)frames.push(structuredClone(frame));
      }}
    }
    const used=process.cpuUsage(cpu);results.push({players,simulationSeconds:12,tickHz:TICK_HZ,snapshotHz:SNAPSHOT_HZ,tickMsP95:percentile(timings,.95),tickMsP99:percentile(timings,.99),encodeMsP95:percentile(encode,.95),cpuMs:(used.user+used.system)/1000,wallMs:performance.now()-start,bytesPerPlayerSecond:bytes/players/12,snapshots:count,activeMobs:room.mobs.length,latentMobs:room.latent?.records.size??0});
    if(players===1){fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/benchmark-frames.json',JSON.stringify(frames));}
  }finally{Math.random=random;}
}
const output=process.argv[2]??'test-results/benchmark-simulation.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
