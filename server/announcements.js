'use strict';
const crypto=require('node:crypto');
const RARITIES=['普通(C)','罕见(Un)','稀有(R)','史诗(E)','传奇(L)','神话(M)','究极(U)','超级(S)','永恒(Et)','唯一(Uq)'];
class Announcements{
  constructor(clients){this.clients=clients;this.pending=new Map();}
  add(key,data){const old=this.pending.get(key);if(old){old.count+=(data.count??0);old.attempts+=(data.attempts??0);old.successes+=(data.successes??0);old.consumed+=(data.consumed??0);old.prominent||=data.prominent;}else this.pending.set(key,{count:0,attempts:0,successes:0,consumed:0,...data});}
  kill(c,m){this.add(`kill:${c.id}:${m.type}:${m.rarity}`,{kind:'kill',name:c.engine.save.name||c.account.username,type:m.type,rarity:m.rarity,count:1,prominent:m.rarity>=7});}
  spawn(c,m){if(m.rarity>=7)this.add(`spawn:${m.id}`,{kind:'spawn',type:m.type,rarity:m.rarity,biome:c.engine.save.biome,count:1,prominent:true});}
  craft(c,item,result,output){if(!result.attempts)return;this.add(`craft:${c.id}:${item.type}:${item.rarity}`,{kind:'craft',name:c.engine.save.name||c.account.username,type:item.type,rarity:item.rarity,output:output??{type:item.type,rarity:item.rarity+1},attempts:result.attempts,successes:result.successes,consumed:result.lost,prominent:item.rarity>=6&&result.successes>0});}
  flush(){if(!this.pending.size)return;const rows=[...this.pending.values()];this.pending.clear();for(const row of rows){const rarity=RARITIES[row.rarity]??String(row.rarity);let text;
    if(row.kind==='kill')text=`[击杀] ${row.name} 击杀 ${rarity} ${row.type} ×${row.count}`;
    else if(row.kind==='spawn')text=`[生成] ${row.biome} 出现 ${rarity} ${row.type}`;
    else text=`[合成] ${row.name} 消耗 ${row.consumed} 个 ${rarity} ${row.type}，尝试 ${row.attempts} 次，获得 ${row.successes} 个 ${RARITIES[row.output.rarity]??row.output.rarity} ${row.output.type}（失败 ${row.attempts-row.successes} 次）`;
    const message=JSON.stringify({type:'chat',id:crypto.randomUUID(),senderId:'server',name:'系统',channel:'Public',system:true,text});
    for(const c of this.clients.values())if(c.ws?.readyState===1){c.ws.send(message);if(row.prominent)c.events.push(text);}
  }}
}
module.exports={Announcements,RARITIES};
