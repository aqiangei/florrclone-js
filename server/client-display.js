// Match the Settings Zoom slider: 60%–140% in 5% steps.
const ASH_ZOOM_MIN=.6,ASH_ZOOM_MAX=1.4,ASH_ZOOM_STEP=.05;
function ashClampZoom(value){
  const stepped=Math.round(Number(value)/ASH_ZOOM_STEP)*ASH_ZOOM_STEP;
  return Math.min(ASH_ZOOM_MAX,Math.max(ASH_ZOOM_MIN,Math.round(stepped*100)/100));
}
function ashWheelZoomsOver(target){
  return !!target?.closest?.('input,textarea,select,dialog,[role="dialog"],.reference-window,.ashflor-dialog,.reference-settings,.game-panel,.inventory-scroll,.ashflor-roster,.chat-prompt,.game-chat,.talent-wheel,.touch-pad');
}
function ashWheelZoomBlocked(){
  return !!document.querySelector('.game-panel:not([inert]),.reference-window:not([inert]),.reference-settings:not([inert]),dialog[open],.ashflor-dialog[open],#ashflor-qq-dialog[open]');
}
// Scroll wheel adjusts the same settings.zoom the Graphics slider writes.
function useAshWheelZoom(setSettings){
  (0,O.useEffect)(()=>{
    if(typeof setSettings!=='function')return;
    let acc=0;
    const onWheel=e=>{
      if(!e.isTrusted||!e.deltaY||ashWheelZoomBlocked()||ashWheelZoomsOver(e.target))return;
      e.preventDefault();
      acc+=e.deltaY;
      if(Math.abs(acc)<40)return;
      const steps=Math.max(-4,Math.min(4,Math.trunc(acc/40)));
      acc-=steps*40;
      // Scroll up → zoom in (narrower view); scroll down → zoom out (wider view).
      setSettings(s=>{
        const zoom=ashClampZoom((Number(s.zoom)||1)-steps*ASH_ZOOM_STEP);
        return zoom===s.zoom?s:{...s,zoom};
      });
    };
    window.addEventListener('wheel',onWheel,{passive:false,capture:true});
    return()=>window.removeEventListener('wheel',onWheel,{capture:true});
  },[setSettings]);
}
// One controller for lobby, settings, the small window action and rotation.
// requestFullscreen must run directly in the gesture, before any await.
function ashDisplay(){
  if(ashDisplay.controller)return ashDisplay.controller;
  const root=document.documentElement;
  const mobile=()=>navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
  const fullscreen=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
  const landscape=()=>innerWidth>innerHeight;
  let message='',pending=null,suppressed=false,lastFullscreen=fullscreen(),autoPending=mobile()&&landscape();
  const emit=()=>window.dispatchEvent(new Event('ashflor-display'));
  const snapshot=()=>({fullscreen:fullscreen(),landscape:landscape(),message});
  async function lockLandscape(){
    try{await screen.orientation?.lock?.('landscape');}catch{}
    if(!landscape())message='Rotate your phone to landscape.';
  }
  function enter(rotate=false,automatic=false){
    if(pending)return pending;
    if(automatic&&suppressed)return Promise.resolve(false);
    if(!automatic)suppressed=false;
    message='';
    let request;
    try{
      if(fullscreen())request=Promise.resolve();
      else if(root.requestFullscreen)request=root.requestFullscreen({navigationUI:'hide'});
      else if(root.webkitRequestFullscreen)request=root.webkitRequestFullscreen();
      else if(root.webkitRequestFullScreen)request=root.webkitRequestFullScreen();
      else{message='Fullscreen is unavailable in this browser.';emit();return Promise.resolve(false);}
    }catch(error){request=Promise.reject(error);}
    pending=(async()=>{
      try{
        await request;
        lastFullscreen=fullscreen();
        autoPending=false;
        if(rotate)await lockLandscape();
        emit();return true;
      }catch{
        message=automatic?'Tap Landscape game to enter fullscreen.':'Fullscreen was blocked. Tap Landscape game to retry.';
        // Retry once a game gesture supplies activation, never on a timer.
        autoPending=automatic&&!suppressed;
        emit();return false;
      }finally{pending=null;}
    })();
    return pending;
  }
  async function exit(){
    suppressed=true;autoPending=false;message='';
    try{
      screen.orientation?.unlock?.();
      if(document.exitFullscreen)await document.exitFullscreen();
      else if(document.webkitExitFullscreen)await document.webkitExitFullscreen();
    }catch{message='Fullscreen was blocked. Tap Landscape game to retry.';}
    emit();
  }
  function changed(){
    const active=fullscreen();
    // Native entry/exit events can be delivered together when the user backs
    // out quickly. An exit always suppresses auto-entry, even in that race.
    if(!active){suppressed=true;autoPending=false;message='';try{screen.orientation?.unlock?.();}catch{}}
    lastFullscreen=active;emit();
  }
  function checkExit(){
    // Rotation may arrive before fullscreenchange when the native back button
    // exits. Read the actual element before deciding to request fullscreen.
    const active=fullscreen();
    if(lastFullscreen&&!active){suppressed=true;autoPending=false;message='';}
    lastFullscreen=active;
  }
  let wasLandscape=landscape();
  function rotated(){
    checkExit();
    const wide=landscape(),turned=wide&&!wasLandscape;wasLandscape=wide;
    if(wide&&message==='Rotate your phone to landscape.')message='';
    if(turned&&mobile()&&!fullscreen()&&!suppressed){autoPending=true;void enter(false,true);}
    emit();
  }
  document.addEventListener('fullscreenchange',changed);
  document.addEventListener('webkitfullscreenchange',changed);
  window.addEventListener('resize',rotated);
  screen.orientation?.addEventListener?.('change',rotated);
  document.addEventListener('pointerup',event=>{
    checkExit();
    if(!event.isTrusted||!autoPending||suppressed||!mobile()||!landscape()||fullscreen())return;
    if(event.target.closest?.('.touch-pad,canvas'))void enter(false,true);
  },true);
  ashDisplay.controller={mobile,snapshot,enter,exit,toggle:()=>fullscreen()?exit():enter(false)};
  return ashDisplay.controller;
}
function useAshDisplay(){
  useAshLanguage();
  const controller=ashDisplay(),[state,set]=(0,O.useState)(controller.snapshot);
  (0,O.useEffect)(()=>{const update=()=>set(controller.snapshot());update();window.addEventListener('ashflor-display',update);return()=>window.removeEventListener('ashflor-display',update);},[]);
  return[state,controller];
}
function AshDisplayButtons({state,controller}){
  // Mobile: one action — Landscape game already requests fullscreen + lock.
  // Desktop keeps a plain fullscreen toggle (no orientation lock).
  if(controller.mobile()){
    const active=!!state.fullscreen;
    return(0,b.jsx)('button',{type:'button',className:'ash-display-landscape','aria-pressed':active,onClick:()=>void(active?controller.exit():controller.enter(true)),children:ashTr(active?'Exit fullscreen':'Landscape game')});
  }
  return(0,b.jsx)('button',{type:'button',className:'ash-display-fullscreen','aria-pressed':state.fullscreen,onClick:()=>void controller.toggle(),children:ashTr(state.fullscreen?'Exit fullscreen':'Enter fullscreen')});
}
function AshDisplaySettings(){
  const[state,controller]=useAshDisplay();
  return(0,b.jsxs)('section',{className:'ash-display-settings','aria-label':ashTr('Display'),children:[
    (0,b.jsx)('strong',{children:ashTr('Display')}),
    (0,b.jsx)('p',{children:ashTr(controller.mobile()?'Landscape game enters fullscreen automatically.':'Landscape and fullscreen for a wider view.')}),
    (0,b.jsx)('div',{className:'ash-display-buttons',children:(0,b.jsx)(AshDisplayButtons,{state,controller})}),
    state.message&&(0,b.jsx)('p',{role:'status',children:ashTr(state.message)})
  ]});
}
function AshMobileDisplayPrompt({lobby}){
  const[state,controller]=useAshDisplay();
  const[mounted,setMounted]=(0,O.useState)(false);
  (0,O.useEffect)(()=>setMounted(true),[]);
  if(!mounted||!controller.mobile()||(state.fullscreen&&state.landscape))return null;
  return(0,ce.createPortal)((0,b.jsxs)('aside',{className:'ash-display-prompt '+(lobby?'is-lobby':'is-playing'),'aria-label':ashTr('Display'),onPointerDown:e=>e.stopPropagation(),children:[
    (0,b.jsx)('div',{className:'ash-display-buttons',children:(0,b.jsx)(AshDisplayButtons,{state,controller})}),
    state.message&&(0,b.jsx)('p',{role:'status',children:ashTr(state.message)})
  ]}),document.body);
}
if(typeof document!=='undefined'){
  const style=document.createElement('style');style.textContent=`
.ash-display-buttons{display:flex;flex-wrap:wrap;gap:10px}
.ash-display-buttons button{box-sizing:border-box;min-height:44px;padding:10px 16px;border:2px solid #fff;border-radius:10px;background:#25943f;color:white;font:700 15px/1.2 Ubuntu,Segoe UI,sans-serif;text-shadow:0 1px 2px #154523;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ash-display-buttons .ash-display-fullscreen{background:#256bc0}
.ash-display-buttons button:focus-visible{outline:3px solid #ffe667;outline-offset:3px}
.ash-display-prompt{position:fixed;right:max(12px,env(safe-area-inset-right));z-index:70;max-width:calc(100vw - 24px);pointer-events:auto;color:white;text-shadow:0 1px 3px #123;font:700 12px/1.4 Ubuntu,Segoe UI,sans-serif}
.ash-display-prompt p{max-width:290px;background:#153b2eef;border-radius:8px;padding:8px;margin:6px 0 0}
body:has(.reference-settings:not([inert])) .ash-display-prompt{display:none}
/* Lobby: top-right under the toolbar so Ready/browser chrome cannot clip it. */
.ash-display-prompt.is-lobby{top:max(56px,calc(env(safe-area-inset-top) + 48px));bottom:auto}
.ash-display-prompt.is-lobby .ash-display-buttons button{animation:ash-display-pulse 1.1s ease-in-out infinite}
.ash-display-prompt.is-playing{bottom:max(214px,calc(env(safe-area-inset-bottom) + var(--ash-vv-bottom,0px) + 206px));top:auto}
.ash-display-prompt.is-playing .ash-display-buttons button{font-size:12px;padding:8px 10px}
.ash-display-settings{margin:10px 16px;padding:12px;border:2px solid #183e2c66;border-radius:10px;background:#173f2b24;color:#fff;font:700 15px/1.35 Ubuntu,Segoe UI,sans-serif;-webkit-text-stroke:0;text-shadow:0 1px 2px #173522}
.ash-display-settings p{font-size:12px;margin:5px 0 10px}
.reference-window>header .window-fullscreen{width:auto;min-width:72px;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 8px;background:#25943f;color:white;font-size:13px;-webkit-text-stroke:0}
.reference-window>header .window-fullscreen svg{width:20px;height:20px}
@keyframes ash-display-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 #a5ff6480}50%{opacity:.65;box-shadow:0 0 0 5px #a5ff6400}}
@media(orientation:landscape){.ash-display-prompt.is-playing{bottom:max(154px,calc(env(safe-area-inset-bottom) + var(--ash-vv-bottom,0px) + 146px))}}
@media(prefers-reduced-motion:reduce){.ash-display-prompt.is-lobby .ash-display-buttons button{animation:none}}
`;document.head.appendChild(style);
}
