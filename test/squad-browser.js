'use strict';
const {createServer}=require('../server/server'),{chromium}=require('playwright');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
(async()=>{
  const app=createServer({dbPath:'test-results/squad-browser-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`,browser=await chromium.launch({headless:true,channel:'chrome'}),players=[],errors=[];
  try{
    for(let i=0;i<2;i++){
      const context=await browser.newContext({viewport:{width:1280,height:800}}),username='squad_'+crypto.randomBytes(4).toString('hex');
      const response=await context.request.post(base+'/api/account/register',{data:{username,password:crypto.randomBytes(16).toString('hex')}});assert.equal(response.status(),200);const account=await response.json();
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Ready',exact:true}).waitFor();if(await page.locator('.ashflor-announce button').count())await page.locator('.ashflor-announce button').click();players.push({context,page,username,client:app.clients.get(account.account.id)});
    }
    const [a,b]=players;
    assert.equal((await a.context.request.post(base+'/api/guild/create',{data:{name:'squad_'+crypto.randomBytes(3).toString('hex')}})).status(),200);
    await a.context.request.post(base+'/api/guild/invite',{data:{username:b.username}});await b.context.request.post(base+'/api/guild/respond',{data:{accept:true}});
    for(const p of players){await p.page.getByRole('button',{name:'Ready',exact:true}).click();await p.page.waitForTimeout(1700);p.client.engine.invuln=100000;p.client.room.mobs=[];app.world.bind(p.client);p.client.engine.spawnTimer=-10000;}
    await a.page.getByRole('button',{name:'Guild',exact:true}).click();const guild=a.page.getByRole('dialog',{name:'Guild',exact:true});
    await guild.locator('.guild-title').waitFor();const desktopPanel=await guild.boundingBox();assert.ok(desktopPanel.x>=0&&desktopPanel.x+desktopPanel.width<=1280&&Math.abs(desktopPanel.x+desktopPanel.width/2-640)<2);await a.page.screenshot({path:'test-results/guild-after-desktop.png'});
    await a.page.setViewportSize({width:390,height:844});await a.page.waitForTimeout(200);
    const panel=await guild.boundingBox();assert.ok(panel.width>=350&&panel.x>=0&&panel.y>=0&&panel.y+panel.height<=844);
    await a.page.screenshot({path:'test-results/guild-after-mobile.png'});await a.page.setViewportSize({width:1280,height:800});
    await guild.getByRole('button',{name:'Invite to squad',exact:true}).click();await guild.getByText('Squad invitation sent.',{exact:true}).waitFor();
    await b.page.locator('.squad-invite-dialog').getByRole('button',{name:'Accept',exact:true}).click();
    await b.page.waitForTimeout(300);assert.equal(a.client.squadCode,b.client.squadCode);assert.equal(a.client.engine.state,'playing');assert.equal(b.client.engine.state,'playing');
    await guild.getByRole('button',{name:'Close Guild',exact:true}).click();
    async function chat(p,text){if(await p.page.locator('.chat-prompt').isVisible())await p.page.locator('.chat-prompt').click();await p.page.getByRole('textbox',{name:'Chat message',exact:true}).fill(text);await p.page.getByRole('textbox',{name:'Chat message',exact:true}).press('Enter');await p.page.waitForTimeout(200);}
    await chat(b,'/squad-leave');assert.equal(b.client.squadCode,undefined);
    await chat(a,'/squad-invite '+b.username);await b.page.locator('.squad-invite-dialog').waitFor();
    await b.page.locator('.squad-invite-dialog').getByRole('button',{name:'Decline',exact:true}).click();assert.equal(b.client.squadCode,undefined);
    await chat(a,'/squad-invite '+b.username);await b.page.locator('.squad-invite-dialog').getByRole('button',{name:'Accept',exact:true}).click();await b.page.waitForTimeout(300);assert.equal(a.client.squadCode,b.client.squadCode);
    assert.deepEqual(errors,[]);fs.writeFileSync('test-results/squad-browser-report.json',JSON.stringify({ok:true,guildQuickInvite:true,chatInvite:true,acceptAndDecline:true,continuesFight:true,errors},null,2));console.log('Guild quick invite and /squad-invite pass through real browser dialogs.');
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
