// Stop intermittent mobile "Save Image" sheets on talent/petal art. The
// browser callout races the talent-wheel long-press, so CSS alone is flaky.
(function ashTouchCalloutGuard(){
  if(typeof document==='undefined')return;
  const block=e=>{
    const t=e.target;
    if(!(t instanceof Element))return;
    if(t.closest('.talent-wheel,.game-panel,.game-shell,.reference-ui')||
       (t.tagName==='IMG'&&/\/assets\/(talents|petals)\//.test(t.getAttribute('src')||''))){
      e.preventDefault();
    }
  };
  document.addEventListener('contextmenu',block,{capture:true});
  document.addEventListener('dragstart',block,{capture:true});
})();

// Inventory petal cards are <button>s. Many mobile browsers will not natively
// scroll a parent when the gesture starts on a button — only the scrollbar
// moves. Drive scrollTop ourselves for vertical swipes; require a short hold
// before a drag-to-loadout can arm (mouse keeps the stock immediate threshold).
function ashInventoryTouchScale(scrollRoot){
  const ui=scrollRoot?.closest?.('.inventory-native-ui');
  if(!ui)return 1;
  const t=getComputedStyle(ui).transform;
  if(!t||t==='none')return 1;
  const m=t.match(/^matrix\(([^,]+),/);
  if(m){const sx=Math.abs(parseFloat(m[1]));return sx>1e-3?sx:1;}
  const m3=t.match(/^matrix3d\(([^,]+),/);
  if(m3){const sx=Math.abs(parseFloat(m3[1]));return sx>1e-3?sx:1;}
  return 1;
}
function ashInventoryGesture(event,inventory){
  if(!inventory||event.pointerType!=='touch')return null;
  const target=event.target instanceof Element?event.target:event.currentTarget;
  const scrollRoot=target?.closest?.('.inventory-scroll');
  if(!scrollRoot)return null;
  const pointerId=event.pointerId;
  const start={x:event.clientX,y:event.clientY,scroll:scrollRoot.scrollTop};
  const scale=ashInventoryTouchScale(scrollRoot);
  const gesture={armed:false,scrolling:false};
  const hold=setTimeout(()=>{if(!gesture.scrolling)gesture.armed=true;},280);
  const follow=e=>{
    const id=e.pointerId??e.changedTouches?.[0]?.identifier;
    if(id!==undefined&&id!==pointerId)return;
    const point=e.clientX!==undefined?e:(e.touches?.[0]||e.changedTouches?.[0]);
    if(!point)return;
    const dy=point.clientY-start.y,dx=point.clientX-start.x;
    if(!gesture.scrolling&&!gesture.armed&&Math.hypot(dx,dy)>=8&&Math.abs(dy)>=Math.abs(dx)*.55)
      gesture.scrolling=true;
    if(gesture.scrolling){
      scrollRoot.scrollTop=start.scroll-dy/scale;
      if(e.cancelable)e.preventDefault();
    }else if(gesture.armed&&e.cancelable)e.preventDefault();
  };
  window.addEventListener('pointermove',follow,{capture:true,passive:false});
  window.addEventListener('touchmove',follow,{capture:true,passive:false});
  gesture.allow=()=>gesture.armed&&!gesture.scrolling;
  gesture.dispose=()=>{
    clearTimeout(hold);
    window.removeEventListener('pointermove',follow,true);
    window.removeEventListener('touchmove',follow,true);
  };
  return gesture;
}
if(typeof document!=='undefined'){
  const style=document.createElement('style');
  style.textContent=`
.inventory-panel .inventory-scroll{touch-action:pan-y!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.inventory-panel .inventory-scroll .petal-card,
.inventory-panel .inventory-scroll .petal-card *{touch-action:pan-y!important}
/* Drop the stock inventory tip; equip is drag/tap on the loadout. */
.inventory-panel .panel-instruction{display:none!important}
/* This panel is portaled outside game-shell and has its own CSS scale.
   Reserve physical space for the loadout rather than covering drop targets. */
html.ash-touch .inventory-native-ui{
  --inventory-scale:max(.58, min(.82, calc(var(--ash-vv-height, var(--vh100, 100dvh)) / 1000px)))!important;
}
html.ash-touch .inventory-native-ui .inventory-panel{
  bottom:calc((var(--ash-vv-bottom,10px) + 100px) / var(--inventory-scale))!important;
  max-height:calc((var(--ash-vv-height,100dvh) - var(--ash-vv-bottom,10px) - 170px) / var(--inventory-scale))!important;
  left:max(10px, calc(16px / var(--inventory-scale)))!important;
}
html.ash-touch .inventory-native-ui .inventory-panel .inventory-controls,
html.ash-touch .inventory-native-ui .inventory-panel .rarity-filters{padding:4px 10px!important}
html.ash-touch .inventory-native-ui .inventory-panel .inventory-scroll{padding:4px 10px 10px!important}
@media(orientation:landscape){
  /* Stock floor (.65625) keeps cards desktop-sized on short landscape phones. */
  html.ash-touch .inventory-native-ui{
    --inventory-scale:max(.42, min(.68, calc(var(--ash-vv-height, var(--vh100, 100dvh)) / 820px)))!important;
  }
  html.ash-touch .inventory-native-ui .inventory-panel{
    bottom:calc((var(--ash-vv-bottom,10px) + 58px) / var(--inventory-scale))!important;
    max-height:calc((var(--ash-vv-height,100dvh) - var(--ash-vv-bottom,10px) - 72px) / var(--inventory-scale))!important;
    left:max(8px, calc(12px / var(--inventory-scale)))!important;
    width:min(432px, calc((100vw - 24px) / var(--inventory-scale)))!important;
  }
  html.ash-touch .inventory-native-ui .inventory-panel .petal-grid{
    grid-template-columns:repeat(6,minmax(0,1fr))!important;
    gap:6px!important;
  }
}
@media(orientation:landscape) and (max-height:420px){
  html.ash-touch .inventory-native-ui{
    --inventory-scale:max(.36, min(.56, calc(var(--ash-vv-height, var(--vh100, 100dvh)) / 760px)))!important;
  }
}
`;
  document.head.appendChild(style);
}

// Mobile has no hover. Stock tips only fire on mouseenter/focus, so a touch
// either flashes a tip then clicks (equip / open bag) or skips the tip. Long-
// press shows the tip, latches it, and suppresses the click.
var ashPetalTipLatch=null;
function ashIsCoarsePointer(){
  try{return matchMedia('(pointer:coarse)').matches||(navigator.maxTouchPoints|0)>0;}catch{return(navigator.maxTouchPoints|0)>0;}
}
function ashPetalTipHeld(){return !!ashPetalTipLatch;}
function ashClearPetalTipLatch(){
  if(!ashPetalTipLatch)return;
  const clear=ashPetalTipLatch.onHover;
  ashPetalTipLatch=null;
  try{typeof ashSetAltMode==='function'&&ashSetAltMode(false);}catch{}
  try{clear?.(null);}catch{}
}
function ashArmPetalLongPress(event,item,onHover,suppressClick){
  if(!item||typeof onHover!=='function')return;
  if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
  if(event.button!==0||!event.isPrimary)return;
  const target=event.currentTarget;
  const pointerId=event.pointerId;
  const x0=event.clientX,y0=event.clientY;
  let armed=false,finished=false;
  const finish=()=>{
    if(finished)return;
    finished=true;
    clearTimeout(timer);
    window.removeEventListener('pointermove',onMove,true);
    window.removeEventListener('pointerup',onUp,true);
    window.removeEventListener('pointercancel',onUp,true);
  };
  const timer=setTimeout(()=>{
    if(finished)return;
    armed=true;
    if(suppressClick)suppressClick.current=true;
    ashPetalTipLatch={onHover,item,target};
    try{typeof ashSetAltMode==='function'&&ashSetAltMode(true);}catch{}
    onHover(item,target);
  },420);
  const onMove=e=>{
    if(e.pointerId!==pointerId)return;
    if(Math.hypot(e.clientX-x0,e.clientY-y0)<10)return;
    finish();
  };
  const onUp=e=>{
    if(e.pointerId!==pointerId)return;
    if(armed&&suppressClick)suppressClick.current=true;
    finish();
  };
  window.addEventListener('pointermove',onMove,true);
  window.addEventListener('pointerup',onUp,true);
  window.addEventListener('pointercancel',onUp,true);
}
(function ashPetalTipDismiss(){
  if(typeof document==='undefined')return;
  document.addEventListener('pointerdown',e=>{
    if(!ashPetalTipLatch)return;
    const t=e.target;
    if(!(t instanceof Element)){ashClearPetalTipLatch();return;}
    if(t.closest('.petal-tooltip,.reference-petal-detail,.gallery-tooltip'))return;
    // Same card handles dismiss in its onPointerDown (suppresses equip click).
    if(ashPetalTipLatch.target&&(t===ashPetalTipLatch.target||ashPetalTipLatch.target.contains(t)))return;
    ashClearPetalTipLatch();
  },true);
})();
var ashPetalTipDismissClick=false;
function ashConsumePetalTipDismissClick(){
  if(!ashPetalTipDismissClick)return false;
  ashPetalTipDismissClick=false;
  return true;
}
// Page chunk is an ES module; publish helpers for tests / any classic listeners.
try{
  Object.assign(globalThis,{
    ashArmPetalLongPress,
    ashClearPetalTipLatch,
    ashPetalTipHeld,
    ashIsCoarsePointer,
    ashConsumePetalTipDismissClick,
  });
  Object.defineProperties(globalThis,{
    ashPetalTipLatch:{configurable:true,get(){return ashPetalTipLatch;},set(v){ashPetalTipLatch=v;}},
    ashPetalTipDismissClick:{configurable:true,get(){return ashPetalTipDismissClick;},set(v){ashPetalTipDismissClick=v;}},
  });
}catch{}
