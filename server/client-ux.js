// Additions to the pinned client. JSX remains React-owned, including translations.
// Draw geometry at the current canvas transform, so giant Square summons stay
// sharp at every rarity, zoom and device pixel ratio.
function ashDrawSquare(ctx,x,y,radius,angle=0){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#82ff5d';ctx.strokeStyle='#67ca4b';
  ctx.lineWidth=radius*.13;ctx.lineJoin='miter';ctx.fillRect(-radius*.85,-radius*.85,radius*1.7,radius*1.7);
  ctx.strokeRect(-radius*.85,-radius*.85,radius*1.7,radius*1.7);ctx.restore();return true;
}
function ashDrawPlayerNameplate(ctx,player){
  const guild=player.guildName?`[${player.guildName}]`:'',name=player.name||'Player';
  ctx.save();ctx.font='700 10px Ubuntu,sans-serif';
  const width=Math.max(96,Math.min(200,ctx.measureText(guild).width+58),Math.min(200,ctx.measureText(name).width));
  const left=player.x-width/2,right=player.x+width/2,y=player.y+player.radius+20;
  eC(ctx,name,left,y-5,12,'#fff','left');ctx.fillStyle='#334e35';ctx.beginPath();ctx.roundRect(left,y,width,6,3);ctx.fill();
  ctx.fillStyle='#77e368';ctx.beginPath();ctx.roundRect(left+1,y+1,(width-2)*Math.max(0,Math.min(1,player.hp/Math.max(1,player.maxHp))),4,2);ctx.fill();
  if(guild)eC(ctx,guild,left,y+19,10,'#a6e4ff','left');
  const best=Math.max(0,...(player.petals||[]).filter(Boolean).map(p=>p.rarity??0));
  eC(ctx,`Lv. ${Math.max(1,player.level|0)}`,right,y+19,10,L[best]?.color??'#fff','right');ctx.restore();
}
function AshGuildHeading({guild}){
  const online=guild.members.filter(m=>m.online).length;
  return(0,b.jsxs)('div',{className:'ash-guild-heading',children:[
    (0,b.jsx)('div',{className:'ash-guild-emblem','aria-hidden':true,children:'✦'}),
    (0,b.jsxs)('div',{children:[(0,b.jsx)('small',{children:'GUILD'}),(0,b.jsx)('h3',{className:'guild-title',children:guild.name})]}),
    (0,b.jsxs)('div',{className:'ash-guild-counts',children:[(0,b.jsxs)('span',{children:[(0,b.jsx)('b',{children:guild.members.length}),' ',ashTr('Members')]}),(0,b.jsxs)('span',{children:[(0,b.jsx)('b',{children:online}),' ',ashTr('Online')]})]})
  ]});
}
function AshLobbySquad({engine,send,squad}){
  const[code,setCode]=(0,O.useState)('');
  const button=(label,action)=>(0,b.jsx)('button',{type:'button',onClick:action,children:label},label);
  if(squad){const self=squad.members.find(m=>m.id===squad.selfId);return(0,b.jsxs)('section',{className:'ash-lobby-squad','aria-label':ashTr('Squad'),children:[
    (0,b.jsxs)('div',{className:'ash-lobby-squad-title',children:[(0,b.jsx)('strong',{children:ashTr('Squad')}),(0,b.jsx)('code',{children:squad.code}),(0,b.jsx)('span',{children:`${squad.members.length}/4`})]}),
    (0,b.jsx)('div',{className:'ash-lobby-squad-members',children:squad.members.map(m=>(0,b.jsx)('span',{children:`${m.id===squad.leaderId?'★ ':''}${m.name}${m.ready?' ✓':''}`},m.id))}),
    (0,b.jsxs)('div',{className:'ash-lobby-squad-actions',children:[button(self?.ready?'Unready':'Ready up',()=>send({type:'squadReady',ready:!self?.ready})),button('Leave squad',()=>send({type:'squadLeave'}))]})
  ]});}
  return(0,b.jsxs)('section',{className:'ash-lobby-squad','aria-label':ashTr('Squad'),children:[
    (0,b.jsxs)('div',{className:'ash-lobby-squad-title',children:[(0,b.jsx)('strong',{children:ashTr('Squad')}),(0,b.jsx)('small',{children:'1–4'})]}),
    (0,b.jsxs)('div',{className:'ash-lobby-squad-actions',children:[button('Create Private',()=>send({type:'squadCreate',public:false})),button('Create Public',()=>send({type:'squadCreate',public:true})),button('Find Public',()=>send({type:'squadFind'}))]}),
    (0,b.jsxs)('div',{className:'ash-lobby-squad-join',children:[(0,b.jsx)('input',{'aria-label':ashTr('Room code'),placeholder:ashTr('Room code'),value:code,maxLength:8,onChange:e=>setCode(e.target.value.toLowerCase())}),(0,b.jsx)('button',{type:'button',disabled:!/^[a-f0-9]{8}$/.test(code),onClick:()=>send({type:'squadJoin',code}),children:'Join'})]})
  ]});
}
// Alt latch (default off): rarity glow under petals + exact tip numbers, matching florr_clone-web.
var ashAltMode=false;
function ashSetAltMode(on){
  const next=!!on;
  if(ashAltMode===next)return;
  ashAltMode=next;
  try{window.dispatchEvent(new Event('ashflor-alt'));}catch{}
}
var ashRarityGlowColors=['#7eef6d','#ffe65d','#4d52e3','#861fde','#de1f1f','#1fdbde','#ff2b75','#2bffa3','#ffff40','#ff4d00','#ff00ff'];
function ashDrawPetalRarityGlow(ctx,x,y,radius,rarity){
  if(!ashAltMode||!ctx)return;
  const tier=Math.max(0,rarity|0);
  const color=(typeof L!=='undefined'&&L[tier]?.color)||ashRarityGlowColors[tier]||ashRarityGlowColors[0];
  ctx.save();
  ctx.globalAlpha*=76/255;
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.arc(x,y,Math.max(0,Number(radius)||0)+16,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}
(function ashInstallAltLatch(){
  const typing=target=>{
    const el=target||document.activeElement;
    if(!el)return false;
    if(el.matches?.('input,textarea,select,[contenteditable],[contenteditable="true"]'))return true;
    if(el.isContentEditable)return true;
    return !!document.querySelector('.ashflor-dialog[open],#ashflor-qq-dialog[open]');
  };
  window.addEventListener('keydown',e=>{
    if(e.repeat||!(e.key==='Alt'||e.code==='AltLeft'||e.code==='AltRight'))return;
    if(typing(e.target))return;
    e.preventDefault();
    ashSetAltMode(!ashAltMode);
  },true);
})();
var ashLanguage='en';
var ashStrings={
  'Settings':'设置','Game':'游戏','Graphics':'画面','Controls':'操作','Credits':'关于','Language ':'语言 ',
  'Quality ':'画质 ','Low':'低','Medium':'中','High':'高','Play style ':'操作方式 ',
  'Auto':'自动','Phone (touch)':'手机（触控）','Computer':'电脑','Phone shows the joystick and touch buttons.':'手机模式显示摇杆和触控按钮。',
  'Keyboard movement':'键盘移动','Movement helper':'移动辅助','Search petals when opening inventory':'打开背包时聚焦搜索',
  'Invert attack button':'反转攻击开关','Invert defend button':'反转防御开关','Hide other petals':'隐藏其他玩家花瓣',
  'Show damage numbers':'显示伤害数字','Screen shake':'屏幕震动','Live icons':'动态图标','Equip drops':'自动装备掉落',
  'Chat':'聊天','Sound effects':'音效','Show mob names':'显示怪物名称','Particles':'粒子效果','Local settings':'更多设置',
  'Auto-save loadout':'自动保存装备','Progress is saved automatically':'进度会自动保存','Inventory':'背包','Craft':'合成',
  'Talents':'天赋','Bestiary':'怪物图鉴','Inventory panel':'背包','Crafting panel':'合成','Close panel':'关闭面板',
  'Search petals':'搜索花瓣','Drag a petal to equip it':'点选花瓣后选择装备槽，也可拖动装备','All':'全部','Stack':'堆叠',
  'Attack':'攻击','Defend':'防御','Build':'配装','Builds':'配装','Movement joystick':'移动摇杆','Swap reserve equipment':'主副装备互换',
  'Fullscreen':'全屏','Enter fullscreen':'进入全屏','Exit fullscreen':'退出全屏','Landscape game':'横屏游戏','Fullscreen landscape':'横屏游戏',
  'Display':'屏幕显示','Zoom ':'缩放 ','Scroll wheel: zoom':'滚轮：调整视野',
  'Landscape and fullscreen for a wider view.':'横屏全屏，获得更宽阔的游戏视野。',
  'Landscape game enters fullscreen automatically.':'点「横屏游戏」会自动全屏并锁定横屏。',
  'Rotate your phone to landscape.':'请将手机横过来，继续游戏。',
  'Tap to enter fullscreen.':'轻触「横屏游戏」进入全屏。',
  'Tap Landscape game to enter fullscreen.':'轻触「横屏游戏」进入全屏。',
  'Fullscreen is unavailable in this browser.':'当前浏览器不支持全屏，可使用浏览器菜单或换浏览器打开。',
  'Fullscreen was blocked. Tap the fullscreen button to retry.':'未能进入全屏，请轻触「横屏游戏」重试。',
  'Fullscreen was blocked. Tap Landscape game to retry.':'未能进入全屏，请轻触「横屏游戏」重试。',
  'Ready':'准备','Not ready':'取消准备','Continue':'重生','Close':'关闭','Cancel':'取消','Save':'保存','Use':'使用',
  'Online':'在线','Offline':'离线','Local':'附近','Public':'公共','Squad':'组队','Guild':'公会','Party invite':'组队邀请','Accept':'接受','Decline':'拒绝',
  'Invite to squad':'快捷组队','Squad invitation sent.':'组队邀请已发送。',
  'Create guild':'创建公会','Guild name':'公会名称','Account username':'账号名称','Invite username':'邀请账号','Invite':'邀请',
  'Leave guild':'退出公会','Guild invitations':'公会邀请','Loading guild…':'正在读取公会…',
  "You don't have a guild yet. Enter a name to create one.":'还没有加入公会，可以输入名称创建。',
  'Sign in online to create or join a guild':'登录联机账号后可以创建或加入公会','Leader: ':'会长：',' · Leader':' · 会长',
  'Find Public':'寻找公开队伍','Create Private':'创建私人队伍','Create Public':'创建公开队伍','Join':'加入','Leave':'离开',
  'Room code':'房间代码','Private':'私人','Return to lobby':'返回大厅','You were destroyed by:':'击败你的是：',
  'Environmental damage':'环境伤害','Collected this run':'本局获得','Kills this life':'本次击杀','Petals this life':'本次收集','None':'无','Run summary':'本局统计','Drops':'掉落','Petal loadout':'花瓣装备',
  'Combine 5 of the same petal to craft an upgrade':'合成需要 5 个相同花瓣','Failure will destroy 1-4 petals':'失败会损失 1–4 个花瓣',
  'No matching petals':'没有匹配的花瓣','No petals yet':'暂时没有花瓣','petals':'花瓣','Common':'普通','Unusual':'罕见','Rare':'稀有',
  'Epic':'史诗','Legendary':'传说','Mythic':'神话','Ultra':'究极','Super':'超级','Eternal':'永恒','Hyper':'超越','Devine':'神圣',
  'Squads: use Find Public or join with a room code from the Online lobby.':'在联机大厅寻找公开队伍，或使用房间代码加入。',
  'Online players':'在线玩家','Combat stats':'战斗统计','Damage dealt':'累计造成伤害','Damage taken':'累计承受伤害','Kills':'击杀','Deaths':'死亡',
  'Reset stats':'重置统计','Stats survive death and respawn.':'死亡、重生和重新登录均保留；手动重置才清空。',
  'Main':'主装备','Reserve':'副装备','Equip selected':'装备所选花瓣','Select a petal, then a slot.':'点选背包花瓣，再选择下面的装备槽。',
  'Swap all':'主副互换','Unequip slot':'卸下所选槽','One-click crafting':'一键合成','Craft selected stack':'合成所选整组',
  'Craft inventory':'合成整个背包','Highest input rarity':'最高投入品质','Only inventory petals are consumed. Equipped petals are protected.':'只消耗背包花瓣，已装备的花瓣不会参与。',
  'Completed':'已完成','Cancelled':'已取消','Running':'合成中','attempts':'次尝试','successes':'次成功','Cancel crafting':'停止合成',
  'Create squad':'创建队伍','Join code':'输入代码加入','Ready up':'准备开始','Unready':'取消准备','Leave squad':'离开队伍',
  'Everyone returns':'全队返回大厅','Only the leader can return everyone.':'仅队长可让全队返回大厅。',
  'Waiting':'等待准备','Countdown':'倒计时','Playing':'游戏中','Ended':'已结束','Lobby':'大厅','Dead':'已阵亡',
  'Chinese / English':'中文 / English','Mobile controls':'手机操作','Show online list':'显示在线列表'
};
function ashTr(value){return ashLanguage==='zh'&&typeof value==='string'?(ashStrings[value]??value):value;}
function ashJSX(original){return function(type,props,...rest){if(props){let next={...props};
  if(typeof type==='string'&&next.children!==undefined){if(type==='option'&&next.value===undefined&&typeof next.children==='string')next.value=next.children;
    const text=v=>typeof v==='string'?ashTr(v):Array.isArray(v)?v.map(text):v;next.children=text(next.children);}
  for(const key of ['title','placeholder','aria-label'])if(typeof next[key]==='string')next[key]=ashTr(next[key]);props=next;
  }return original(type,props,...rest);};}
function ashSetLanguage(lang){ashLanguage=lang==='zh'?'zh':'en';try{localStorage.setItem('ashflor-language',ashLanguage);}catch{}window.dispatchEvent(new Event('ashflor-language'));}
function useAshLanguage(){const [lang,set]=(0,O.useState)('en');(0,O.useEffect)(()=>{const update=()=>set(ashLanguage);try{ashLanguage=localStorage.getItem('ashflor-language')==='zh'?'zh':'en';}catch{}update();window.addEventListener('ashflor-language',update);return()=>window.removeEventListener('ashflor-language',update);},[]);return lang;}
function AshLanguageSelect(){const lang=useAshLanguage();return(0,b.jsxs)('select',{'aria-label':'Language',value:lang,onChange:e=>ashSetLanguage(e.target.value),children:[(0,b.jsx)('option',{value:'en',children:'English (US)'}),(0,b.jsx)('option',{value:'zh',children:'简体中文'})]});}
function ashSend(ref,command){return ref.current?.sendCommand?.(command);}
function useAshEngine(ref){const [data,set]=(0,O.useState)({});(0,O.useEffect)(()=>{let last='';const update=()=>{const e=ref.current;if(!e?.sendCommand)return;const next={roster:e.onlineRoster??[],stats:e.combatStats??{},job:e.craftJob??null,squad:e.squad??null,state:e.state,biome:e.save.biome,online:e.connection?.status??'online'};const json=JSON.stringify(next);if(json!==last){last=json;set(next);}};update();const timer=setInterval(update,200);return()=>clearInterval(timer);},[ref]);return data;}
function AshDialog({title,close,clear,children}){const ref=(0,O.useRef)(null);(0,O.useEffect)(()=>{clear?.();ref.current?.showModal();return()=>clear?.();},[]);return(0,ce.createPortal)((0,b.jsxs)('dialog',{ref,className:'ashflor-dialog',onCancel:close,onClose:close,onPointerDown:e=>e.stopPropagation(),children:[(0,b.jsxs)('header',{children:[(0,b.jsx)('h2',{children:title}),(0,b.jsx)('button',{'aria-label':'Close',onClick:close,children:'×'})]}),children]}),document.body);}
function ashFormatStack(n){if(typeof Ya==='function')return Ya(n);for(const[t,s]of[[1e9,'b'],[1e6,'m'],[1e3,'k']])if(Math.abs(n)>=t)return`${(n/t).toFixed(1)}${s}`;return String(n);}
function ashParseStacked(map,kind){
  return Object.entries(map??{}).filter(([,n])=>n>0).map(([key,count])=>{
    if(kind==='petal'&&typeof nt==='function'){const item=nt(key);return{key,type:item.type,rarity:item.rarity|0,count};}
    const i=key.lastIndexOf(':');return{key,type:i>=0?key.slice(0,i):key,rarity:i>=0?Number(key.slice(i+1))||0:0,count};
  }).sort((a,b)=>b.rarity-a.rarity||b.count-a.count||a.type.localeCompare(b.type));
}
function AshDeathSummary({engine}){
  useAshLanguage();
  const [,bump]=(0,O.useState)(0);
  (0,O.useEffect)(()=>{const timer=setInterval(()=>bump(n=>n+1),200);return()=>clearInterval(timer);},[]);
  // Death Continue only mounts when no panel is open — dismiss craft/inventory on death.
  // Stock keeps closed panels mounted with [inert]; only non-inert ones still block.
  (0,O.useEffect)(()=>{
    const close=()=>{
      if(engine.current?.state!=='dead')return;
      document.querySelector('.game-panel:not([inert]) header button[aria-label="Close panel"]')?.click();
    };
    close();
    const timer=setInterval(close,200);
    return()=>clearInterval(timer);
  },[engine]);
  const e=engine.current;
  if(!e||e.state!=='dead')return null;
  // Match stock death loot: stay out of the way while inventory/craft/etc. is open.
  if(document.querySelector('.game-panel:not([inert])'))return null;
  const kills=ashParseStacked(e.sessionMobKills,'mob');
  const petals=ashParseStacked(e.sessionCollected,'petal');
  if(!kills.length&&!petals.length)return null;
  const panel=(title,entries,kind)=>(0,b.jsxs)('section',{className:'ash-death-summary-panel',children:[
    (0,b.jsx)('h2',{children:ashTr(title)}),
    entries.length?(0,b.jsx)('div',{className:'ash-death-summary-grid',children:entries.map(item=>{
      const rarity=L[item.rarity]||L[0];
      const label=`${rarity.name} ${item.type} ×${item.count}`;
      return(0,b.jsxs)('div',{
        className:'ash-death-summary-card death-loot-card',
        style:kind==='mob'?{background:rarity.color}:void 0,
        'aria-label':label,
        children:[
          kind==='mob'
            ?(0,b.jsx)(fo,{type:item.type,rarity:item.rarity})
            :(0,b.jsx)(aN,{item:{type:item.type,rarity:item.rarity},count:item.count}),
          kind==='mob'&&item.count>1&&(0,b.jsxs)('b',{children:['x',ashFormatStack(item.count)]})
        ]
      },item.key);
    })}):(0,b.jsx)('p',{className:'ash-death-summary-empty',children:ashTr('None')})
  ]});
  return(0,ce.createPortal)((0,b.jsxs)('aside',{className:'ash-death-summary','aria-label':'Run summary',children:[
    panel('Kills this life',kills,'mob'),
    panel('Petals this life',petals,'petal')
  ]}),document.body);
}
function AshOnlineTools({engine}){useAshLanguage();const data=useAshEngine(engine),[collapsed,setCollapsed]=(0,O.useState)(false),roster=(0,O.useRef)(null);
  (0,O.useEffect)(()=>{setCollapsed(matchMedia('(max-width:900px), (orientation:landscape) and (max-height:520px)').matches);const timer=setInterval(()=>{
    const map=document.querySelector('.minimap-wrap'),el=roster.current;if(!el)return;const r=map?.getBoundingClientRect();const bottom=r&&r.height>0?r.bottom:64;
    const touch=document.documentElement.classList.contains('ash-touch');const landscape=innerWidth>innerHeight;
    el.style.top=Math.min(innerHeight-(touch?56:80),bottom+(touch?4:6))+'px';
    el.style.right=Math.max(touch?6:8,r?innerWidth-r.right:12)+'px';
    el.style.width=Math.max(touch?110:140,Math.min(touch?(landscape?128:150):180,r?.width??150))+'px';
    el.style.maxHeight=touch?(landscape?'22vh':'28vh'):'';
  },200);return()=>clearInterval(timer);},[]);
  if(!data.state)return null;
  return(0,ce.createPortal)((0,b.jsxs)(b.Fragment,{children:[
    data.state!=='lobby'&&(0,b.jsxs)('aside',{ref:roster,className:'ashflor-roster','aria-label':'Online players',children:[(0,b.jsxs)('button',{className:'ashflor-roster-heading',onClick:()=>setCollapsed(v=>!v),'aria-expanded':!collapsed,children:[ashTr('Online players'),' · ',data.roster.length,collapsed?' ▸':' ▾']}),!collapsed&&(0,b.jsx)('ul',{children:data.roster.map(p=>(0,b.jsxs)('li',{'data-self':p.id===engine.current?.squad?.selfId,children:[(0,b.jsx)('strong',{children:p.name}),(0,b.jsxs)('small',{children:['Lv.',p.level,' · ',p.biome,' · ',ashTr(p.state==='playing'?'Playing':p.state==='dead'?'Dead':'Lobby')]})]},p.id))})]})]}),document.body);}
function AshPanelTools({engine,selected,panel}){useAshLanguage();const data=useAshEngine(engine),[max,setMax]=(0,O.useState)(6);if(panel!=='craft'||!engine.current?.sendCommand)return null;const send=c=>ashSend(engine,c),running=!!data.job?.running;
  return(0,b.jsxs)('div',{className:'ashflor-panel-tools',children:[(0,b.jsx)('strong',{children:'One-click crafting'}),(0,b.jsx)('p',{children:'Only inventory petals are consumed. Equipped petals are protected.'}),(0,b.jsxs)('label',{children:['Highest input rarity',' ',(0,b.jsx)('select',{'aria-label':'Highest input rarity',value:max,disabled:running,onChange:e=>setMax(Number(e.target.value)),children:L.slice(0,9).map((r,i)=>(0,b.jsx)('option',{value:i,children:r.name},i))})]}),(0,b.jsxs)('div',{className:'ashflor-action-row',children:[(0,b.jsx)('button',{disabled:running||!selected||selected.rarity>8,onClick:()=>send({type:'craftBatch',scope:'selected',item:selected,maxRarity:selected.rarity}),children:'Craft selected stack'}),(0,b.jsx)('button',{disabled:running,onClick:()=>send({type:'craftBatch',scope:'inventory',maxRarity:max}),children:'Craft inventory'}),running&&(0,b.jsx)('button',{onClick:()=>send({type:'craftCancel'}),children:'Cancel crafting'})]}),data.job&&(0,b.jsxs)('p',{role:'status',children:[ashTr(running?'Running':data.job.status==='cancelled'?'Cancelled':'Completed'),' · ',data.job.attempts,' ',ashTr('attempts'),' · ',data.job.successes,' ',ashTr('successes')]})]});}
function useAshTouchReset(input){(0,O.useEffect)(()=>{const reset=()=>Object.assign(input.current,{x:0,y:0,attack:false,defend:false});window.addEventListener('blur',reset);document.addEventListener('visibilitychange',reset);window.addEventListener('ashflor-clear-input',reset);return()=>{reset();window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);window.removeEventListener('ashflor-clear-input',reset);};},[input]);}
var ASH_CHAT_COMMANDS=[
  {command:'/help',description:'List chat and squad commands'},
  {command:'/clear',description:'Clear the chat log'},
  {command:'/local',description:'Send a nearby (Local) message'},
  {command:'/public',description:'Send a server-wide message'},
  {command:'/squad',description:'Send a squad message'},
  {command:'/guild',description:'Send a guild message'},
  {command:'/s',description:'Send a squad message'},
  {command:'/g',description:'Send a guild message'},
  {command:'/squad-create',description:'Create a private or public squad'},
  {command:'/squad-find-public',description:'Find or create a public squad'},
  {command:'/squad-join',description:'Join a squad by room code'},
  {command:'/squad-invite',description:'Invite an online player by name'},
  {command:'/squad-accept',description:'Accept a squad invitation'},
  {command:'/squad-decline',description:'Decline a squad invitation'},
  {command:'/squad-public',description:'Make your squad public'},
  {command:'/squad-private',description:'Make your squad private'},
  {command:'/squad-ready',description:'Toggle ready in your squad'},
  {command:'/squad-leave',description:'Leave your current squad'},
  {command:'/squad-info',description:'Show current squad status'},
  {command:'/squad-return',description:'Leader: return everyone to lobby'},
];
var ASH_CHAT_HELP='/local · /public · /squad · /guild · /s · /g · /squad-create [public|private] · /squad-find-public · /squad-join <code> · /squad-invite <player> · /squad-accept · /squad-decline · /squad-ready · /squad-leave · /squad-info · /help · /clear';
function ashMatchChatCommands(draft){
  const q=String(draft||'').trim().toLowerCase();
  if(!q.startsWith('/'))return [];
  return ASH_CHAT_COMMANDS.filter(c=>c.command.startsWith(q)||c.command.slice(1).startsWith(q.slice(1)));
}
function ashSetChatDraft(input,value){
  if(!input)return;
  const proto=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  proto?.set?.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function ashSquadSend(engine,command){
  if(!engine)return false;
  if(typeof engine.sendCommand==='function')return !!engine.sendCommand(command);
  if(typeof engine.squadAction==='function')return engine.squadAction(command)!==false;
  return false;
}
function ashHandleChatCommand(text,engine,systemMsg){
  const raw=String(text||'').trim();
  if(!raw.startsWith('/'))return false;
  const lower=raw.toLowerCase();
  const say=msg=>{systemMsg?.(typeof msg==='string'?msg:String(msg));return true;};
  if(lower==='/help'||lower.startsWith('/help '))return say(ASH_CHAT_HELP);
  if(lower==='/squad-invite'||lower.startsWith('/squad-invite ')||lower==='/squad-accept'||lower==='/squad-decline'){
    const inviting=lower==='/squad-invite'||lower.startsWith('/squad-invite '),username=inviting?raw.slice('/squad-invite'.length).trim():'';
    if(inviting&&!username)return say('Usage: /squad-invite <player name>');
    fetch('/api/guild/'+(inviting?'squad-invite':'squad-respond'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(inviting?{username}:{accept:lower==='/squad-accept'})})
      .then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error||'Squad request failed');say(ashTr(result.message||(inviting?'Squad invitation sent.':lower==='/squad-accept'?'Joined squad.':'Invitation declined.')));})
      .catch(error=>say(error.message));
    return true;
  }
  const channelOnly=/^\/(local|public|squad|guild|s|g)$/i.exec(raw);
  if(channelOnly){
    const key=channelOnly[1].toLowerCase();
    const channel=key==='s'?'Squad':key==='g'?'Guild':key[0].toUpperCase()+key.slice(1);
    return say(`Channel set tip: type /${key} <message>. Current shortcut maps to ${channel}.`);
  }
  const channelMsg=/^\/(local|public|squad|guild|s|g)\s+(.+)$/i.exec(raw);
  if(channelMsg){
    const key=channelMsg[1].toLowerCase();
    const channel=key==='s'?'Squad':key==='g'?'Guild':key[0].toUpperCase()+key.slice(1);
    const body=channelMsg[2].trim();
    if(!body)return say('Message required.');
    if(!engine?.sendChat)return say('Not connected.');
    return engine.sendChat(channel,body)?true:say('Not connected. Your message was not sent.');
  }
  if(lower==='/squad-create'||lower.startsWith('/squad-create ')){
    const arg=raw.slice('/squad-create'.length).trim().toLowerCase();
    const isPublic=arg==='public'||arg==='1'||arg==='true';
    if(arg&&!['public','private','1','0','true','false'].includes(arg))return say('Usage: /squad-create [public|private]');
    return ashSquadSend(engine,{type:'squadCreate',public:isPublic})?true:say('Not connected.');
  }
  if(lower==='/squad-find-public'||lower==='/squad-find'){
    return ashSquadSend(engine,{type:'squadFind'})?true:say('Not connected.');
  }
  if(lower.startsWith('/squad-join')){
    const code=raw.slice('/squad-join'.length).trim().toLowerCase();
    if(!/^[a-f0-9]{8}$/.test(code))return say('Usage: /squad-join <8-char room code>');
    return ashSquadSend(engine,{type:'squadJoin',code})?true:say('Not connected.');
  }
  if(lower==='/squad-public')return ashSquadSend(engine,{type:'squadPublic',public:true})?true:say('Not connected.');
  if(lower==='/squad-private')return ashSquadSend(engine,{type:'squadPublic',public:false})?true:say('Not connected.');
  if(lower==='/squad-leave')return ashSquadSend(engine,{type:'squadLeave'})?true:say('Not connected.');
  if(lower==='/squad-return')return ashSquadSend(engine,{type:'squadReturn'})?true:say('Not connected.');
  if(lower==='/squad-ready'||lower.startsWith('/squad-ready ')){
    const arg=raw.slice('/squad-ready'.length).trim().toLowerCase();
    const squad=engine?.squad;
    const self=squad?.members?.find(m=>m.id===squad.selfId);
    let ready=!(self?.ready);
    if(arg==='1'||arg==='true'||arg==='on')ready=true;
    if(arg==='0'||arg==='false'||arg==='off')ready=false;
    return ashSquadSend(engine,{type:'squadReady',ready})?true:say('Not connected.');
  }
  if(lower==='/squad-info'){
    const s=engine?.squad;
    if(!s)return say('Not in a squad.');
    const members=(s.members||[]).map(m=>`${m.name}${m.id===s.leaderId?'*':''}${m.ready?' ready':''}`).join(', ');
    return say(`Squad ${s.code} · ${s.public?'public':'private'} · ${s.phase} · ${members||'empty'}`);
  }
  return false;
}
(function ashInstallChatSuggest(){
  if(typeof document==='undefined')return;
  let box=null,selected=0,matches=[],bound=null;
  const ensure=()=>{
    if(box)return box;
    box=document.createElement('div');
    box.className='ashflor-chat-suggestions';
    box.setAttribute('role','listbox');
    box.setAttribute('aria-label','Chat command suggestions');
    box.style.display='none';
    document.body.appendChild(box);
    return box;
  };
  const hide=()=>{if(!box)return;box.style.display='none';box.innerHTML='';matches=[];selected=-1;};
  const paint=()=>{
    const el=ensure();
    el.innerHTML='';
    matches.forEach((cmd,i)=>{
      const row=document.createElement('button');
      row.type='button';
      row.className='ashflor-chat-suggestion'+(i===selected?' is-active':'');
      row.setAttribute('role','option');
      row.setAttribute('aria-selected',i===selected?'true':'false');
      row.dataset.command=cmd.command;
      row.innerHTML=`<span class="cmd">${cmd.command}</span><span class="desc">${cmd.description}</span>`;
      row.onmousedown=e=>e.preventDefault();
      row.onclick=()=>{if(!bound)return;ashSetChatDraft(bound,cmd.command+' ');hide();bound.focus();};
      el.appendChild(row);
    });
    el.style.display=matches.length?'block':'none';
    const chat=bound?.closest('.game-chat');
    if(chat){
      const r=chat.getBoundingClientRect();
      el.style.left=Math.max(8,r.left)+'px';
      el.style.width=Math.max(180,r.width)+'px';
      el.style.bottom=Math.max(8,innerHeight-r.top+4)+'px';
    }
  };
  const refresh=()=>{
    if(!bound||document.activeElement!==bound){hide();return;}
    const value=bound.value||'';
    matches=value.startsWith('/')?ashMatchChatCommands(value).slice(0,10):[];
    selected=matches.length?0:-1;
    if(!matches.length){hide();return;}
    paint();
  };
  const applySelected=()=>{
    if(selected<0||!matches[selected]||!bound)return false;
    ashSetChatDraft(bound,matches[selected].command+' ');
    hide();
    return true;
  };
  document.addEventListener('focusin',e=>{
    const input=e.target;
    if(!(input instanceof HTMLInputElement)||!input.classList.contains('chat-draft'))return;
    bound=input;refresh();
  });
  document.addEventListener('focusout',e=>{
    if(e.target!==bound)return;
    setTimeout(()=>{if(document.activeElement!==bound)hide();},120);
  });
  document.addEventListener('input',e=>{if(e.target===bound)refresh();},true);
  document.addEventListener('keydown',e=>{
    if(!bound||document.activeElement!==bound)return;
    const open=matches.length>0&&box?.style.display!=='none';
    if(open&&e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();selected=Math.min(selected+1,matches.length-1);paint();return;}
    if(open&&e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();selected=Math.max(selected-1,0);paint();return;}
    if(open&&e.key==='Tab'){e.preventDefault();e.stopPropagation();applySelected();return;}
    if(open&&e.key==='Enter'&&selected>=0){
      const draft=(bound.value||'').trim();
      const cmd=matches[selected].command;
      // Complete only when the draft is still a prefix of the highlighted command.
      if(draft&&draft!==cmd&&!draft.startsWith(cmd+' ')&&cmd.startsWith(draft)){
        e.preventDefault();e.stopPropagation();applySelected();return;
      }
    }
    if(e.key==='Escape'&&open){e.preventDefault();hide();}
  },true);
})();
if(typeof document!=='undefined'){const style=document.createElement('style');style.textContent=`
.ashflor-panel-tools button,.ashflor-dialog button{background:#3b6449;color:white;border:2px solid #243b2b;border-radius:6px;padding:6px 10px;cursor:pointer;font:inherit;min-height:34px;text-shadow:none}.ashflor-roster{position:fixed;right:12px;top:200px;width:150px;z-index:34;color:white;background:#183e2cde;border:2px solid #243b2b;border-radius:6px;box-sizing:border-box;text-shadow:0 1px 2px #000;pointer-events:auto}.ashflor-roster-heading{background:none;border:0;color:white;font:inherit;font-size:11px;width:100%;padding:4px 6px;text-align:left;cursor:pointer}.ashflor-roster ul{margin:0;padding:0 6px 4px;list-style:none;min-height:0;max-height:160px;overflow:auto;overscroll-behavior:contain}.ashflor-roster li{border-top:1px solid #ffffff25;padding:2px 0;overflow-wrap:anywhere}.ashflor-roster strong{font-size:11px}.ashflor-roster small{display:block;font-size:9px;opacity:.8}.ash-death-summary{position:fixed;top:72px;right:12px;z-index:40;display:flex;flex-direction:column;gap:10px;width:min(280px,calc(100vw - 24px));pointer-events:none;color:#fff;text-shadow:0 1px 2px #000;font:700 13px Ubuntu,sans-serif}.ash-death-summary-panel{pointer-events:auto;background:#2a1c14cc;border-radius:8px;padding:10px 12px;box-sizing:border-box}.ash-death-summary-panel h2{margin:0 0 8px;font-size:16px;text-align:left;color:#ffe9c8}.ash-death-summary-empty{margin:0;font-size:14px;opacity:.75;text-align:center;padding:10px 0}.ash-death-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:168px;overflow:auto;overscroll-behavior:contain}.ash-death-summary-card{border:3px solid #0003;border-radius:6px;height:52px;display:grid;place-items:center;position:relative;overflow:hidden}.ash-death-summary-card canvas{width:100%;height:100%;display:block;pointer-events:none}.ash-death-summary-card b{text-shadow:1px 1px #000;font-size:11px;position:absolute;top:-2px;right:-1px;background:#000e;border-radius:6px;padding:0 5px;color:#ffd56a}.loot-box{display:none!important}.ashflor-dialog{box-sizing:border-box;max-width:calc(100vw - 20px);width:520px;max-height:85dvh;overflow:auto;border:3px solid #253d2c;border-radius:12px;background:#82ac76;color:#142719;padding:14px;z-index:200;text-shadow:none}.ashflor-dialog::backdrop{background:#0007}.ashflor-dialog header{display:flex;align-items:center;justify-content:space-between}.ashflor-dialog h2{font-size:22px;margin:0}.ashflor-dialog-body p{font-size:14px}.ashflor-dialog input:not([type=checkbox]){max-width:65%;padding:8px}.ashflor-stats>div{display:flex;justify-content:space-between;border-bottom:1px solid #24412b40;padding:8px}.ashflor-stats dd{margin:0;font-variant-numeric:tabular-nums}.ashflor-action-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ashflor-panel-tools{padding:8px 12px;border-bottom:1px solid #fff3;font-size:13px}.ashflor-panel-tools p{margin:4px 0 7px}.ashflor-panel-tools select{max-width:160px;padding:5px;font:inherit}.ashflor-panel-tools button:disabled,.ashflor-dialog button:disabled{opacity:.45;cursor:default}.ashflor-panel-tools input,.ashflor-dialog input{accent-color:#355e41}.touch-pad,.touch-stick,.touch-actions button{touch-action:none!important;user-select:none;-webkit-user-select:none}.ashflor-squad-members{padding-left:20px}.ashflor-squad-members li{padding:6px 0}
.ashflor-chat-suggestions{position:fixed;z-index:80;max-height:220px;overflow:auto;box-sizing:border-box;padding:4px;background:#102418f2;border:2px solid #2f513b;border-radius:8px;color:#fff;text-shadow:0 1px 2px #000;pointer-events:auto}
.ashflor-chat-suggestion{display:flex;gap:8px;align-items:baseline;width:100%;border:0;background:transparent;color:inherit;font:12px/1.35 Ubuntu,sans-serif;text-align:left;padding:6px 8px;border-radius:5px;cursor:pointer}
.ashflor-chat-suggestion .cmd{color:#9fdfff;flex:0 0 auto}
.ashflor-chat-suggestion .desc{color:#ffffff99;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ashflor-chat-suggestion.is-active,.ashflor-chat-suggestion:hover{background:#ffffff22}
.chat-color-public{color:#ffd56a}
/* Mobile long-press on talent/petal art opens the browser "Save Image" sheet
   intermittently; kill callout/selection on game HUD images. */
.game-shell img,.game-panel img,.reference-ui img,.talent-wheel img,.talent-wheel canvas,
img[src*="/assets/talents/"],img[src*="/assets/petals/"]{
  -webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;
  -webkit-user-drag:none!important;
}
.talent-wheel,.talent-wheel *{ -webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important }
/* Pin petal loadout to bottom-center on phone; desktop reference-ui scale rules can shove it top-right */
@media(max-width:800px){
  .game-shell .loadout,
  .reference-ui .loadout,
  .game-shell:has(.game-panel:not([inert])) .loadout,
  .game-shell:has(.game-panel:not([inert])) .reference-ui .loadout{
    position:absolute!important;
    left:50%!important;
    right:auto!important;
    top:auto!important;
    bottom:max(12px, env(safe-area-inset-bottom,0px))!important;
    transform:translateX(-50%)!important;
    transform-origin:bottom center!important;
    z-index:16;
  }
}
.game-shell:has(.touch-pad) .slot-key,
.game-shell:has(.touch-pad) .side-actions kbd,
.game-shell:has(.touch-pad) .loadout-label kbd{display:none!important}
.game-shell:has(.touch-pad) .touch-pad{z-index:18}
.game-shell:has(.touch-pad) .touch-mini .touch-swap.ash-l-armed{
  background:#c9a227!important;color:#1a1408!important;border-color:#8a6e1a!important;
}
@media(max-width:600px){
  .ashflor-roster{width:min(150px,42vw);right:8px}
  .ashflor-roster ul{min-height:0;max-height:min(140px,22vh)}
  .ash-death-summary{top:64px;right:8px;width:min(260px,calc(100vw - 16px))}
  .ash-death-summary-grid{max-height:140px}
  .ashflor-panel-tools{font-size:12px;padding:6px}
  .ashflor-panel-tools button{padding:5px 7px;min-height:36px}
  .ashflor-dialog{padding:10px}
}
`;document.head.appendChild(style);}
