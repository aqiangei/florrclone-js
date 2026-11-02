// CSS pixels, independent of DPR. Keep a useful world view on either orientation.
function ashMobileViewportScale(width,height){
  const touch=typeof matchMedia==='function'&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
  if(!touch)return 1;
  const short=Math.min(width,height);
  // Landscape phones are often ~360–400px tall; pull the world back further so
  // HUD chrome and labels do not dominate the playfield.
  const base=height<width?640:720;
  return Math.min(1,Math.max(.55,short/base));
}
function ashIsTouchUi(){
  return typeof document!=='undefined'&&document.documentElement.classList.contains('ash-touch');
}
// Skip centipede/worm segment spam only. Keep Common/Unusual names visible.
function ashShouldDrawMobName(mob){
  return !!(mob&&!mob.wormGut&&!mob.segment);
}
// World-space font → roughly constant on-screen size. Mobile labels stay small
// even when the camera zooms in on the flower.
function ashMobNameFont(size,zoom){
  if(!ashIsTouchUi())return size;
  const z=Math.max(.45,Number(zoom)||1);
  return Math.max(4.5,Math.min(7.5,(size*.42)/z));
}
function ashPlayerNameFont(size,zoom){
  if(!ashIsTouchUi())return size;
  const z=Math.max(.45,Number(zoom)||1);
  return Math.max(8,Math.min(14,(size*.7)/z));
}
if(typeof document!=='undefined'){
  const style=document.createElement('style');
  style.textContent=`
/* Pin the game to the visible viewport so browser chrome cannot clip Ready /
   loadout. Stock CSS uses inset:0 + 100dvh which extends under Edge/Bilibili bars. */
html.ash-touch,html.ash-touch body{overflow:hidden;overscroll-behavior:none}
.game-shell{
  position:fixed!important;
  top:var(--ash-vv-top,0px)!important;
  left:var(--ash-vv-left,0px)!important;
  width:var(--ash-vv-width,100%)!important;
  height:var(--ash-vv-height,100%)!important;
  right:auto!important;
  bottom:auto!important;
  inset:auto!important;
  overflow:hidden!important;
}
/* Lobby fit: use .is-lobby (touch-pad stays in DOM with visibility:hidden).
   Squad row made stock lobby taller than phones can show. */
.game-shell.is-lobby{
  --ash-lobby-zoom:1;
}
@media(max-height:920px),(any-pointer:coarse),(pointer:coarse){
  .game-shell.is-lobby{
    --lobby-scale:clamp(.3, calc((var(--ash-vv-height, 100dvh) - 28px) / 1500px), .55)!important;
  }
  .game-shell.is-lobby .brand,
  .game-shell.is-lobby .reference-ui .brand{
    top:calc((14dvh - 24px * var(--lobby-scale)) / var(--ref,1))!important;
  }
  .game-shell.is-lobby .start-card,
  .game-shell.is-lobby .reference-ui .start-card{
    top:calc(24dvh / var(--ref,1))!important;
    transform:translate(-50%,0) scale(var(--ash-lobby-zoom,1))!important;
    transform-origin:top center!important;
  }
  .game-shell.is-lobby .start-card .play-button{
    margin-bottom:4px!important;
  }
  .game-shell.is-lobby .start-card p,
  .game-shell.is-lobby .start-card .rename-row{
    margin:4px 0 6px!important;
    font-size:calc(12px * var(--lobby-scale) / var(--ref,1))!important;
  }
  .game-shell.is-lobby .start-card div[style*="flex-wrap"]{gap:4px!important;margin-top:4px!important}
  .game-shell.is-lobby .start-card div[style*="flex-wrap"] button{
    font-size:11px!important;padding:4px 8px!important;min-height:28px!important;line-height:1.1!important
  }
  .game-shell.is-lobby .start-card input[aria-label="Room code"],
  .game-shell.is-lobby .start-card input[aria-label="房间代码"]{
    font-size:12px!important;min-height:28px!important;padding:2px 6px!important
  }
  .game-shell.is-lobby .biome-picker{
    margin-top:calc(8px * var(--lobby-scale) / var(--ref,1))!important;
    margin-bottom:calc(2px * var(--lobby-scale) / var(--ref,1))!important;
  }
  .game-shell.is-lobby .credits-button,
  .game-shell.is-lobby .fan-note{
    bottom:max(10px, calc(var(--ash-vv-bottom, 0px) + 6px))!important;
  }
}
@media(max-height:520px){
  .game-shell.is-lobby{
    --lobby-scale:clamp(.26, calc((var(--ash-vv-height, 100dvh) - 12px) / 1700px), .44)!important;
  }
  .game-shell.is-lobby .brand{
    top:calc((6dvh - 4px * var(--lobby-scale)) / var(--ref,1))!important;
    font-size:calc(48px * var(--lobby-scale) / var(--ref,1))!important;
  }
  .game-shell.is-lobby .start-card{
    top:calc(12dvh / var(--ref,1))!important;
  }
}
/* In-game HUD: one coordinate system. --ash-ui / --ash-loadout drive every chrome. */
.game-shell:has(.touch-pad) .reference-ui{display:contents;--ref:1}
.game-shell:has(.touch-pad){
  --ash-ui:.68;
  --ash-loadout:.56;
  --ash-map:.82;
  --ash-touch:1.08;
  --ash-hud-bottom:max(10px, calc(env(safe-area-inset-bottom, 0px) + var(--ash-vv-bottom, 0px)));
  --hud-native-scale:var(--ash-ui);
  --loadout-native-scale:var(--ash-loadout);
}
.game-shell:has(.touch-pad) .toolbar{
  top:max(6px,env(safe-area-inset-top));left:max(6px,env(safe-area-inset-left));
  transform:scale(var(--ash-ui));transform-origin:top left;gap:5px
}
.game-shell:has(.touch-pad) .toolbar .tool{width:38px!important;height:38px!important;border-width:2px}
.game-shell:has(.touch-pad) .toolbar .tool svg{width:24px;height:24px}
.game-shell:has(.touch-pad) .player-hud{
  left:max(8px,env(safe-area-inset-left));top:calc(48px * var(--ash-ui) + 8px);
  transform:scale(var(--ash-ui));transform-origin:top left
}
.game-shell:has(.touch-pad) .side-actions{
  left:max(6px,env(safe-area-inset-left));bottom:var(--ash-hud-bottom)!important;
  transform:scale(var(--ash-ui));transform-origin:bottom left;gap:8px
}
.game-shell:has(.touch-pad) .loadout,
.game-shell:has(.touch-pad):has(.game-panel:not([inert])) .loadout{
  --hud-scale:var(--ash-loadout-scale,var(--ash-loadout));
  bottom:var(--ash-hud-bottom)!important;left:50%!important;right:auto!important;top:auto!important;
  transform:translateX(-50%) scale(var(--hud-scale))!important;
  transform-origin:bottom center!important;z-index:16
}
.game-shell:has(.touch-pad) .viep-preset-panel{transform:scale(.9);transform-origin:bottom center;max-width:92vw}
.game-shell:has(.touch-pad) .minimap-wrap{
  top:max(6px,env(safe-area-inset-top))!important;right:max(6px,env(safe-area-inset-right))!important;
  transform:scale(var(--ash-map));transform-origin:top right;gap:2px
}
.game-shell:has(.touch-pad) .minimap-wrap canvas{width:112px!important;height:84px!important;border-width:2px!important}
.game-shell:has(.touch-pad) .minimap-wrap>span{font-size:10px!important}
.game-shell:has(.touch-pad) .ashflor-roster{
  transform:scale(var(--ash-map));transform-origin:top right;max-height:28vh;font-size:10px
}
.game-shell:has(.touch-pad) .ashflor-qq-entry{
  transform:scale(calc(var(--ash-ui) * 1.05));transform-origin:top center
}
.game-shell:has(.touch-pad):not(.is-lobby) .ashflor-qq-caption{display:none}
.game-shell:has(.touch-pad) .swap-all,
.game-shell:has(.touch-pad) .petal-speed{display:none}
.game-shell:has(.touch-pad) .online-readout{
  top:max(6px,env(safe-area-inset-top));bottom:auto;left:50%;transform:translateX(-50%) scale(.85);
  transform-origin:top center;font-size:9px;line-height:13px;gap:6px;padding:2px 6px;pointer-events:none
}
.game-shell:has(.touch-pad) .fps-readout{
  top:max(26px,calc(env(safe-area-inset-top) + 20px));left:50%;transform:translateX(-50%) scale(.85);
  transform-origin:top center;font-size:9px;line-height:13px;padding:2px 6px
}
.game-shell:has(.touch-pad) .game-chat{
  left:max(104px,calc(env(safe-area-inset-left) + 96px));
  bottom:max(96px,calc(var(--ash-hud-bottom) + 72px));
  width:min(320px,48vw);transform:scale(.62);transform-origin:bottom left
}
.game-shell:has(.touch-pad) .ash-death-summary{
  top:max(56px,calc(env(safe-area-inset-top) + 48px));right:max(8px,env(safe-area-inset-right));
  width:min(220px,42vw);transform:scale(.85);transform-origin:top right
}
.game-shell:has(.touch-pad) .touch-stick{
  box-sizing:border-box;width:calc(96px * var(--ash-touch))!important;height:calc(96px * var(--ash-touch))!important;
  left:max(12px,calc(env(safe-area-inset-left) + 8px))!important;
  bottom:max(148px,calc(var(--ash-hud-bottom) + 120px))!important
}
.game-shell:has(.touch-pad) .touch-knob{box-sizing:border-box;width:calc(44px * var(--ash-touch))!important;height:calc(44px * var(--ash-touch))!important}
.game-shell:has(.touch-pad) .touch-actions{
  right:max(10px,calc(env(safe-area-inset-right) + 8px))!important;
  bottom:max(110px,calc(var(--ash-hud-bottom) + 84px))!important;
  gap:8px!important;align-items:flex-end!important;
  transform:scale(var(--ash-touch));transform-origin:bottom right
}
.game-shell:has(.touch-pad) .touch-actions button{box-sizing:border-box;width:56px!important;height:56px!important;font-size:13px!important;border-width:2px!important}
.game-shell:has(.touch-pad) .touch-actions .touch-attack{width:72px!important;height:72px!important;font-size:15px!important}
.game-shell:has(.touch-pad) .touch-mini{gap:8px!important}
.game-shell:has(.touch-pad) .touch-mini .touch-build,
.game-shell:has(.touch-pad) .touch-mini .touch-swap{width:48px!important;height:48px!important;font-size:12px!important;border-width:2px!important}
.game-shell:has(.touch-pad) .touch-build-panel{bottom:max(200px,calc(var(--ash-hud-bottom) + 170px))!important;max-height:min(42dvh,calc(100dvh - 200px));transform:scale(.9);transform-origin:bottom right}
.game-shell:has(.touch-pad) .touch-controls{bottom:max(160px,calc(var(--ash-hud-bottom) + 140px))!important}
/* Landscape: keep controls thumb-sized; only ease down on very short screens. */
@media(orientation:landscape){
  .game-shell:has(.touch-pad){
    --ash-ui:.58;
    --ash-loadout:.46;
    --ash-map:.72;
    --ash-touch:1;
  }
  .game-shell:has(.touch-pad) .side-actions{display:flex;flex-direction:row}
  .game-shell:has(.touch-pad) .touch-mini{flex-direction:row!important}
  .game-shell:has(.touch-pad) .touch-stick{bottom:max(72px,calc(var(--ash-hud-bottom) + 52px))!important}
  .game-shell:has(.touch-pad) .touch-actions{bottom:max(72px,calc(var(--ash-hud-bottom) + 52px))!important}
  .game-shell:has(.touch-pad) .game-chat{bottom:max(72px,calc(var(--ash-hud-bottom) + 52px));width:min(280px,40vw);transform:scale(.55)}
  .game-shell:has(.touch-pad) .touch-build-panel{bottom:max(140px,calc(var(--ash-hud-bottom) + 118px))!important;max-height:min(48dvh,calc(100dvh - 140px))}
  .game-shell:has(.touch-pad) .touch-controls{bottom:max(140px,calc(var(--ash-hud-bottom) + 118px))!important}
  .game-shell:has(.touch-pad) .online-readout{top:max(4px,env(safe-area-inset-top))}
  .game-shell:has(.touch-pad) .fps-readout{top:max(22px,calc(env(safe-area-inset-top) + 18px))}
  .game-shell:has(.touch-pad) .ash-death-summary{width:min(200px,36vw);transform:scale(.85)}
}
@media(orientation:landscape) and (max-height:420px){
  .game-shell:has(.touch-pad){
    --ash-ui:.50;
    --ash-loadout:.40;
    --ash-map:.62;
    --ash-touch:.9;
  }
}
`;
  document.head.appendChild(style);
  let frame=0,observed;
  const resize=new ResizeObserver(()=>schedule());
  function touchDevice(){
    return navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches||matchMedia('(any-pointer:coarse)').matches;
  }
  function syncViewportChrome(){
    const vv=window.visualViewport;
    const touch=touchDevice();
    const fullscreen=!!(document.fullscreenElement||document.webkitFullscreenElement);
    const root=document.documentElement;
    root.classList.toggle('ash-touch',touch);
    let top=0,left=0,width=window.innerWidth,height=window.innerHeight,inset=0;
    if(vv){
      top=Math.max(0,Math.round(vv.offsetTop));
      left=Math.max(0,Math.round(vv.offsetLeft));
      width=Math.max(1,Math.round(vv.width));
      height=Math.max(1,Math.round(vv.height));
      inset=Math.max(0,Math.round(window.innerHeight-(vv.height+vv.offsetTop)));
    }
    // Edge/Bilibili often report a matching visualViewport while still covering
    // the bottom strip. Keep a small floor until fullscreen hides chrome.
    if(inset===0&&touch&&!fullscreen)inset=Math.max(10,Math.round(Math.min(32,height*0.045)));
    else if(!vv&&touch&&!fullscreen)inset=16;
    const vals={
      '--ash-vv-top':top+'px',
      '--ash-vv-left':left+'px',
      '--ash-vv-width':width+'px',
      '--ash-vv-height':height+'px',
      '--ash-vv-bottom':inset+'px'
    };
    for(const [key,value] of Object.entries(vals)){
      if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value);
    }
  }
  function lobbyFits(shell,padBottom){
    const els=shell.querySelectorAll('.brand,.start-card,.biome-picker,.credits-button,.fan-note,.rename-row');
    const shellR=shell.getBoundingClientRect();
    let top=Infinity,bottom=-Infinity,seen=0;
    for(const el of els){
      if(!el.getClientRects().length)continue;
      const r=el.getBoundingClientRect();
      top=Math.min(top,r.top);bottom=Math.max(bottom,r.bottom);seen++;
    }
    if(!seen)return true;
    return top>=shellR.top-2&&bottom<=shellR.bottom-Math.max(8,padBottom)-2;
  }
  function syncLobbyFit(){
    const shell=document.querySelector('.game-shell');
    if(!shell)return;
    // touch-pad remains mounted in lobby with visibility:hidden — use is-lobby.
    if(!shell.classList.contains('is-lobby')){
      shell.style.removeProperty('--lobby-scale');
      shell.style.removeProperty('--ash-lobby-zoom');
      return;
    }
    const root=document.documentElement;
    const viewH=parseFloat(root.style.getPropertyValue('--ash-vv-height'))||innerHeight;
    const padBottom=parseFloat(root.style.getPropertyValue('--ash-vv-bottom'))||0;
    if(viewH>980&&!touchDevice()&&!(navigator.maxTouchPoints>0))return;
    const usable=Math.max(180,viewH-padBottom-12);
    const portrait=innerHeight>=innerWidth;
    let scale=Math.min(portrait?0.5:0.46,usable/(portrait?1580:1750));
    scale=Math.max(.26,scale);
    let zoom=1;
    shell.style.setProperty('--lobby-scale',scale.toFixed(4),'important');
    shell.style.setProperty('--ash-lobby-zoom','1','important');
    for(let i=0;i<14&&!lobbyFits(shell,padBottom);i++){
      if(scale>.26){
        scale=Math.max(.26,scale*.84);
        shell.style.setProperty('--lobby-scale',scale.toFixed(4),'important');
      }else{
        zoom=Math.max(.5,zoom*.88);
        shell.style.setProperty('--ash-lobby-zoom',zoom.toFixed(3),'important');
      }
    }
  }
  function sync(){
    frame=0;
    syncViewportChrome();
    syncLobbyFit();
    const shell=document.querySelector('.game-shell:has(.touch-pad)'),row=shell?.querySelector('.loadout');
    if(!row)return;
    if(observed!==row){if(observed)resize.unobserve(observed);resize.observe(row);observed=row;}
    const landscape=innerWidth>innerHeight;
    const short=landscape&&innerHeight<=420;
    const cap=short?0.40:landscape?0.46:0.56;
    const margin=landscape?(short?140:120):96;
    const scale=String(Math.min(cap,(innerWidth-margin)/Math.max(1,row.offsetWidth)));
    if(shell.style.getPropertyValue('--ash-loadout-scale')!==scale)shell.style.setProperty('--ash-loadout-scale',scale);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(sync);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);
  document.addEventListener('fullscreenchange',schedule);
  document.addEventListener('webkitfullscreenchange',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  schedule();
}
