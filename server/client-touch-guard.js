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

// Touch inventory: native vertical scrolling wins until a deliberate hold.
// Mouse/loadout drags keep their existing immediate movement threshold.
function ashInventoryGesture(event,inventory){
  if(!inventory||event.pointerType!=='touch')return null;
  const start={x:event.clientX,y:event.clientY};
  const gesture={armed:false,scrolling:false};
  const hold=setTimeout(()=>{gesture.armed=true;},350);
  const touchMove=e=>{if(gesture.armed&&!gesture.scrolling&&e.cancelable)e.preventDefault();};
  window.addEventListener('touchmove',touchMove,{capture:true,passive:false});
  gesture.allow=e=>{
    if(gesture.armed)return true;
    if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>=8)gesture.scrolling=true;
    return false;
  };
  gesture.dispose=()=>{clearTimeout(hold);window.removeEventListener('touchmove',touchMove,true);};
  return gesture;
}
if(typeof document!=='undefined'){
  const style=document.createElement('style');
  style.textContent=`
.inventory-panel .inventory-scroll,.inventory-panel .inventory-scroll .petal-card{touch-action:pan-y!important;overscroll-behavior:contain}
/* This panel is portaled outside game-shell and has its own CSS scale.
   Reserve physical space for the loadout rather than covering drop targets. */
html.ash-touch .inventory-native-ui .inventory-panel{
  bottom:calc((var(--ash-vv-bottom,10px) + 110px) / var(--inventory-scale))!important;
  max-height:calc((var(--ash-vv-height,100dvh) - var(--ash-vv-bottom,10px) - 210px) / var(--inventory-scale))!important;
}
@media(orientation:landscape){
  html.ash-touch .inventory-native-ui .inventory-panel{
    bottom:calc((var(--ash-vv-bottom,10px) + 90px) / var(--inventory-scale))!important;
    max-height:calc((var(--ash-vv-height,100dvh) - var(--ash-vv-bottom,10px) - 150px) / var(--inventory-scale))!important;
  }
}
`;
  document.head.appendChild(style);
}
