'use strict';
const {LatentPopulation}=require('./latent');
const {LootField}=require('./loot');
const {Dungeons}=require('./dungeons');
class World {
  constructor(api) {this.api=api;this.rooms=new Map();this.nextId=1;this.time=0;this.dungeons=new Dungeons(this);}
  join(client) {
    const e=client.engine, dungeon=e.moundVisit?.room,key=dungeon?.key??e.save.biome;
    let room=this.rooms.get(key);
    if(!room){
      // Seed a single authoritative world without seeding a private copy per player.
      const seed=new this.api.Engine(this.api.normalize({...this.api.defaults(),biome:e.save.biome}),Math.random,false);
      seed.sharedReferenceRoom=true;seed.referenceSeedCap=96;if(!dungeon)seed.seedMobs();
      room={key,biome:e.save.biome,dungeon,id:`adventure:${key}`,clients:new Set(),mobs:dungeon?e.mobs:seed.mobs,drops:dungeon?e.drops:[],deaths:[],deathSeq:0,spawn:seed.referenceSpawnState,latent:new LatentPopulation(),loot:new LootField(this.api)};
      this.nextId=Math.max(this.nextId,...room.mobs.map(m=>m.id+1));
      this.rooms.set(key,room);
    }
    if(client.room&&client.room!==room){const old=client.room;old.clients.delete(client);old.flowers=[...old.clients].map(c=>c.engine);this.releaseRoom(old);}
    room.clients.add(client);client.room=room;
    room.flowers=[...room.clients].map(c=>c.engine);
    e.playerId=client.id;e.nextWorldId=()=>this.nextId++;
    e.sharedReferenceRoom=true;e.referenceSeedCap=96;e.externalDropLifetime=true;e.externalMobShotCollision=true;e.simulationViewRadius=1800;
    e.time=this.time;e.worldFlowers=()=>room.flowers;
    e.ownsWorldMob=m=>m.serverOwner===client.id&&m.serverAiDue!==false;
    e.ownsWorldDrop=d=>!d.ownerId||d.ownerId===client.id||!!client.squadCode&&d.squadId===client.squadCode;
    e.onMobKill=m=>{if(m.serverRewarded)return;m.serverRewarded=true;
      const owner=[...room.clients].find(c=>c.id===m.lastHitBy)??client;
      owner.engine.grantKill(m,true,true);
      if(owner.combatStats)owner.combatStats.kills++;
      const death=owner.engine.mobDeaths.at(-1);
      if(death)room.deaths.push({...death,born:this.time,seq:++room.deathSeq});
    };
    this.bind(client);
  }
  bind(c){
    const e=c.engine,room=c.room;
    e.mobs=room.mobs;e.drops=room.drops;e.referenceSpawnState=room.spawn;e.squadId=c.squadCode;e.shareLootDrops=!!c.squadCode;
    e.visualScope=room.id;e.latentManaged=true;e.latentMobRecords=room.latentRecords??[];
    if(c.worldHooksEngine===e)return;c.worldHooksEngine=e;
    e.onDropCreated=()=>c.room.loot.ensure(c.room.drops);
    e.queryWorldDrops=engine=>{c.room.loot.ensure(c.room.drops);return c.dropCandidates=c.room.loot.pickup(engine);};
    // Room-wide lightning bolts (florr_clone-web EventQueue::lightning).
    e.onLightningArc=arc=>{
      for(const peer of c.room.clients){
        const pe=peer.engine;if(!pe?.localVisuals||!pe.visualEvents)continue;
        pe.visualEvents.emit({kind:`arc`,arc:{x1:arc.x1,y1:arc.y1,x2:arc.x2,y2:arc.y2,born:arc.born}},pe.time,c.room.id,.5);
      }
    };
  }
  // Portal trigger radius is 60. Some authored exits sit inside it, so after
  // portalCooldown the player is bounced back to the previous map.
  safePortalExit(from,to,width,height){
    const authored=this.api.portalExit(from,to,width,height);if(!authored)return null;
    const ret=this.api.portals(to,width,height).find(p=>p.to===from);if(!ret)return authored;
    if(!this.api.findPortal(to,authored.x,authored.y,width,height)&&Math.hypot(authored.x-ret.x,authored.y-ret.y)>=190)
      return authored;
    const len=Math.hypot(width/2-ret.x,height/2-ret.y)||1,ux=(width/2-ret.x)/len,uy=(height/2-ret.y)/len;
    for(let dist=190;dist<=480;dist+=20){
      const x=ret.x+ux*dist,y=ret.y+uy*dist;
      if(!this.api.findPortal(to,x,y,width,height))return {x,y};
    }
    return {x:ret.x+ux*220,y:ret.y+uy*220};
  }
  enterPortal(c){
    const e=c.engine;
    if(e.state!=='playing'||e.hp<=0||e.paused||e.portalCooldown>0||e.waveMode||e.moundVisit||e.wormVisit||e.corrupted)return false;
    const source=e.save.biome,portal=this.api.findPortal(source,e.x,e.y,e.width,e.height);
    if(!portal)return false;
    const size=this.api.mapSize(portal.to),exit=this.safePortalExit(source,portal.to,size.width,size.height);
    if(!exit)return false;
    const original={width:e.width,height:e.height};Object.assign(e,size);
    // The online world owns population and loot. Do not reseed a private
    // world or replace the source room's shared arrays during transfer.
    if(!e.travelPortal(portal.to,exit,true)){Object.assign(e,original);return false;}
    // Drop leftover stick input so the player cannot walk straight back in.
    e.input={x:0,y:0};e.moveVX=e.moveVY=e.pushX=e.pushY=0;c.lastInput=Date.now();
    // projectInside may clamp the landing into the trigger; nudge out again.
    if(this.api.findPortal(e.save.biome,e.x,e.y,e.width,e.height)){
      const fixed=this.safePortalExit(source,e.save.biome,e.width,e.height);
      if(fixed){const inside=e.geometry.projectInside(fixed.x,fixed.y,e.radius);e.x=inside.x;e.y=inside.y;}
    }
    this.join(c);return true;
  }
  tick(dt){
    this.time+=dt;
    const transfers=[];
    for(const room of this.rooms.values()){
      this.npcs?.tick(room,dt);
      room.snapshotGeneration=(room.snapshotGeneration??0)+1;
      room.deaths=room.deaths.filter(d=>this.time-d.born<.5).slice(-96);
      const active=[...room.clients].filter(c=>c.engine.state==='playing');
      // Dead players still anchor simulation view so packs around a corpse are
      // not culled/frozen-out while another living player hosts elsewhere.
      const present=[...room.clients].filter(c=>c.engine.state==='playing'||c.engine.state==='dead');
      const viewers=present.map(c=>c.engine);
      for(const c of present)c.engine.simulationViewRadius=Math.max(1800,c.viewRadius??1800);
      room.latent.census(room,viewers,this.time);room.latentRecords=[...room.latent.records.values()];
      const starts=new Map(active.map(c=>[c.id,{x:c.engine.x,y:c.engine.y}]));
      const referenced=new Set();for(const m of room.mobs)for(const key of ['leaderId','summonerId','lootParentId','carrierId','carryingId','leechRootId'])if(m[key]!==undefined)referenced.add(m[key]);
      for(const m of room.mobs){
        let best,dist=Infinity;for(const c of present){const d=(m.x-c.engine.x)**2+(m.y-c.engine.y)**2;if(d<dist){dist=d;best=c;}}m.serverOwner=best?.id;
        const distance=Math.sqrt(dist)-(m.radius??0),lod=distance>900&&m.hp>0&&m.rarity<7&&!m.friendly&&!m.segment&&!m.serverDungeonOpen&&!referenced.has(m.id)&&
          ['leaderId','summonerId','lootParentId','carrierId','carryingId','leechRootId'].every(key=>m[key]===undefined)&&
          !m.chargeRemaining&&!m.spiderWebWindup&&!m.leechAttached&&!m.helTeleport&&!m.shots?.some(s=>s.life>0),interval=lod?(distance>1400?.1:1/15):dt;
        m.serverMobElapsed=(m.serverMobElapsed??0)+dt;
        m.serverAiDue=!lod||m.serverNextAi===undefined||this.time+1e-9>=m.serverNextAi;
        if(m.serverAiDue){m.serverMobDt=Math.min(.1333333333,m.serverMobElapsed);m.serverMobElapsed=0;m.serverNextAi=this.time+interval;}
      }
      room.loot.begin(room.drops,dt);
      const host=active[0];
      for(const c of room.clients){
        this.bind(c);const e=c.engine;e.roomHost=c===host;c.dropCandidates=null;
        e.simulationViewers=viewers;e.simulationViewRadius=Math.max(1800,c.viewRadius??1800);
        if(Date.now()-c.lastInput>500)e.input={x:0,y:0};
        e.serverFrameDt=dt;e.update(dt);room.mobs=e.mobs;room.drops=e.drops;room.loot.moved(c.dropCandidates);
        if(e.save.biome!==room.biome||e.moundVisit?.room?.key!==(room.dungeon?.key))transfers.push(c);
      }
      for(const c of room.clients)this.bind(c);
      // Resolve each shared projectile once, against all flowers and petals,
      // after all players have moved. The first swept collision wins.
      if(host){for(const m of room.mobs)if(m.shots?.some(s=>s.life>0))host.engine.collideMobShots(m,dt,viewers,room.mobs);}
      const bodies=active.filter(c=>c.engine.state==='playing'&&c.room===room).map(c=>{
        const e=c.engine,start=starts.get(c.id);return {id:c.id,engine:e,x:e.x,y:e.y,radius:e.radius,startX:start.x,startY:start.y,vx:e.moveVX,vy:e.moveVY,pushX:e.pushX,pushY:e.pushY};
      });
      if(bodies.length>1){
        const host=bodies[0].engine;
        this.api.resolvePlayerContacts(bodies,host.width,host.height,host.geometry);
        for(const body of bodies){
          const e=body.engine,dx=body.x-e.x,dy=body.y-e.y;
          e.x=body.x;e.y=body.y;e.moveVX=body.vx;e.moveVY=body.vy;e.pushX=body.pushX;e.pushY=body.pushY;
          for(const p of e.petals)if(p&&!p.dropped){p.x+=dx;p.y+=dy;for(const m of p.motion??[]){m.x+=dx;m.y+=dy;}}
          e.bodySweepEndX=e.x;e.bodySweepEndY=e.y;
        }
      }
      for(const c of room.clients)if(c.engine.state==='playing')transfers.push(c);
      if(room.dungeon)this.dungeons.advance(room,dt);
    }
    // Room membership changes after all rooms have stepped, so a traveller
    // cannot receive another physics step or collide in two rooms this tick.
    for(const c of new Set(transfers)){
      if(c.engine.save.biome!==c.room.biome||c.engine.moundVisit?.room?.key!==(c.room.dungeon?.key))this.join(c);
      else if(!c.room.dungeon&&!this.dungeons.approach(c,dt))this.enterPortal(c);
    }
  }
  releaseRoom(room){if(room.clients.size||room.dungeon)return;if([...this.rooms.values()].some(r=>r.dungeon?.parentRoom===room))return;this.rooms.delete(room.key);}
  leave(c){c.room?.clients.delete(c);if(c.room)c.room.flowers=[...c.room.clients].map(c=>c.engine);for(const r of this.rooms.values())this.releaseRoom(r);}
}
module.exports={World};
