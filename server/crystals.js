'use strict';
const Geometry=require('./crystal-geometry');
const XP=Object.freeze([1,5,50,500,10000,500000,50000000,5000000000]);
// Energy capacity/recharge are explicit server tuning, not a claimed original formula.
const CAPACITY=5000000000,HALF_LIFE_MS=12*3600000;
class Crystals{
  constructor(world,{now=Date.now}={}){this.world=world;this.now=now;world.crystals=this;this.entrance=null;}
  portal(e){if(!this.entrance){const seed=new this.world.api.Engine(this.world.api.defaults(),Math.random,false);this.entrance=seed.geometry.projectInside(seed.x-700,seed.y-450,80);}return this.entrance;}
  entities(c){const e=c.engine;if(c.room.crystal)return[{id:'crystal-exit',kind:'Garden Portal',x:e.width/2,y:e.height-130,radius:65,rarity:0,recipe:null}];if(e.save.biome!=='Garden'||c.room.dungeon)return[];return[{id:'crystal-entrance',kind:'Crystal Room',...this.portal(e),radius:65,rarity:7,recipe:null}];}
  energy(c){let bank=c.account.crystalEnergy;const now=this.now();if(!bank)bank=c.account.crystalEnergy={value:CAPACITY,at:now};const elapsed=Math.max(0,now-bank.at);bank.value=Math.min(CAPACITY,CAPACITY-(CAPACITY-bank.value)*Math.exp(-Math.LN2*elapsed/HALF_LIFE_MS));bank.at=now;return bank;}
  status(c){const bank=this.energy(c);return{energy:bank.value,capacity:CAPACITY,xp:XP,level:c.engine.save.level};}
  enter(c){const e=c.engine;if(e.save.biome!=='Garden'||e.state!=='playing'||e.crystalVisit||e.moundVisit||e.portalCooldown>0)return false;const portal=this.portal(e);if(Math.hypot(e.x-portal.x,e.y-portal.y)>65)return false;
    const visit={x:portal.x+220,y:portal.y,width:e.width,height:e.height,room:{key:`crystal:${c.id}`,parentRoom:c.room}};e.crystalVisit=visit;e.serverCrystalRoom=true;e.width=2400;e.height=1800;
    const geometry=new Geometry(e.width,e.height);Object.defineProperties(e,{geometry:{value:geometry,configurable:true},mobGeometry:{value:geometry,configurable:true},inShortcut:{get:()=>e.y>e.height-280,configurable:true}});
    e.x=e.width/2;e.y=e.height-350;e.input={x:0,y:0};e.moveVX=e.moveVY=e.pushX=e.pushY=0;e.projectiles=[];e.portalCooldown=1;
    this.world.join(c);c.room.specialEntities=[{id:`crystal:${c.id}:center`,kind:'Crystal',x:e.width/2,y:e.height/2,radius:140,rarity:7,recipe:null}];this.resetPetals(e);return true;
  }
  resetPetals(e){e.rebuildPetals();for(const p of e.petals)if(p){p.x=e.x;p.y=e.y;p.motion=undefined;}}
  exit(c){const e=c.engine,visit=e.crystalVisit;if(!visit)return false;delete e.crystalVisit;delete e.serverCrystalRoom;delete e.geometry;delete e.mobGeometry;delete e.inShortcut;Object.assign(e,{width:visit.width,height:visit.height,x:visit.x,y:visit.y,portalCooldown:2,input:{x:0,y:0},moveVX:0,moveVY:0,pushX:0,pushY:0});const p=e.geometry.projectInside(e.x,e.y,e.radius);e.x=p.x;e.y=p.y;e.projectiles=[];this.world.join(c);this.resetPetals(e);return true;}
  approach(c){const e=c.engine;if(c.room.crystal){if(e.state!=='playing'||e.hp<=0)return this.exit(c);if(e.portalCooldown<=0&&Math.hypot(e.x-e.width/2,e.y-(e.height-130))<75)return this.exit(c);return false;}return this.enter(c);}
  absorb(c,raw){const e=c.engine,item=raw.item,count=raw.count??1;if(!c.room.crystal||!e.crystalVisit||e.state!=='playing'||e.hp<=0)throw Error('Enter the Crystal Room first.');if(!item||!Object.hasOwn(this.world.api.petals,item.type)||['Basic','Square','Fragment','Shard'].includes(item.type)||!Number.isInteger(item.rarity)||item.rarity<0||item.rarity>=XP.length)throw Error('This petal cannot be absorbed.');if(!Number.isSafeInteger(count)||count<1)throw Error('Invalid petal count.');const key=`${item.type}:${item.rarity}`,inventory=e.save.inventory;if((inventory[key]??0)<count)throw Error('Not enough inventory petals.');const amount=XP[item.rarity]*count,bank=this.energy(c);if(amount>bank.value)throw Error('Not enough Crystal energy.');inventory[key]-=count;bank.value-=amount;e.gainXP(amount);c.saveDirty=true;e.onEvent('save');return{ok:true,message:`Absorbed ${count} petal(s): +${amount} XP`,inventory:{...inventory},crystal:this.status(c),xpGained:amount};}
}
module.exports={Crystals,XP,CAPACITY};
