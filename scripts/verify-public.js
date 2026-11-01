'use strict';
const {request,chromium}=require('playwright'),{WebSocket}=require('ws');
const crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadEngine,BUNDLE}=require('../server/engine');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  if(!process.env.TARGET_URL)throw Error('TARGET_URL required, e.g. http://127.0.0.1:8088/');
  const target=new URL(process.env.TARGET_URL),api=loadEngine(path.join(__dirname,'../florr-local-site'));
  const contexts=[],connections=[],errors=[];let browser;
  try{
    const playerCount=Math.max(2,Math.min(12,Number(process.env.TEST_PLAYERS??8)));
    for(let i=0;i<playerCount;i++){
      const context=await request.newContext({timeout:25000});contexts.push(context);
      const username='verify_'+crypto.randomBytes(5).toString('hex'),password=crypto.randomBytes(16).toString('hex');
      const response=await context.post(target.origin+'/api/account/register',{data:{username,password}});assert.equal(response.status(),200);
      const session=await response.json();assert.equal(session.account.role,'player');assert.equal(Object.values(session.save.inventory).reduce((a,b)=>a+b,0),20);assert.ok(!session.save.debug&&!session.save.debugLevel);
      const login=await context.post(target.origin+'/api/account/login',{data:{username,password}});assert.equal(login.status(),200);assert.deepEqual((await login.json()).save.inventory,session.save.inventory);
      const cookie=(await context.storageState()).cookies.map(c=>`${c.name}=${c.value}`).join('; ');
      const ws=new WebSocket(target.origin.replace(/^http/,'ws')+'/ws',['florr-batch-v1','florr-delta-v1'],{headers:{Cookie:cookie,Origin:target.origin}}),frames=[];
      connections.push({ws,frames,session});
      ws.on('message',(data,binary)=>{try{const f=JSON.parse(binary?zlib.gunzipSync(data):data);if(f.type==='snapshot'){assert.ok(api.validate(f));frames.push(f);}}catch(e){errors.push(e.message);}});
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket open timeout')),20000);ws.once('open',()=>{clearTimeout(timer);resolve();});ws.once('error',e=>{clearTimeout(timer);reject(e);});});
      ws.send(JSON.stringify({type:'start',name:username}));
    }
    const [a]=connections;
    const allVisible=()=>connections.every(c=>connections.every(peer=>peer===c||c.frames.at(-1)?.players.some(p=>p.id===peer.session.account.id)));
    for(let i=0;i<70&&!allVisible();i++)await delay(100);
    assert.ok(allVisible());
    const before=a.frames.at(-1).self.x;
    a.ws.send(JSON.stringify({type:'input',seq:1,x:1,y:0,mode:'attack',defend:false}));
    for(let i=0;i<60&&!(a.frames.at(-1)?.inputAck===1&&a.frames.at(-1).self.x>before+2);i++)await delay(100);
    assert.ok(a.frames.at(-1).self.x>before+2);assert.equal(a.frames.at(-1).inputAck,1);
    for(const c of connections)c.ws.close(1000);
    await delay(300);
    browser=await chromium.launch({headless:true,channel:'chrome'});
    const context=await browser.newContext({storageState:await contexts[0].storageState(),viewport:{width:1280,height:800}}),page=await context.newPage(),failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    await page.goto(target.href,{waitUntil:'networkidle',timeout:60000});await page.waitForFunction(()=>!document.querySelector('.boot-screen'),null,{timeout:60000});
    await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForTimeout(1500);
    assert.equal(await page.getByRole('button',{name:'Ready',exact:true}).isVisible(),false);
    const source=await(await contexts[0].get(target.origin+'/'+BUNDLE)).text();assert.ok(source.includes('recordOnlineMotion(this,e)'));
    const health=await(await contexts[0].get(target.origin+'/api/health')).json();assert.ok(health.ok);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    let existingGameStatus=null;
    if(process.env.LEGACY_URL){
      const old=await contexts[0].get(process.env.LEGACY_URL);assert.equal(old.status(),200);existingGameStatus=old.status();
    }
    fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/public-playing.png'});
    const report={ok:true,url:target.href,registrationReward:20,rarity:'Super',role:'player',testedPlayers:playerCount,multiplayerVisibility:true,movementAcknowledged:true,frames:connections.map(c=>c.frames.length),browserErrors:errors,failedRequests:failed,health,existingGameStatus};
    fs.writeFileSync('test-results/public-deployment-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{for(const c of connections)c.ws.terminate();if(browser)await browser.close();for(const c of contexts)await c.dispose();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
