'use strict';
// A short-lived checkpoint lets a routine server restart restore the flower
// rather than silently converting a transport interruption into a new life.
function captureRun(c){
  const e=c.engine;
  if(!['playing','dead'].includes(e.state)){delete c.account.activeRun;return;}
  const position=e.crystalVisit??e.moundVisit??e;
  c.account.activeRun={savedAt:Date.now(),biome:e.save.biome,state:e.state,x:position.x,y:position.y,hp:e.hp,angle:e.angle,
    sessionKills:e.sessionKills,sessionXP:e.sessionXP,sessionCollected:{...e.sessionCollected},sessionMobKills:{...e.sessionMobKills}};
}
function restoreRun(c,world){
  const run=c.account.activeRun,e=c.engine,age=Date.now()-(run?.savedAt??0);
  if(!run||age<0||age>120000||run.biome!==e.save.biome||!['playing','dead'].includes(run.state)||![run.x,run.y,run.hp].every(Number.isFinite))return false;
  e.save.previousBiome=undefined;e.start();world.join(c);
  const point=e.geometry.projectInside(run.x,run.y,e.radius);e.x=point.x;e.y=point.y;
  e.hp=run.state==='dead'?0:Math.max(1,Math.min(e.maxHp,run.hp));e.state=run.state;
  if(Number.isFinite(run.angle))e.angle=run.angle;
  for(const key of ['sessionKills','sessionXP'])if(Number.isFinite(run[key])&&run[key]>=0)e[key]=run[key];
  for(const key of ['sessionCollected','sessionMobKills'])if(run[key]&&typeof run[key]==='object'&&!Array.isArray(run[key]))e[key]={...run[key]};
  if(e.state==='dead'){e.deathAt=e.time;e.deathAngle=e.angle;}
  e.input={x:0,y:0};e.moveVX=e.moveVY=e.pushX=e.pushY=0;
  for(const petal of e.petals)if(petal){petal.x=e.x;petal.y=e.y;petal.motion=undefined;}
  return true;
}
module.exports={captureRun,restoreRun};
