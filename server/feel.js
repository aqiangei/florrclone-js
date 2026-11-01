'use strict';
// Applied to the same pinned simulation source on both sides.
function patchFeel(source){
  for(const [before,after] of [
    ['V={speed:250,attackRadius:104','V={speed:750,attackRadius:104'],
    ['this.reloadMult=yt(c,this.save.talents),this.shortcutSuppressed','this.reloadMult=yt(c,this.save.talents)*.5,this.shortcutSuppressed']
  ]){
    if(source.split(before).length!==2)throw Error('Movement/reload tuning boundary changed');
    source=source.replace(before,after);
  }
  return source;
}
module.exports={patchFeel};
