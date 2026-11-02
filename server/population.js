'use strict';
// Strong-player servers need a maintained field, not an occasional rare roll.
const POLICY=Object.freeze({interval:.25,superTarget:6,superRefillDelay:30,ultraPerCluster:0,localCap:96,spawnBudget:6});
const root=m=>m.hp>0&&!m.friendly&&!m.segment&&m.leaderId===undefined&&m.summonerId===undefined&&m.carrierId===undefined;
function contains(region,x,y){let hit=false;const p=region.points;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const deepUltra=region=>!region.point&&region.density!==0&&Number.isFinite(region.difficulty)&&region.difficulty>=65&&(region.forceRarity===null||region.forceRarity>=6);
class Population{
  constructor(world){this.world=world;}
  relocateIdle(room,clients){
    const e=clients[0].engine,regions=this.world.api.spawnRegions[room.biome]?.filter(deepUltra)??[];if(!regions.length)return;
    for(const mob of room.mobs){
      if(!root(mob)||mob.rarity!==7||regions.some(r=>contains(r,mob.x/e.width,mob.y/e.height)))continue;
      if(mob.hp!==mob.maxHp||mob.aggro||mob.poisonTime>0||[...room.clients].some(c=>Math.hypot(c.engine.x-mob.x,c.engine.y-mob.y)<2200+mob.radius))continue;
      if(room.mobs.some(m=>m!==mob&&[m.leaderId,m.summonerId,m.carrierId,m.leechRootId].includes(mob.id)))continue;
      for(let attempt=0;attempt<48;attempt++){
        const r=regions[(room.populationCursor+attempt)%regions.length],xs=r.points.map(p=>p[0]),ys=r.points.map(p=>p[1]),x=(Math.min(...xs)+e.rng()*(Math.max(...xs)-Math.min(...xs)))*e.width,y=(Math.min(...ys)+e.rng()*(Math.max(...ys)-Math.min(...ys)))*e.height;
        if(!contains(r,x/e.width,y/e.height)||!e.geometry.isFreeCircle(x,y,mob.radius))continue;
        for(const state of room.spawn.regions.values()){state.alive.delete(mob.id);for(const group of state.groups??[])group.delete(mob.id);}
        let state=room.spawn.regions.get(r.id);if(!state){state={alive:new Set,ready:0,groups:[]};room.spawn.regions.set(r.id,state);}state.alive.add(mob.id);(state.groups??=[]).push(new Set([mob.id]));
        Object.assign(mob,{x,y,vx:0,vy:0,spawnOrigin:{x,y},spawnRegionId:r.id});
        for(const c of room.clients)c.events?.push(`[定位修复] 未参战的 Super ${mob.type} 已移至深究极区，血量不变。`);
        return;
      }
    }
  }
  tick(room,dt){
    if(room.dungeon||room.crystal)return;
    room.populationWait=(room.populationWait??0)-dt;if(room.populationWait>0)return;room.populationWait=POLICY.interval;
    const clients=[...room.clients].filter(c=>c.engine.state==='playing'&&c.engine.hp>0&&!c.engine.inShortcut&&c.engine.petals.some(p=>p&&p.rarity>=6));if(!clients.length)return;
    const anchors=[];for(const c of clients)if(anchors.every(p=>Math.hypot(p.engine.x-c.engine.x,p.engine.y-c.engine.y)>2200))anchors.push(c);
    const supers=room.mobs.filter(m=>root(m)&&m.rarity===7).length;
    room.superTarget=POLICY.superTarget;
    if(supers>=room.superTarget)delete room.superRefillAt;
    else room.superRefillAt??=this.world.time+POLICY.superRefillDelay;
    let remaining=POLICY.spawnBudget,superNeed=this.world.time>=(room.superRefillAt??Infinity)?Math.max(0,room.superTarget-supers):0;
    room.populationCursor=(room.populationCursor??0)+1;
    this.relocateIdle(room,clients);
    for(let i=0;i<anchors.length&&remaining>0;i++){
      const c=anchors[(i+room.populationCursor)%anchors.length],e=c.engine;this.world.bind(c);
      const local=room.mobs.filter(m=>root(m)&&Math.hypot(m.x-e.x,m.y-e.y)<1800);
      const ultraNeed=Math.max(0,POLICY.ultraPerCluster-local.filter(m=>m.rarity===6).length);
      let madeSuper=0,madeUltra=0;
      for(let attempt=0;attempt<48&&remaining>0;attempt++){
        const rarity=superNeed>0&&madeSuper<4?7:madeUltra<ultraNeed?6:null;if(rarity===null)break;
        const regions=this.world.api.spawnRegions[room.biome]?.filter(deepUltra);if(!regions?.length)break;
        const region=regions[(room.populationCursor+attempt)%regions.length],xs=region.points.map(v=>v[0]),ys=region.points.map(v=>v[1]),x=(Math.min(...xs)+e.rng()*(Math.max(...xs)-Math.min(...xs)))*e.width,y=(Math.min(...ys)+e.rng()*(Math.max(...ys)-Math.min(...ys)))*e.height;
        if(!contains(region,x/e.width,y/e.height))continue;
        const living=room.mobs.filter(m=>root(m)&&m.rarity===7);if(living.some(m=>Math.hypot(m.x-x,m.y-y)<1000))continue;
        const types=this.world.api.spawnTypes(region).filter(type=>!['Test Dummy','Target Dummy','Text Dummy','Square','Termite Mound','Fire Ant Burrow'].includes(type));if(!types.length)continue;
        types.sort((a,b)=>living.filter(m=>m.type===a).length-living.filter(m=>m.type===b).length);const type=types[0];
        // spawnReferenceAt resolves the actual zone and rejects walls, portals
        // and insufficient space. Never clone an existing mob or move a boss.
        const before=e.mobs.length,count=e.spawnReferenceAt(x,y,1,[region],rarity,type);
        if(!count)continue;
        const roots=e.mobs.slice(before).filter(root);remaining-=Math.max(1,count);
        if(rarity===7){madeSuper+=roots.length;superNeed-=roots.length;}else madeUltra+=roots.length;
      }
      room.mobs=e.mobs;room.spawn=e.referenceSpawnState;
    }
  }
}
module.exports={Population,POLICY,root,contains,deepUltra};
