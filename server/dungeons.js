'use strict';
// A mound is a shared instance, keyed by the actual nest, rather than a
// private array that can overwrite the overworld during an engine update.
class Dungeons{
  constructor(world){this.world=world;}
  approach(c,dt){
    const e=c.engine;
    if(e.state!=='playing'||e.hp<=0||e.paused||e.portalCooldown>0||e.save.biome!=='Jungle'||e.moundVisit||e.wormVisit){delete c.moundApproach;return false;}
    const mound=c.room.mobs.find(m=>m.type==='Termite Mound'&&m.hp>0&&Math.hypot(m.x-e.x,m.y-e.y)<m.radius*.55);
    if(!mound){delete c.moundApproach;return false;}
    if(c.moundApproach?.id!==mound.id)c.moundApproach={id:mound.id,time:0};
    c.moundApproach.time+=dt;if(c.moundApproach.time+1e-9<.6)return false;
    const parent=c.room,key=`mound:${parent.key}:${mound.id}`,existing=this.world.rooms.get(key);
    if(existing)e.termiteRooms.set(mound.id,existing.dungeon);else e.termiteRooms.delete(mound.id);
    e.serverDungeonTransfer=true;
    let entered;try{entered=this.world.api.enterMound(e,mound);}finally{e.serverDungeonTransfer=false;}
    if(!entered)return false;
    const dungeon=e.moundVisit.room;dungeon.key=key;dungeon.parentRoom=parent;mound.serverDungeonOpen=true;
    this.world.join(c);delete c.moundApproach;return true;
  }
  finish(room){
    const n=room.dungeon,parent=n.parentRoom,clients=[...room.clients];
    const cleared=!room.mobs.some(m=>m.hp>0&&!m.friendly);
    // Move each unexpired reward exactly once, before returning all visitors.
    for(const drop of room.drops)if(drop.life>0){drop.x=n.mound.x+(Math.random()-.5)*100;drop.y=n.mound.y+(Math.random()-.5)*100;parent.drops.push(drop);}
    room.drops.length=0;n.cleared=true;n.mound.serverDungeonOpen=false;
    for(const c of clients){
      const visit=c.engine.moundVisit;visit.mobs=parent.mobs;visit.drops=parent.drops;
      this.world.api.exitMound(c.engine);c.engine.termiteRooms.delete(n.mound.id);this.world.join(c);
    }
    if(cleared&&clients.length&&!n.mound.serverRewarded){n.mound.moundCleared=true;clients[0].engine.kill(n.mound);}
    this.world.rooms.delete(room.key);
  }
  advance(room,dt){
    const n=room.dungeon;n.mobs=room.mobs;n.drops=room.drops;n.remaining=Math.max(0,n.remaining-dt);
    if(!room.clients.size){n.emptyFor=(n.emptyFor??0)+dt;if(n.emptyFor>=60){n.mound.serverDungeonOpen=false;this.world.rooms.delete(room.key);this.world.releaseRoom(n.parentRoom);}return;}
    n.emptyFor=0;
    if(!room.mobs.some(m=>m.hp>0&&!m.friendly))n.clearFor=(n.clearFor??0)+dt;else n.clearFor=0;
    if(n.clearFor>=5||n.remaining===0)this.finish(room);
  }
}
module.exports={Dungeons};
