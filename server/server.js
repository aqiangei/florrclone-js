'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {WebSocketServer,WebSocket}=require('ws');
const {loadEngine,BUNDLE}=require('./engine');
const {patchClient}=require('./client-patches');
const {World}=require('./world');
const {snapshot}=require('./snapshot');
const {Accounts,AccountError}=require('./accounts');
const {promisify}=require('node:util');
const gzip=promisify(zlib.gzip);
const {TICK_HZ,SNAPSHOT_HZ}=require('./config');
function createServer(options={}){
  const webRoot=path.resolve(options.webRoot??path.join(__dirname,'../florr-local-site'));
  const dbPath=path.resolve(options.dbPath??path.join(__dirname,'../data/inventory.json'));
  const api=loadEngine(webRoot), world=new World(api), clients=new Map();
  const clientCode=Buffer.from(patchClient(fs.readFileSync(path.join(webRoot,BUNDLE),'utf8')));
  let db={version:1,sessions:{}};
  if(fs.existsSync(dbPath))db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
  if(db.version!==1||!db.sessions)throw Error('Unsupported save database');
  const accounts=new Accounts(db,api);
  let writing=Promise.resolve();
  const persist=()=>{for(const c of clients.values())c.account.save=c.engine.save;
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
  const stats={ticks:[],tickTimes:[],snapshotCount:0,saveFrames:0,bytes:0};
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
  const server=http.createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://local').pathname;
      if(pathname==='/api/health'){const timings=stats.ticks.slice().sort((a,b)=>a-b),times=stats.tickTimes;return json(res,200,{ok:true,protocol:3,players:clients.size,rooms:world.rooms.size,targetTps:TICK_HZ,actualTps:times.length>1?Math.round((times.length-1)*1000/(times.at(-1)-times[0])*10)/10:0,snapshotHz:SNAPSHOT_HZ,tickMsP95:timings[Math.floor(timings.length*.95)]??0,snapshots:stats.snapshotCount,saveFrames:stats.saveFrames});}
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
    handleProtocols:protocols=>protocols.has('florr-batch-v1')?'florr-batch-v1':protocols.has('florr-delta-v1')?'florr-delta-v1':false});
  server.on('upgrade',(req,socket,head)=>{
    const reject=status=>socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    if(req.url!=='/ws')return reject('404 Not Found');
    if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return reject('403 Forbidden');}catch{return reject('403 Forbidden');}}
    const token=tokenOf(req),s=accounts.accountFor(token);if(!s)return reject('401 Unauthorized');
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,{token,s}));
  });
  async function send(c){if(c.sending||c.ws.readyState!==WebSocket.OPEN)return;
    if(c.ws.bufferedAmount>1024*1024)return c.ws.close(4009,'Slow client');
    c.sending=true;
    try{const frame=snapshot(c,c.room,api);
    const saveJSON=JSON.stringify(frame.save);
    if(saveJSON===c.lastSaveJSON)delete frame.save;
    if(!api.validate(frame))throw Error('Server generated an invalid snapshot');
    const data=JSON.stringify(frame);
    const payload=c.ws.protocol?await gzip(data,{level:zlib.constants.Z_BEST_SPEED}):data;
    if(c.ws.readyState!==WebSocket.OPEN)return;
    c.ws.send(payload,{binary:!!c.ws.protocol});c.lastSaveJSON=saveJSON;
    stats.snapshotCount++;stats.bytes+=Buffer.byteLength(payload);if(frame.save)stats.saveFrames++;
    }finally{c.sending=false;}
  }
  const sendSafely=c=>send(c).catch(err=>{console.error('Snapshot failed:',err.message);c.ws.close(1011,'Snapshot failed');});
  wss.on('connection',(ws,{token,s})=>{
    const previous=clients.get(s.id);if(previous){previous.ws.close(4013,'Already open in another tab');world.leave(previous);}
    const c={id:s.id,token,ws,account:s,engine:new api.Engine(api.normalize(s.save),Math.random,false),inputAck:0,lastInput:0,events:[],count:0,window:Date.now()};
    c.engine.onEvent=event=>{if(event!=='save')c.events.push(event);};
    clients.set(c.id,c);world.join(c);sendSafely(c);
    ws.on('message',(data,binary)=>{
      if(clients.get(c.id)!==c)return;
      if(binary)return ws.close(4002,'JSON commands required');
      if(Date.now()-c.window>=1000){c.count=0;c.window=Date.now();}
      if(++c.count>80)return ws.close(4008,'Too many commands');
      let raw;try{raw=JSON.parse(data);}catch{return ws.close(4002,'Invalid JSON');}
      if(raw?.type==='chat'){
        if(raw.channel==='Local'&&typeof raw.text==='string'&&raw.text.trim()&&raw.text.length<=200){
          const message={type:'chat',id:crypto.randomUUID(),senderId:c.id,name:c.engine.save.name,channel:'Local',text:raw.text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim(),system:false};
          for(const peer of c.room.clients)if(peer.ws.readyState===WebSocket.OPEN)peer.ws.send(JSON.stringify(message));
        }return;
      }
      const parsed=api.commands.safeParse(raw);if(!parsed.success)return ws.close(4002,'Invalid command');
      const m=parsed.data,e=c.engine;
      try{switch(m.type){
        case 'input':{if(m.seq<=c.inputAck)return;c.inputAck=m.seq;const length=Math.max(1,Math.hypot(m.x,m.y));e.input={x:m.x/length,y:m.y/length};e.mode=m.mode;e.defendHeld=m.defend;c.lastInput=Date.now();c.viewRadius=Math.max(800,Math.min(3000,m.viewRadius??1800));if(m.rotation!==undefined)e.adjustRotationSpeed(Math.max(-10,Math.min(10,m.rotation))-e.manualRotationSpeed);break;}
        case 'start':if(e.state!=='playing'){e.save.name=(m.name??e.save.name).trim().slice(0,20)||s.username;e.start();world.bind(c);}break;
        case 'lobby':e.state='lobby';e.input={x:0,y:0};break;
        case 'biome':if(e.state==='lobby'){e.setBiome(m.biome);world.join(c);}break;
        case 'equip':e.equip(m.slot,m.item,m.reserve);break;
        case 'unequip':e.unequip(m.slot,m.reserve);break;
        case 'swap':e.swap(m.slot);break;
        case 'movePetal':e.movePetal(m.from,m.fromReserve,m.to,m.toReserve);break;
        case 'applyBuild':e.applyBuild(m.loadout,m.reserve);break;
        case 'talent':e.changeTalent(m.id,m.level,m.action==='refund');break;
        case 'resetTalents':e.resetTalents();break;
        case 'equipDrops':e.setEquipDrops(m.enabled);break;
        case 'shop':e.useShop(m.action,m.offer);break;
        case 'craft':{const result=api.craft(e.save.inventory,m.item,Math.random,m.repeat?100:1);c.events.push(result.attempts?`Crafted ${result.successes} of ${result.attempts} attempt(s)`:'Need 5 craftable identical petals');break;}
        default:c.events.push('This local server currently supports Adventure rooms. This action is not implemented.');
      }}catch(err){console.error('Command failed:',m.type,err.message);c.events.push('Command could not be completed.');}
    });
    ws.on('error',()=>{});
    ws.on('close',()=>{if(clients.get(c.id)===c){s.save=c.engine.save;clients.delete(c.id);world.leave(c);persist().catch(()=>{});}});
  });
  const tickInterval=1000/TICK_HZ;
  let previous=performance.now(),nextTick=previous+tickInterval,timer,closing=false;
  function scheduleTick(){timer=setTimeout(runTick,Math.max(1,Math.ceil(nextTick-performance.now())));}
  function runTick(){if(closing)return;const now=performance.now(),dt=Math.min(.1,(now-previous)/1000);previous=now;
    const start=performance.now();try{world.tick(dt);}catch(err){console.error(err.stack);}
    stats.ticks.push(performance.now()-start);if(stats.ticks.length>120)stats.ticks.shift();
    stats.tickTimes.push(now);while(stats.tickTimes.length&&now-stats.tickTimes[0]>3000)stats.tickTimes.shift();
    nextTick=Math.max(nextTick+tickInterval,performance.now());scheduleTick();
  }
  scheduleTick();
  const snapshotTimer=setInterval(()=>{for(const c of clients.values())sendSafely(c);},1000/SNAPSHOT_HZ);
  const saveTimer=setInterval(()=>persist().catch(()=>{}),10000);
  async function close(){closing=true;clearTimeout(timer);clearInterval(snapshotTimer);clearInterval(saveTimer);await persist();for(const c of clients.values())c.ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));await writing;}
  return {server,world,clients,api,close,persist,stats};
}
if(require.main===module){
  const root=process.env.WEB_ROOT,dbPath=process.env.DB_PATH;
  const app=createServer({webRoot:root,dbPath});const port=Number(process.env.PORT??8787),host=process.env.HOST??'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Florr protocol 3 server: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit(0)));
}
module.exports={createServer};
