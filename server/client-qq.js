// Same logo, group, invite and cream/green dialog as Ashflor's Client/DOM.cc.
const ashflorQQStyle=`
.ashflor-qq-entry{display:inline-flex;flex:0 0 46px;flex-direction:column;align-items:center;gap:4px;align-self:flex-start;width:46px;pointer-events:auto}
.reference-ui .ashflor-qq-entry .ashflor-qq-button{display:grid;place-items:center;width:46px!important;height:46px!important;min-width:46px;min-height:46px;padding:5px!important;border:0!important;border-radius:8px!important;background:#5ba3f5!important;box-shadow:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.reference-ui .ashflor-qq-entry .ashflor-qq-button:hover{filter:brightness(1.08)}
.reference-ui .ashflor-qq-entry .ashflor-qq-button:focus-visible{outline:2px solid #fff;outline-offset:3px}
.ashflor-qq-entry img{width:36px;height:36px;object-fit:contain;pointer-events:none}
.ashflor-qq-caption{font:700 11px/1.1 Ubuntu,sans-serif;color:#e8e8e8;text-shadow:0 1px 2px #0008;white-space:nowrap;pointer-events:none}
.reference-ui .ashflor-qq-entry .ashflor-github-button{background:#7b8cff!important;text-decoration:none}
.reference-ui .ashflor-qq-entry .ashflor-feedback-button{background:#547d46!important;text-decoration:none}
@media(max-width:520px){
  .reference-ui .toolbar{left:6px!important;gap:4px!important}
  .reference-ui .toolbar .tool,.reference-ui .toolbar .menu-close{width:40px!important;height:40px!important;min-width:40px;min-height:40px;padding:4px!important}
  .reference-ui .toolbar .ashflor-qq-entry{width:36px;flex-basis:36px;gap:3px}
  .reference-ui .toolbar .ashflor-qq-entry .ashflor-qq-button{width:36px!important;height:36px!important;min-width:36px;min-height:36px;padding:4px!important}
  .reference-ui .toolbar .ashflor-qq-entry img{width:28px;height:28px}
  .reference-ui .toolbar .ashflor-qq-caption{font-size:10px}
}
@media(max-width:360px){
  .reference-ui .toolbar{gap:3px!important}
  .reference-ui .toolbar .tool,.reference-ui .toolbar .menu-close{width:36px!important;height:36px!important;min-width:36px;min-height:36px}
  .reference-ui .toolbar .ashflor-qq-entry{width:32px;flex-basis:32px}
  .reference-ui .toolbar .ashflor-qq-entry .ashflor-qq-button{width:32px!important;height:36px!important;min-width:32px}
}
#ashflor-qq-dialog{box-sizing:content-box;border:2px solid #d7bd79;border-radius:20px;padding:28px 28px 22px;background:#fff9e9;color:#384638;font-family:system-ui,sans-serif;width:min(340px,calc(100vw - 108px));max-width:calc(100vw - 108px);text-align:center;box-shadow:0 18px 80px #0007;margin:auto}
#ashflor-qq-dialog::backdrop{background:rgba(20,28,22,.45)}
#ashflor-qq-dialog>img{display:block;margin:0 auto}
#ashflor-qq-dialog h2{margin:12px 0 8px;font-size:1.35rem;color:#384638;text-shadow:none;-webkit-text-stroke:0}
#ashflor-qq-dialog p{margin:0 0 10px}
#ashflor-qq-dialog .qq-hint{font-size:14px;opacity:.85;line-height:1.4}
#ashflor-qq-dialog .qq-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px}
#ashflor-qq-dialog .qq-row{display:flex;gap:10px}
#ashflor-qq-dialog .qq-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-height:44px;padding:11px 16px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;border:2px solid transparent;-webkit-tap-highlight-color:transparent;user-select:none;text-shadow:none;-webkit-text-stroke:0}
#ashflor-qq-dialog .qq-btn-primary{background:#48a575;color:#fff;border-color:#3a8a60}
#ashflor-qq-dialog .qq-btn-primary:hover{background:#3f9668}
#ashflor-qq-dialog .qq-btn-secondary{background:#f3ead3;color:#384638;border-color:#d7bd79}
#ashflor-qq-dialog .qq-btn-secondary:hover{background:#ebe0c4}
#ashflor-qq-dialog [data-status]{min-height:20px;margin:10px 0 0;font-size:14px}
`;
function openAshflorQQ(invoker){
  const existing=document.getElementById('ashflor-qq-dialog');if(existing){existing.focus();return;}
  const dialog=document.createElement('dialog');dialog.id='ashflor-qq-dialog';dialog.setAttribute('aria-labelledby','ashflor-qq-heading');
  dialog.innerHTML='<img src="/assets/ashflor-qq.png" alt="QQ" width="52" height="52"><h2 id="ashflor-qq-heading">Ashflor 交流群</h2><p>QQ群：<strong>227990150</strong></p><p class="qq-hint">打不开 QQ 时，可以复制群号搜索加入。</p><div class="qq-actions"><a class="qq-btn qq-btn-primary" href="https://qm.qq.com/q/E0OG9CLIg" target="_blank" rel="noopener noreferrer">加入 QQ 群</a><div class="qq-row"><button type="button" class="qq-btn qq-btn-secondary" data-copy>复制群号</button><button type="button" class="qq-btn qq-btn-secondary" data-close>关闭</button></div></div><p data-status role="status"></p>';
  dialog.querySelector('[data-copy]').onclick=async()=>{
    let copied=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText('227990150');copied=true;}}catch{}
    // Clipboard API is unavailable on the public HTTP IP. Retain a click-only
    // fallback there, followed by Ashflor's manual-copy message if unsupported.
    if(!copied){const text=document.createElement('textarea');text.value='227990150';text.style.cssText='position:fixed;opacity:0;pointer-events:none';dialog.appendChild(text);text.select();try{copied=document.execCommand('copy');}catch{}text.remove();dialog.querySelector('[data-copy]').focus();}
    dialog.querySelector('[data-status]').textContent=copied?'群号已复制':'请手动复制群号：227990150';
  };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.onclose=()=>{dialog.remove();if(invoker?.isConnected)invoker.focus({preventScroll:true});};
  for(const name of ['keydown','keyup','mousedown','mouseup','pointerdown','pointerup','touchstart','touchend','touchmove'])dialog.addEventListener(name,event=>event.stopPropagation());
  document.body.appendChild(dialog);dialog.showModal();
}
function AshflorQQEntry({clearInput,existingLink=false}={}){
  // Match the captured SSR markup until hydration finishes. Then replace its
  // old community link with the Ashflor button without rebuilding the page.
  const [mounted,setMounted]=(0,O.useState)(false);
  (0,O.useEffect)(()=>setMounted(true),[]);
  if(!mounted)return existingLink?(0,b.jsx)('a',{className:'lobby-menu-qq community-link',title:'Visit the florr.io QQ community','aria-label':'Florr.io QQ',href:'https://jq.qq.com/?_wv=1027&k=eMLWfOJb',target:'_blank',rel:'noopener noreferrer',children:(0,b.jsx)(S,{name:'qq'})}):null;
  return (0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)('style',{children:ashflorQQStyle}),(0,b.jsxs)('span',{className:'ashflor-qq-entry',children:[(0,b.jsx)('button',{type:'button',className:'ashflor-qq-button',title:'QQ 群：227990150','aria-label':'Ashflor QQ 群',onClick:event=>{clearInput?.();openAshflorQQ(event.currentTarget);},children:(0,b.jsx)('img',{src:'/assets/ashflor-qq.png',alt:'',width:36,height:36,draggable:false})}),(0,b.jsx)('span',{className:'ashflor-qq-caption',children:'QQ 群'})]})]});
}
function AshflorGithubEntry({clearInput}={}){
  const [mounted,setMounted]=(0,O.useState)(false);(0,O.useEffect)(()=>setMounted(true),[]);
  if(!mounted)return null;
  return (0,b.jsxs)('span',{className:'ashflor-qq-entry ashflor-github-entry',children:[(0,b.jsx)('a',{className:'ashflor-qq-button ashflor-github-button',title:'GitHub 开源仓库','aria-label':'GitHub 开源仓库',href:'https://github.com/aqiangei/florrclone',target:'_blank',rel:'noopener noreferrer',onClick:()=>clearInput?.(),children:(0,b.jsx)('img',{src:'/assets/ashflor-github.svg',alt:'',width:36,height:36,draggable:false})}),(0,b.jsx)('span',{className:'ashflor-qq-caption',children:'GitHub'})]});
}
function ashflorFeedbackBoardUrl(){
  const from=encodeURIComponent(location.origin||'');
  return 'https://ashflor.com/feedback.html?v=prog5&from='+from;
}
function AshflorFeedbackEntry({clearInput}={}){
  const [mounted,setMounted]=(0,O.useState)(false);(0,O.useEffect)(()=>setMounted(true),[]);
  if(!mounted)return null;
  return (0,b.jsxs)('span',{className:'ashflor-qq-entry ashflor-feedback-entry',children:[(0,b.jsx)('a',{className:'ashflor-qq-button ashflor-feedback-button',title:'给作者留言','aria-label':'给作者留言',href:ashflorFeedbackBoardUrl(),target:'_blank',rel:'noopener noreferrer',onClick:()=>clearInput?.(),children:(0,b.jsx)('img',{src:'/assets/ashflor-feedback.svg',alt:'',width:36,height:36,draggable:false})}),(0,b.jsx)('span',{className:'ashflor-qq-caption',children:'留言'})]});
}
