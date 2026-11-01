'use strict';
const {createServer}=require('../server/server'),{BUNDLE}=require('../server/engine'),Wire=require('../server/wire');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});const app=createServer({dbPath:'test-results/reliability-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'msedge'}),base=`http://127.0.0.1:${app.server.address().port}`,results=[];
  try{
    for(const mobile of [false,true]){
      const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
      try{
        const auth=await context.request.post(base+'/api/account/register',{data:{username:'stable_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});assert.equal(auth.status(),200);const account=await auth.json();
        const page=await context.newPage(),errors=[],breaks=new Set();let closes=0,grassAttempts=0;
        page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>{const decoder=new Wire.Decoder();ws.on('close',()=>closes++);ws.on('framereceived',f=>{if(typeof f.payload!=='string')try{for(const v of decoder.decode(f.payload).visuals??[])if(v.kind==='break')breaks.add(v.petal.type);}catch(e){errors.push(e.message);}});});
        await page.route('**/'+BUNDLE,async route=>{const response=await route.fetch();let body=await response.text();body=body.replace('connect(){this.disposed||this.connection.connect()}','connect(){globalThis.__observedEngine=this;this.disposed||this.connection.connect()}').replace('function p(){return l.size}','function p(){return l.size}globalThis.__terrainProbe={ready:p,tiles:l,paint:y};');await route.fulfill({response,body});});
        await page.route('**/assets/world-tiles/grass_c_0.svg',route=>++grassAttempts===1?route.fulfill({status:503,body:'temporary failure'}):route.continue());
        await page.route('**/assets/world-tiles/bush_t_0.svg',route=>route.fulfill({status:503,body:'decoration unavailable'}));
        await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForFunction(()=>globalThis.__observedEngine?.state==='playing');await page.bringToFront();
        await page.waitForFunction(()=>globalThis.__terrainProbe?.ready()===110);assert.ok(grassAttempts>=2);
        const terrain=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d'),painted=__terrainProbe.paint(ctx,'Garden',512,512),data=ctx.getImageData(0,0,512,512).data,colors=new Set();let opaque=0;for(let i=0;i<data.length;i+=64){if(data[i+3])opaque++;colors.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`);}return{painted,loaded:__terrainProbe.ready(),colors:colors.size,opaque};});
        assert.equal(terrain.painted,true);assert.ok(terrain.colors>10&&terrain.opaque>1000,JSON.stringify(terrain));
        const c=app.clients.get(account.account.id),e=c.engine;c.room.mobs=[];app.world.bind(c);e.invuln=10000;e.spawnTimer=-10000;
        for(const [type,petal]of Object.entries(app.api.petals))for(let rarity=petal.minRarity??0;rarity<8;rarity++)e.save.inventory[`${type}:${rarity}`]=20;
        e.save.loadout=[{type:'Coral',rarity:7},null,null,null,null];e.rebuildPetals();c.saveDirty=true;
        const coral=e.petals[0];e.breakCoral(coral,0);e.fadePetal(coral,1);e.fadePetal(coral,2);e.breakCoral(coral,1);e.fadePetal(coral,3);
        for(let i=0;i<40&&breaks.size<4;i++)await pause(25);
        for(const type of ['Coral','coral-piece-1a','coral-piece-1b','coral-piece-2'])assert.ok(breaks.has(type),JSON.stringify([...breaks]));
        await page.waitForTimeout(500);await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');
        await page.keyboard.press('z');await page.locator('.inventory-panel').waitFor();await page.waitForTimeout(700);
        const loadoutBefore=JSON.stringify(e.save.loadout),session=await context.newCDPSession(page);
        const point=()=>page.evaluate(()=>{const root=document.querySelector('.inventory-panel .inventory-scroll'),r=root.getBoundingClientRect();const cards=[...root.querySelectorAll('button.petal-card')].map(el=>({el,r:el.getBoundingClientRect()})).filter(({r:b})=>b.top>r.top+5&&b.bottom<r.bottom-5);cards.sort((a,b)=>Math.abs(a.r.y+a.r.height/2-(r.top+r.height/2))-Math.abs(b.r.y+b.r.height/2-(r.top+r.height/2)));const b=cards[0].r;return{x:b.x+b.width/2,y:b.y+b.height/2,top:r.top,bottom:r.bottom,scroll:root.scrollTop};});
        const touch=async(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
        if(mobile){
          const first=await point();await touch('touchStart',first.x,first.y);
          for(let i=1;i<=8;i++){await touch('touchMove',first.x,first.y-i*12);await page.waitForTimeout(18);}await touch('touchEnd');await page.waitForTimeout(350);
          const scrolled=await page.locator('.inventory-panel .inventory-scroll').evaluate(el=>el.scrollTop);assert.ok(scrolled>first.scroll+20,JSON.stringify({first,scrolled}));
          assert.equal(JSON.stringify(e.save.loadout),loadoutBefore);assert.equal(await page.locator('.petal-drag-ghost').count(),0);
          const next=await point(),slot=await page.locator('[data-petal-slot="0"][data-reserve="false"]').boundingBox();await touch('touchStart',next.x,next.y);
          for(let i=1;i<=10;i++){await touch('touchMove',next.x+(slot.x+slot.width/2-next.x)*i/10,next.y+(slot.y+slot.height/2-next.y)*i/10);await page.waitForTimeout(15);}await touch('touchEnd');await page.waitForTimeout(300);
          assert.equal(JSON.stringify(e.save.loadout),loadoutBefore,'a scroll ending over a slot cannot equip');
        }
        await page.locator('.inventory-panel').getByLabel('Search petals',{exact:true}).fill('Rose');await page.waitForTimeout(400);
        await page.evaluate(()=>{globalThis.__drops=[];window.addEventListener('petal-drop',e=>setTimeout(()=>__drops.push({item:e.detail.item,accepted:e.detail.accepted,target:e.detail.target?.outerHTML.slice(0,150)}),0));});
        const rose=await page.getByRole('button',{name:'Super Rose ×20',exact:true}).boundingBox({timeout:5000}),slot=await page.locator('[data-petal-slot="0"][data-reserve="false"]').boundingBox();assert.ok(rose&&slot);
        if(mobile){
          await touch('touchStart',rose.x+rose.width/2,rose.y+rose.height/2);await page.waitForTimeout(420);await touch('touchMove',rose.x+rose.width/2+12,rose.y+rose.height/2);await page.waitForTimeout(50);assert.equal(await page.locator('.petal-drag-ghost').count(),1);
          await touch('touchMove',slot.x+slot.width/2,slot.y+slot.height/2);await page.waitForTimeout(40);await touch('touchEnd');
        }else{await page.mouse.move(rose.x+rose.width/2,rose.y+rose.height/2);await page.mouse.down();await page.mouse.move(slot.x+slot.width/2,slot.y+slot.height/2,{steps:10});await page.mouse.up();}
        for(let i=0;i<40&&e.save.loadout[0]?.type!=='Rose';i++)await pause(25);if(e.save.loadout[0]?.type!=='Rose'){await page.screenshot({path:'test-results/drag-failure.png'});console.log(JSON.stringify({mobile,rose,slot,drop:await page.evaluate(()=>__drops),target:await page.evaluate(p=>document.elementFromPoint(p.x+p.width/2,p.y+p.height/2)?.outerHTML.slice(0,300),slot)}));}assert.equal(e.save.loadout[0]?.type,'Rose');
        assert.equal(e.state,'playing');assert.equal(closes,0);assert.deepEqual(errors,[]);await page.screenshot({path:`test-results/reliability-${mobile?'mobile':'desktop'}.png`});
        results.push({mobile,browser:'Edge',terrain,grassRetried:grassAttempts,coralBreaks:[...breaks],scrollDoesNotEquip:true,deliberateDragEquips:true,closes,errors});
        await page.evaluate(()=>globalThis.__observedEngine.sendCommand({type:'lobby'}));await page.waitForTimeout(100);
      }finally{await context.close();}
    }
    const report={ok:true,results};fs.writeFileSync('test-results/reliability-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
