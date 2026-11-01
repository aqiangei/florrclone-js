'use strict';
class World {
  constructor(api) {this.api=api;this.rooms=new Map();this.nextId=1;this.time=0;}
  join(client) {
    const e=client.engine, key=e.save.biome;
    let room=this.rooms.get(key);
    if(!room){
      // Seed a single authoritative world without seeding a private copy per player.
      const seed=new this.api.Engine(this.api.normalize({...this.api.defaults(),biome:key}),Math.random,false);
      seed.sharedReferenceRoom=true;seed.referenceSeedCap=180;seed.seedMobs();
      room={id:`adventure:${key}`,clients:new Set(),mobs:seed.mobs,drops:[],deaths:[],deathSeq:0,spawn:seed.referenceSpawnState};
      this.nextId=Math.max(this.nextId,...room.mobs.map(m=>m.id+1));
      this.rooms.set(key,room);
    }
    if(client.room&&client.room!==room){const old=client.room;old.clients.delete(client);if(!old.clients.size)this.rooms.delete(old.id.slice('adventure:'.length));}
    room.clients.add(client);client.room=room;
    e.playerId=client.id;e.nextWorldId=()=>this.nextId++;
    e.sharedReferenceRoom=true;e.referenceSeedCap=180;e.externalDropLifetime=true;e.simulationViewRadius=1800;
    e.time=this.time;e.worldFlowers=()=>[...room.clients].map(c=>c.engine);
    e.ownsWorldMob=m=>m.serverOwner===client.id;
    e.ownsWorldDrop=d=>!d.ownerId||d.ownerId===client.id;
    e.onMobKill=m=>{if(m.serverRewarded)return;m.serverRewarded=true;
      const owner=[...room.clients].find(c=>c.id===m.lastHitBy)??client;
      owner.engine.grantKill(m,true,true);
      const death=owner.engine.mobDeaths.at(-1);
      if(death)room.deaths.push({...death,born:this.time,seq:++room.deathSeq});
    };
    this.bind(client);
  }
  bind(c){c.engine.mobs=c.room.mobs;c.engine.drops=c.room.drops;c.engine.referenceSpawnState=c.room.spawn;}
  tick(dt){
    this.time+=dt;
    for(const room of this.rooms.values()){
      room.deaths=room.deaths.filter(d=>this.time-d.born<.5).slice(-96);
      const active=[...room.clients].filter(c=>c.engine.state==='playing');
      const viewers=active.map(c=>c.engine);
      const starts=new Map(active.map(c=>[c.id,{x:c.engine.x,y:c.engine.y}]));
      for(const m of room.mobs){let best,dist=Infinity;for(const c of active){const d=(m.x-c.engine.x)**2+(m.y-c.engine.y)**2;if(d<dist){dist=d;best=c;}}m.serverOwner=best?.id;}
      for(const d of room.drops)d.life-=dt;
      room.drops=room.drops.filter(d=>d.life>0);
      const host=active[0];
      for(const c of room.clients){
        this.bind(c);const e=c.engine;e.roomHost=c===host;
        e.simulationViewers=viewers;e.simulationViewRadius=Math.max(1800,c.viewRadius??1800);
        if(Date.now()-c.lastInput>500)e.input={x:0,y:0};
        e.update(dt);room.mobs=e.mobs;room.drops=e.drops;
        if(e.save.biome!==room.id.slice('adventure:'.length))this.join(c);
      }
      for(const c of room.clients)this.bind(c);
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
    }
  }
  leave(c){c.room?.clients.delete(c);for(const [key,r]of this.rooms)if(!r.clients.size)this.rooms.delete(key);}
}
module.exports={World};
