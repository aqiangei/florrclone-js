'use strict';
const {LatentPopulation}=require('./latent');
const {LootField}=require('./loot');
class World {
  constructor(api) {this.api=api;this.rooms=new Map();this.nextId=1;this.time=0;}
  join(client) {
    const e=client.engine, key=e.save.biome;
    let room=this.rooms.get(key);
    if(!room){
      // Seed a single authoritative world without seeding a private copy per player.
      const seed=new this.api.Engine(this.api.normalize({...this.api.defaults(),biome:key}),Math.random,false);
      seed.sharedReferenceRoom=true;seed.referenceSeedCap=180;seed.seedMobs();
      room={id:`adventure:${key}`,clients:new Set(),mobs:seed.mobs,drops:[],deaths:[],deathSeq:0,spawn:seed.referenceSpawnState,latent:new LatentPopulation(),loot:new LootField(this.api)};
      this.nextId=Math.max(this.nextId,...room.mobs.map(m=>m.id+1));
      this.rooms.set(key,room);
    }
    if(client.room&&client.room!==room){const old=client.room;old.clients.delete(client);if(!old.clients.size)this.rooms.delete(old.id.slice('adventure:'.length));}
    room.clients.add(client);client.room=room;
    e.playerId=client.id;e.nextWorldId=()=>this.nextId++;
    e.sharedReferenceRoom=true;e.referenceSeedCap=180;e.externalDropLifetime=true;e.externalMobShotCollision=true;e.simulationViewRadius=1800;
    e.time=this.time;e.worldFlowers=()=>[...room.clients].map(c=>c.engine);
    e.ownsWorldMob=m=>m.serverOwner===client.id;
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
    e.onDropCreated=()=>room.loot.ensure(room.drops);
    e.queryWorldDrops=engine=>{room.loot.ensure(room.drops);return c.dropCandidates=room.loot.pickup(engine);};
    // Room-wide lightning bolts (florr_clone-web EventQueue::lightning).
    e.onLightningArc=arc=>{
      for(const peer of room.clients){
        const pe=peer.engine;if(!pe?.localVisuals||!pe.visualEvents)continue;
        pe.visualEvents.emit({kind:`arc`,arc:{x1:arc.x1,y1:arc.y1,x2:arc.x2,y2:arc.y2,born:arc.born}},pe.time,room.id,.5);
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
      room.deaths=room.deaths.filter(d=>this.time-d.born<.5).slice(-96);
      const active=[...room.clients].filter(c=>c.engine.state==='playing');
      // Dead players still anchor simulation view so packs around a corpse are
      // not culled/frozen-out while another living player hosts elsewhere.
      const present=[...room.clients].filter(c=>c.engine.state==='playing'||c.engine.state==='dead');
      const viewers=present.map(c=>c.engine);
      for(const c of present)c.engine.simulationViewRadius=Math.max(1800,c.viewRadius??1800);
      room.latent.census(room,viewers,this.time);room.latentRecords=[...room.latent.records.values()];
      const starts=new Map(active.map(c=>[c.id,{x:c.engine.x,y:c.engine.y}]));
      for(const m of room.mobs){let best,dist=Infinity;for(const c of present){const d=(m.x-c.engine.x)**2+(m.y-c.engine.y)**2;if(d<dist){dist=d;best=c;}}m.serverOwner=best?.id;}
      room.loot.begin(room.drops,dt);
      const host=active[0];
      for(const c of room.clients){
        this.bind(c);const e=c.engine;e.roomHost=c===host;c.dropCandidates=null;
        e.simulationViewers=viewers;e.simulationViewRadius=Math.max(1800,c.viewRadius??1800);
        if(Date.now()-c.lastInput>500)e.input={x:0,y:0};
        e.update(dt);room.mobs=e.mobs;room.drops=e.drops;room.loot.moved(c.dropCandidates);
        if(e.save.biome!==room.id.slice('adventure:'.length))transfers.push(c);
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
    }
    // Room membership changes after all rooms have stepped, so a traveller
    // cannot receive another physics step or collide in two rooms this tick.
    for(const c of new Set(transfers)){
      if(c.engine.save.biome!==c.room.id.slice('adventure:'.length))this.join(c);
      else this.enterPortal(c);
    }
  }
  leave(c){c.room?.clients.delete(c);for(const [key,r]of this.rooms)if(!r.clients.size)this.rooms.delete(key);}
}
module.exports={World};
