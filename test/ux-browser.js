'use strict';
const {createServer}=require('../server/server'),{chromium}=require('playwright');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});const app=createServer({dbPath:'test-results/ux-browser-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`,browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
 try{
  const contexts=[];for(const mobile of [false,true]){
   const ctx=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1280,height:800}});contexts.push(ctx);
   const res=await ctx.request.post(base+'/api/account/register',{data:{username:'ux_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(12).toString('hex')}});assert.equal(res.status(),200);const account=await res.json();
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.ashflor-tools'));
   const c=app.clients.get(account.account.id);c.room.mobs.length=0;c.engine.save.inventory['Rose:0']=100;c.engine.save.inventory['Moon Rock:6']=5;
   // Guild popup uses the original client form and the new durable API.
   await page.locator('.ashflor-tools').getByRole('button',{name:'Guild',exact:true}).click();const guild=page.getByRole('dialog',{name:'Guild',exact:true});await guild.getByRole('textbox',{name:'Guild name',exact:true}).fill('guild_'+crypto.randomBytes(3).toString('hex'));await guild.getByRole('button',{name:'Create guild'}).click();await page.waitForFunction(()=>!!document.querySelector('.guild-title'));await guild.getByRole('button',{name:'Close Guild',exact:true}).click();
   await page.getByRole('button',{name:'Ready',exact:true}).click();await page.waitForTimeout(1700);assert.equal(c.engine.state,'playing');c.engine.invuln=100000;
   await page.locator('.ashflor-roster').waitFor();await page.waitForTimeout(500);const map=await page.locator('.minimap-wrap').boundingBox(),roster=await page.locator('.ashflor-roster').boundingBox();assert.ok(roster.x>=(mobile?200:950),JSON.stringify({map,roster}));assert.ok(roster.y>=map.y+map.height-1,JSON.stringify({map,roster}));
   if(mobile){
    const stick=page.getByLabel('Movement joystick');await stick.waitFor();const r=await stick.boundingBox(),x=c.engine.x;
    // CDP dispatches real touch events, including pointer capture and cancel.
    const session=await ctx.newCDPSession(page);const center={x:r.x+r.width/2,y:r.y+r.height/2};
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:center.x,y:center.y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+40,y:center.y,id:1}]});await page.waitForTimeout(400);await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(100);assert.ok(c.engine.x>x+5);assert.equal(c.engine.input.x,0);
    const attack=await page.getByRole('button',{name:'Attack',exact:true}).boundingBox();await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:attack.x+attack.width/2,y:attack.y+attack.height/2,id:2}]});await page.waitForTimeout(350);assert.equal(c.engine.mode,'attack');await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);assert.equal(c.engine.mode,'normal');
   }
   await page.locator('.ashflor-tools').getByRole('button',{name:'Settings',exact:true}).click();const settings=page.getByRole('dialog',{name:'Settings',exact:true});await settings.getByRole('button',{name:'Controls',exact:true}).click();const inversion=settings.getByLabel('Invert attack button',{exact:true});await inversion.check();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('petal-garden-settings')).invertAttack),true);await inversion.uncheck();await settings.getByRole('button',{name:'Close Settings',exact:true}).click();
   await page.keyboard.press('z');if(mobile&&!await page.getByRole('region',{name:'Inventory panel'}).count()){}const inventory=page.locator('.inventory-panel');await inventory.waitFor();await page.waitForTimeout(600);await inventory.getByLabel('Search petals',{exact:true}).fill('Rose');await inventory.getByRole('button',{name:'Common Rose ×100',exact:true}).click();await inventory.getByRole('button',{name:'Equip slot 2',exact:true}).click();await page.waitForTimeout(150);assert.equal(c.engine.save.loadout[1].type,'Rose');await inventory.getByRole('button',{name:'Close panel'}).click();await page.waitForTimeout(700);
   await page.keyboard.press('c');const craft=page.locator('.craft-panel');await craft.waitFor();await page.waitForTimeout(600);await craft.getByRole('button',{name:'Craft inventory',exact:true}).click();await page.waitForTimeout(400);assert.ok(c.craftJob.attempts>0);assert.ok(c.engine.save.inventory['Rose:0']<5);await craft.getByRole('button',{name:'Close panel'}).click();await page.waitForTimeout(700);
   c.combatStats.dealt=1234;await page.locator('.ashflor-tools').getByRole('button',{name:'Combat stats',exact:true}).click();const stats=page.locator('.ashflor-dialog');await stats.getByText('1,234',{exact:true}).waitFor();await page.keyboard.press('Escape');
   await page.locator('.ashflor-tools').getByRole('button',{name:'中文',exact:true}).click();await page.locator('.ashflor-tools').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('dialog',{name:'设置',exact:true}).getByRole('button',{name:'操作',exact:true}).click();await page.getByLabel('反转攻击开关',{exact:true}).waitFor();await page.getByRole('button',{name:'Close 设置',exact:true}).click();
   await page.screenshot({path:`test-results/ux-${mobile?'mobile':'desktop'}.png`});assert.equal(await page.evaluate(()=>localStorage.getItem('ashflor-language')),'zh');
   await page.reload({waitUntil:'networkidle'});await page.locator('.ashflor-tools').getByRole('button',{name:'设置',exact:true}).waitFor();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,desktopAndMobile:true,touchMovementAndCancel:true,equipment:true,batchCrafting:true,guildPopup:true,languagePersists:true,errors},null,2));
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
