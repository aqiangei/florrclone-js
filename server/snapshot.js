'use strict';
const {TICK_HZ,SNAPSHOT_HZ}=require('./config');
const {LootField}=require('./loot');
const SELF_NUMBERS = 'x y hp maxHp radius angle time invuln hitFlash flashUntil hitSequence visionPenalty attractRange mana maxMana shield shieldMax amuletShield armor cogTimer sessionKills sessionXP chainKills distance poisonDps poisonRemaining deathAngle undead reviveCharges killHealRate absorbTime'.split(' ');
const pick = (object, keys) => {const result={};for(const key of keys)if(object[key]!==undefined)result[key]=object[key];return result;};
const PETAL_KEYS='type rarity x y hp cd suit subAngle dropped dropX dropY splits splitMult passiveActive duplicateOf spawnTime activation'.split(' ');
const MOB_KEYS='id type x y vx vy angle rarity hp maxHp radius hit poison poisonTime gaitPhase gaitActivity segment leaderId aggro burrowDepth wormSurface'.split(' ');
const PARTICLE_KEYS='x y vx vy life max color size text'.split(' ');
const BREAK_KEYS='x y vx vy type radius angle born duration'.split(' ');
const SHOT_KEYS='x y vx vy radius damage life type docked waveHeading electricWeb hp suit orbit'.split(' ');
const petal = p => p && ({...pick(p,PETAL_KEYS),
  ...(p.units?{units:p.units.map(u=>pick(u,['hp','cd','respawnTime']))}:{}),
  ...(p.motion?{motion:p.motion.map(m=>({x:m.x,y:m.y}))}: {})});
function player(client,api) {
  const e=client.engine;
  const name=String(e.save.name||client.account?.username||'Player').trim().slice(0,20)||'Player';
  return {id:client.id,name,guildName:api.guildName?.(client.account)??'',level:e.save.level,x:e.x,y:e.y,vx:e.moveVX,vy:e.moveVY,radius:e.radius,hp:e.hp,maxHp:e.maxHp,angle:e.angle,mode:e.mode,input:{...e.input},petals:e.petals.map(petal),dead:e.state==='dead',corrupted:e.corrupted,flashUntil:e.flashUntil,hitSequence:e.hitSequence};
}
function snapshot(client, room, api, hz=TICK_HZ, sharedCache=false) {
  const e=client.engine;
  let cache;
  if(sharedCache){
    cache=room.snapshotCache;
    if(!cache||cache.generation!==room.snapshotGeneration||cache.source!==room.mobs||cache.length!==room.mobs.length)
      cache=room.snapshotCache={generation:room.snapshotGeneration,source:room.mobs,length:room.mobs.length,mobs:new Map(),players:new Map()};
  }
  room.loot??=new LootField(api);room.loot.ensure(room.drops);
  const visibleDrops=room.loot.visible(e,client.viewRadius??1800);
  const self={...pick(e,SELF_NUMBERS), armor:Number.isFinite(e.armor)?e.armor:0, state:e.state,mode:e.mode,paused:e.paused,
    compassTarget:e.compassTarget?{...e.compassTarget}:null,sessionCollected:{...e.sessionCollected},sessionMobKills:{...e.sessionMobKills},
    chainComplete:e.chainComplete,lastChainKill:Number.isFinite(e.lastChainKill)?e.lastChainKill:null,
    deathAt:Number.isFinite(e.deathAt)?e.deathAt:null,lastDamageSource:e.lastDamageSource,
    totemStacks:e.totemStacks.slice(),face:{...e.face},overmindSlots:[...e.overmindSlots].map(([slot,remaining])=>({slot,remaining})),
    petals:e.petals.map(petal),
    // Schema caps projectiles/particles at 4096; overshoot closes the socket.
    projectiles:e.projectiles.slice(-2048).map(p=>({...pick(p,'x y vx vy life radius type driftX driftY webGround'.split(' ')),rarity:Number.isInteger(p.rarity)?p.rarity:0})),
    particles:e.particles.filter(p=>p.life>0).slice(-256).map(p=>({
      ...pick(p,PARTICLE_KEYS),...(p.damage?{damage:{target:p.damage.target===e?'self':p.damage.target?.id??'self',type:p.damage.type,amount:p.damage.amount,born:p.damage.born}}:{})})),
    petalBreaks:e.petalBreaks.slice(-512).map(p=>pick(p,BREAK_KEYS)),mobDeaths:[],
    drops:visibleDrops.map(d=>pick(d,'x y id type rarity life'.split(' ')))};
  const range=client.viewRadius??1800;
  const nearby=[];for(const m of room.mobs){const distance=(m.x-e.x)**2+(m.y-e.y)**2;if(distance<(range+m.radius)**2)nearby.push({m,distance});}
  const mobs=nearby.sort((a,b)=>a.distance-b.distance).slice(0,200).map(({m})=>{
    if(cache?.mobs.has(m))return cache.mobs.get(m);
    const record={
    ...pick(m,MOB_KEYS),...pick(m,'hornetReload hornetTelegraph shellRecallTime shellShield scorpionArmed jellyWindup jellyWaves helTeleport leechRootId corruptedDigger'.split(' ')),
    shots:(m.shots??[]).filter(s=>s.life>0).slice(0,32).map(s=>({...pick(s,SHOT_KEYS),...s.orbit?{orbit:{...s.orbit}}:{}})),hitUntil:e.time+Math.max(0,m.hit),friendly:!!m.friendly};
    cache?.mobs.set(m,record);return record;
  });
  if(e.localVisuals){self.particles=[];self.petalBreaks=[];}
  const visualRecords=e.localVisuals?e.visualEvents.since(client.lastVisualAck??0,e.time,room.id):[];
  const visuals=visualRecords.filter(event=>api.validateVisual(event));
  client.invalidVisuals=(client.invalidVisuals??0)+visualRecords.length-visuals.length;
  return {type:'snapshot',protocol:3,gameMode:'adventure',self,
    specialEntities:api.specialEntities?.(client)??[],
    ...(e.localVisuals?{visuals,visualAck:e.visualEvents.sequence}:{}),
    motion:{x:e.x,y:e.y,vx:e.moveVX,vy:e.moveVY,speed:api.constants.speed*e.speedMult*(1+e.speedBonus),rotation:e.currentRotationSpeed,pushX:e.pushX,pushY:e.pushY},
    inputAck:client.inputAck,time:e.time,rates:{hz,snapshotHz:SNAPSHOT_HZ},save:e.save,
    mobs,players:[...room.clients].filter(c=>c!==client&&c.engine.state!=='lobby').map(c=>{
      if(cache?.players.has(c))return cache.players.get(c);const record=player(c,api);cache?.players.set(c,record);return record;
    }),
    deaths:(room.deaths??[]).map(d=>({...d,...d.leechBody?{leechBody:d.leechBody.map(p=>({...p}))}:{}})),deathAck:room.deathSeq??0,map:{biome:e.save.biome,width:e.width,height:e.height,seed:1,roomId:room.id,...room.dungeon?{dungeon:{kind:'termite',rarity:room.dungeon.mound.rarity}}:{}},
    mapMobs:mobs.map(m=>({x:m.x,y:m.y,rarity:m.rarity})),online:room.clients.size,events:client.events.splice(0,32)};
}
module.exports={snapshot};
