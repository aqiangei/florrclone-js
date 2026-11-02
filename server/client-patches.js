'use strict';
const fs=require('node:fs'),path=require('node:path');
const {patchFeel}=require('./feel');
function patchClient(source){
  source=patchFeel(source);
  function replaceOnce(before,after){
    if(source.split(before).length!==2)throw Error('Client playback patch no longer matches the pinned capture');
    source=source.replace(before,after);
  }
  replaceOnce('let ir=P.biome===`Hel`&&rr>tr,ar=!ft||P.helUnlocked||!!P.debug||P.biome===`Hel`,or=Object.keys(Et).filter(e=>ir?e!==`Hel`:e===`Hel`&&!ar),sr=e=>',
    'let ir=!be&&P.biome===`Hel`&&rr>tr,ar=be||!ft||P.helUnlocked||!!P.debug||P.biome===`Hel`,or=be?[]:Object.keys(Et).filter(e=>ir?e!==`Hel`:e===`Hel`&&!ar),sr=e=>');
  replaceOnce('[`Garden`,`Desert`,`Ocean`,`Jungle`,`Hel`].map(e=>',
    '(be?[`Garden`,`Desert`,`Ocean`,`Jungle`,`Hel`,`Pyramid`,`Factory`,`Ant Hell`,`Sewers`]:[`Garden`,`Desert`,`Ocean`,`Jungle`,`Hel`]).map(e=>');
  replaceOnce('}),ft&&it&&(0,b.jsxs)(`div`,{className:`account-strip`',
    '}),(0,b.jsx)(AshSafeLocate,{engine:v}),ft&&it&&(0,b.jsxs)(`div`,{className:`account-strip`');
  replaceOnce('n.current=e,T.current.clear(),E.current.active=E.current.down=E.current.right=!1,oe.current=0,x.current?.flushControls()',
    'n.current=e,T.current.clear(),e&&A.current.mouse||(E.current.active=!1),E.current.down=E.current.right=!1,oe.current=0,x.current?.flushControls()');
  replaceOnce('E.current.x=e.clientX-t.left,E.current.y=e.clientY-t.top,E.current.active=!0',
    'E.current.x=e.clientX-t.left,E.current.y=e.clientY-t.top,E.current.ashKnown=true,E.current.active=!0');
  replaceOnce('!r&&!i&&e&&A.current.mouse&&E.current.active&&!M.current&&!re.current',
    '!r&&!i&&e&&A.current.mouse&&(E.current.active||n.current&&E.current.ashKnown)&&!M.current&&!re.current');
  replaceOnce('let e=w.current,t=T.current;if(document.hidden||!document.hasFocus()||re.current||n.current)return{x:0,y:0,mode:`normal`,defend:!1};',
    'let e=w.current,t=n.current?new Set:T.current;if(document.hidden||!document.hasFocus()||re.current||n.current&&!A.current.mouse)return{x:0,y:0,mode:`normal`,defend:!1};');
  replaceOnce('i=(t.has(`s`)||t.has(`arrowdown`)?1:0)-(t.has(`w`)||t.has(`arrowup`)?1:0),a=D.current;',
    'i=(t.has(`s`)||t.has(`arrowdown`)?1:0)-(t.has(`w`)||t.has(`arrowup`)?1:0),a=n.current?{x:0,y:0,attack:false,defend:false}:D.current;');
  replaceOnce('let o=(t.has(`shift`)||E.current.right||a.defend)!==A.current.invertDefend,',
    'if(n.current)return{x:r,y:i,mode:`normal`,defend:false};let o=(t.has(`shift`)||E.current.right||a.defend)!==A.current.invertDefend,');
  // A failed first request must not poison the shared image/manifest cache.
  // Keep the original component promise pending through bounded retries so
  // memoized card canvases repaint when their own image finally arrives.
  replaceOnce('async function gn(e=[]){','async function gn(e=[]){for(let attempt=0;;attempt++){try{return await ashLoadSpriteBatch(e)}catch(error){if(attempt>=3)throw error;await new Promise(resolve=>setTimeout(resolve,300*2**attempt))}}}async function ashLoadSpriteBatch(e=[]){');
  replaceOnce('Object.assign(sn,await e.json())})()),await Promise.all(e.map',
    'Object.assign(sn,await e.json())})().catch(error=>{pn=void 0;throw error})),await Promise.all(e.map');
  replaceOnce('hn.set(t,r)),r}))}',
    'hn.set(t,r),r.catch(()=>{if(hn.get(t)===r)hn.delete(t)})),r}))}');
  replaceOnce('this.width=e.map.width,this.height=e.map.height;let u={...this.face};',
    'this.specialEntities=e.specialEntities??[];this.ashCrystalGeometry=e.map.instance===`crystal`?this.ashCrystalGeometry??new AshCrystalGeometry(e.map.width,e.map.height):null;this.width=e.map.width,this.height=e.map.height;let u={...this.face};');
  replaceOnce('get geometry(){return this.wormVisit?', 'get geometry(){if(this.ashCrystalGeometry)return this.ashCrystalGeometry;return this.wormVisit?');
  replaceOnce('get mobGeometry(){return this.wormVisit?', 'get mobGeometry(){if(this.ashCrystalGeometry)return this.ashCrystalGeometry;return this.wormVisit?');
  replaceOnce('get inShortcut(){if(this.moundVisit||this.wormVisit)', 'get inShortcut(){if(this.ashCrystalGeometry)return this.y>this.height-280;if(this.moundVisit||this.wormVisit)');
  replaceOnce('for(let e of n.mobs){if(e.hp<=0)continue;if(e.type===`Firefly`',
    'ashDrawNpcs(t,n);for(let e of n.mobs){if(e.hp<=0)continue;if(e.type===`Firefly`');
  replaceOnce('await Promise.all([gn(),h().then(()=>{e||b.render(0)})])',
    'await Promise.all([gn([`Flower`,...c.save.loadout.concat(c.save.reserve).filter(Boolean).map(item=>co(item.type,item.rarity))]),h().then(()=>{e||b.render(0)})])');
  replaceOnce('className:`guild-squad`,disabled:h,onClick:()=>void _(()=>Xc(e.id)),children:`Squad`',
    'className:`guild-squad`,disabled:h,onClick:()=>void _(()=>Xc(e.id)),children:`Invite to squad`');
  replaceOnce('(0,b.jsx)(`h3`,{className:`guild-title`,children:r.guild.name})',
    '(0,b.jsx)(AshGuildHeading,{guild:r.guild})');
  replaceOnce('className:`guild-member`,children:[(0,b.jsxs)(`span`,{className:`guild-member-name`',
    'className:`guild-member`,children:[(0,b.jsx)(`span`,{className:`ash-guild-avatar`,\"aria-hidden\":true,children:e.name.slice(0,1).toUpperCase()}),(0,b.jsxs)(`span`,{className:`guild-member-name`');
  // Powder can cover 250 units between reconciliation samples without a teleport.
  replaceOnce('Math.hypot(o.x-l.x,o.y-l.y)>250','Math.hypot(o.x-l.x,o.y-l.y)>Math.max(250,e.motion.speed*(.75+c))');
  replaceOnce('function H(e,t,n,r,i,a=0){let o=on[t];',
    'function H(e,t,n,r,i,a=0){if(t===`Square`)return ashDrawSquare(e,n,r,i/2,a);let o=on[t];');
  replaceOnce('function Mn(e,t,n,r,i,a,o=0,s=!1){if(t!==`Test Dummy`',
    'function Mn(e,t,n,r,i,a,o=0,s=!1){if(t===`Square`)return ashDrawSquare(e,n,r,i,o);if(t!==`Test Dummy`');
  replaceOnce('driftX:Q.optional(),driftY:Q.optional()})).max(4096)',
    'driftX:Q.optional(),driftY:Q.optional(),webGround:Zg().optional()})).max(4096)');
  replaceOnce('driftY:AM(e.driftY,0)}),FM=', 'driftY:AM(e.driftY,0),webGround:e.webGround===true}),FM=');
  replaceOnce('return{id:p.id,name:p.name,level:', 'return{id:p.id,name:p.name,guildName:p.guildName??``,level:');
  replaceOnce('players:r_(q({..._j,id:xg(),name:xg(),level:', 'players:r_(q({..._j,id:xg(),name:xg(),guildName:xg().optional(),level:');
  replaceOnce('t.type===`Wax`&&(r.life=0),!s.invulnerable', '(t.type===`Wax`||t.type===`Moon Rock`)&&(r.life=0),!s.invulnerable');
  replaceOnce('m.sort((e,t)=>e.time-t.time);for(let{time:t,target:n',
    'm.sort((e,t)=>e.time-t.time||Number(!!t.intercept)-Number(!!e.intercept));for(let{time:t,target:n');
  replaceOnce('roomId:xg().optional()}),mapMobs:', 'roomId:xg().optional(),dungeon:q({kind:g_(\`termite\`),rarity:vj}).optional()}),mapMobs:');
  replaceOnce('this.width=e.map.width,this.height=e.map.height;let u={...this.face};',
    'this.width=e.map.width,this.height=e.map.height;if(this.ashDungeonRoom!==e.map.roomId){this.moundVisit=e.map.dungeon?{room:gA({id:0,type:\`Termite Mound\`,rarity:e.map.dungeon.rarity})}:void 0;this.ashDungeonRoom=e.map.roomId}let u={...this.face};');
  replaceOnce('const geometry=wS(snapshot.map.biome,e.width,e.height);',
    'const geometry=e.ashCrystalGeometry??e.moundVisit?.room.geometry??wS(snapshot.map.biome,e.width,e.height);');
  replaceOnce('!e.waveMode&&Bx(snapshot.map.biome)?wS(snapshot.map.biome,e.width,e.height):void 0',
    '!e.waveMode&&Bx(snapshot.map.biome)?e.ashCrystalGeometry??e.moundVisit?.room.geometry??wS(snapshot.map.biome,e.width,e.height):void 0');
  replaceOnce('function p(){return f}', 'function p(){return l.size}');
  replaceOnce('function h(){return d??=Promise.all(Object.entries(c).map(async([e,t])=>{let n=new Image;n.src=`/assets/world-tiles/${t}`,await n.decode();let r=document.createElement(`canvas`);r.width=r.height=256,r.getContext(`2d`).drawImage(n,0,0,256,256),l.set(Number(e),r)})).then(()=>{f=!0}).catch(e=>{throw d=void 0,e})}',
    'function h(){return d??=ashLoadTerrainTiles(c,l,()=>{f=l.size>0}).finally(()=>{d=void 0})}');
  replaceOnce('let o=l.get(t&268435455);if(o)', 'let o=l.get(t&268435455)??ashTerrainFallback(l,t&268435455);if(o)');
  replaceOnce('c=!!o.closest(`.loadout`),l=o.getBoundingClientRect()',
    'c=!!o.closest(`.loadout`),ashGesture=ashInventoryGesture(i,s),l=o.getBoundingClientRect()');
  replaceOnce('ee=()=>{window.removeEventListener(`pointermove`,A)',
    'ee=()=>{ashGesture?.dispose();window.removeEventListener(`pointermove`,A)');
  // Scroll swipes: suppress drag/click but do NOT abort via M() — that disposed
  // ashInventoryGesture and left button-started pans unable to move scrollTop.
  replaceOnce('A=n=>{if(n.pointerId!==u||(d=n.clientX,f=n.clientY,!S&&Math.hypot(d-p,f-m)<5))return;',
    'A=n=>{if(n.pointerId!==u)return;if(ashGesture&&!ashGesture.allow(n)){if(ashGesture.scrolling)r.current=true;return}if((d=n.clientX,f=n.clientY,!S&&Math.hypot(d-p,f-m)<5))return;');
  // Mobile long-press shows petal tip; coarse pointers skip focus/hover flash tips.
  replaceOnce(
    'let d=pv(e,()=>l?.(null)),f=r&&d.reserved?Math.max(0,(n??1)-1):n,p=r&&f===1?void 0:f;return(0,b.jsxs)(`button`,{className:`petal-card ${i?`small`:``} ${o?`selected`:``}`,style:{"--rarity":L[e.rarity].color,gridColumn:a,visibility:r&&d.reserved&&f===0?`hidden`:void 0},"data-petal-count":f,onPointerDown:d.onPointerDown,onClick:e=>{if(d.suppressClick.current){e.preventDefault(),d.suppressClick.current=!1;return}c?.(e)},onMouseEnter:n=>l?.(t??e,n.currentTarget),onMouseLeave:()=>l?.(null),onFocus:n=>l?.(t??e,n.currentTarget),onBlur:()=>l?.(null),',
    'let tipItem=t??e,d=pv(e,()=>{ashClearPetalTipLatch();l?.(null)}),f=r&&d.reserved?Math.max(0,(n??1)-1):n,p=r&&f===1?void 0:f;return(0,b.jsxs)(`button`,{className:`petal-card ${i?`small`:``} ${o?`selected`:``}`,style:{"--rarity":L[e.rarity].color,gridColumn:a,visibility:r&&d.reserved&&f===0?`hidden`:void 0},"data-petal-count":f,onPointerDown:ev=>{if(ashPetalTipHeld()&&ashPetalTipLatch?.target===ev.currentTarget){ashClearPetalTipLatch();d.suppressClick.current=!0;ashPetalTipDismissClick=!0;return}ashArmPetalLongPress(ev,tipItem,l,d.suppressClick);d.onPointerDown(ev);},onClick:e=>{if(ashConsumePetalTipDismissClick()||d.suppressClick.current){e.preventDefault(),d.suppressClick.current=!1;return}c?.(e)},onMouseEnter:n=>{if(ashIsCoarsePointer())return;l?.(tipItem,n.currentTarget);},onMouseLeave:()=>{if(ashPetalTipHeld())return;l?.(null);},onFocus:n=>{if(ashIsCoarsePointer())return;l?.(tipItem,n.currentTarget);},onBlur:()=>{if(ashPetalTipHeld())return;l?.(null);},');
  // Fit the world to the short edge on phones. Render and snapshot interest
  // must use the same zoom, including immediately after an orientation change.
  replaceOnce('get effectiveZoom(){return this.zoom*(this.visionScale??1)}',
    'get viewportScale(){return ashMobileViewportScale(this.w,this.h)}get effectiveZoom(){return this.zoom*this.viewportScale*(this.visionScale??1)}');
  // Mobile labels: skip segments only; keep all rarities; font tracks zoom.
  replaceOnce('this.showNames&&!this.labelsHidden&&!r.wormGut&&(eC(t,r.type===`Test Dummy`?`Target Dummy`:r.type,r.x-30,r.y+s+15,12,`#fff`,`left`,void 0,void 0,11*this.dpr),eC(t,L[r.rarity].name+(r.waveLevel?` · Lv ${r.waveLevel}`:``),r.x+30,r.y+s+34,10,L[r.rarity].color,`right`,void 0,void 0,10*this.dpr))',
    'this.showNames&&!this.labelsHidden&&ashShouldDrawMobName(r)&&(eC(t,r.type===`Test Dummy`?`Target Dummy`:r.type,r.x-30,r.y+s+15,ashMobNameFont(12,this.effectiveZoom),`#fff`,`left`,void 0,void 0,ashMobNameFont(11,this.effectiveZoom)*this.dpr),eC(t,L[r.rarity].name+(r.waveLevel?` · Lv ${r.waveLevel}`:``),r.x+30,r.y+s+34,ashMobNameFont(10,this.effectiveZoom),L[r.rarity].color,`right`,void 0,void 0,ashMobNameFont(10,this.effectiveZoom)*this.dpr))');
  replaceOnce('let f=this.zoom*this.visionScale,p=r/2-this.camera.x*f',
    'let f=this.effectiveZoom,p=r/2-this.camera.x*f');
  replaceOnce('let t=typeof DecompressionStream==`function`?new WebSocket(e,[dM,aM]):new WebSocket(e);',
    'let t=new WebSocket(e,typeof DecompressionStream==`function`?[AshWire.PROTOCOL,dM,aM]:[AshWire.PROTOCOL]);');
  replaceOnce('let r=new pM({decode:e=>{if(e instanceof ArrayBuffer)',
    'const wire=new AshWire.Decoder();let r=new pM({decode:e=>{if(t.protocol===AshWire.PROTOCOL&&e instanceof ArrayBuffer)return wire.decode(e);if(e instanceof ArrayBuffer)');
  replaceOnce('mM=e=>{if(typeof e==`string`)try{return JSON.parse(e)}catch{return}}',
    'mM=e=>{if(e&&typeof e===`object`)return e;if(typeof e==`string`)try{return JSON.parse(e)}catch{return}}');
  replaceOnce('}catch{e.close(4002,`Invalid delta`)}',
    '}catch(error){try{e.send(JSON.stringify({type:`clientDiagnostic`,phase:`snapshot`,message:String(error?.message??error).slice(0,240)}))}catch{}e.close(4002,`Snapshot playback failed`)}');
  replaceOnce('acceptSnapshot(e){let t=this.clock.now()', 'acceptSnapshot(e){recordOnlineMotion(this,e);if(e.onlineRoster)this.onlineRoster=e.onlineRoster;this.combatStats=e.combatStats;this.craftJob=e.craftJob;if(e.loadoutPresets)ashSyncLoadoutPresets(e.loadoutPresets);let t=this.clock.now()');
  replaceOnce('var b=i(),x=', 'var ashOriginalJSX=i();var b={...ashOriginalJSX,jsx:ashJSX(ashOriginalJSX.jsx),jsxs:ashJSX(ashOriginalJSX.jsxs)},x=');
  replaceOnce('function dN(){let[e,t]', 'function dN(){useAshLanguage();let[e,t]');
  replaceOnce('async function hc(){try{document.fullscreenElement||await document.documentElement.requestFullscreen({navigationUI:`hide`})}catch{}try{await screen.orientation?.lock?.(`landscape`)}catch{}}',
    'async function hc(){return ashDisplay().enter(true)}');
  replaceOnce('className:`window-fullscreen`,title:`Fullscreen landscape`,"aria-label":`Fullscreen landscape`,onClick:()=>void hc(),children:(0,b.jsx)(ie,{})',
    'className:`window-fullscreen`,title:ashTr(`Fullscreen landscape`),"aria-label":ashTr(`Fullscreen landscape`),onClick:()=>void hc(),children:[(0,b.jsx)(ie,{}),(0,b.jsx)(`span`,{children:ashTr(`Landscape game`)})]');
  replaceOnce('theme:`reference-settings settings-${o.toLowerCase()}`,close:r,open:e,children:[',
    'theme:`reference-settings settings-${o.toLowerCase()}`,close:r,open:e,children:[(0,b.jsx)(AshDisplaySettings,{}),');
  // Scroll wheel steps the same Zoom setting the Graphics slider uses.
  replaceOnce('[ze,Be]=(0,O.useState)(nN)',
    '[ze,Be]=(0,O.useState)(nN),ashWheelZoom=useAshWheelZoom(Be)');
  replaceOnce('`L + 1–0: load build · Shift+L + 1–0: save build`,(0,b.jsx)(`br`,{}),`Enter: Chat · Esc: Close panel`',
    '`L + 1–0: load build · Shift+L + 1–0: save build`,(0,b.jsx)(`br`,{}),`Scroll wheel: zoom`,(0,b.jsx)(`br`,{}),`Enter: Chat · Esc: Close panel`');
  replaceOnce('className:`play-button`,onClick:Vn,disabled:',
    'className:`play-button`,onClick:()=>{if(ashDisplay().mobile())void ashDisplay().enter(true);Vn()},disabled:');
  replaceOnce('let e=e=>{if(e.target.matches(`input,textarea`))return;if(s.current)',
    'let e=e=>{if(document.querySelector(".ashflor-dialog[open]"))return;if(e.target.matches(`input,textarea`))return;if(s.current)');
  replaceOnce('value:`en`,onChange:()=>{},children:(0,b.jsx)(`option`,{value:`en`,children:`English (US)`})',
    'value:ashLanguage,onChange:e=>ashSetLanguage(e.target.value),children:[(0,b.jsx)(`option`,{value:`en`,children:`English (US)`}),(0,b.jsx)(`option`,{value:`zh`,children:`简体中文`})]');
  replaceOnce('Only English (US) is available in this build.', 'Chinese / English');
  replaceOnce('function eN({input:e,onSwap:t,onBuild:n}){let r=', 'function eN({input:e,onSwap:t,onBuild:n}){useAshTouchReset(e);let r=');
  replaceOnce('let r=Math.hypot(t,n),a=r>52?52/r:1;e.current.x=t*a/52,e.current.y=n*a/52',
    'let r=Math.hypot(t,n),limit=Math.max(16,((i.current?.parentElement?.clientWidth??110)-(i.current?.offsetWidth??52))/2),a=r>limit?limit/r:1;e.current.x=r<6?0:t*a/limit,e.current.y=r<6?0:n*a/limit');
  replaceOnce('let Pn=(0,O.useCallback)(()=>{let e=v.current;e&&(ov(e.save.loadout.length),e.save.loadout.forEach((t,n)=>e.swap(n))),Tn()',
    'let Pn=(0,O.useCallback)(()=>{let e=v.current;e&&(ov(e.save.loadout.length),e.sendCommand?e.sendCommand({type:"swapAll"}):e.save.loadout.forEach((t,n)=>e.swap(n))),Tn()');
  // Online builds: 20 cloud presets. K/L apply; leave autosaves (server loadPreset).
  replaceOnce('Fn=(0,O.useCallback)(e=>{let t=v.current;if(!t)return!1;let n=bv(e,{loadout:t.save.loadout.map(e=>e?{...e}:null),reserve:t.save.reserve.map(e=>e?{...e}:null)});return jn(n?`Saved build ${e+1}`:`Build slots are unavailable in this browser`),n},[jn]),In=(0,O.useCallback)(e=>{let t=v.current;if(!t)return!1;let n=xv(e);if(!n)return ov(t.save.loadout.length),t.applyBuild([],[]),Tn(),jn(`Build ${e===9?`0`:e+1} is empty — petals cleared; press K+${e===9?`0`:e+1} to save`),!1;ov(t.save.loadout.length);let r=t.applyBuild(n.loadout,n.reserve);return Tn(),jn(r?`Loaded build ${e+1}`:`Could not load that build`),r},[jn,Tn]);',
    'Fn=(0,O.useCallback)(e=>{let t=v.current;if(!t)return!1;const ok=ashSaveBuild(t,e|0);if(ok)jn(`Saved ${(e|0)<10?`K`:`L`}${((e|0)%10===9)?`0`:(e|0)%10+1}`);return ok},[jn]),In=(0,O.useCallback)(e=>{let t=v.current;if(!t)return!1;const ok=ashLoadBuild(t,e|0);Tn();return ok},[Tn]);');

  // Craft keeps one-click tools; inventory uses stock drag/tap equip only.
  replaceOnce('children:(0,b.jsx)(se,{size:21})})]}),(F===`inventory`||F===`craft`)',
    'children:(0,b.jsx)(se,{size:21})})]}),(F===`craft`)&&(0,b.jsx)(AshPanelTools,{engine:v,selected:I,slots:er,panel:F}),(F===`inventory`||F===`craft`)');
  // Death keeps chat and equipment panels available; closing a panel reveals respawn.
  replaceOnce('Ne===`playing`&&ze.chat&&(0,b.jsx)(W_,',
    '(Ne===`playing`||Ne===`dead`)&&ze.chat&&(0,b.jsx)(W_,');
  replaceOnce('onFocusChange:fe,canOpen:!ot&&!Ve&&!Ke&&!Je&&!F&&(!a||!!a.closing)',
    'onFocusChange:fe,canOpen:!ot&&!Ve&&!Ke&&!Je&&(!a||!!a.closing)');
  replaceOnce('if(!this.showChat||this.engine.state!==`playing`)return;',
    'if(!this.showChat||![`playing`,`dead`].includes(this.engine.state))return;');
  replaceOnce('hj(this,{snapshot:t,age:(this.clock.now()-this.receivedAt)/1e3,dt:e});this.hitFlash=',
    'hj(this,{snapshot:t,age:(this.clock.now()-this.receivedAt)/1e3,dt:e});smoothOnlineMotion(this);this.hitFlash=');
  // Online input was sampled at 10Hz (~100ms), which feels like sticky movement
  // even when the server is healthy. Match snapshot cadence instead.
  replaceOnce('this.sampler=new TM({clock:this.clock,hz:10,onSample:()=>this.tickSample()})',
    'this.sampler=new TM({clock:this.clock,hz:30,onSample:()=>this.tickSample()})');
  replaceOnce('(0,b.jsx)(`a`,{className:`lobby-menu-qq community-link`,title:`Visit the florr.io QQ community`,"aria-label":`Florr.io QQ`,href:`https://jq.qq.com/?_wv=1027&k=eMLWfOJb`,target:`_blank`,rel:`noopener noreferrer`,children:(0,b.jsx)(S,{name:`qq`})})',
    '(0,b.jsx)(AshflorFeedbackEntry,{}),(0,b.jsx)(AshflorQQEntry,{existingLink:!0}),(0,b.jsx)(AshflorGithubEntry,{})');
  replaceOnce('children:(0,b.jsx)(se,{})})]}),Ne===`lobby`',
    'children:(0,b.jsx)(se,{})}),(0,b.jsx)(AshMobileDisplayPrompt,{lobby:Ne===`lobby`}),(0,b.jsx)(AshOnlineTools,{engine:v}),(0,b.jsx)(AshDeathSummary,{engine:v}),(0,b.jsx)(AshflorFeedbackEntry,{clearInput:()=>{T.current.clear(),E.current.active=!1,E.current.down=!1,E.current.right=!1,v.current?.flushControls?.()}}),(0,b.jsx)(AshflorQQEntry,{clearInput:()=>{T.current.clear(),E.current.active=!1,E.current.down=!1,E.current.right=!1,v.current?.flushControls?.()}}),(0,b.jsx)(AshflorGithubEntry,{clearInput:()=>{T.current.clear(),E.current.active=!1,E.current.down=!1,E.current.right=!1,v.current?.flushControls?.()}})]}),Ne===`lobby`');
  // Live drop list is ashflor-style death-only; hide the in-run loot box.
  replaceOnce('P.biome!==`Hel`&&cr.length>0&&(0,b.jsxs)(`aside`,{className:`loot-box`',
    'false&&(0,b.jsxs)(`aside`,{className:`loot-box`');
  // Stock death loot panel replaced by AshDeathSummary (kills + petals stacks).
  replaceOnce('Ne===`dead`&&Se&&!F&&Object.keys(v.current?.sessionCollected??{}).length>0&&(0,ce.createPortal)',
    'false&&(0,ce.createPortal)');
  // Per-life mob kill stacks (death summary), mirrored in engine.js.
  replaceOnce('this.save.mobKills??={},this.save.mobKills[r]=(this.save.mobKills[r]??0)+1,this.sessionKills++',
    'this.save.mobKills??={},this.save.mobKills[r]=(this.save.mobKills[r]??0)+1,this.sessionMobKills??={},this.sessionMobKills[r]=(this.sessionMobKills[r]??0)+1,this.sessionKills++');
  replaceOnce('this.lastDamageSource=``,this.sessionCollected={},this.rewardedMobs=new WeakSet',
    'this.lastDamageSource=``,this.sessionCollected={},this.sessionMobKills={},this.rewardedMobs=new WeakSet');
  replaceOnce('this.lastDamageSource=``,this.sessionCollected={},this.state=`playing`',
    'this.lastDamageSource=``,this.sessionCollected={},this.sessionMobKills={},this.state=`playing`');
  replaceOnce('sessionKills:Q,sessionXP:Q,sessionCollected:f_(xg(),Q)',
    'sessionKills:Q,sessionXP:Q,sessionCollected:f_(xg(),Q),sessionMobKills:f_(xg(),Q)');
  replaceOnce('Aj(e.sessionCollected)&&Object.values(e.sessionCollected).every($)&&$(e.chainKills)',
    'Aj(e.sessionCollected)&&Object.values(e.sessionCollected).every($)&&Aj(e.sessionMobKills)&&Object.values(e.sessionMobKills).every($)&&$(e.chainKills)');
  replaceOnce('if(document.hidden||!document.hasFocus()||re.current||n.current&&!A.current.mouse)',
    'if(document.querySelector(".ashflor-dialog[open]")||document.getElementById("ashflor-qq-dialog")?.open||document.hidden||!document.hasFocus()||re.current||n.current&&!A.current.mouse)');
  // Root armor stacks: accept in snapshot schema/validator and show on loadout badge.
  replaceOnce('amuletShield:Q,cogTimer:Q', 'amuletShield:Q,armor:Q,cogTimer:Q');
  replaceOnce('$(e.shield)&&$(e.shieldMax)&&$(e.amuletShield)&&$(e.cogTimer)',
    '$(e.shield)&&$(e.shieldMax)&&$(e.amuletShield)&&$(e.armor)&&$(e.cogTimer)');
  replaceOnce('t=!m||![`Sponge`,`Totem`,`Nazar Amulet`].includes(m.type)||_,n=m?.type===`Nazar Amulet`?String(m.cd>0||m.hp<=0?0:m.nazarCharges??3):m?.type===`Totem`?String(p?.totemStacks.length??0):Us(Math.ceil(p?.spongeDamage.pending??0)),r=m?.type===`Nazar Amulet`?`Nazar charges`:m?.type===`Totem`?`Totem healing stacks`:`Absorbed damage remaining`',
    't=!m||![`Sponge`,`Totem`,`Nazar Amulet`,`Root`].includes(m.type)||_,n=m?.type===`Nazar Amulet`?String(m.cd>0||m.hp<=0?0:m.nazarCharges??3):m?.type===`Totem`?String(p?.totemStacks.length??0):m?.type===`Root`?String(Math.floor((p?.armor??0)/(R(m).armorStack||1)+1e-9)):Us(Math.ceil(p?.spongeDamage.pending??0)),r=m?.type===`Nazar Amulet`?`Nazar charges`:m?.type===`Totem`?`Totem healing stacks`:m?.type===`Root`?`Armor stacks`:`Absorbed damage remaining`');
  // Other-player plate: name above-left, health bar, Lv. below-right (florr_clone-web).
  replaceOnce(
    'Iv(e,o.x,o.y,o.radius,s,this.engine.time,this.hideOtherPetals?[]:o.petals,!1,!1,o.corrupted,false,o.hitFlash??0,o.dev===true),eC(e,o.name,o.x,o.y+40,13),e.fillStyle=`#334e35`,e.beginPath(),e.roundRect(o.x-24,o.y+47,48,6,3),e.fill(),e.fillStyle=`#77e368`,e.beginPath(),e.roundRect(o.x-23,o.y+48,46*Math.max(0,Math.min(1,o.hp/o.maxHp)),4,2),e.fill()',
    'Iv(e,o.x,o.y,o.radius,s,this.engine.time,this.hideOtherPetals?[]:o.petals,!1,!1,o.corrupted,false,o.hitFlash??0,o.dev===true),ashDrawPlayerNameplate(e,o)');
  // Downed/dead remotes: same nameplate as living (not gray/hidden).
  replaceOnce('if(o.dead){if(!a){let t=Pv();Iv(e,o.x,o.y,o.radius,t,this.engine.time,[],!1,!0,!1),eC(e,o.name,o.x,o.y+40,11,`#b9b9b9`)}continue}',
    'if(o.dead){if(!a){let t=Pv();Iv(e,o.x,o.y,o.radius,t,this.engine.time,[],!1,!0,!1);ashDrawPlayerNameplate(e,o)}continue}');
  // Alt latch (florr_clone-web): rarity glow under every petal (self + remotes).
  replaceOnce(
    'function yx(e,t,n,r,i,a,o,s=0,c,l=0,u=[2,5]){let d=vx(t,i)*(t===`Beetle Egg`?i/9:1);if(t===`Mimic`)return!0;',
    'function yx(e,t,n,r,i,a,o,s=0,c,l=0,u=[2,5]){let d=vx(t,i)*(t===`Beetle Egg`?i/9:1);ashDrawPetalRarityGlow(e,n,r,d,s);if(t===`Mimic`)return!0;');
  replaceOnce(
    'yx(e,t.type,r.x,r.y,t.type===`Wax`&&t.dropped?R(t).waxRadius:os(t.type,R(t).size),n,t.suit)',
    'yx(e,t.type,r.x,r.y,t.type===`Wax`&&t.dropped?R(t).waxRadius:os(t.type,R(t).size),n,t.suit,t.rarity??0)');
  // Local Uranium / Light Bulb skip the normal yx call — pass rarity through.
  replaceOnce(
    'yx(e,`Uranium`,0,0,9,r),e.restore()}drawBulb(e,t,n,r,i){if(i){let r=.5+.5*Math.sin(this.engine.time*Math.PI*2);e.save(),e.globalAlpha*=.06+.04*r,e.fillStyle=`#ffe763`,e.beginPath(),e.arc(t,n,260*(.94+.06*r),0,Math.PI*2),e.fill(),e.restore()}yx(e,`Light Bulb`,t,n,9,r)}',
    'yx(e,`Uranium`,0,0,9,r,void 0,s??0),e.restore()}drawBulb(e,t,n,r,i,s=0){if(i){let r=.5+.5*Math.sin(this.engine.time*Math.PI*2);e.save(),e.globalAlpha*=.06+.04*r,e.fillStyle=`#ffe763`,e.beginPath(),e.arc(t,n,260*(.94+.06*r),0,Math.PI*2),e.fill(),e.restore()}yx(e,`Light Bulb`,t,n,9,r,void 0,s??0)}');
  replaceOnce(
    'drawUranium(e,t,n,r){let i=.5+.5*Math.sin(this.engine.time*Math.PI*2);e.save(),e.globalAlpha*=.06+.04*i,e.fillStyle=`#74cc30`,e.beginPath(),e.arc(t,n,260*(.94+.06*i),0,Math.PI*2),e.fill(),e.restore(),e.save(),e.translate(t,n),e.scale(.92+.08*i,.92+.08*i),yx(e,`Uranium`,0,0,9,r,void 0,s??0),e.restore()}',
    'drawUranium(e,t,n,r,s=0){let i=.5+.5*Math.sin(this.engine.time*Math.PI*2);e.save(),e.globalAlpha*=.06+.04*i,e.fillStyle=`#74cc30`,e.beginPath(),e.arc(t,n,260*(.94+.06*i),0,Math.PI*2),e.fill(),e.restore(),e.save(),e.translate(t,n),e.scale(.92+.08*i,.92+.08*i),yx(e,`Uranium`,0,0,9,r,void 0,s??0),e.restore()}');
  replaceOnce(
    'a.type===`Uranium`?this.drawUranium(e,s.x,s.y,n.petalAngle(a,t)):a.type===`Light Bulb`?this.drawBulb(e,s.x,s.y,n.petalAngle(a,t),n.bulbArmed(a)):yx(',
    'a.type===`Uranium`?this.drawUranium(e,s.x,s.y,n.petalAngle(a,t),a.rarity):a.type===`Light Bulb`?this.drawBulb(e,s.x,s.y,n.petalAngle(a,t),n.bulbArmed(a),a.rarity):yx(');
  // Inventory / gallery tips: follow Alt latch instead of hold-to-show.
  replaceOnce(
    'let e=e=>{e.key===`Alt`&&c(e.type===`keydown`)},n=()=>{c(!1),u()};return window.addEventListener(`keydown`,e),window.addEventListener(`keyup`,e),window.addEventListener(`blur`,n),window.addEventListener(`resize`,n),()=>{window.removeEventListener(`keydown`,e),window.removeEventListener(`keyup`,e),window.removeEventListener(`blur`,n),window.removeEventListener(`resize`,n)}',
    'const sync=()=>c(!!ashAltMode);sync();const n=()=>u();return window.addEventListener(`ashflor-alt`,sync),window.addEventListener(`blur`,n),window.addEventListener(`resize`,n),()=>{window.removeEventListener(`ashflor-alt`,sync),window.removeEventListener(`blur`,n),window.removeEventListener(`resize`,n)}');
  replaceOnce(
    'let e=e=>{e.key===`Alt`&&c(!0)},t=e=>{e.key===`Alt`&&c(!1)},n=()=>c(!1),r=()=>{document.visibilityState===`hidden`&&n()};return window.addEventListener(`keydown`,e),window.addEventListener(`keyup`,t),window.addEventListener(`blur`,n),document.addEventListener(`visibilitychange`,r),()=>{window.removeEventListener(`keydown`,e),window.removeEventListener(`keyup`,t),window.removeEventListener(`blur`,n),document.removeEventListener(`visibilitychange`,r)}',
    'const sync=()=>c(!!ashAltMode);sync();return window.addEventListener(`ashflor-alt`,sync),()=>window.removeEventListener(`ashflor-alt`,sync)');
  // Local nameplate: readable on mobile zoom; also show over the dead body sprite.
  replaceOnce('x?Rb(t,n.x,n.y,n.radius,n):n.burrowLeft>0?(t.fillStyle=`rgba(0,0,0,.2)`,t.beginPath(),t.arc(n.x,n.y,n.radius,0,Math.PI*2),t.fill()):this.drawPlayerAppearance(t,n.x,n.y,n.radius);let S=this.healthMotion(n).sample(n.hp,n.maxHp,e)',
    'x?(Rb(t,n.x,n.y,n.radius,n),eC(t,n.save.name||`Player`,n.x,n.y+40,ashPlayerNameFont(14,this.effectiveZoom),`#fff`)):n.burrowLeft>0?(t.fillStyle=`rgba(0,0,0,.2)`,t.beginPath(),t.arc(n.x,n.y,n.radius,0,Math.PI*2),t.fill()):(this.drawPlayerAppearance(t,n.x,n.y,n.radius),(n.state===`playing`||n.state===`dead`)&&eC(t,n.save.name||`Player`,n.x,n.y+40,ashPlayerNameFont(14,this.effectiveZoom),`#fff`));let S=this.healthMotion(n).sample(n.hp,n.maxHp,e)');
  // Legacy drawMap path (kept for compatibility).
  replaceOnce('n.fillStyle=`#7fe9ff`;for(let e of this.remotePlayers)n.beginPath(),n.arc(e.x/r.width*i,e.y/r.height*a,t?4*o:2.5,0,Math.PI*2),n.fill();n.fillStyle=`#ffe666`,n.strokeStyle=`#3f542d`,n.lineWidth=2,n.beginPath(),n.arc(r.x/r.width*i,r.y/r.height*a,t?6*o:3.5,0,Math.PI*2),n.fill(),n.stroke()',
    'n.fillStyle=`#7fe9ff`;for(let e of this.remotePlayers){const s=e.x/r.width*i,c=e.y/r.height*a,label=(e.name||`Player`).slice(0,10);n.beginPath(),n.arc(s,c,t?4*o:2.5,0,Math.PI*2),n.fill();eC(n,label,s,c+(t?14:11),t?18:16,`#dff9ff`,`center`,`#0b2a1c`,2,10)}n.fillStyle=`#ffe666`,n.strokeStyle=`#3f542d`,n.lineWidth=2,n.beginPath(),n.arc(r.x/r.width*i,r.y/r.height*a,t?6*o:3.5,0,Math.PI*2),n.fill(),n.stroke();eC(n,(r.save.name||`Player`).slice(0,10),r.x/r.width*i,r.y/r.height*a+(t?15:12),t?18:16,`#ffe666`,`center`,`#2a3a14`,2,10)');
  // Active HUD minimap (drawHudMap): compact nameplates under dots.
  replaceOnce('for(let e of this.remotePlayers)_(e.x,e.y,`#7fe9ff`,`#3b7d88`);for(let e of this.squadMates)_(e.x,e.y,`#ff9fdf`,`#8a3f6f`);for(let e of this.guildMates)_(e.x,e.y,`#ffd166`,`#7a5d1f`);_(s.x,s.y,`#ffe666`,`#7a7835`)}',
    'for(let e of this.remotePlayers)_(e.x,e.y,`#7fe9ff`,`#3b7d88`);for(let e of this.squadMates)_(e.x,e.y,`#ff9fdf`,`#8a3f6f`);for(let e of this.guildMates)_(e.x,e.y,`#ffd166`,`#7a5d1f`);_(s.x,s.y,`#ffe666`,`#7a7835`);(()=>{const mark=(x,y,name,color)=>{const px=(.02+.96*x/s.width-m)*g,py=(.02+.96*y/s.height-h)*g,sz=Math.max(9,Math.round(6.5*u));eC(o,String(name||`Player`).slice(0,10),px,py+Math.max(7,5*u),sz,color,`center`,`#071a10`,Math.max(1,Math.round(u)),8)};for(const e of this.remotePlayers)mark(e.x,e.y,e.name,`#e8fbff`);mark(s.x,s.y,s.save.name,`#ffe666`)})()}');
  // Inventory click: empty primary auto-equips; also auto-fill empty reserve before opening the slot picker.
  replaceOnce(
    'if(F===`inventory`){let e=v.current,r=Array.from({length:er},(e,t)=>t).find(e=>!P.loadout[e]),i=P.inventory[t]??0;if(e&&r!==void 0&&i>0&&e.equip(r,n,!1)){av(r),jn(`Equipped ${n.type}`),Tn(),Qe(i>1?n:null);return}}Qe(n);',
    'if(F===`inventory`){let e=v.current,r=Array.from({length:er},(e,t)=>t).find(e=>!P.loadout[e]),i=P.inventory[t]??0;if(e&&r!==void 0&&i>0&&e.equip(r,n,!1)){av(r),jn(`Equipped ${n.type}`),Tn(),Qe(i>1?n:null);return}let a=Array.from({length:er},(e,t)=>t).find(e=>!P.reserve[e]);if(e&&a!==void 0&&i>0&&e.equip(a,n,!0)){jn(`Equipped ${n.type}`),Tn(),Qe(i>1?n:null);return}}Qe(n);');
  // Public chat channel (server-wide), alongside Local / Squad / Guild.
  replaceOnce('var V_=[`Local`,`Squad`,`Guild`]', 'var V_=[`Local`,`Public`,`Squad`,`Guild`]');
  replaceOnce('a(`/local <message> · /squad <message> · /guild <message> · /debug · /clear`)',
    'a(ASH_CHAT_HELP)');
  // Channel shortcuts also accept /public; /s and /g are handled by ashHandleChatCommand.
  replaceOnce('let r=/^\\/(local|squad|guild)(?:\\s+(.*))?$/i.exec(n),i=c;',
    'let r=/^\\/(local|public|squad|guild)(?:\\s+(.*))?$/i.exec(n),i=c;');
  // Channel toggle must not focus the draft — that opens the mobile IME.
  replaceOnce(
    '"aria-label":`Change chat channel`,onClick:()=>{w(),v.current?.focus()}',
    '"aria-label":`Change chat channel`,onClick:()=>{w()}');
  // Slash commands: squad helpers + suggestions; keep /clear /debug stock paths.
  replaceOnce('n.startsWith(`/`)?(a(`Invalid command, type /help to list all commands.`),!0)',
    'n.startsWith(`/`)?(ashHandleChatCommand(n,x.current||v.current,a)?!0:(a(`Invalid command, type /help to list all commands.`),!0))');
  // Adventure lobby: show squad create/join/ready UI (stock only showed it for Wave).
  replaceOnce('return mode==="wave"&&e.squadAction&&(s?children.push(jsx("div",{style:{marginTop:8,color:"white",font:"700 14px Ubuntu,sans-serif"},children:[jsx("p",{children:`Wave squad ${s.code} \\xB7 ${s.phase==="countdown"?`Starting in ${Math.ceil(s.countdown)}`:s.phase}`},"title"),...s.members.map(m=>jsx("p",{children:`${m.name} \\xB7 ${m.connected?"Online":"Offline"} \\xB7 ${m.ready?"Ready":"Not ready"}`},m.id)),button(s.members.find(m=>m.id===s.selfId)?.ready?"Unready":"Ready",()=>send({type:"squadReady",ready:!s.members.find(m=>m.id===s.selfId)?.ready})),button("Leave squad",()=>send({type:"squadLeave"}))]},"squad")):children.push(jsx("div",{style:{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:6,marginTop:8},children:[button("New Squad",()=>send({type:"squadCreate",public:!1})),button("Find Public",()=>send({type:"squadFind"})),jsx("input",{"aria-label":"Wave squad code",placeholder:"Room code",value:code,maxLength:8,onChange:ev=>setCode(ev.target.value.toUpperCase()),style:{width:95}},"code"),button("Join",()=>send({type:"squadJoin",code}))]},"join")))',
    'return e.squadAction&&children.push(jsx(AshLobbySquad,{engine:e,send,squad:s}))');
  // Death Continue: revive where you died (same as server Engine.start patch).
  replaceOnce(
    'let t=Bx(this.save.biome)?nS(this.save.biome,this.width,this.height):{x:540,y:700},n=!this.waveMode&&Bx(this.save.biome)?this.geometry.projectInside(t.x,t.y,this.radius):t;this.x=n.x,this.y=n.y',
    'let t=e?{x:this.x,y:this.y}:Bx(this.save.biome)?nS(this.save.biome,this.width,this.height):{x:540,y:700},n=!this.waveMode&&Bx(this.save.biome)?this.geometry.projectInside(t.x,t.y,this.radius):t;this.x=n.x,this.y=n.y');
  // Death Continue must keep the surrounding pack; seedMobs() would wipe it.
  replaceOnce(
    'this.mobDeaths=[],this.playerId||this.seedMobs(),this.waveMode&&',
    'this.mobDeaths=[],this.playerId||e||this.seedMobs(),this.waveMode&&');
  replaceOnce(
    'this.cogTimer=0,this.drops=!this.playerId&&this.save.biome===`Hel`?this.helSacrificeDrops.filter(e=>e.life>0):[],this.projectiles=[]',
    'this.cogTimer=0,this.drops=e?this.drops:!this.playerId&&this.save.biome===`Hel`?this.helSacrificeDrops.filter(e=>e.life>0):[],this.projectiles=[]');
  // Keep corpse-area packs: far-cull must count dead players as map presence.
  replaceOnce(
    '(this.worldFlowers?.()??[]).filter(e=>e.state===`playing`&&!e.inShortcut)',
    '(this.worldFlowers?.()??[]).filter(e=>(e.state===`playing`||e.state===`dead`)&&!e.inShortcut)');
  replaceOnce(
    '(this.worldFlowers?.()??[this]).filter(e=>e.state===`playing`&&e.hp>0)',
    '(this.worldFlowers?.()??[this]).filter(e=>e.state===`playing`||e.state===`dead`)');
  // Lentil attraction: same as server/engine.js — allow Leaf/Yucca/Starfish.
  replaceOnce(
    '(g.damage>0||g.poison>0||g.poisonAmp>0)&&!g.projectile&&!g.wearable&&!g.heal&&!g.healPerSecond&&!g.healAura&&!g.burstHeal&&![`Honey`,`Missile`,`Peas`,`Grapes`,`Blueberries`,`Pearl`,`Jelly`,`Antennae`,`Cactus`,`Bubble`,`Cotton`,`Plank`,`Poo`,`Magnet`,`Shell`,`Light Bulb`].includes(h.type)',
    '(g.damage>0||g.poison>0||g.poisonAmp>0)&&!g.projectile&&!g.wearable&&!g.burstHeal&&![`Honey`,`Missile`,`Peas`,`Grapes`,`Blueberries`,`Pearl`,`Jelly`,`Antennae`,`Cactus`,`Bubble`,`Cotton`,`Plank`,`Poo`,`Magnet`,`Shell`,`Light Bulb`].includes(h.type)');
  // Leech: same balance fixes as server/engine.js (aggro + contact).
  replaceOnce('t.type===`Leech`?900:','t.type===`Leech`?600:');
  replaceOnce(
    'applyFlowerMobContact(e,t,n,r){let i=B[e.type];if(e.type===`Leech`&&!e.segment&&this.burrowLeft<=0&&(e.leechAttached=!0,e.leechTargetId=void 0,e.leechFlowerId=this.playerId,e.leechAngle=e.angle),this.burrowLeft<=0){let a=qA(this,e,i.speed===0,this.width,this.height,r?this.geometry:void 0,r,t)??t;if(!this.bodyTouches.has(e.id)&&(this.bodyPushContacts.get(e.id)??0)<=n+1e-9){let{nx:t,ny:r}=a,o=(e.bodySweepDt??0)>0&&e.bodySweepStartX!==void 0&&e.bodySweepStartY!==void 0&&e.bodySweepEndX!==void 0&&e.bodySweepEndY!==void 0,s=i.speed===0?0:o?(e.bodySweepEndX-e.bodySweepStartX)/e.bodySweepDt:e.vx+e.kx,c=i.speed===0?0:o?(e.bodySweepEndY-e.bodySweepStartY)/e.bodySweepDt:e.vy+e.ky,l=GA((this.moveVX+this.pushX-s)*t+(this.moveVY+this.pushY-c)*r,this.radius,e.radius,i.speed===0,V.bodyRestitution,V.bodyContactPush),u=l.flower*(1+this.effectiveKnockbackMult);this.pushX+=t*u,this.pushY+=r*u,e.kx-=t*l.mob,e.ky-=r*l.mob,this.bodyPushContacts.set(e.id,Pt(this.bodyPushContacts.get(e.id),n)),this.bodyTouches.add(e.id)}}if(this.invuln===0&&!this.shovelBlocksDamage(e.type,e.id)&&this.frameContact(this,e,n)){kA(this,e,this);let t=this.mobDamage(e);',
    'applyFlowerMobContact(e,t,n,r){let i=B[e.type];if(e.type===`Leech`&&!e.segment&&this.burrowLeft<=0&&(e.leechAttached=!0,e.leechTargetId=void 0,e.leechFlowerId=this.playerId,e.leechAngle=e.angle),this.burrowLeft<=0){if(!(e.type===`Leech`&&(e.segment||e.leechAttached))){let a=qA(this,e,i.speed===0,this.width,this.height,r?this.geometry:void 0,r,t)??t;if(!this.bodyTouches.has(e.id)&&(this.bodyPushContacts.get(e.id)??0)<=n+1e-9){let{nx:t,ny:r}=a,o=(e.bodySweepDt??0)>0&&e.bodySweepStartX!==void 0&&e.bodySweepStartY!==void 0&&e.bodySweepEndX!==void 0&&e.bodySweepEndY!==void 0,s=i.speed===0?0:o?(e.bodySweepEndX-e.bodySweepStartX)/e.bodySweepDt:e.vx+e.kx,c=i.speed===0?0:o?(e.bodySweepEndY-e.bodySweepStartY)/e.bodySweepDt:e.vy+e.ky,l=GA((this.moveVX+this.pushX-s)*t+(this.moveVY+this.pushY-c)*r,this.radius,e.radius,i.speed===0,V.bodyRestitution,V.bodyContactPush),u=l.flower*(1+this.effectiveKnockbackMult);this.pushX+=t*u,this.pushY+=r*u,e.kx-=t*l.mob,e.ky-=r*l.mob,this.bodyPushContacts.set(e.id,Pt(this.bodyPushContacts.get(e.id),n)),this.bodyTouches.add(e.id)}}}if(e.type!==`Leech`&&this.invuln===0&&!this.shovelBlocksDamage(e.type,e.id)&&this.frameContact(this,e,n)){kA(this,e,this);let t=this.mobDamage(e);');
  // Web ground art: replace crude star PNG with florr_clone-web spider-web strokes
  // (10 spokes + 5 sagging rings). Same painter is used for spider/Mecha webs.
  replaceOnce(
    'function Mx(e,t,n,r,i=`rgba(240,237,225,.8)`){e.save(),e.translate(t,n),e.strokeStyle=i,e.lineWidth=Math.max(1,r*.012),e.lineCap=`round`,e.beginPath();for(let t=0;t<10;t++){let n=t*Math.PI*2/10;e.moveTo(0,0),e.lineTo(Math.cos(n)*r,Math.sin(n)*r)}for(let t=1;t<=5;t++){let n=r*t/5;for(let t=0;t<10;t++){let r=t*Math.PI*2/10,i=(t+1)*Math.PI*2/10,a=(r+i)/2;e.moveTo(Math.cos(r)*n,Math.sin(r)*n),e.quadraticCurveTo(Math.cos(a)*n*.76,Math.sin(a)*n*.76,Math.cos(i)*n,Math.sin(i)*n)}}e.stroke(),e.restore()}',
    'function Mx(e,t,n,r,i=`rgba(255,255,255,.45)`){e.save(),e.translate(t,n),e.strokeStyle=i,e.lineWidth=Math.max(1,r*.075),e.lineCap=`round`,e.beginPath();for(let t=0;t<10;t++){let n=t*Math.PI*2/10;e.moveTo(0,0),e.lineTo(Math.cos(n)*r,Math.sin(n)*r)}for(let t=0;t<5;t++){let n=r*t/5,a=n-r/10;e.moveTo(n,0);for(let t=0;t<10;t++){let o=Math.PI*2*(t+1)/10,s=Math.PI*(2*t+1)/10;e.quadraticCurveTo(Math.cos(s)*a,Math.sin(s)*a,Math.cos(o)*n,Math.sin(o)*n)}}e.stroke(),e.restore()}'
  );
  replaceOnce(
    'for(let e of n.projectiles)if((e.type===`Web`||e.type===`Electric Web`)&&e.webGround){let r=(e.radius??50)*2;H(t,`web-ground`,e.x,e.y,r,0),e.type===`Electric Web`&&(t.save(),t.globalAlpha*=.5+.5*Math.sin(n.time*4),H(t,`electric-web-ground-blue`,e.x,e.y,r,0),t.restore())}',
    'for(let e of n.projectiles)if((e.type===`Web`||e.type===`Electric Web`)&&e.webGround){let r=e.radius??50;Mx(t,e.x,e.y,r,e.type===`Electric Web`?`rgba(145,244,239,.55)`:`rgba(255,255,255,.45)`),e.type===`Electric Web`&&(t.save(),t.globalAlpha*=.45+.45*Math.sin(n.time*4),Mx(t,e.x,e.y,r,`rgba(145,244,239,.9)`),t.restore())}'
  );
  // Mobile talent wheel drag felt sluggish at 1.15x / 2.8x; raise coarse-pointer gain again.
  replaceOnce('ie=(e,t)=>{cancelAnimationFrame(_.current),_.current=0,g.current=Yv(g.current,-(t+e*.6)*1.15,0),h.current=g.current,m(h.current)}',
    'ie=(e,t)=>{cancelAnimationFrame(_.current),_.current=0,g.current=Yv(g.current,-(t+e*1.05)*(matchMedia(`(pointer:coarse)`).matches||navigator.maxTouchPoints>0?4.6:1.15),0),h.current=g.current,m(h.current)}');
  replaceOnce('!(!t.moved&&Math.hypot(i,a)<8)&&(e.preventDefault(),r(t,i,a))',
    '!(!t.moved&&Math.hypot(i,a)<3)&&(e.preventDefault(),r(t,i,a))');
  // Talent icons are <img>; iOS/Android long-press sometimes races the wheel
  // gesture and shows Save/Share. Block callout at the element too.
  replaceOnce('function iy({id:e}){return(0,b.jsx)(`img`,{src:`/assets/talents/${e}.svg`,alt:``,draggable:!1})}',
    'function iy({id:e}){return(0,b.jsx)(`img`,{src:`/assets/talents/${e}.svg`,alt:``,draggable:!1,onContextMenu:e=>e.preventDefault(),onDragStart:e=>e.preventDefault(),style:{WebkitTouchCallout:`none`,WebkitUserSelect:`none`,userSelect:`none`,pointerEvents:`none`}})}');
  // Keep stock strip at first evaluate; client-builds.js reassigns after helpers exist.
  replaceOnce("const viepPresetStrip=createPresetStrip(O,b.jsx,yv,oN,L)",
    "var viepPresetStrip=createPresetStrip(O,b.jsx,yv,oN,L)");
  replaceOnce("function tN({open:e,close:t,save:n,use:r}){if(!e)return null;let i=yv();return(0,b.jsxs)(`section`,{className:`touch-build-panel`,role:`dialog`,\"aria-label\":`Builds`,children:[(0,b.jsxs)(`header`,{children:[(0,b.jsx)(`b`,{children:`Builds`}),(0,b.jsx)(`button`,{className:`touch-build-close`,\"aria-label\":`Close builds`,onClick:t,children:`×`})]}),(0,b.jsx)(`p`,{className:`touch-build-hint`,children:`Save the current loadout, or equip a stored build.`}),(0,b.jsx)(`div`,{className:`touch-build-grid`,children:i.map((e,i)=>(0,b.jsxs)(`article`,{className:`touch-build-slot`,children:[(0,b.jsx)(`b`,{children:i+1}),(0,b.jsx)(`button`,{className:`touch-build-save`,onClick:()=>{n(i)&&t()},children:`Save`}),(0,b.jsx)(`button`,{className:`touch-build-use`,disabled:!e,onClick:()=>{r(i)&&t()},children:`Use`})]},i))})]})}",
    "function tN(p){return AshTouchBuildPanel(p)}");
  // Desktop: K/L+digit both apply (20 slots). No Shift-save — leave autosaves.
  replaceOnce('T.current.has(`l`)?(e.preventDefault(),e.shiftKey?Fn(t):In(t)):n&&(av(t),n.swap(t)),Tn()',
    '(T.current.has(`k`)||T.current.has(`l`))?(e.preventDefault(),In((T.current.has(`k`)?0:10)+t)):n&&(av(t),n.swap(t)),Tn()');
  // Primary slot click: if mobile L-pick armed, apply L(slot+1) instead of swap.
  replaceOnce('Hn=(e,t=!1)=>{v.current&&(I?v.current.equip(e,I,t)&&((v.current.save.inventory[tt(I)]??0)===0&&Qe(null),jn(`Equipped ${I.type}`),Tn()):(av(e),v.current.swap(e),Tn()))}',
    'Hn=(e,t=!1)=>{if(!t&&ashConsumeMobileLPick(e,v.current)){Tn();return}v.current&&(I?v.current.equip(e,I,t)&&((v.current.save.inventory[tt(I)]??0)===0&&Qe(null),jn(`Equipped ${I.type}`),Tn()):(av(e),v.current.swap(e),Tn()))}');
  // Mobile R: short=swap, long=arm L-pick (ashflor).
  replaceOnce('t&&(0,b.jsx)(`button`,{className:`touch-swap`,"aria-label":`Swap reserve equipment`,onPointerDown:e=>e.preventDefault(),onClick:t,children:`R`})',
    't&&(0,b.jsx)(AshTouchSwap,{onSwap:t})');
  // Lightning arcs (florr_clone-web): accept, apply, and linger like the C++ bolts.
  replaceOnce(
    'q({kind:g_(`break`),petal:q({..._j,type:yj,radius:Q,angle:Q,born:Q,duration:Q})})])',
    'q({kind:g_(`break`),petal:q({..._j,type:yj,radius:Q,angle:Q,born:Q,duration:Q})}),q({kind:g_(`arc`),arc:q({x1:Q,y1:Q,x2:Q,y2:Q,born:Q})})])');
  replaceOnce(
    'e.kind===`break`&&Aj(e.petal)&&Uj(e.petal)&&Rj(e.petal.type)&&$(e.petal.radius)&&$(e.petal.angle)&&$(e.petal.born)&&$(e.petal.duration)',
    'e.kind===`break`&&Aj(e.petal)&&Uj(e.petal)&&Rj(e.petal.type)&&$(e.petal.radius)&&$(e.petal.angle)&&$(e.petal.born)&&$(e.petal.duration)||e.kind===`arc`&&Aj(e.arc)&&$(e.arc.x1)&&$(e.arc.y1)&&$(e.arc.x2)&&$(e.arc.y2)&&$(e.arc.born)');
  replaceOnce(
    'if(t.kind===`particle`&&this.particles.length<256){let e={...t.particle,...t.damage?{damage:{...t.damage,target:{}}}:{}};e.x+=e.vx*n,e.y+=e.vy*n,e.life-=n,this.particles.push(e)}else t.kind===`break`&&this.petalBreaks.length<256&&this.petalBreaks.push({...t.petal})',
    'if(t.kind===`particle`&&this.particles.length<256){let e={...t.particle,...t.damage?{damage:{...t.damage,target:{}}}:{}};e.x+=e.vx*n,e.y+=e.vy*n,e.life-=n,this.particles.push(e)}else if(t.kind===`break`&&this.petalBreaks.length<256)this.petalBreaks.push({...t.petal});else if(t.kind===`arc`&&this.lightningArcs.length<200)this.lightningArcs.push({...t.arc})');
  replaceOnce(
    't.globalAlpha=Math.max(0,1-(n.time-e.born)/.12),t.strokeStyle=`#b6f5ff`,t.lineWidth=2',
    't.globalAlpha=Math.max(0,1-(n.time-e.born)/.5),t.strokeStyle=`#ffffff`,t.lineWidth=2.65');
  // Online sim path: same arc emit hook as server/engine.js.
  replaceOnce(
    's=(e,t,n,r)=>{this.lightningArcs.push({x1:e,y1:t,x2:n,y2:r,born:this.time}),this.lightningArcs.length>200&&this.lightningArcs.shift()}',
    's=(e,t,n,r)=>{const a={x1:e,y1:t,x2:n,y2:r,born:this.time};this.localVisuals?this.onLightningArc?this.onLightningArc(a):this.visualEvents.emit({kind:`arc`,arc:a},this.time,this.visualScope,.5):(this.lightningArcs.push(a),this.lightningArcs.length>200&&this.lightningArcs.shift())}');
  // Jellyfish arcs appear twice in the capture (comma-expression sites).
  {
    const before='e.lightningArcs.push({x1:a.x,y1:a.y,x2:o.x,y2:o.y,born:e.time})';
    const after='(a=>{e.localVisuals?e.onLightningArc?e.onLightningArc(a):e.visualEvents.emit({kind:`arc`,arc:a},e.time,e.visualScope,.5):(e.lightningArcs.push(a),e.lightningArcs.length>200&&e.lightningArcs.shift())})({x1:a.x,y1:a.y,x2:o.x,y2:o.y,born:e.time})';
    if(source.split(before).length!==3)throw Error('Client jellyfish lightning arc patch no longer matches the pinned capture');
    source=source.split(before).join(after);
  }
  // Render-only Coral fragment names also occur in valid break events.
  {
    const before='type:yj,radius:Q,angle:Q,born:Q,duration:Q';
    if(source.split(before).length!==3)throw Error('Client break sprite schema boundary changed');
    source=source.split(before).join('type:o_([yj,m_([`coral-piece-1a`,`coral-piece-1b`,`coral-piece-2`])]),radius:Q,angle:Q,born:Q,duration:Q');
  }
  replaceOnce('Rj(e.petal.type)','(Rj(e.petal.type)||[`coral-piece-1a`,`coral-piece-1b`,`coral-piece-2`].includes(e.petal.type))');
  replaceOnce('e.petalBreaks.every(e=>Aj(e)&&Uj(e)&&Rj(e.type)',
    'e.petalBreaks.every(e=>Aj(e)&&Uj(e)&&(Rj(e.type)||[`coral-piece-1a`,`coral-piece-1b`,`coral-piece-2`].includes(e.type))');
  return source+'\n'+['crystal-geometry.js','wire.js','client-terrain.js','client-motion.js','client-builds.js','client-qq.js','client-ux.js','client-mobile.js','client-display.js','client-npcs.js'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(__dirname,'client-touch-guard.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'client-lobby.js'),'utf8');
}
module.exports={patchClient};
