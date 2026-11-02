// NPCs remain separate from damageable mobs. Coordinates use the world canvas.
var ashNpcEngine=null,ashNpcDialog=null,ashNpcBusy=false,ashNpcInputRestore=null;
function ashNearestNpc(){const e=ashNpcEngine;if(!e||e.state!=='playing'||e.hp<=0)return null;return(e.specialEntities??[]).filter(n=>Math.hypot(n.x-e.x,n.y-e.y)<=n.radius+e.radius+120).sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))[0]??null;}
function ashDrawNpcs(ctx,engine){
  ashNpcEngine=engine;
  for(const n of engine.specialEntities??[]){
    ctx.save();ctx.translate(n.x,n.y);const r=n.radius;
    if(n.kind==='Assembler'){
      ctx.fillStyle='#777f86';ctx.strokeStyle='#3a4249';ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(-r,-r*.75,r*2,r*1.5,9);ctx.fill();ctx.stroke();
      ctx.fillStyle='#bec8ce';ctx.fillRect(-r*.8,-r*.55,r*.9,r*.7);ctx.fillStyle='#1e292e';ctx.fillRect(-r*.68,-r*.42,r*.65,r*.44);
      for(let i=0;i<2;i++){ctx.save();ctx.translate(r*(.35+i*.24),r*(i?.28:-.22));ctx.rotate(engine.time*(i?-1:1));ctx.strokeStyle='#d3dce0';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,r*.18,0,Math.PI*2);ctx.stroke();for(let j=0;j<8;j++){ctx.rotate(Math.PI/4);ctx.fillStyle='#d3dce0';ctx.fillRect(r*.13,-3,9,6);}ctx.restore();}
      ctx.fillStyle='#91e69d';ctx.beginPath();ctx.arc(-r*.55,r*.4,5,0,Math.PI*2);ctx.fill();
    }else{
      for(let i=0;i<8;i++){const a=i*Math.PI/4+engine.time*.4;ctx.fillStyle=L[i].color;ctx.strokeStyle='#a37d29';ctx.lineWidth=2;ctx.beginPath();ctx.arc(Math.cos(a)*r*1.7,Math.sin(a)*r*1.7,8,0,Math.PI*2);ctx.fill();ctx.stroke();}
      ctx.fillStyle='#e9b66c';ctx.strokeStyle='#ba874b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#262b24';for(const x of [-10,10]){ctx.beginPath();ctx.ellipse(x,-5,4,8,0,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#262b24';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,8,9,0,Math.PI);ctx.stroke();
    }
    ctx.font='700 16px Ubuntu,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#23352e';ctx.fillStyle='#fff';const text=ashTr(n.kind);ctx.strokeText(text,0,r+24);ctx.fillText(text,0,r+24);ctx.font='700 12px Ubuntu,sans-serif';ctx.fillStyle=L[n.rarity].color;ctx.fillText(ashTr(L[n.rarity].name),0,r+40);ctx.fillStyle='#173d2d';ctx.fillRect(-36,r+47,72,6);ctx.fillStyle='#aad890';ctx.fillRect(-34,r+49,68,2);ctx.restore();
  }
}
function ashCloseNpc(){ashNpcDialog?.close();ashNpcDialog?.remove();ashNpcDialog=null;ashNpcInputRestore?.();ashNpcInputRestore=null;}
async function ashOpenNpc(n){
  ashCloseNpc();window.dispatchEvent(new Event('ashflor-clear-input'));
  if(ashNpcEngine?.sampleInput){const e=ashNpcEngine,previous=e.sampleInput;e.sampleInput=()=>({x:0,y:0,mode:'normal',defend:false});ashNpcInputRestore=()=>{e.sampleInput=previous;};}
  const dialog=document.createElement('dialog');dialog.className='ash-npc-panel';dialog.setAttribute('aria-label',n.kind);ashNpcDialog=dialog;
  const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.textContent=ashTr(n.kind);close.textContent='×';close.setAttribute('aria-label','Close NPC');close.onclick=ashCloseNpc;header.append(title,close);dialog.append(header);
  const info=document.createElement('p'),content=document.createElement('div'),status=document.createElement('p'),action=document.createElement('button');status.setAttribute('role','status');action.className='ash-npc-submit';dialog.append(info,content,status,action);document.body.append(dialog);dialog.showModal();dialog.addEventListener('cancel',ashCloseNpc);
  const t=(en,zh)=>ashLanguage==='zh'?zh:en;let item,view;
  const inventory=()=>ashNpcEngine?.save.inventory??{};
  const describe=table=>Object.entries(table).map(([type,count])=>`${count} × ${ashTr(type)}`).join(' + ');
  const refresh=()=>{
    const inv=inventory();
    if(n.kind==='Assembler'){
      info.textContent=`${ashTr(L[n.rarity].name)} · ${t('Same rarity ingredients and outputs.','投入与产出均为相同稀有度。')}`;
      content.textContent=`${describe(n.recipe.input)} → ${describe(n.recipe.output)}`;
      const missing=Object.entries(n.recipe.input).filter(([type,count])=>(inv[`${type}:${n.rarity}`]??0)<count);
      if(!ashNpcBusy)status.textContent=missing.length?t('Not enough ingredients. Equipped petals are protected.','材料不足，已装备花瓣不会消耗。'):t('Ingredients ready.','材料充足。');
      action.disabled=ashNpcBusy||missing.length>0;action.textContent=t('Assemble once','组装一次');
    }else{
      info.textContent=t('One petal → one Coin of the same rarity. Irreversible. Once every 24 hours.','一个花瓣换取同品质的一个 Coin；不可撤销，每 24 小时一次。');
      const wait=Math.max(0,(view?.traderReadyAt??0)-(Date.now()+(view?.now?view.now-view.fetchedAt:0)));
      action.disabled=ashNpcBusy||!view||!item||wait>0;action.textContent=t('Confirm trade','确认兑换');
      if(!ashNpcBusy)status.textContent=wait>0?`${t('Available in','距离可兑换')} ${Math.ceil(wait/60000)} ${t('minutes','分钟')}`:t('Only inventory petals can be exchanged.','仅可兑换背包中的花瓣。');
    }
  };
  if(n.kind==='Trader'){
    const select=document.createElement('select');select.setAttribute('aria-label','Petal to trade');const empty=document.createElement('option');empty.textContent=t('Choose a petal','选择要兑换的花瓣');empty.value='';select.append(empty);
    for(const[key,count]of Object.entries(inventory())){const i=key.lastIndexOf(':'),type=key.slice(0,i),rarity=Number(key.slice(i+1));if(count<1||rarity>8||['Fragment','Shard','Blood Sacrifice','Basic','Square','Coin'].includes(type))continue;const option=document.createElement('option');option.value=key;option.textContent=`${ashTr(L[rarity].name)} ${ashTr(type)} × ${count}`;select.append(option);}
    select.onchange=()=>{const key=select.value,i=key.lastIndexOf(':');item=key?{type:key.slice(0,i),rarity:Number(key.slice(i+1))}:null;refresh();};content.append(select);
    try{const response=await fetch('/api/npc'),data=await response.json();if(response.ok)view={...data,fetchedAt:Date.now()};else status.textContent=data.error;}catch{status.textContent=t('Connection failed.','连接失败。');}
  }
  action.onclick=async()=>{
    if(ashNpcBusy)return;ashNpcBusy=true;refresh();status.textContent=t('Processing…','处理中…');
    try{const response=await fetch('/api/npc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:n.id,recipe:n.recipe?.id,item,requestId:crypto.randomUUID()})}),data=await response.json();if(!response.ok)throw Error(data.error);view={...data,fetchedAt:Date.now()};Object.assign(ashNpcEngine.save.inventory,data.inventory);status.textContent=t('Exchange completed.','兑换成功。');}catch(error){status.textContent=error.message;}finally{ashNpcBusy=false;action.disabled=true;setTimeout(()=>{if(ashNpcDialog===dialog)refresh();},1200);}
  };
  refresh();const timer=setInterval(()=>{const current=ashNearestNpc();if(ashNpcDialog!==dialog||!current||current.id!==n.id){clearInterval(timer);if(ashNpcDialog===dialog)ashCloseNpc();}else if(!ashNpcBusy)refresh();},1000);
}
if(typeof document!=='undefined'){
  Object.assign(ashStrings,{Assembler:'组装机',Trader:'交易者'});
  const style=document.createElement('style');style.textContent='.ash-npc-panel{position:fixed;left:50%;top:50%;margin:0;transform:translate(-50%,-50%);box-shadow:0 24px 90px #05251e66;box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:85dvh;overflow:auto;border:3px solid #637875;border-radius:16px;background:#e1e8e4;color:#233d35;padding:22px;font:600 16px/1.6 Ubuntu,sans-serif}.ash-npc-panel::backdrop{background:#05251e80}.ash-npc-panel header{display:flex;justify-content:space-between;align-items:center}.ash-npc-panel h2{margin:0;font-size:26px;line-height:1.2}.ash-npc-panel button,.ash-npc-panel select{font:inherit;min-height:42px;border:1px solid #567569;border-radius:8px;padding:6px 14px}.ash-npc-panel select{max-width:100%;width:100%}.ash-npc-submit{margin-top:10px;background:#39755b;color:white;width:100%;cursor:pointer}.ash-npc-panel button:disabled{opacity:.45;cursor:default}';document.head.append(style);
  const craftButton=()=>document.querySelector('.side-actions button:last-child');
  document.addEventListener('click',event=>{const button=event.target.closest?.('.side-actions button:last-child'),npc=ashNearestNpc();if(button&&npc){event.preventDefault();event.stopImmediatePropagation();ashOpenNpc(npc);}},true);
  window.addEventListener('keydown',event=>{if(event.code!=='KeyC'||event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.target.closest?.('input,textarea,select,dialog,[contenteditable=true]'))return;const npc=ashNearestNpc();if(npc){event.preventDefault();event.stopImmediatePropagation();ashOpenNpc(npc);}},true);
  setInterval(()=>{const button=craftButton();if(!button)return;const npc=ashNearestNpc();if(!button.dataset.ashNpcOriginalTitle){button.dataset.ashNpcOriginalTitle=button.title;button.dataset.ashNpcOriginalLabel=button.getAttribute('aria-label')??'';}
    if(npc){button.title=`${ashTr(npc.kind)} [C]`;button.setAttribute('aria-label',ashTr(npc.kind));button.style.background=npc.kind==='Trader'?'#d7b34d':'#8b9c9b';}
    else if(button.dataset.ashNpcActive){button.title=button.dataset.ashNpcOriginalTitle;button.setAttribute('aria-label',button.dataset.ashNpcOriginalLabel);button.style.removeProperty('background');}
    button.dataset.ashNpcActive=npc?'yes':'';
  },200);
}
