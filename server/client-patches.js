'use strict';
const fs=require('node:fs'),path=require('node:path');
function patchClient(source){
  function replaceOnce(before,after){
    if(source.split(before).length!==2)throw Error('Client playback patch no longer matches the pinned capture');
    source=source.replace(before,after);
  }
  replaceOnce('acceptSnapshot(e){let t=this.clock.now()', 'acceptSnapshot(e){recordOnlineMotion(this,e);let t=this.clock.now()');
  replaceOnce('hj(this,{snapshot:t,age:(this.clock.now()-this.receivedAt)/1e3,dt:e});this.hitFlash=',
    'hj(this,{snapshot:t,age:(this.clock.now()-this.receivedAt)/1e3,dt:e});smoothOnlineMotion(this);this.hitFlash=');
  replaceOnce('(0,b.jsx)(`a`,{className:`lobby-menu-qq community-link`,title:`Visit the florr.io QQ community`,"aria-label":`Florr.io QQ`,href:`https://jq.qq.com/?_wv=1027&k=eMLWfOJb`,target:`_blank`,rel:`noopener noreferrer`,children:(0,b.jsx)(S,{name:`qq`})})',
    '(0,b.jsx)(AshflorQQEntry,{})');
  replaceOnce('children:(0,b.jsx)(se,{})})]}),Ne===`lobby`',
    'children:(0,b.jsx)(se,{})}),(0,b.jsx)(AshflorQQEntry,{clearInput:()=>{T.current.clear(),E.current.active=!1,E.current.down=!1,E.current.right=!1,v.current?.flushControls?.()}})]}),Ne===`lobby`');
  replaceOnce('if(document.hidden||!document.hasFocus()||re.current||n.current)',
    'if(document.getElementById("ashflor-qq-dialog")?.open||document.hidden||!document.hasFocus()||re.current||n.current)');
  return source+'\n'+fs.readFileSync(path.join(__dirname,'client-motion.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'client-qq.js'),'utf8');
}
module.exports={patchClient};
