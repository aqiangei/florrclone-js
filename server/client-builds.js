// ashflor presets: K/L+digit apply (20 slots). Leave filled slot autosaves edits.
// Empty slot is a no-op (no bank/overwrite). Mobile: long-press R → tap primary for L.
const ASH_ACTIVE_KEY='viep.active-preset.v1';
const ASH_NONE=20;

function ashSyncLoadoutPresets(presets){
  try{
    const rows=Array.from({length:20},(_,i)=>{
      const entry=Array.isArray(presets)?presets[i]:null;
      if(!entry||typeof entry!=='object')return null;
      return {loadout:entry.loadout??null,reserve:entry.reserve??null};
    });
    localStorage.setItem('viep.petal-builds.v1',JSON.stringify(rows));
    window.dispatchEvent(new StorageEvent('storage',{key:'viep.petal-builds.v1'}));
  }catch{}
}
function ashReadActive(){
  try{
    const n=Number(localStorage.getItem(ASH_ACTIVE_KEY));
    return Number.isInteger(n)&&n>=0&&n<=ASH_NONE?n:ASH_NONE;
  }catch{return ASH_NONE;}
}
function ashWriteActive(slot){
  try{localStorage.setItem(ASH_ACTIVE_KEY,String(slot));}catch{}
}
function ashSnapshot(engine){
  return {
    loadout:(engine.save.loadout||[]).map(e=>e?{...e}:null),
    reserve:(engine.save.reserve||[]).map(e=>e?{...e}:null),
  };
}
function ashSaveBuild(engine,slot){
  if(!engine||!Number.isInteger(slot)||slot<0||slot>=20)return false;
  if(engine.sendCommand){
    engine.sendCommand({type:'saveBuild',slot});
    ashWriteActive(slot);
    return true;
  }
  try{
    const raw=JSON.parse(localStorage.getItem('viep.petal-builds.v1')||'[]');
    const rows=Array.from({length:20},(_,i)=>raw[i]??null);
    rows[slot]=ashSnapshot(engine);
    localStorage.setItem('viep.petal-builds.v1',JSON.stringify(rows));
    ashWriteActive(slot);
    return true;
  }catch{return false;}
}
function ashLoadBuild(engine,slot){
  if(!engine||!Number.isInteger(slot)||slot<0||slot>=20)return false;
  if(engine.sendCommand){
    engine.sendCommand({type:'loadBuild',slot});
    ashWriteActive(slot);
    return true;
  }
  try{
    const raw=JSON.parse(localStorage.getItem('viep.petal-builds.v1')||'[]');
    const rows=Array.from({length:20},(_,i)=>raw[i]??null);
    const entry=rows[slot];
    if(!entry)return false;
    const active=ashReadActive();
    if(active>=0&&active<20&&active!==slot){
      rows[active]=ashSnapshot(engine);
    }
    localStorage.setItem('viep.petal-builds.v1',JSON.stringify(rows));
    const ok=!!engine.applyBuild(entry.loadout||[],entry.reserve||[]);
    if(ok)ashWriteActive(slot);
    return ok;
  }catch{return false;}
}
function ashPresetDigit(key,code){
  if(key>='1'&&key<='9')return key.charCodeAt(0)-49;
  if(key==='0'||code==='Digit0'||code==='Numpad0')return 9;
  return null;
}
function ashReadBuilds(){
  try{
    const raw=JSON.parse(localStorage.getItem('viep.petal-builds.v1')||'[]');
    return Array.from({length:20},(_,i)=>raw[i]??null);
  }catch{return Array.from({length:20},()=>null);}
}

window.ashMobileLPick=false;
function ashArmMobileLPick(){
  window.ashMobileLPick=true;
  try{window.dispatchEvent(new CustomEvent('ashflor-l-pick',{detail:{armed:true}}));}catch{}
}
function ashClearMobileLPick(){
  if(!window.ashMobileLPick)return false;
  window.ashMobileLPick=false;
  try{window.dispatchEvent(new CustomEvent('ashflor-l-pick',{detail:{armed:false}}));}catch{}
  return true;
}
function ashConsumeMobileLPick(primaryIndex,engine){
  if(!window.ashMobileLPick)return false;
  if(!Number.isInteger(primaryIndex)||primaryIndex<0||primaryIndex>9)return false;
  window.ashMobileLPick=false;
  try{window.dispatchEvent(new CustomEvent('ashflor-l-pick',{detail:{armed:false}}));}catch{}
  if(engine)ashLoadBuild(engine,10+primaryIndex);
  return true;
}

// K/L both apply. Digits never Shift-save — edits autosave on leave (server/local).
function createAshPresetStrip(React,jsx,readBuilds,Art,rarities){
  const read=()=>typeof readBuilds==='function'?readBuilds():ashReadBuilds();
  return function AshPresetStrip(props){
    const current=React.useRef(props);current.current=props;
    const held=React.useRef(new Set);
    const bankRef=React.useRef(0);
    const modeRef=React.useRef(null);
    const [mode,setMode]=React.useState(null);
    const [builds,setBuilds]=React.useState(()=>[]);
    const [selected,setSelected]=React.useState(null);
    const selectRef=React.useRef(()=>{});
    selectRef.current=(digit)=>{
      const p=current.current;
      if(!modeRef.current||p.blocked()||p.engine.current?.state!=='playing')return;
      const slot=bankRef.current+digit;
      setSelected(digit);
      p.useBuild(slot);
      setBuilds(read());
    };
    React.useEffect(()=>{
      const available=()=>!current.current.blocked()&&current.current.engine.current?.state==='playing';
      const reset=()=>{held.current.clear();modeRef.current=null;setMode(null);setSelected(null);bankRef.current=0;};
      const update=()=>{
        const keys=[...held.current];
        const last=keys[keys.length-1];
        const next=(last==='k'||last==='l')?'load':null;
        // K wins if both held (ashflor).
        bankRef.current=held.current.has('k')?0:last==='l'?10:0;
        modeRef.current=next;setMode(next);setSelected(null);
        if(next)setBuilds(read());
      };
      const editable=t=>t&&(t.matches?.('input,textarea,[contenteditable="true"]')||t.isContentEditable);
      const down=e=>{
        if(editable(e.target)||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
        if(!available()){reset();return;}
        const key=e.key.toLowerCase();
        if(key==='escape'){reset();return;}
        if(key==='k'||key==='l'){
          if(e.repeat)return;
          held.current.delete(key);held.current.add(key);update();e.preventDefault();return;
        }
        const digit=ashPresetDigit(key,e.code);
        if(digit===null||!modeRef.current)return;
        e.preventDefault();e.stopImmediatePropagation();
        if(!e.repeat)selectRef.current(digit);
      };
      const up=e=>{const key=e.key.toLowerCase();held.current.delete(key)&&update();};
      const hidden=()=>{document.hidden&&reset();};
      const focus=e=>{editable(e.target)&&reset();};
      const storage=()=>{modeRef.current&&setBuilds(read());};
      window.addEventListener('keydown',down,true);
      window.addEventListener('keyup',up,true);
      window.addEventListener('blur',reset);
      window.addEventListener('storage',storage);
      document.addEventListener('visibilitychange',hidden);
      document.addEventListener('focusin',focus);
      return()=>{
        window.removeEventListener('keydown',down,true);
        window.removeEventListener('keyup',up,true);
        window.removeEventListener('blur',reset);
        window.removeEventListener('storage',storage);
        document.removeEventListener('visibilitychange',hidden);
        document.removeEventListener('focusin',focus);
      };
    },[]);
    React.useEffect(()=>{
      if(mode&&(props.blocked()||props.engine.current?.state!=='playing')){
        held.current.clear();modeRef.current=null;setMode(null);setSelected(null);bankRef.current=0;
      }
    });
    if(!mode||props.blocked()||props.engine.current?.state!=='playing')return null;
    const bank=bankRef.current;
    const bankName=bank?'L':'K';
    return jsx('div',{className:'viep-preset-panel','data-mode':'load',role:'group','aria-label':'Load loadout presets',children:[
      jsx('p',{className:'viep-preset-hint',children:`${bankName}+1–0 切换 · 离开自动保存 · 空槽无效`}),
      jsx('div',{className:'viep-preset-row',children:Array.from({length:10},(_,digit)=>{
        const build=builds[bank+digit]??null;
        const preview=(build?.loadout||[]).find(Boolean)||(build?.reserve||[]).find(Boolean)||null;
        const label=digit===9?'0':String(digit+1);
        return jsx('button',{
          type:'button',
          className:'viep-preset-slot',
          'aria-pressed':selected===digit,
          title:preview?`${rarities[preview.rarity]?.name||''} ${preview.type}`:(build?'Saved build':'Empty — save first'),
          onPointerDown:e=>{e.preventDefault();e.stopPropagation();},
          onClick:()=>selectRef.current(digit),
          children:[
            jsx('span',{className:'viep-preset-art',children:preview?jsx(Art,{item:preview,showLabel:!0}):null}),
            jsx('kbd',{className:'viep-preset-key',children:`[${label}]`}),
          ],
        },digit);
      })}),
    ]});
  };
}

function AshTouchBuildPanel({open,close,save,use}){
  if(!open)return null;
  const rows=ashReadBuilds();
  const press={slot:-1,at:0};
  return b.jsxs('section',{className:'touch-build-panel',role:'dialog','aria-label':'Builds',children:[
    b.jsxs('header',{children:[b.jsx('b',{children:'配装方案'}),b.jsx('button',{className:'touch-build-close','aria-label':'Close builds',onClick:close,children:'×'})]}),
    b.jsx('p',{className:'touch-build-hint',children:'点按切换 · 长按保存 · 空槽需先长按保存'}),
    b.jsx('div',{className:'touch-build-grid',children:rows.map((entry,i)=>b.jsxs('article',{className:'touch-build-slot',children:[
      b.jsx('b',{children:(i<10?'K':'L')+(i%10===9?'0':String(i%10+1))}),
      b.jsx('button',{
        className:'touch-build-use',
        onPointerDown:e=>{e.preventDefault();press.slot=i;press.at=performance.now();},
        onPointerUp:()=>{
          if(press.slot!==i)return;
          const held=performance.now()-press.at>=450;
          press.slot=-1;
          if(held){save(i);close();}
          else if(entry){use(i);close();}
        },
        onPointerCancel:()=>{press.slot=-1;},
        children:entry?'切换 / 长按保存':'长按保存',
      }),
    ]},i))}),
  ]});
}

function AshTouchSwap({onSwap}){
  const press=O.useRef({at:0,long:false,timer:0});
  const [armed,setArmed]=O.useState(()=>!!window.ashMobileLPick);
  O.useEffect(()=>{
    const on=e=>setArmed(!!e.detail?.armed);
    window.addEventListener('ashflor-l-pick',on);
    return()=>window.removeEventListener('ashflor-l-pick',on);
  },[]);
  const finish=()=>{
    const p=press.current;
    if(!p.at)return;
    clearTimeout(p.timer);
    if(!p.long){
      if(ashClearMobileLPick()){setArmed(false);p.at=0;p.long=false;return;}
      onSwap?.();
    }
    p.at=0;p.long=false;
  };
  return b.jsx('button',{
    className:'touch-swap'+(armed?' ash-l-armed':''),
    'aria-label':armed?'Cancel L preset pick':'Swap or hold for L presets',
    onPointerDown:e=>{
      e.preventDefault();
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}
      const p=press.current;
      p.at=performance.now();p.long=false;
      clearTimeout(p.timer);
      const start=p.at;
      p.timer=setTimeout(()=>{
        if(press.current.at!==start||press.current.long)return;
        press.current.long=true;
        ashArmMobileLPick();
        setArmed(true);
      },380);
    },
    onPointerUp:()=>finish(),
    onPointerCancel:()=>{clearTimeout(press.current.timer);press.current.at=0;press.current.long=false;},
    children:armed?'L…':'R',
  });
}

// Bind after O/b/yv/oN/L exist (this file is appended to the page chunk).
try{
  if(typeof createAshPresetStrip==='function'&&typeof O!=='undefined'&&typeof b!=='undefined'&&typeof yv==='function'&&typeof oN!=='undefined'&&typeof L!=='undefined'){
    viepPresetStrip=createAshPresetStrip(O,b.jsx,yv,oN,L);
  }
}catch(err){console.error('ash preset strip bind failed',err);}
