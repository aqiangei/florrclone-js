'use strict';
const {createServer}=require('../server/server'),{chromium}=require('playwright');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
  const app=createServer({dbPath:'test-results/ui-register-db.json'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${app.server.address().port}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!document.querySelector('.boot-screen'));
    await page.getByRole('button',{name:'Ready',exact:true}).click();
    await page.getByRole('button',{name:'Register',exact:true}).click();
    const username='ui_'+crypto.randomBytes(4).toString('hex'),password=crypto.randomBytes(12).toString('hex');
    await page.getByLabel('Username',{exact:true}).fill(username);
    await page.getByLabel('Password',{exact:true}).fill(password);
    await page.getByLabel('Confirm password',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    for(let i=0;i<100&&app.clients.size!==1;i++)await page.waitForTimeout(100);
    assert.equal(app.clients.size,1);
    const c=[...app.clients.values()][0];assert.equal(c.account.username,username);
    assert.equal(Object.values(c.engine.save.inventory).reduce((a,b)=>a+b,0),20);
    assert.equal(c.engine.save.debug,false);assert.equal(c.engine.save.debugLevel,false);
    assert.ok(Object.keys(c.engine.save.inventory).every(k=>k.endsWith(':7')));
    assert.deepEqual(errors,[]);await page.screenshot({path:'test-results/registered-reward.png'});
    console.log(JSON.stringify({ok:true,registeredInUI:true,rewardCount:20,rarity:'Super',role:'player',errors}));
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
