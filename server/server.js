'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {WebSocketServer,WebSocket}=require('ws');
const {loadEngine,BUNDLE}=require('./engine');
const {patchClient}=require('./client-patches');
const {World}=require('./world');
const {snapshot}=require('./snapshot');
const {Accounts,AccountError}=require('./accounts');
const {Social}=require('./social');
const {attachCombat,startCraft,stepCraft}=require('./operations');
const {ensurePresets,savePreset,loadPreset,slotLabel}=require('./builds');
const {promisify}=require('node:util');
const gzip=promisify(zlib.gzip);
const {TICK_HZ,SNAPSHOT_HZ}=require('./config');
const {FixedStepper}=require('./scheduler');
const Wire=require('./wire');
const {captureRun,restoreRun}=require('./active-run');
function createServer(options={}){
  const webRoot=path.resolve(options.webRoot??path.join(__dirname,'../florr-local-site'));
  const dbPath=path.resolve(options.dbPath??path.join(__dirname,'../data/inventory.json'));
  const api=loadEngine(webRoot), world=new World(api), clients=new Map();
  const clientCode=Buffer.from(patchClient(fs.readFileSync(path.join(webRoot,BUNDLE),'utf8')));
  let db={version:1,sessions:{}};
  if(fs.existsSync(dbPath))db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
  if(db.version!==1||!db.sessions)throw Error('Unsupported save database');
  const accounts=new Accounts(db,api);
  const social=new Social(db,clients,world);
  let writing=Promise.resolve();
  const persist=()=>{for(const c of clients.values()){c.account.save=c.engine.save;captureRun(c);}
    const data=JSON.stringify(db);
    const next=writing.then(async()=>{await fs.promises.mkdir(path.dirname(dbPath),{recursive:true});await fs.promises.writeFile(dbPath+'.tmp',data);await fs.promises.rename(dbPath+'.tmp',dbPath);});
    writing=next.catch(err=>console.error('Save failed:',err.message));return next;};
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const tokenOf=req=>/\bflorr_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie??'')?.[1];
  const setCookie=(res,token)=>res.setHeader('Set-Cookie',`florr_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
  function session(req,res){let token=tokenOf(req),s=accounts.accountFor(token)??db.sessions[token];
    if(!s){token=crypto.randomBytes(32).toString('hex');const id=crypto.randomUUID();
      const save=api.defaults();save.name=`Guest-${id.slice(0,6)}`;
      s=db.sessions[token]={id,username:save.name,save};
      setCookie(res,token);persist().catch(()=>{});}
    return {token,s,account:accounts.accountFor(token)};}
  async function readBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw new AccountError(413,'Request too large');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AccountError(400,'Invalid JSON');}}
  const authAttempts=new Map();
  function limitAuth(req){const key=req.socket.remoteAddress,now=Date.now();let window=authAttempts.get(key);if(!window||now-window.start>60000){window={start:now,count:0};authAttempts.set(key,window);}if(++window.count>30)throw new AccountError(429,'Too many attempts');}
  const stats={ticks:[],tickTimes:[],snapshotTimes:[],snapshotCount:0,saveFrames:0,bytes:0,snapshotErrors:0,skippedSnapshots:0,socketCloses:{}};
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
  const server=http.createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://local').pathname;
      if(pathname==='/api/health'){
        const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*p)]??0,times=stats.tickTimes;
        const rooms=[...world.rooms.values()];
        return json(res,200,{ok:true,protocol:3,players:clients.size,connectedPlayers:[...clients.values()].filter(c=>c.ws.readyState===WebSocket.OPEN).length,rooms:rooms.length,targetTps:TICK_HZ,
          actualTps:times.length>1?Math.round((times.length-1)*1000/(times.at(-1)-times[0])*10)/10:0,snapshotHz:SNAPSHOT_HZ,
          tickMsP95:percentile(stats.ticks,.95),tickMsP99:percentile(stats.ticks,.99),snapshotMsP95:percentile(stats.snapshotTimes,.95),droppedSimulationSeconds:stepper.droppedSeconds,
          activeMobs:rooms.reduce((n,r)=>n+r.mobs.length,0),latentMobs:rooms.reduce((n,r)=>n+r.latent.records.size,0),
          groundDrops:rooms.reduce((n,r)=>n+r.drops.length,0),peakGroundDrops:rooms.reduce((n,r)=>n+r.loot.stats.peakDrops,0),invalidDrops:rooms.reduce((n,r)=>n+r.loot.stats.invalidDrops,0),collectedDrops:rooms.reduce((n,r)=>n+r.loot.stats.collectedDrops,0),
          snapshots:stats.snapshotCount,saveFrames:stats.saveFrames,snapshotErrors:stats.snapshotErrors,skippedSnapshots:stats.skippedSnapshots,bytesSent:stats.bytes,socketCloses:stats.socketCloses,invalidVisuals:[...clients.values()].reduce((n,c)=>n+(c.invalidVisuals??0),0)});
      }
      if(pathname.startsWith('/api/account/')&&['register','login','logout'].includes(pathname.split('/').at(-1))){
        if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Invalid origin'});
        if(pathname==='/api/account/logout'){
          const token=tokenOf(req),account=accounts.accountFor(token);delete db.sessions[token];
          if(account&&clients.get(account.id)?.token===token)clients.get(account.id).ws.close(4001,'Logged out');
          res.setHeader('Set-Cookie','florr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');await persist();return json(res,200,{ok:true});
        }
        limitAuth(req);const body=await readBody(req),username=typeof body?.username==='string'?body.username.trim():body?.username;
        const account=await accounts[pathname.endsWith('/register')?'register':'login'](username,body?.password);
        const token=accounts.issue(account);setCookie(res,token);await persist();
        return json(res,200,{protocol:3,save:clients.get(account.id)?.engine.save??account.save,account:accounts.public(account)});
      }
      if(pathname==='/api/session'||pathname==='/api/account'){
        if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
        const account=accounts.accountFor(tokenOf(req));
        if(pathname==='/api/account'&&!account)return json(res,401,{error:'Not logged in'});
        const {s}=session(req,res);return json(res,200,{protocol:3,save:clients.get(s.id)?.engine.save??s.save,account:account?accounts.public(account):null});
      }
      if(pathname==='/api/guild'||pathname.startsWith('/api/guild/')){
        const account=accounts.accountFor(tokenOf(req));if(!account)return json(res,401,{error:'Sign in first'});
        const action=pathname.slice('/api/guild'.length).replace(/^\//,'');
        if(req.method!==(action?'POST':'GET'))return json(res,405,{error:'Method not allowed'});
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Invalid origin'});
        if(action)limitAuth(req);
        const result=await social.request(account,action,action?await readBody(req):{});if(action)await persist();return json(res,200,result);
      }
      if(pathname.startsWith('/api/'))return json(res,404,{error:'This local server currently uses browser guest sessions.'});
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
      const relative=decodeURIComponent(pathname)==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/, '');
      const file=path.resolve(webRoot,relative), rel=path.relative(webRoot,file);
      if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'Not found'});
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')return res.end();if(file===path.join(webRoot,BUNDLE))return res.end(clientCode);fs.createReadStream(file).pipe(res);
    }catch(err){json(res,err.status??400,{error:err instanceof AccountError?err.message:'Invalid request'});}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false,
    handleProtocols:protocols=>protocols.has(Wire.PROTOCOL)?Wire.PROTOCOL:protocols.has('florr-batch-v1')?'florr-batch-v1':protocols.has('florr-delta-v1')?'florr-delta-v1':false});
  server.on('upgrade',(req,socket,head)=>{
    const reject=status=>socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    if(req.url!=='/ws')return reject('404 Not Found');
    if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return reject('403 Forbidden');}catch{return reject('403 Forbidden');}}
    const token=tokenOf(req),s=accounts.accountFor(token);if(!s)return reject('401 Unauthorized');
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,{token,s}));
  });
  async function send(c){if(c.sending||c.ws.readyState!==WebSocket.OPEN)return;
    // Frames are complete world samples: wait for the socket to drain instead
    // of queuing stale worlds or kicking a player after a transient stall.
    if(c.ws.bufferedAmount>256*1024){stats.skippedSnapshots++;return;}
    const socket=c.ws;
    const started=performance.now(),encoder=c.encoder;
    c.sending=true;
    try{const frame=snapshot(c,c.room,api,TICK_HZ,true);
    const mates=ids=>ids.map(id=>clients.get(id)).filter(p=>p&&p!==c&&p.engine.save.biome===c.engine.save.biome).map(p=>({id:p.id,name:p.engine.save.name,x:p.engine.x,y:p.engine.y}));
    frame.squad=social.snapshot(c);frame.guildMates=mates(social.guild(c.account)?.members??[]).slice(0,10);frame.squadMates=mates([...(social.squad(c)?.members??[])]);
    const roster=[...clients.values()].map(p=>({id:p.id,name:p.engine.save.name,level:p.engine.save.level,biome:p.engine.save.biome,state:p.engine.state}));
    const rosterJSON=JSON.stringify(roster);if(rosterJSON!==c.lastRosterJSON)frame.onlineRoster=roster;
    frame.combatStats={...c.combatStats};frame.craftJob=c.craftJob?structuredClone(c.craftJob):null;
    const presets=ensurePresets(c.account),presetsJSON=JSON.stringify(presets);
    if(presetsJSON!==c.lastPresetsJSON)frame.loadoutPresets=JSON.parse(presetsJSON);
    // Inventory can contain thousands of entries. Passive loot/XP changes
    // sample at 5 Hz; explicit equipment/craft commands invalidate it now.
    if(c.saveDirty||!c.saveSampleAt||Date.now()-c.saveSampleAt>=200){
      c.sampledSaveJSON=JSON.stringify(frame.save);c.saveSampleAt=Date.now();c.saveDirty=false;
    }
    const saveJSON=c.sampledSaveJSON;
    if(saveJSON===c.lastSaveJSON)delete frame.save;else frame.save=JSON.parse(saveJSON);
    if(!api.validate(frame)){
      const issues=api.snapshotSchema.safeParse(frame).error?.issues??[];
      throw Error('Invalid snapshot: '+JSON.stringify(issues.slice(0,6).map(i=>({path:i.path,code:i.code,message:i.message}))));
    }
    const encoded=encoder?.prepare(frame,true);
    const payload=encoded?encoded.bytes:(socket.protocol?await gzip(JSON.stringify(frame),{level:zlib.constants.Z_BEST_SPEED}):JSON.stringify(frame));
    if(c.ws!==socket||socket.readyState!==WebSocket.OPEN)return;
    socket.send(payload,{binary:!!socket.protocol});encoded?.commit();c.lastVisualAck=frame.visualAck??c.lastVisualAck;c.lastSaveJSON=saveJSON;c.lastRosterJSON=rosterJSON;c.lastPresetsJSON=presetsJSON;c.snapshotFails=0;
    stats.snapshotCount++;stats.bytes+=Buffer.byteLength(payload);if(frame.save)stats.saveFrames++;
    }finally{c.sending=false;stats.snapshotTimes.push(performance.now()-started);if(stats.snapshotTimes.length>120)stats.snapshotTimes.shift();}
  }
  const sendSafely=c=>send(c).catch(err=>{
    stats.snapshotErrors++;
    c.snapshotFails++;
    if(!c.lastSnapshotErrorAt||Date.now()-c.lastSnapshotErrorAt>=5000){
      c.lastSnapshotErrorAt=Date.now();console.error('Snapshot failed:',err.message);
    }
    // Invalid server output is a server bug. Keep the transport alive so the
    // next valid sample can recover, rather than discarding the player's fight.
  });
  wss.on('connection',(ws,{token,s})=>{
    const previous=clients.get(s.id);
    if(previous){clearTimeout(previous.disconnectTimer);previous.ws.close(4013,'Already open in another tab');s.save=previous.engine.save;}
    ensurePresets(s);
    const c=previous??{id:s.id,account:s,engine:new api.Engine(api.normalize(s.save),Math.random,false),events:[]};
    Object.assign(c,{token,ws,inputAck:0,lastInput:0,count:0,controlCount:0,window:Date.now(),snapshotFails:0,lastSaveJSON:undefined,lastRosterJSON:undefined,lastPresetsJSON:'',disconnectedAt:undefined,saveDirty:true});
    c.encoder=ws.protocol===Wire.PROTOCOL?new Wire.Encoder():null;c.lastVisualAck=0;
    c.engine.localVisuals=true;c.engine.visualScope=c.room?.id??'';
    c.engine.input={x:0,y:0};
    if(!previous)attachCombat(c,clients);
    c.engine.onEvent=event=>{if(event==='dead')c.combatStats.deaths++;if(event!=='save')c.events.push(event);};
    clients.set(c.id,c);if(!previous){world.join(c);restoreRun(c,world);}sendSafely(c);
    ws.on('message',(data,binary)=>{
      if(clients.get(c.id)!==c||c.ws!==ws)return;
      if(binary)return ws.close(4002,'JSON commands required');
      if(Date.now()-c.window>=1000){c.count=0;c.controlCount=0;c.window=Date.now();}
      // TCP can deliver several seconds of 30 Hz controls together after a
      // brief network stall. Inputs only overwrite intent, never step physics.
      if(++c.count>512)return ws.close(4008,'Too many commands');
      let raw;try{raw=JSON.parse(data);}catch{return ws.close(4002,'Invalid JSON');}
      if(raw?.type!=='input'&&++c.controlCount>80)return ws.close(4008,'Too many control commands');
      if(raw?.type==='clientDiagnostic'){
        if(raw.phase==='snapshot'&&typeof raw.message==='string'&&raw.message.length<=240&&(!c.lastDiagnosticAt||Date.now()-c.lastDiagnosticAt>=5000)){
          c.lastDiagnosticAt=Date.now();console.warn('Client snapshot error:',JSON.stringify({phase:raw.phase,message:raw.message,state:c.engine.state,biome:c.engine.save.biome}));
        }return;
      }
      if(raw?.type!=='input'&&raw?.type!=='chat')c.saveDirty=true;
      if(raw?.type==='chat'){
        if(['Local','Public','Squad','Guild'].includes(raw.channel)&&typeof raw.text==='string'&&raw.text.trim()&&raw.text.length<=200){
          const message={type:'chat',id:crypto.randomUUID(),senderId:c.id,name:c.engine.save.name,channel:raw.channel,text:raw.text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim(),system:false};
          for(const peer of social.recipients(c,raw.channel))if(peer.ws.readyState===WebSocket.OPEN)peer.ws.send(JSON.stringify(message));
        }return;
      }
      if(['craftBatch','craftCancel','swapAll','combatReset','saveBuild','loadBuild'].includes(raw?.type)){
        const allowed={craftBatch:['type','scope','item','maxRarity'],craftCancel:['type'],swapAll:['type'],combatReset:['type'],saveBuild:['type','slot'],loadBuild:['type','slot']}[raw.type];
        if(Object.keys(raw).some(k=>!allowed.includes(k)))return ws.close(4002,'Invalid command');
        try{if(raw.type==='craftBatch')startCraft(c,raw,api);
          if(raw.type==='craftCancel'&&c.craftJob){c.craftJob.running=false;c.craftJob.status='cancelled';}
          if(raw.type==='swapAll'){const e=c.engine;for(let slot=0;slot<api.slots(e.save.level,e.save.talents.loadout);slot++)e.swap(slot);}
          if(raw.type==='combatReset'){for(const key of ['dealt','taken','kills','deaths'])c.combatStats[key]=0;}
          if(raw.type==='saveBuild'){const slot=raw.slot|0;savePreset(c.account,c.engine,slot);c.lastPresetsJSON='';c.events.push(`Saved ${slotLabel(slot)}`);}
          if(raw.type==='loadBuild'){const result=loadPreset(c.account,c.engine,raw.slot|0);c.lastPresetsJSON='';c.events.push(result.empty?`${result.label} is empty — hold/save first`:(result.ok?`Loaded ${result.label}`:`Could not load ${result.label}`));}
        }catch(err){c.events.push(err.message);}return;
      }
      const parsed=api.commands.safeParse(raw);if(!parsed.success){
        console.warn('Invalid command:',JSON.stringify({type:typeof raw?.type==='string'?raw.type.slice(0,40):null,issues:parsed.error.issues.slice(0,4).map(i=>({path:i.path,code:i.code})),state:c.engine.state}));
        return ws.close(4002,'Invalid command');
      }
      const m=parsed.data,e=c.engine;
      try{if(social.command(c,m))return;switch(m.type){
        case 'input':{if(m.seq<=c.inputAck)return;c.inputAck=m.seq;const length=Math.max(1,Math.hypot(m.x,m.y));e.input={x:m.x/length,y:m.y/length};e.mode=m.mode;e.defendHeld=m.defend;c.lastInput=Date.now();c.viewRadius=Math.max(800,Math.min(3000,m.viewRadius??1800));if(m.rotation!==undefined)e.adjustRotationSpeed(Math.max(-10,Math.min(10,m.rotation))-e.manualRotationSpeed);break;}
        case 'start':if(e.state!=='playing'){if(['waiting','countdown'].includes(social.squad(c)?.phase)){social.command(c,{type:'squadReady',ready:true,name:m.name});break;}e.save.name=(m.name??e.save.name).trim().slice(0,20)||s.username;
          // Client start() restores save.previousBiome after death (Garden after Ant Hell portals).
          // Keep the death map for Adventure respawns on every biome.
          if(e.state==='dead')e.save.previousBiome=undefined;
          e.start();world.join(c);}break;
        case 'lobby':e.state='lobby';e.input={x:0,y:0};delete c.account.activeRun;social.leave(c);break;
        case 'biome':if(e.state==='lobby'){const squad=social.squad(c);if(squad){if(squad.leaderId!==c.id)throw Error('Only the leader can change the squad map');squad.biome=m.biome;squad.ready.clear();squad.countdown=0;squad.phase='waiting';for(const id of squad.members){const p=clients.get(id);p.engine.setBiome(m.biome);world.join(p);}}else{e.setBiome(m.biome);world.join(c);}}break;
        case 'equip':e.equip(m.slot,m.item,m.reserve);break;
        case 'unequip':e.unequip(m.slot,m.reserve);break;
        case 'swap':e.swap(m.slot);break;
        case 'movePetal':e.movePetal(m.from,m.fromReserve,m.to,m.toReserve);break;
        case 'applyBuild':e.applyBuild(m.loadout,m.reserve);break;
        case 'talent':e.changeTalent(m.id,m.level,m.action==='refund');break;
        case 'resetTalents':e.resetTalents();break;
        case 'equipDrops':e.setEquipDrops(m.enabled);break;
        case 'shop':e.useShop(m.action,m.offer);break;
        case 'craft':{if(c.craftJob?.running)throw Error('A crafting job is already running');const result=api.craft(e.save.inventory,m.item,Math.random,m.repeat?100:1);c.events.push(result.attempts?`Crafted ${result.successes} of ${result.attempts} attempt(s)`:'Need 5 craftable identical petals');break;}
        case 'absorb':{const key=`${m.item.type}:${m.item.rarity}`;if(m.item.type==='Fragment'||(e.save.inventory[key]??0)<1)throw Error('This petal cannot be absorbed');e.save.inventory[key]--;e.gainXP(5**m.item.rarity);break;}
        case 'gameMode':if(m.mode!=='adventure')c.events.push('Wave mode is not available on this server yet');break;
        default:c.events.push('This local server currently supports Adventure rooms. This action is not implemented.');
      }}catch(err){c.events.push(err.message||'Command could not be completed.');}
    });
    ws.on('error',()=>{});
    ws.on('close',(code,reason)=>{
      stats.socketCloses[code]=(stats.socketCloses[code]??0)+1;
      if(!closing&&code!==1000)console.warn('Socket closed:',JSON.stringify({code,reason:reason.toString().slice(0,120),state:c.engine.state,biome:c.engine.save.biome,commands:c.count}));
      if(clients.get(c.id)!==c||c.ws!==ws)return;
      s.save=c.engine.save;c.engine.input={x:0,y:0};c.engine.mode='normal';c.engine.defendHeld=false;
      const release=()=>{if(clients.get(c.id)!==c||c.ws!==ws)return;if(!closing)delete c.account.activeRun;social.leave(c);clients.delete(c.id);world.leave(c);persist().catch(()=>{});};
      // Retain the authoritative fight across transport failures. The next
      // socket resets its input sequence and receives all persistent baselines.
      const playbackFailure=code===4002&&['Invalid delta','Snapshot playback failed','Invalid compressed state'].includes(reason.toString());
      if(!closing&&([1001,1005,1006,1011,4000,4008,4009].includes(code)||playbackFailure)){
        c.disconnectedAt=Date.now();c.disconnectTimer=setTimeout(release,15000);c.disconnectTimer.unref();
      }else release();
    });
  });
  const tickInterval=1000/TICK_HZ,stepper=new FixedStepper(TICK_HZ);
  let previous=performance.now(),nextTick=previous+tickInterval,timer,closing=false,snapshotTimer;
  function scheduleTick(){timer=setTimeout(runTick,Math.max(1,Math.ceil(nextTick-performance.now())));}
  function runTick(){if(closing)return;const now=performance.now(),elapsed=(now-previous)/1000;previous=now;
    stepper.advance(elapsed,dt=>{
      const start=performance.now();try{social.tick(dt);world.tick(dt);for(const c of clients.values())stepCraft(c,api);}catch(err){console.error(err.stack);}
      stats.ticks.push(performance.now()-start);if(stats.ticks.length>120)stats.ticks.shift();
      stats.tickTimes.push(now);while(stats.tickTimes.length&&now-stats.tickTimes[0]>3000)stats.tickTimes.shift();
    });
    nextTick=Math.max(nextTick+tickInterval,performance.now());scheduleTick();
  }
  scheduleTick();
  let nextSnapshot=performance.now()+1000/SNAPSHOT_HZ;
  function broadcast(){if(closing)return;for(const c of clients.values())sendSafely(c);nextSnapshot=Math.max(nextSnapshot+1000/SNAPSHOT_HZ,performance.now()+1);snapshotTimer=setTimeout(broadcast,Math.max(1,Math.ceil(nextSnapshot-performance.now())));}
  snapshotTimer=setTimeout(broadcast,Math.ceil(1000/SNAPSHOT_HZ));
  const saveTimer=setInterval(()=>persist().catch(()=>{}),10000);
  async function close(){closing=true;clearTimeout(timer);clearTimeout(snapshotTimer);clearInterval(saveTimer);await persist();for(const c of clients.values()){clearTimeout(c.disconnectTimer);c.ws.terminate();}await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));await writing;}
  return {server,world,clients,api,social,close,persist,stats};
}
if(require.main===module){
  const root=process.env.WEB_ROOT,dbPath=process.env.DB_PATH;
  const app=createServer({webRoot:root,dbPath});const port=Number(process.env.PORT??8787),host=process.env.HOST??'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Florr protocol 3 server: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit(0)));
}
module.exports={createServer};
