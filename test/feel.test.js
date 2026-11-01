'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadEngine,BUNDLE}=require('../server/engine'),{patchClient}=require('../server/client-patches'),{snapshot}=require('../server/snapshot'),{World}=require('../server/world');
const root=path.join(__dirname,'../florr-local-site'),api=loadEngine(root);
test('server and client use 750 speed and the same real cooldown multiplier',()=>{
  const source=patchClient(fs.readFileSync(path.join(root,BUNDLE),'utf8'));
  assert.ok(source.includes('V={speed:750,attackRadius:104'));assert.ok(source.includes('this.reloadMult=yt(c,this.save.talents)*.5,this.shortcutSuppressed'));
  const world=new World(api),c={id:'feel',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.defaults(),()=>.5,false)};
  world.join(c);c.engine.start();world.bind(c);c.room.mobs.length=0;c.engine.spawnTimer=-10000;
  assert.equal(api.constants.speed,750);assert.equal(c.engine.reloadMult,.5);assert.equal(snapshot(c,c.room,api).motion.speed,750);
  const p=c.engine.petals[0];p.hp=0;p.cd=1;
  for(let i=0;i<14;i++)world.tick(1/30);assert.ok(p.cd>0);world.tick(1/30);assert.ok(p.cd<1e-8);world.tick(1/30);assert.ok(p.hp>0);
});
