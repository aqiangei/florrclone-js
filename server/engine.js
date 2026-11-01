'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const {patchFeel}=require('./feel');
const BUNDLE = '_next/static/chunks/page-tick10-746d9e01379dbea7.js';
const HASH = '746d9e01379dbea7d3ac03b1fa7a48c0d4bd1cc84f6e5f1511face49140d8fd7';

// The captured client contains the simulation and its schemas. Pin the capture:
// upgrades must deliberately re-audit these boundaries and the protocol tests.
function loadEngine(webRoot) {
  const source = fs.readFileSync(path.join(webRoot, BUNDLE), 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') !== HASH)
    throw new Error('Client capture changed; re-audit server/engine.js before upgrading.');
  let code = source.slice(source.indexOf('var a='), source.indexOf(';function hj'));
  const pickupLoop='this.refreshPickup();for(let t of this.drops){';
  if(code.split(pickupLoop).length!==2)throw Error('Loot pickup boundary changed');
  code=code.replace(pickupLoop,'this.refreshPickup();for(let t of this.queryWorldDrops?this.queryWorldDrops(this):this.drops){');
  const pickupFilter='if(this.drops=this.drops.filter(e=>e.life>0),this.roomHost&&this.waveMode';
  if(code.split(pickupFilter).length!==2)throw Error('Loot cleanup boundary changed');
  code=code.replace(pickupFilter,'if(this.externalDropLifetime||(this.drops=this.drops.filter(e=>e.life>0)),this.roomHost&&this.waveMode');
  const census='Uo(this.referenceSpawnState,this.save.biome,this.mobs)';
  if(code.split(census).length!==3)throw Error('Population census boundary changed');
  code=code.split(census).join('Uo(this.referenceSpawnState,this.save.biome,this.latentMobRecords?.length?this.mobs.concat(this.latentMobRecords):this.mobs)');
  // The world manager retains far mobs; the captured replenisher must not
  // delete them before the sleep grace period, or remove far bosses.
  const farCull='if(a!==1/0&&o?.length){let e=(e,t)=>s.every';
  if(code.split(farCull).length!==2)throw Error('Far population boundary changed');
  code=code.replace(farCull,'if(!this.latentManaged&&a!==1/0&&o?.length){let e=(e,t)=>s.every');
  // Moon is a physical petal too: enemy projectiles must collide with it.
  const shotSkip='if(n.wearable||n.orbitCenter||t.burrowLeft>0&&!e.dropped)continue';
  if(code.split(shotSkip).length!==2)throw Error('Projectile collision boundary changed');
  code=code.replace(shotSkip,'if(n.wearable||t.burrowLeft>0&&!e.dropped)continue');
  // Carrot should launch on attack even while defend is also held (left+right
  // mouse / space+shift). The capture gated on !defendHeld, which left Carrot
  // stuck in orbit for the common attack+defend control style; Missile already
  // fires in that state.
  const carrotFire='if(n.type===`Carrot`&&this.mode===`attack`&&!this.defendHeld&&this.time-(n.spawnTime??0)+1e-9>=a.activationDelay*this.reloadMult)';
  if(code.split(carrotFire).length!==2)throw Error('Carrot launch boundary changed');
  code=code.replace(carrotFire,'if(n.type===`Carrot`&&this.mode===`attack`&&this.time-(n.spawnTime??0)+1e-9>=a.activationDelay*this.reloadMult)');
  code=patchFeel(code);
  // Death Continue: revive at the death position instead of the biome spawn.
  const deathSpawn='let t=Bx(this.save.biome)?nS(this.save.biome,this.width,this.height):{x:540,y:700},n=!this.waveMode&&Bx(this.save.biome)?this.geometry.projectInside(t.x,t.y,this.radius):t;this.x=n.x,this.y=n.y';
  if(code.split(deathSpawn).length!==2)throw Error('Death respawn spawn boundary changed');
  code=code.replace(deathSpawn,'let t=e?{x:this.x,y:this.y}:Bx(this.save.biome)?nS(this.save.biome,this.width,this.height):{x:540,y:700},n=!this.waveMode&&Bx(this.save.biome)?this.geometry.projectInside(t.x,t.y,this.radius):t;this.x=n.x,this.y=n.y');
  // Death Continue must not reseed: seedMobs() wipes the field and respawns
  // fresh packs, which erased the fight around an in-place revive.
  const deathSeed='this.mobDeaths=[],this.playerId||this.seedMobs(),this.waveMode&&';
  if(code.split(deathSeed).length!==2)throw Error('Death respawn seed boundary changed');
  code=code.replace(deathSeed,'this.mobDeaths=[],this.playerId||e||this.seedMobs(),this.waveMode&&');
  const deathDrops='this.cogTimer=0,this.drops=!this.playerId&&this.save.biome===`Hel`?this.helSacrificeDrops.filter(e=>e.life>0):[],this.projectiles=[]';
  if(code.split(deathDrops).length!==2)throw Error('Death respawn drops boundary changed');
  code=code.replace(deathDrops,'this.cogTimer=0,this.drops=e?this.drops:!this.playerId&&this.save.biome===`Hel`?this.helSacrificeDrops.filter(e=>e.life>0):[],this.projectiles=[]');
  // Dead flowers still occupy the map: far-cull / replenish must not treat the
  // corpse area as empty, or another living player elsewhere wipes the pack.
  const deadPresence='(this.worldFlowers?.()??[]).filter(e=>e.state===`playing`&&!e.inShortcut)';
  if(code.split(deadPresence).length!==2)throw Error('Dead presence cull boundary changed');
  code=code.replace(deadPresence,'(this.worldFlowers?.()??[]).filter(e=>(e.state===`playing`||e.state===`dead`)&&!e.inShortcut)');
  const deadAnchor='(this.worldFlowers?.()??[this]).filter(e=>e.state===`playing`&&e.hp>0)';
  if(code.split(deadAnchor).length!==2)throw Error('Dead presence replenish boundary changed');
  code=code.replace(deadAnchor,'(this.worldFlowers?.()??[this]).filter(e=>e.state===`playing`||e.state===`dead`)');
  // Lentil attraction: capture excluded every heal-* petal, which also blocked
  // combat hybrids (Leaf / Yucca / Starfish). Keep burst-heal supports out
  // (Rose / Dahlia); Fang already attracted via healOnHit alone.
  const lentilAttract='(g.damage>0||g.poison>0||g.poisonAmp>0)&&!g.projectile&&!g.wearable&&!g.heal&&!g.healPerSecond&&!g.healAura&&!g.burstHeal&&![`Honey`,`Missile`,`Peas`,`Grapes`,`Blueberries`,`Pearl`,`Jelly`,`Antennae`,`Cactus`,`Bubble`,`Cotton`,`Plank`,`Poo`,`Magnet`,`Shell`,`Light Bulb`].includes(h.type)';
  const lentilAttractFixed='(g.damage>0||g.poison>0||g.poisonAmp>0)&&!g.projectile&&!g.wearable&&!g.burstHeal&&![`Honey`,`Missile`,`Peas`,`Grapes`,`Blueberries`,`Pearl`,`Jelly`,`Antennae`,`Cactus`,`Bubble`,`Cotton`,`Plank`,`Poo`,`Magnet`,`Shell`,`Light Bulb`].includes(h.type)';
  if(code.split(lentilAttract).length!==2)throw Error('Lentil attraction boundary changed');
  code=code.replace(lentilAttract,lentilAttractFixed);
  // Leech aggro was 900 (bypasses the 520 gate via B.Leech.aggro) — far past
  // wiki parity with Soldier Fire Ant (600). Segments also stacked body push
  // + contact DPS on top of the once-per-second attach suck, yeeting flowers.
  const leechAggro='t.type===`Leech`?900:';
  if(code.split(leechAggro).length!==2)throw Error('Leech aggro boundary changed');
  code=code.replace(leechAggro,'t.type===`Leech`?600:');
  const leechContact='applyFlowerMobContact(e,t,n,r){let i=B[e.type];if(e.type===`Leech`&&!e.segment&&this.burrowLeft<=0&&(e.leechAttached=!0,e.leechTargetId=void 0,e.leechFlowerId=this.playerId,e.leechAngle=e.angle),this.burrowLeft<=0){let a=qA(this,e,i.speed===0,this.width,this.height,r?this.geometry:void 0,r,t)??t;if(!this.bodyTouches.has(e.id)&&(this.bodyPushContacts.get(e.id)??0)<=n+1e-9){let{nx:t,ny:r}=a,o=(e.bodySweepDt??0)>0&&e.bodySweepStartX!==void 0&&e.bodySweepStartY!==void 0&&e.bodySweepEndX!==void 0&&e.bodySweepEndY!==void 0,s=i.speed===0?0:o?(e.bodySweepEndX-e.bodySweepStartX)/e.bodySweepDt:e.vx+e.kx,c=i.speed===0?0:o?(e.bodySweepEndY-e.bodySweepStartY)/e.bodySweepDt:e.vy+e.ky,l=GA((this.moveVX+this.pushX-s)*t+(this.moveVY+this.pushY-c)*r,this.radius,e.radius,i.speed===0,V.bodyRestitution,V.bodyContactPush),u=l.flower*(1+this.effectiveKnockbackMult);this.pushX+=t*u,this.pushY+=r*u,e.kx-=t*l.mob,e.ky-=r*l.mob,this.bodyPushContacts.set(e.id,Pt(this.bodyPushContacts.get(e.id),n)),this.bodyTouches.add(e.id)}}if(this.invuln===0&&!this.shovelBlocksDamage(e.type,e.id)&&this.frameContact(this,e,n)){';
  const leechContactFixed='applyFlowerMobContact(e,t,n,r){let i=B[e.type];if(e.type===`Leech`&&!e.segment&&this.burrowLeft<=0&&(e.leechAttached=!0,e.leechTargetId=void 0,e.leechFlowerId=this.playerId,e.leechAngle=e.angle),this.burrowLeft<=0){if(!(e.type===`Leech`&&(e.segment||e.leechAttached))){let a=qA(this,e,i.speed===0,this.width,this.height,r?this.geometry:void 0,r,t)??t;if(!this.bodyTouches.has(e.id)&&(this.bodyPushContacts.get(e.id)??0)<=n+1e-9){let{nx:t,ny:r}=a,o=(e.bodySweepDt??0)>0&&e.bodySweepStartX!==void 0&&e.bodySweepStartY!==void 0&&e.bodySweepEndX!==void 0&&e.bodySweepEndY!==void 0,s=i.speed===0?0:o?(e.bodySweepEndX-e.bodySweepStartX)/e.bodySweepDt:e.vx+e.kx,c=i.speed===0?0:o?(e.bodySweepEndY-e.bodySweepStartY)/e.bodySweepDt:e.vy+e.ky,l=GA((this.moveVX+this.pushX-s)*t+(this.moveVY+this.pushY-c)*r,this.radius,e.radius,i.speed===0,V.bodyRestitution,V.bodyContactPush),u=l.flower*(1+this.effectiveKnockbackMult);this.pushX+=t*u,this.pushY+=r*u,e.kx-=t*l.mob,e.ky-=r*l.mob,this.bodyPushContacts.set(e.id,Pt(this.bodyPushContacts.get(e.id),n)),this.bodyTouches.add(e.id)}}}if(e.type!==`Leech`&&this.invuln===0&&!this.shovelBlocksDamage(e.type,e.id)&&this.frameContact(this,e,n)){';
  if(code.split(leechContact).length!==2)throw Error('Leech contact boundary changed');
  code=code.replace(leechContact,leechContactFixed);
  // Death summary: stack per-life mob kills like ashflor (client-patches mirrors these).
  const sessionMobKill='this.save.mobKills??={},this.save.mobKills[r]=(this.save.mobKills[r]??0)+1,this.sessionKills++';
  if(code.split(sessionMobKill).length!==2)throw Error('Session mob kill boundary changed');
  code=code.replace(sessionMobKill,'this.save.mobKills??={},this.save.mobKills[r]=(this.save.mobKills[r]??0)+1,this.sessionMobKills??={},this.sessionMobKills[r]=(this.sessionMobKills[r]??0)+1,this.sessionKills++');
  const sessionMobResetCtor='this.lastDamageSource=``,this.sessionCollected={},this.rewardedMobs=new WeakSet';
  if(code.split(sessionMobResetCtor).length!==2)throw Error('Session mob reset ctor boundary changed');
  code=code.replace(sessionMobResetCtor,'this.lastDamageSource=``,this.sessionCollected={},this.sessionMobKills={},this.rewardedMobs=new WeakSet');
  const sessionMobResetStart='this.lastDamageSource=``,this.sessionCollected={},this.state=`playing`';
  if(code.split(sessionMobResetStart).length!==2)throw Error('Session mob reset start boundary changed');
  code=code.replace(sessionMobResetStart,'this.lastDamageSource=``,this.sessionCollected={},this.sessionMobKills={},this.state=`playing`');
  // Lightning arcs (florr_clone-web EventQueue::lightning): under localVisuals,
  // emit room-broadcastable visual events instead of keeping a local-only array.
  const arcHelper='s=(e,t,n,r)=>{this.lightningArcs.push({x1:e,y1:t,x2:n,y2:r,born:this.time}),this.lightningArcs.length>200&&this.lightningArcs.shift()}';
  const arcHelperFixed='s=(e,t,n,r)=>{const a={x1:e,y1:t,x2:n,y2:r,born:this.time};this.localVisuals?this.onLightningArc?this.onLightningArc(a):this.visualEvents.emit({kind:`arc`,arc:a},this.time,this.visualScope,.5):(this.lightningArcs.push(a),this.lightningArcs.length>200&&this.lightningArcs.shift())}';
  if(code.split(arcHelper).length!==2)throw Error('Lightning arc helper boundary changed');
  code=code.replace(arcHelper,arcHelperFixed);
  const jellyArc='e.lightningArcs.push({x1:a.x,y1:a.y,x2:o.x,y2:o.y,born:e.time})';
  // Comma-expression sites: keep this an expression, not a block.
  const jellyArcFixed='(a=>{e.localVisuals?e.onLightningArc?e.onLightningArc(a):e.visualEvents.emit({kind:`arc`,arc:a},e.time,e.visualScope,.5):(e.lightningArcs.push(a),e.lightningArcs.length>200&&e.lightningArcs.shift())})({x1:a.x,y1:a.y,x2:o.x,y2:o.y,born:e.time})';
  if(code.split(jellyArc).length!==3)throw Error('Jellyfish lightning arc boundary changed');
  code=code.split(jellyArc).join(jellyArcFixed);
  code = code.replace('c_(`type`,[q({type:g_(`input`)', 'var serverCommands=c_(`type`,[q({type:g_(`input`)');
  // Include snapshot/session validators after the intervening interpolation code.
  const start = source.lastIndexOf('var ', source.indexOf('gj=', 5710000));
  let validatorCode = source.slice(start, source.indexOf('var iM='));
  // Accept kind:`arc` in the snapshot visual schema + runtime validator.
  const visualSchema='q({kind:g_(`break`),petal:q({..._j,type:yj,radius:Q,angle:Q,born:Q,duration:Q})})])';
  const visualSchemaFixed='q({kind:g_(`break`),petal:q({..._j,type:yj,radius:Q,angle:Q,born:Q,duration:Q})}),q({kind:g_(`arc`),arc:q({x1:Q,y1:Q,x2:Q,y2:Q,born:Q})})])';
  if(validatorCode.split(visualSchema).length!==2)throw Error('Visual schema arc boundary changed');
  validatorCode=validatorCode.replace(visualSchema,visualSchemaFixed);
  const visualCheck='e.kind===`break`&&Aj(e.petal)&&Uj(e.petal)&&Rj(e.petal.type)&&$(e.petal.radius)&&$(e.petal.angle)&&$(e.petal.born)&&$(e.petal.duration)';
  const visualCheckFixed='e.kind===`break`&&Aj(e.petal)&&Uj(e.petal)&&Rj(e.petal.type)&&$(e.petal.radius)&&$(e.petal.angle)&&$(e.petal.born)&&$(e.petal.duration)||e.kind===`arc`&&Aj(e.arc)&&$(e.arc.x1)&&$(e.arc.y1)&&$(e.arc.x2)&&$(e.arc.y2)&&$(e.arc.born)';
  if(validatorCode.split(visualCheck).length!==2)throw Error('Visual validator arc boundary changed');
  validatorCode=validatorCode.replace(visualCheck,visualCheckFixed);
  // Coral fragments are render sprite names, not equipable petal types.
  const breakType='type:yj,radius:Q,angle:Q,born:Q,duration:Q';
  if(validatorCode.split(breakType).length!==3)throw Error('Break sprite schema boundary changed');
  validatorCode=validatorCode.split(breakType).join('type:o_([yj,m_([`coral-piece-1a`,`coral-piece-1b`,`coral-piece-2`])]),radius:Q,angle:Q,born:Q,duration:Q');
  validatorCode=validatorCode.replace('Rj(e.petal.type)','(Rj(e.petal.type)||[`coral-piece-1a`,`coral-piece-1b`,`coral-piece-2`].includes(e.petal.type))');
  validatorCode=validatorCode.replace('e.petalBreaks.every(e=>Aj(e)&&Uj(e)&&Rj(e.type)','e.petalBreaks.every(e=>Aj(e)&&Uj(e)&&(Rj(e.type)||[`coral-piece-1a`,`coral-piece-1b`,`coral-piece-2`].includes(e.type))');
  const sessionMobSchema='sessionKills:Q,sessionXP:Q,sessionCollected:f_(xg(),Q)';
  if(validatorCode.split(sessionMobSchema).length!==2)throw Error('Session mob schema boundary changed');
  validatorCode=validatorCode.replace(sessionMobSchema,'sessionKills:Q,sessionXP:Q,sessionCollected:f_(xg(),Q),sessionMobKills:f_(xg(),Q)');
  const sessionMobValidate='Aj(e.sessionCollected)&&Object.values(e.sessionCollected).every($)&&$(e.chainKills)';
  if(validatorCode.split(sessionMobValidate).length!==2)throw Error('Session mob validator boundary changed');
  validatorCode=validatorCode.replace(sessionMobValidate,'Aj(e.sessionCollected)&&Object.values(e.sessionCollected).every($)&&Aj(e.sessionMobKills)&&Object.values(e.sessionMobKills).every($)&&$(e.chainKills)');
  code += ';' + validatorCode.replace('q({visuals:r_(Dj)', 'var snapshotSchema=q({visuals:r_(Dj)');
  code += ';'+source.slice(source.indexOf('var iM='),source.indexOf(',pM=class'))+';';
  const announceStart=source.indexOf('function viepAnnounceSpawn');
  code += ';'+source.slice(announceStart,source.indexOf('\n',announceStart));
  const craftStart=source.indexOf('const viepCanCraft=');
  code += ';'+source.slice(craftStart,source.indexOf('\n',craftStart));
  const contactStart=source.indexOf('var viepBodyContact=');
  code += ';'+source.slice(contactStart,source.indexOf('\n',contactStart));
  code += ';globalThis.api={Engine:lj,defaults:ij,normalize:aj,petals:et,rarityCount:L.length,mobs:B,maps:Et,constants:V,craft:Mt,canCraft:viepCanCraft,slots:Ct,resolvePlayerContacts:viepBodyContact.resolvePlayerContacts,BatchDecoder:fM,commands:serverCommands,session:kj,validate:rM,validateVisual:eM,snapshotSchema,findPortal:eS,portalExit:tS,portals:$x,mapSize:zx};';
  // UI declarations occur before the engine in this compiled module. Imports
  // are inert here; no browser, network, or rendering API is supplied.
  const inert = new Proxy(function () { return inert; }, { get: () => inert });
  const context = { console, performance, AbortSignal, AbortController, DOMException,
    structuredClone, URL, setTimeout, clearTimeout, i:inert,n:inert,r:inert,e:inert,t:inert };
  // Shared cloud CPUs can pause during the one-time initialization. This
  // deadline applies only at boot and does not change the simulation cadence.
  vm.runInNewContext(code, context, { timeout:30000, filename:'captured-simulation.js' });
  return context.api;
}
module.exports = { loadEngine, BUNDLE, HASH };
