'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {loadEngine}=require('../server/engine');
const {World}=require('../server/world');
const {savePreset,loadPreset,ensurePresets,SLOT_COUNT}=require('../server/builds');

test('presets: empty apply is no-op; filled apply switches and autosaves leaving slot',()=>{
  const api=loadEngine(path.join(__dirname,'../florr-local-site'));
  const world=new World(api);
  const account={id:'builder',save:api.defaults()};
  ensurePresets(account);
  assert.equal(SLOT_COUNT,20);
  const client={id:'builder',events:[],inputAck:0,lastInput:Date.now(),engine:new api.Engine(api.normalize(account.save),()=>.5,false)};
  world.join(client);client.engine.start();world.bind(client);
  const e=client.engine;
  e.save.inventory['Rose:1']=5;e.save.inventory['Leaf:0']=5;e.save.inventory['Basic:0']=5;
  e.equip(0,{type:'Rose',rarity:1},false);e.equip(0,{type:'Leaf',rarity:0},true);

  const empty=loadPreset(account,e,0);
  assert.equal(empty.empty,true);
  assert.equal(empty.banked,false);
  assert.equal(empty.ok,false);
  assert.equal(account.loadoutPresets[0],null);
  assert.equal(e.save.loadout[0].type,'Rose');

  savePreset(account,e,0);
  assert.equal(account.loadoutPresets[0].loadout[0].type,'Rose');

  e.equip(0,{type:'Basic',rarity:0},false);
  savePreset(account,e,11); // L2
  assert.equal(account.loadoutPresets[11].loadout[0].type,'Basic');

  const loaded=loadPreset(account,e,0);
  assert.equal(loaded.ok,true);
  assert.equal(loaded.empty,false);
  assert.equal(e.save.loadout[0].type,'Rose');
  // Leaving L2 autosaved the Basic loadout first.
  assert.equal(account.loadoutPresets[11].loadout[0].type,'Basic');
});
