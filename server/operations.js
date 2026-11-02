'use strict';
function attachCombat(c,clients){
  const e=c.engine;c.account.combatStats??={dealt:0,taken:0,kills:0,deaths:0};c.combatStats=c.account.combatStats;
  const pay=e.payPlayerDamage;
  e.onMobDamage=(_,amount,id)=>{const owner=clients.get(id);if(owner?.combatStats)owner.combatStats.dealt+=amount;};
  e.payPlayerDamage=function(...args){const hp=this.hp,result=pay.apply(this,args);c.combatStats.taken+=Math.max(0,Math.max(0,hp)-Math.max(0,this.hp));return result;};
}
function startCraft(c,raw,api){
  if(c.craftJob?.running)throw Error('A crafting job is already running');
  if(raw.scope!=='selected'&&raw.scope!=='inventory')throw Error('Invalid crafting scope');
  if(!Number.isInteger(raw.maxRarity)||raw.maxRarity<0||raw.maxRarity>8)throw Error('Invalid crafting rarity');
  if(raw.scope==='selected'&&(!raw.item||!api.canCraft(raw.item)))throw Error('Select a craftable petal');
  c.craftJob={running:true,scope:raw.scope,item:raw.item?{type:raw.item.type,rarity:raw.item.rarity}:null,maxRarity:raw.maxRarity,attempts:0,successes:0,lost:0,status:'running'};
}
function stepCraft(c,api){const job=c.craftJob;if(!job?.running)return;let budget=40,changed=false;
  const entries=job.scope==='selected'?[[`${job.item.type}:${job.item.rarity}`,c.engine.save.inventory[`${job.item.type}:${job.item.rarity}`]??0]]:Object.entries(c.engine.save.inventory).sort(([a],[b])=>Number(a.slice(a.lastIndexOf(':')+1))-Number(b.slice(b.lastIndexOf(':')+1)));
  for(const [key,count]of entries){if(count<5||budget<=0)continue;const colon=key.lastIndexOf(':'),item={type:key.slice(0,colon),rarity:Number(key.slice(colon+1))};if(item.rarity>job.maxRarity||!api.canCraft(item))continue;
    const r=api.craft(c.engine.save.inventory,item,Math.random,budget);c.onCraft?.(item,r);job.attempts+=r.attempts;job.successes+=r.successes;job.lost+=r.lost??0;budget-=r.attempts;changed||=r.attempts>0;
  }
  if(!changed){job.running=false;job.status='completed';c.events.push(`Crafted ${job.successes} of ${job.attempts} attempt(s)`);}
}
module.exports={attachCombat,startCraft,stepCraft};
