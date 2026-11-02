'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{loadEngine}=require('../server/engine');
const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site'));
function engine(items){const save=api.defaults();save.loadout=items.concat(Array(5).fill(null)).slice(0,5);return new api.Engine(save,()=>.5,false);}
test('Powder uses the highest rarity regardless of slot order and never stacks',()=>{
  const low={type:'Mysterious Powder',rarity:2},high={type:'Mysterious Powder',rarity:7};
  const expected=engine([high]).speedBonus;
  for(const items of [[low,high],[high,low],[high,high]]){
    const e=engine(items);assert.equal(e.speedBonus,expected);assert.equal(e.petals.filter(p=>p?.passiveActive&&p.type===high.type).length,1);
  }
});
test('Cactus health bonuses stack, preserve missing-health ratio and do not consume equipped petals',()=>{
  const item={type:'Cactus',rarity:0},base=engine([]).maxHp,one=engine([item]),two=engine([item,item]);
  assert.equal(one.maxHp-base,30);assert.equal(two.maxHp-base,60);
  one.hp=one.maxHp*.5;one.unequip(0);assert.ok(Math.abs(one.hp/one.maxHp-.5)<1e-9);
  one.equip(0,item);assert.ok(Math.abs(one.hp/one.maxHp-.5)<1e-9);
});
