'use strict';
const {TICK_HZ,SNAPSHOT_HZ}=require('./config');
const SELF_NUMBERS = 'x y hp maxHp radius angle time invuln hitFlash flashUntil hitSequence visionPenalty attractRange mana maxMana shield shieldMax amuletShield cogTimer sessionKills sessionXP chainKills distance poisonDps poisonRemaining deathAngle undead reviveCharges killHealRate absorbTime'.split(' ');
const pick = (object, keys) => Object.fromEntries(keys.map(k=>[k, object[k]]).filter(([,v])=>v!==undefined));
const PETAL_KEYS='type rarity x y hp cd suit subAngle dropped dropX dropY splits splitMult passiveActive duplicateOf spawnTime'.split(' ');
const MOB_KEYS='id type x y vx vy angle rarity hp maxHp radius hit poison poisonTime gaitPhase gaitActivity segment leaderId aggro burrowDepth wormSurface'.split(' ');
const PARTICLE_KEYS='x y vx vy life max color size text'.split(' ');
const BREAK_KEYS='x y vx vy type radius angle born duration'.split(' ');
const petal = p => p && ({...pick(p,PETAL_KEYS),
  ...(p.units?{units:p.units.map(u=>pick(u,['hp','cd','respawnTime']))}:{}),
  ...(p.motion?{motion:p.motion.map(m=>({x:m.x,y:m.y}))}: {})});
function player(client) {
  const e=client.engine;
  return {id:client.id,name:e.save.name,level:e.save.level,x:e.x,y:e.y,vx:e.moveVX,vy:e.moveVY,radius:e.radius,hp:e.hp,maxHp:e.maxHp,angle:e.angle,mode:e.mode,input:e.input,petals:e.petals.map(petal),dead:e.state==='dead',corrupted:e.corrupted,flashUntil:e.flashUntil,hitSequence:e.hitSequence};
}
function snapshot(client, room, api, hz=TICK_HZ) {
  const e=client.engine;
  const self={...pick(e,SELF_NUMBERS), state:e.state,mode:e.mode,paused:e.paused,
    compassTarget:e.compassTarget??null,sessionCollected:e.sessionCollected,
    chainComplete:e.chainComplete,lastChainKill:Number.isFinite(e.lastChainKill)?e.lastChainKill:null,
    deathAt:Number.isFinite(e.deathAt)?e.deathAt:null,lastDamageSource:e.lastDamageSource,
    totemStacks:e.totemStacks,face:e.face,overmindSlots:[...e.overmindSlots].map(([slot,remaining])=>({slot,remaining})),
    petals:e.petals.map(petal),projectiles:e.projectiles.map(p=>({...pick(p,'x y vx vy life radius type driftX driftY'.split(' ')),rarity:p.rarity??0})),
    particles:e.particles.filter(p=>p.life>0).slice(-256).map(p=>({
      ...pick(p,PARTICLE_KEYS),...(p.damage?{damage:{target:p.damage.target===e?'self':p.damage.target?.id??'self',type:p.damage.type,amount:p.damage.amount,born:p.damage.born}}:{})})),
    petalBreaks:e.petalBreaks.map(p=>pick(p,BREAK_KEYS)),mobDeaths:[],drops:room.drops.filter(d=>d.life>0&&e.ownsWorldDrop(d)).map(d=>pick(d,'x y id type rarity life'.split(' ')))};
  const range=client.viewRadius??1800;
  const nearby=[];for(const m of room.mobs){const distance=(m.x-e.x)**2+(m.y-e.y)**2;if(distance<(range+m.radius)**2)nearby.push({m,distance});}
  const mobs=nearby.sort((a,b)=>a.distance-b.distance).slice(0,200).map(({m})=>({
    ...pick(m,MOB_KEYS),hitUntil:e.time+Math.max(0,m.hit),friendly:!!m.friendly}));
  return {type:'snapshot',protocol:3,gameMode:'adventure',self,
    motion:{x:e.x,y:e.y,vx:e.moveVX,vy:e.moveVY,speed:api.constants.speed*e.speedMult*(1+e.speedBonus),rotation:e.currentRotationSpeed,pushX:e.pushX,pushY:e.pushY},
    inputAck:client.inputAck,time:e.time,rates:{hz,snapshotHz:SNAPSHOT_HZ},save:e.save,
    mobs,players:[...room.clients].filter(c=>c!==client&&c.engine.state!=='lobby').map(player),
    deaths:room.deaths??[],deathAck:room.deathSeq??0,map:{biome:e.save.biome,width:e.width,height:e.height,seed:1,roomId:room.id},
    mapMobs:mobs.map(m=>({x:m.x,y:m.y,rarity:m.rarity})),online:room.clients.size,events:client.events.splice(0,32)};
}
module.exports={snapshot};
