'use strict';
// Explicit diagnostic only. Credentials and cookies remain in memory.
const {request}=require('playwright');const {WebSocket}=require('ws');
const fs=require('node:fs'),zlib=require('node:zlib');
const {loadEngine}=require('../server/engine');
(async()=>{
  const base=process.env.TARGET_URL??'https://152.32.173.78';
  if(!process.env.GAME_USER||!process.env.GAME_PASS)throw Error('GAME_USER and GAME_PASS required');
  const api=loadEngine(require('node:path').resolve(__dirname,'../florr-local-site'));
  const context=await request.newContext({ignoreHTTPSErrors:true,timeout:20000});
  try{
    const login=await context.post(base+'/api/account/login',{data:{username:process.env.GAME_USER,password:process.env.GAME_PASS}});
    if(!login.ok())throw Error(`Upstream login returned ${login.status()}`);
    const session=await (await context.get(base+'/api/session')).json();
    const cookie=(await context.storageState()).cookies.map(c=>`${c.name}=${c.value}`).join('; ');
    const frames=[],types=new Set(),decoder=new api.BatchDecoder();
    const protocols=process.env.WS_COMPRESSED?['florr-batch-v1','florr-delta-v1']:[];
    const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws',protocols,{rejectUnauthorized:false,headers:{Cookie:cookie,Origin:base}});
    let close;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{ws.close();resolve();},4000);
      ws.on('message',(data,binary)=>{try{const f=JSON.parse(binary?zlib.gunzipSync(data):data);types.add(Array.isArray(f)?f[0]:f.type);const decoded=decoder.accept(f);if(decoded?.type==='snapshot')frames.push(decoded);}catch{types.add('unparsed');}});
      ws.on('close',(code)=>{close=code;clearTimeout(timer);resolve();});ws.on('error',err=>{clearTimeout(timer);reject(err);});
    });
    const frame=frames[0];
    const report={target:base,mode:'login and lobby snapshots only',subprotocol:ws.protocol,protocol:session.protocol,sessionValid:api.session.safeParse(session).success,
      frameCount:frames.length,frameTypes:[...types],allSnapshotsValid:frames.length>0&&frames.every(f=>!!api.validate(f)),closeCode:close,
      snapshotKeys:frame?Object.keys(frame).sort():[],selfKeys:frame?Object.keys(frame.self).sort():[],motion:frame?.motion,rates:frame?.rates,
      map:frame?{biome:frame.map.biome,width:frame.map.width,height:frame.map.height}:null};
    fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync(`test-results/upstream-parity${process.env.WS_COMPRESSED?'-gzip':''}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    if(!report.allSnapshotsValid||!report.sessionValid)process.exitCode=1;
  }finally{await context.dispose();}
})().catch(err=>{console.error(err.message);process.exitCode=1;});
