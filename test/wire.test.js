'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Wire=require('../server/wire');
const frame=(mobs=[],room='Garden')=>({type:'snapshot',map:{roomId:room},self:{x:0,hp:1e30,petals:[null,{type:'Basic',x:-0,rarity:7}]},mobs,players:[],events:[]});
test('owned immutable frames normalize optional undefined fields before delta encoding',()=>{
  const encoder=new Wire.Encoder(),decoder=new Wire.Decoder(),first=frame();first.self.optional=undefined;first.self.list=[undefined,2];
  const packet=encoder.prepare(first,true);packet.commit();const decoded=decoder.decode(packet.bytes);assert.ok(!Object.hasOwn(decoded.self,'optional'));assert.deepEqual(decoded.self.list,[null,2]);
  const next=frame();next.self.list=[3,undefined];const delta=encoder.prepare(next,true);delta.commit();assert.deepEqual(decoder.decode(delta.bytes).self.list,[3,null]);
});
test('binary deltas retain identity across reorder, removal, room changes and keyframes',()=>{
  const encoder=new Wire.Encoder(),decoder=new Wire.Decoder();
  for(let i=0;i<420;i++){
    const f=frame(i%3?[{id:2,x:i/17,type:'Rock'},{id:1,x:100,hp:1e25}]:[{id:1,x:100,hp:1e25}],i<180?'Garden':'Ocean');
    if(i%2)f.save={name:'测试🌸',inventory:{'Basic:7':1000}};
    const packet=encoder.prepare(f),decoded=decoder.decode(packet.bytes);assert.deepEqual(decoded,f);packet.commit();
    decoded.self.petals[1].x=12345;decoded.mobs.length=0;
  }
});
test('an unsent prepared frame never changes the committed baseline or dictionary',()=>{
  const encoder=new Wire.Encoder(),decoder=new Wire.Decoder(),first=encoder.prepare(frame());decoder.decode(first.bytes);first.commit();
  encoder.prepare({...frame(),extra:'unsent string'});
  const next=encoder.prepare({...frame(),self:{x:2}});assert.deepEqual(decoder.decode(next.bytes),{...frame(),self:{x:2}});next.commit();
});
test('binary decoder rejects missing baselines, corruption, oversized and truncated frames',()=>{
  const encoder=new Wire.Encoder(),first=encoder.prepare(frame());first.commit();const second=encoder.prepare({...frame(),time:1});
  assert.throws(()=>new Wire.Decoder().decode(second.bytes),/sequence|baseline/i);
  for(let i=0;i<first.bytes.length;i++)assert.throws(()=>new Wire.Decoder().decode(first.bytes.slice(0,i)));
  const bad=first.bytes.slice();bad[2]=99;assert.throws(()=>new Wire.Decoder().decode(bad),/version/);
  assert.throws(()=>new Wire.Decoder().decode(new Uint8Array(2*1024*1024+1)),/large/);
});
