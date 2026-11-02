'use strict';
// Applied to the same pinned simulation source on both sides.
function patchFeel(source){
  const leafbug='addMob(e,t,n,r=0,i=!1,a=0,o=!1,s=1/0){';
  if(source.split(leafbug).length!==2)throw Error('Super Leafbug variant boundary changed');
  source=source.replace(leafbug,leafbug+'if(!i&&!o&&r===7&&(e===`Leafbug`||e===`Golden Leafbug`))e=this.rng()<.5?`Leafbug`:`Golden Leafbug`;');
  const killXp='ri(e)||this.gainXP(Zn(e.type,e.rarity,Si(e.type,e.rarity,_a(e.type,e.rarity,Ai(e.type,e.rarity,Ri(e.type,e.rarity,B[e.type].xp*5**e.rarity))))))';
  if(source.split(killXp).length!==2)throw Error('Monster XP multiplier boundary changed');
  source=source.replace(killXp,killXp.replace('this.gainXP(Zn','this.gainXP(20*Zn'));
  for(const [before,after] of [
    ['V={speed:250,attackRadius:104','V={speed:1125,attackRadius:104'],
    // Petal/body contact damage window: capture is 10Hz (1/10); raise to 20 hits/s.
    ['contactInterval:1/10','contactInterval:1/20'],
    ['this.reloadMult=yt(c,this.save.talents),this.shortcutSuppressed','this.reloadMult=yt(c,this.save.talents)*.5,this.shortcutSuppressed']
  ]){
    if(source.split(before).length!==2)throw Error('Movement/reload/drop tuning boundary changed');
    source=source.replace(before,after);
  }
  // Server policy: the captured Super scheduler used 900 seconds and one
  // spawn per cycle. A cycle now opens after 180 seconds and issues four
  // ordinary spawn groups, preserving each region's placement/ownership.
  const superInitial='rareReady:{super:e+900,';
  const superAdvance='t>=7&&(n.super=Math.max(n.super,e.time+900))';
  if(source.split(superInitial).length!==2||source.split(superAdvance).length!==2)throw Error('Super scheduler boundary changed');
  source=source.replace(superInitial,'rareReady:{super:e+180,');
  source=source.replace(superAdvance,'t>=7&&((e.superSpawnRemaining=(e.superSpawnRemaining??4)-1)>0?n.super=Math.min(n.super,e.time):(e.superSpawnRemaining=4,n.super=Math.max(n.super,e.time+180)))');
  const highestPassive='[`Root`,`Disc`,`Shovel`,`Magic Eye`';
  if(source.split(highestPassive).length!==2)throw Error('Powder passive selection boundary changed');
  source=source.replace(highestPassive,'[`Mysterious Powder`,`Root`,`Disc`,`Shovel`,`Magic Eye`');
  // Every multiplier means another complete, independent loot-table roll.
  // XP, kill counts and kill effects still run once in grantKill().
  const copies="let i=this.save.shop,a=t!==`Pharaoh's Crown`&&i&&(i.bonusUntil??0)>Date.now()&&e.rarity<7?(i.bonusCount??0)%7==0?3:2:1;for(let e=1;e<a;e++){let t={...r,id:this.nextWorldId?this.nextWorldId():this.id++,x:r.x+e*12};this.drops.push(t),this.onDropCreated?.(t)}";
  if(source.split(copies).length!==2)throw Error('Independent loot roll boundary changed');
  source=source.replace(copies,'');
  const grant='grantLoot(e){if(ri(e)||';
  if(source.split(grant).length!==2)throw Error('Loot table entry boundary changed');
  source=source.replace(grant,'grantLoot(e){if(ri(e))return;const shop=this.save.shop,rolls=20*(e.rarity>=7?3:1)*(shop&&(shop.bonusUntil??0)>Date.now()?(shop.bonusCount??0)%7===0?3:2:1);for(let roll=0;roll<rolls;roll++)this.grantLootRoll(e)}grantLootRoll(e){if(ri(e)||');
  return source;
}
module.exports={patchFeel};
