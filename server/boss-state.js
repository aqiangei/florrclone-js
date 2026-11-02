'use strict';
const v8=require('node:v8');
const LINKS=['leaderId','summonerId','lootParentId','carrierId','carryingId','leechRootId'];
function plain(v,seen=new Set(),depth=0){if(v===null||typeof v!=='object')return typeof v==='function'?undefined:v;if(depth>8||seen.has(v))return undefined;seen.add(v);const out=Array.isArray(v)?[]:{};for(const [k,x]of Object.entries(v))if(!k.startsWith('server')&&!['simViewKey','simViewValue','__proto__','constructor','prototype'].includes(k)){const value=plain(x,seen,depth+1);if(value!==undefined)out[k]=value;}seen.delete(v);return out;}
function capture(world){const result=[];for(const room of world.rooms.values()){
  if(room.dungeon||room.crystal)continue;
  const mobs=room.mobs.filter(m=>m.hp>0&&!m.friendly),ids=new Set(mobs.map(m=>m.id));
  for(const record of room.latent?.records.values()??[])if(!ids.has(record.id)){try{const m=v8.deserialize(record.data);if(m.hp>0&&!m.friendly){mobs.push(m);ids.add(m.id);}}catch{}}
  for(let changed=true;changed;){changed=false;for(const m of room.mobs)if(m.hp>0&&!m.friendly&&!ids.has(m.id)&&LINKS.some(k=>ids.has(m[k]))){ids.add(m.id);mobs.push(m);changed=true;}}
  if(!mobs.length)continue;
  const count=mobs.filter(m=>m.rarity===7&&!m.segment&&m.leaderId===undefined&&m.summonerId===undefined&&m.carrierId===undefined).length;
  result.push({biome:room.biome,time:world.time,spawn:plain(room.spawn),count,target:room.superTarget??count,data:v8.serialize(mobs.map(m=>plain(m))).toString('base64')});
}return result;}
function restore(world,records){for(const record of records??[]){if(!Object.hasOwn(world.api.maps,record.biome)||typeof record.data!=='string')continue;try{
  const mobs=v8.deserialize(Buffer.from(record.data,'base64'));if(!Array.isArray(mobs))continue;
  if(Number.isFinite(record.time))world.time=Math.max(world.time,record.time);
  const engine=new world.api.Engine(world.api.normalize({...world.api.defaults(),biome:record.biome}),Math.random,false),c={id:'boss-checkpoint:'+record.biome,account:{},engine};world.join(c);const room=c.room;room.clients.delete(c);room.flowers=[];
  if(record.spawn?.rareReady)room.spawn.rareReady={...record.spawn.rareReady};room.spawn.time=world.time;
  room.mobs=mobs.filter(m=>m&&Number.isSafeInteger(m.id)&&m.hp>0&&Object.hasOwn(world.api.mobs,m.type)&&[m.x,m.y,m.radius].every(Number.isFinite));
  room.superTarget=Math.max(0,Number.isInteger(record.target)?record.target:record.count);for(const m of room.mobs)world.nextId=Math.max(world.nextId,m.id+1);
}catch(error){console.warn('Boss checkpoint skipped:',record.biome,error.message);}}}
module.exports={capture,restore};
