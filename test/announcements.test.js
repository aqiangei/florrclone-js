'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Announcements}=require('../server/announcements'),{loadEngine}=require('../server/engine');
test('all clients receive grouped kill notices and exact consumed-U / produced-S craft counts',()=>{
  const messages=[[],[]],clients=new Map(messages.map((a,i)=>[String(i),{ws:{readyState:1,send:data=>a.push(JSON.parse(data))},events:[]}])),ann=new Announcements(clients),c={id:'crafter',engine:{save:{name:'测试玩家'}},account:{username:'test'}};
  for(let i=0;i<7;i++)ann.kill(c,{type:'Rock',rarity:0});ann.kill(c,{type:'Leafbug',rarity:7});
  ann.craft(c,{type:'Rose',rarity:6},{attempts:1,successes:0,lost:2},{type:'Rose',rarity:7});ann.craft(c,{type:'Rose',rarity:6},{attempts:2,successes:2,lost:10},{type:'Rose',rarity:7});ann.flush();
  assert.deepEqual(messages[0],messages[1]);assert.ok(messages[0].some(m=>m.text.includes('Rock ×7')));const craft=messages[0].find(m=>m.text.startsWith('[合成]'));assert.match(craft.text,/消耗 12 个 究极\(U\)/);assert.match(craft.text,/获得 2 个 超级\(S\)/);assert.match(craft.text,/失败 1 次/);assert.ok(clients.get('0').events.some(m=>m===craft.text));ann.flush();assert.equal(messages[0].length,3);
});
test('Super Leafbug rolls normal/golden at exactly the 50 percent boundary, without changing other rarities',()=>{
  const api=loadEngine(require('node:path').join(__dirname,'../florr-local-site')),e=new api.Engine(api.defaults(),()=>.5,false);
  for(const [roll,rarity,expected]of [[.4999,7,'Leafbug'],[.5,7,'Golden Leafbug'],[.9999,7,'Golden Leafbug'],[.9999,6,'Leafbug']]){let calls=0;e.rng=()=>calls++===0?roll:.5;e.addMob('Leafbug',e.x+200,e.y,rarity);assert.equal(e.mobs.at(-1).type,expected);}
});
