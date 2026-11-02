'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadEngine}=require('../server/engine'),{World}=require('../server/world');
test('far idle AI preserves elapsed simulation time and immediately resumes 30Hz combat',()=>{
  const api=loadEngine(path.join(__dirname,'../florr-local-site')),world=new World(api),c={id:'lod',lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(c);c.engine.start();c.room.mobs=[];world.bind(c);const e=c.engine;e.spawnTimer=-10000;e.invuln=1000;
  e.addMob('Rock',e.x+1600,e.y,0);const mob=e.mobs[0],original=e.advanceMobSpecial;let calls=0,elapsed=0;
  e.advanceMobSpecial=function(m,dt,distance){if(m===mob){calls++;elapsed+=dt;}return original.call(this,m,dt,distance);};
  for(let i=0;i<60;i++)world.tick(1/30);
  assert.ok(calls>=19&&calls<=22,`far AI calls: ${calls}`);assert.ok(elapsed>=1.9&&elapsed<=2.01,`elapsed: ${elapsed}`);
  mob.aggro=true;mob.hp--;mob.x=e.x+300;mob.y=e.y;calls=0;elapsed=0;for(let i=0;i<30;i++)world.tick(1/30);
  assert.equal(calls,30);assert.ok(elapsed>=1&&elapsed<1.11,'combat catches up any pending idle time');
});
