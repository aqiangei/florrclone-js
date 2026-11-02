'use strict';
// Wiki recipe facts, normalized to this capture's names (Shard = Fragment).
// https://florrio.wiki.gg/wiki/Assembler and /Trader
const RECIPES=[
  [{Glass:1},{Sand:1}],[{Sand:1},{Glass:1}],
  [{Battery:1,'Light Bulb':1,Glass:1},{Laser:2}],[{Air:10},{Bubble:1}],
  [{Light:1,Rose:1},{Dahlia:1}],[{Battery:3},{Battery:1,Lightning:1}],
  [{Honey:3},{Wax:1}],[{Antennae:1,'Light Bulb':1},{'Mecha Antennae':1}],
  [{Monstera:1},{Leaf:2}],[{Leaf:1,Uranium:1},{Monstera:1}],
  [{Basil:1},{Leaf:2}],[{Battery:1,Missile:1},{'Mecha Missile':2}],
  [{Cogwheel:2},{Fragment:1}],[{Fragment:1,Glass:1,Magnet:1},{Compass:1}],
  [{Rock:100000},{'Moon Rock':1}],[{'Moon Rock':1},{Rock:15}],
  [{Battery:1},{Fragment:1}],[{Light:1,Honey:1},{Pollen:1}],
  [{Triangle:10},{Cutter:1}],[{Cogwheel:1,Fragment:20},{Sawblade:1}]
].map(([input,output],id)=>({id,input,output}));
const UNTRADABLE=new Set(['Fragment','Shard','Blood Sacrifice','Basic','Square','Coin']);
const tradable=(item,api)=>item&&Object.hasOwn(api.petals,item.type)&&!UNTRADABLE.has(item.type)&&Number.isInteger(item.rarity)&&item.rarity>=0&&item.rarity<=8;
function inside(points,x,y){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
class Npcs{
  constructor(world,{rng=Math.random,now=Date.now}={}){this.world=world;this.rng=rng;this.now=now;this.sequence=0;this.requests=new Map();world.npcs=this;world.api.specialEntities=c=>this.visible(c);}
  place(room,engine,site){
    let p;
    if(site.points){const xs=site.points.map(v=>v[0]),ys=site.points.map(v=>v[1]),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
      for(let i=0;i<80;i++){const x=left+this.rng()*w,y=top+this.rng()*h;if(!inside(site.points,x,y))continue;const q={x:x*engine.width,y:y*engine.height};if(engine.geometry.isFreeCircle(q.x,q.y,60)){p=q;break;}}
      if(!p){const x=site.points.reduce((s,v)=>s+v[0],0)/site.points.length*engine.width,y=site.points.reduce((s,v)=>s+v[1],0)/site.points.length*engine.height;p=engine.geometry.projectInside(x,y,60);}
    }else p=engine.geometry.projectInside(engine.x+600,engine.y+300,60);
    return {...p,id:`npc:${++this.sequence}`,kind:site.kind,rarity:site.rarity,radius:site.kind==='Assembler'?65:35,recipe:site.kind==='Assembler'?RECIPES[Math.floor(this.rng()*RECIPES.length)]:null,refreshAt:site.kind==='Assembler'?this.world.time+1800:Infinity,site,home:{...p},phase:this.rng()*Math.PI*2};
  }
  tick(room,dt){
    if(room.dungeon||!['Factory','Desert'].includes(room.biome))return;
    const engine=[...room.clients][0]?.engine;if(!engine)return;
    if(!room.specialEntities){
      const sites=[];
      if(room.biome==='Desert')sites.push({kind:'Trader',rarity:0});
      else{const seen=new Set;for(const r of this.world.api.spawnRegions.Factory){if(seen.has(r.difficulty))continue;seen.add(r.difficulty);sites.push({kind:'Assembler',rarity:Math.max(0,Math.min(7,Math.round((r.difficulty??0)/10))),points:r.points});}}
      room.specialEntities=sites.map(site=>this.place(room,engine,site));
    }
    room.specialEntities=room.specialEntities.map(n=>{
      if(this.world.time>=n.refreshAt)return this.place(room,engine,n.site);
      if(n.kind==='Trader'){const angle=this.world.time*.08+n.phase,target={x:n.home.x+Math.cos(angle)*400,y:n.home.y+Math.sin(angle)*400},distance=Math.hypot(target.x-n.x,target.y-n.y),step=Math.min(distance,50*dt),p=engine.geometry.projectInside(n.x+(target.x-n.x)*step/(distance||1),n.y+(target.y-n.y)*step/(distance||1),n.radius);n.x=p.x;n.y=p.y;}
      return n;
    });
    if(this.requests.size>2000){const expiry=this.now()-600000;for(const [id,r]of this.requests)if(r.at<expiry)this.requests.delete(id);}
  }
  visible(c){return(c.room?.specialEntities??[]).filter(n=>Math.hypot(n.x-c.engine.x,n.y-c.engine.y)<(c.viewRadius??1800)+n.radius).map(({id,kind,x,y,radius,rarity,recipe})=>({id,kind,x,y,radius,rarity,recipe}));}
  nearest(c,id){const e=c.engine;if(e.state!=='playing'||e.hp<=0||e.paused)throw Error('You must be alive and playing.');const n=c.room?.specialEntities?.find(n=>n.id===id);if(!n||Math.hypot(n.x-e.x,n.y-e.y)>n.radius+e.radius+120)throw Error('Move closer to the NPC.');return n;}
  view(c){return{entities:this.visible(c),traderReadyAt:c.account.traderReadyAt??0,now:this.now()};}
  interact(c,raw){
    if(typeof raw.requestId!=='string'||raw.requestId.length<8||raw.requestId.length>80)throw Error('Invalid interaction request.');
    const key=c.id+':'+raw.requestId,previous=this.requests.get(key);if(previous){if(previous.command!==JSON.stringify(raw))throw Error('Request already used.');return previous.result;}
    const receipt=c.account.npcReceipts?.find(r=>r.requestId===raw.requestId);
    if(receipt){if(receipt.command!==JSON.stringify(raw))throw Error('Request already used.');return{ok:true,message:'Exchange already completed.',inventory:{...c.engine.save.inventory},...this.view(c)};}
    const n=this.nearest(c,raw.id),inventory=c.engine.save.inventory;
    let input,output,rarity;
    if(n.kind==='Trader'){
      if(!tradable(raw.item,this.world.api))throw Error('This petal cannot be traded.');
      if((c.account.traderReadyAt??0)>this.now())throw Error('You can trade once every 24 hours.');
      input={[raw.item.type]:1};output={Coin:1};rarity=raw.item.rarity;
    }else{if(raw.recipe!==n.recipe.id)throw Error('The assembler recipe has changed.');input=n.recipe.input;output=n.recipe.output;rarity=n.rarity;}
    // Validate everything before any mutation, including the Battery→Battery recipe.
    for(const [type,count]of Object.entries(input))if((inventory[`${type}:${rarity}`]??0)<count)throw Error('Not enough inventory petals. Equipped petals are protected.');
    for(const [type,count]of Object.entries(output)){
      if(!Object.hasOwn(this.world.api.petals,type))throw Error('Recipe output is unavailable.');
      if(!Number.isSafeInteger((inventory[`${type}:${rarity}`]??0)-(input[type]??0)+count))throw Error('Inventory count limit reached.');
    }
    for(const [type,count]of Object.entries(input))inventory[`${type}:${rarity}`]-=count;
    for(const [type,count]of Object.entries(output))inventory[`${type}:${rarity}`]=(inventory[`${type}:${rarity}`]??0)+count;
    if(n.kind==='Trader')c.account.traderReadyAt=this.now()+86400000;
    c.account.npcReceipts=[...(c.account.npcReceipts??[]),{requestId:raw.requestId,command:JSON.stringify(raw)}].slice(-128);
    c.saveDirty=true;c.engine.onEvent('save');
    const result={ok:true,message:n.kind==='Trader'?'Trade completed.':'Assembly completed.',inventory:{...inventory},...this.view(c)};
    this.requests.set(key,{at:this.now(),command:JSON.stringify(raw),result});return result;
  }
}
module.exports={Npcs,RECIPES,tradable};
