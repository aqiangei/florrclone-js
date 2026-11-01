// CSS pixels, independent of DPR. Keep a useful world view on either orientation.
function ashMobileViewportScale(width,height){
  const touch=typeof matchMedia==='function'&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
  return touch?Math.min(1,Math.min(width,height)/720):1;
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
/* In-game HUD: one screen coordinate system for touch controls. */
.game-shell:has(.touch-pad) .reference-ui{display:contents;--ref:1}
.game-shell:has(.touch-pad){--hud-native-scale:.6;--loadout-native-scale:.48;--ash-hud-bottom:max(12px, calc(env(safe-area-inset-bottom, 0px) + var(--ash-vv-bottom, 0px)))}
.game-shell:has(.touch-pad) .toolbar{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));transform:none;gap:5px}
.game-shell:has(.touch-pad) .toolbar .tool{width:36px!important;height:36px!important;border-width:2px}
.game-shell:has(.touch-pad) .toolbar .tool svg{width:24px;height:24px}
.game-shell:has(.touch-pad) .player-hud{left:max(12px,env(safe-area-inset-left));top:52px;transform:scale(.58);transform-origin:top left}
.game-shell:has(.touch-pad) .side-actions{left:max(8px,env(safe-area-inset-left));bottom:var(--ash-hud-bottom)!important;transform:scale(.46);transform-origin:bottom left;gap:8px}
.game-shell:has(.touch-pad) .loadout,
.game-shell:has(.touch-pad):has(.game-panel:not([inert])) .loadout{
  --hud-scale:var(--ash-loadout-scale,.48);
  bottom:var(--ash-hud-bottom)!important;
  left:50%!important;
  right:auto!important;
  top:auto!important;
  transform:translateX(-50%) scale(var(--hud-scale))!important;
  transform-origin:bottom center!important;
  z-index:16;
}
.game-shell:has(.touch-pad) .touch-stick{box-sizing:border-box;width:88px!important;height:88px!important;left:max(16px,calc(env(safe-area-inset-left) + 12px))!important;bottom:max(154px,calc(var(--ash-hud-bottom) + 132px))!important}
.game-shell:has(.touch-pad) .touch-knob{box-sizing:border-box;width:40px!important;height:40px!important}
.game-shell:has(.touch-pad) .swap-all,
.game-shell:has(.touch-pad) .petal-speed{display:none}
.game-shell:has(.touch-pad) .online-readout{top:106px;bottom:auto;font-size:9px;line-height:14px;gap:6px;padding:2px 6px;pointer-events:none}
.game-shell:has(.touch-pad) .fps-readout{top:86px;font-size:9px;line-height:14px;padding:2px 6px}
.game-shell:has(.touch-pad) .game-chat{left:110px;bottom:max(96px,calc(var(--ash-hud-bottom) + 72px));width:322px;transform:scale(.55);transform-origin:bottom left}
.game-shell:has(.touch-pad) .touch-actions{right:max(12px,calc(env(safe-area-inset-right) + 8px))!important;bottom:max(106px,calc(var(--ash-hud-bottom) + 84px))!important;gap:8px!important;align-items:flex-end!important}
.game-shell:has(.touch-pad) .touch-actions button{box-sizing:border-box;width:52px!important;height:52px!important;font-size:12px!important;border-width:2px!important}
.game-shell:has(.touch-pad) .touch-actions .touch-attack{width:68px!important;height:68px!important;font-size:14px!important}
.game-shell:has(.touch-pad) .touch-mini{gap:8px!important}
.game-shell:has(.touch-pad) .touch-mini .touch-build,
.game-shell:has(.touch-pad) .touch-mini .touch-swap{width:44px!important;height:44px!important;font-size:11px!important;border-width:2px!important}
.game-shell:has(.touch-pad) .touch-build-panel{bottom:max(220px,calc(var(--ash-hud-bottom) + 196px))!important;max-height:calc(100dvh - 230px)}
.game-shell:has(.touch-pad) .touch-controls{bottom:max(180px,calc(var(--ash-hud-bottom) + 160px))!important}
@media(orientation:landscape){
  .game-shell:has(.touch-pad){--ash-hud-bottom:max(10px, calc(env(safe-area-inset-bottom, 0px) + var(--ash-vv-bottom, 0px)))}
  .game-shell:has(.touch-pad) .side-actions{display:flex;flex-direction:row}
  .game-shell:has(.touch-pad) .online-readout{top:8px}
  .game-shell:has(.touch-pad) .fps-readout{top:28px}
  .game-shell:has(.touch-pad) .touch-stick{bottom:max(72px,calc(var(--ash-hud-bottom) + 52px))!important}
  .game-shell:has(.touch-pad) .touch-actions{bottom:max(72px,calc(var(--ash-hud-bottom) + 52px))!important}
  .game-shell:has(.touch-pad) .touch-mini{flex-direction:row!important}
  .game-shell:has(.touch-pad) .game-chat{bottom:max(72px,calc(var(--ash-hud-bottom) + 52px))}
  .game-shell:has(.touch-pad) .touch-build-panel{bottom:max(148px,calc(var(--ash-hud-bottom) + 128px))!important;max-height:calc(100dvh - 160px)}
  .game-shell:has(.touch-pad) .touch-controls{bottom:max(148px,calc(var(--ash-hud-bottom) + 128px))!important}
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
    const scale=String(Math.min(.48,(innerWidth-112)/Math.max(1,row.offsetWidth)));
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
