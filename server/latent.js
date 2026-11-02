'use strict';
const v8=require('node:v8');
const LINKS=['leaderId','summonerId','lootParentId','carrierId','carryingId','leechRootId'];
// A sleeping mob is a compact serialized record, absent from every active
// entity query. Restore the exact state/id rather than rolling another mob.
// Wounded mobs, summons, linked packs and bosses remain live.
class LatentPopulation{
  constructor({grace=5,limit=2048,wakeBudget=32,activeLimit=256}={}){this.records=new Map();this.farSince=new Map();this.grace=grace;this.limit=limit;this.wakeBudget=wakeBudget;this.activeLimit=activeLimit;this.nextCensus=0;this.restored=0;this.slept=0;}
  near(m,viewers,margin){return viewers.some(e=>(m.x-e.x)**2+(m.y-e.y)**2<=(Math.max(1800,e.simulationViewRadius??1800)+(m.radius??0)+margin)**2);}
  eligible(m,referenced){
    return m.hp>0&&m.hp===m.maxHp&&m.rarity<7&&!m.serverDungeonOpen&&!m.friendly&&!m.aggro&&!m.segment&&!referenced.has(m.id)&&
      LINKS.every(k=>m[k]===undefined)&&m.ownerId===undefined&&m.lastHitBy===undefined&&m.lastHitByMob===undefined&&m.summonAggroId===undefined&&m.poisonBy===undefined&&
      !m.poison&&!m.poisonTime&&!m.hit&&!m.slowTime&&!m.armorDebuffTime&&!m.chargeRemaining&&!m.wildUndead&&!m.revived&&!m.flowerEquipment&&!m.helTeleport&&
      !m.shots?.some(s=>s.life>0)&&!m.healingSuppression?.some(n=>n>0);
  }
  census(room,viewers,time){
    if(time+1e-9<this.nextCensus)return;this.nextCensus=time+.25;
    const wake=[];for(const record of this.records.values())if(this.near(record,viewers,512))wake.push(record);
    const distance=m=>Math.min(...viewers.map(e=>(m.x-e.x)**2+(m.y-e.y)**2));
    wake.sort((a,b)=>distance(a)-distance(b));
    const referenced=new Set();for(const m of room.mobs)for(const key of LINKS)if(m[key]!==undefined)referenced.add(m[key]);
    const keep=[],seen=new Set();
    for(const m of room.mobs){
      seen.add(m.id);
      if(this.records.size>=this.limit||this.near(m,viewers,1024)||!this.eligible(m,referenced)){this.farSince.delete(m.id);keep.push(m);continue;}
      const since=this.farSince.get(m.id)??time;this.farSince.set(m.id,since);
      if(time-since<this.grace&&!(wake.length&&room.mobs.length>=this.activeLimit)){keep.push(m);continue;}
      try{
        // Visibility caches contain engine references and must not be retained.
        const state=Object.fromEntries(Object.entries(m).filter(([k,v])=>v!==undefined&&k!=='simViewKey'&&k!=='simViewValue'));
        const data=v8.serialize(state);
        this.records.set(m.id,{id:m.id,type:m.type,rarity:m.rarity,x:m.x,y:m.y,radius:m.radius,hp:m.hp,spawnRegionId:m.spawnRegionId,data});
        this.farSince.delete(m.id);this.slept++;
      }catch{keep.push(m);}
    }
    for(const id of this.farSince.keys())if(!seen.has(id))this.farSince.delete(id);
    room.mobs=keep;
    const budget=Math.min(this.wakeBudget,Math.max(0,this.activeLimit-room.mobs.length));
    for(const record of wake.slice(0,budget)){room.mobs.push(v8.deserialize(record.data));this.records.delete(record.id);this.restored++;}
  }
}
module.exports={LatentPopulation};
