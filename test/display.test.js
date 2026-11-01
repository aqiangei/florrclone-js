'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../server/client-display.js'),'utf8').split('function useAshDisplay(){')[0];
function setup({width=390,height=844,touch=true}={}){
  const events=()=>({listeners:{},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);},dispatchEvent(event){for(const fn of this.listeners[event.type]??[])fn(event);}});
  const document=Object.assign(events(),{documentElement:{},fullscreenElement:null}),window=events(),calls=[];
  const context={document,window,navigator:{maxTouchPoints:touch?1:0},matchMedia:()=>({matches:touch}),innerWidth:width,innerHeight:height,Event,
    screen:{orientation:Object.assign(events(),{lock:async mode=>{calls.push(mode);},unlock:()=>calls.push('unlock')})}};
  const succeed=()=>{calls.push('request');document.fullscreenElement=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
  document.documentElement.requestFullscreen=succeed;
  document.exitFullscreen=async()=>{calls.push('exit');document.fullscreenElement=null;document.dispatchEvent(new Event('fullscreenchange'));};
  vm.createContext(context);vm.runInContext(code+';globalThis.controller=ashDisplay();',context);
  return{context,document,window,calls,succeed,controller:context.controller};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('landscape action requests fullscreen before locking, reports manual rotation when lock fails',async()=>{
  const h=setup();
  h.context.screen.orientation.lock=async mode=>{h.calls.push(mode);throw Error('not supported');};
  assert.equal(await h.controller.enter(true),true);
  assert.deepEqual(h.calls,['request','landscape']);
  assert.equal(h.controller.snapshot().fullscreen,true);
  assert.equal(h.controller.snapshot().message,'Rotate your phone to landscape.');
  h.context.innerWidth=844;h.context.innerHeight=390;h.window.dispatchEvent(new Event('resize'));
  assert.equal(h.controller.snapshot().message,'');
});
test('rotation rejection retries on the next game gesture and respects browser exit',async()=>{
  const h=setup();let attempts=0;
  h.document.documentElement.requestFullscreen=()=>{attempts++;return Promise.reject(Error('activation required'));};
  h.context.innerWidth=844;h.context.innerHeight=390;h.window.dispatchEvent(new Event('resize'));await flush();
  assert.equal(attempts,1);assert.equal(h.controller.snapshot().message,'Tap Landscape game to enter fullscreen.');
  // Viewport resize without another rotation must not spam requests.
  h.window.dispatchEvent(new Event('resize'));await flush();assert.equal(attempts,1);
  h.document.documentElement.requestFullscreen=h.succeed;
  const gesture={type:'pointerup',isTrusted:true,target:{closest:()=>true}};
  h.document.dispatchEvent(gesture);await flush();assert.equal(h.controller.snapshot().fullscreen,true);
  await h.document.exitFullscreen();h.document.dispatchEvent(gesture);await flush();
  assert.equal(h.controller.snapshot().fullscreen,false);
  h.context.innerWidth=390;h.context.innerHeight=844;h.window.dispatchEvent(new Event('resize'));
  h.context.innerWidth=844;h.context.innerHeight=390;h.window.dispatchEvent(new Event('resize'));await flush();
  assert.equal(h.calls.filter(c=>c==='request').length,1);
  assert.equal(await h.controller.enter(false),true);
});
test('already-landscape loads wait for a gesture; desktop does not auto-enter',async()=>{
  for(const touch of [true,false]){
    const h=setup({width:844,height:390,touch});assert.deepEqual(h.calls,[]);
    h.document.dispatchEvent({type:'pointerup',isTrusted:true,target:{closest:()=>true}});await flush();
    assert.equal(h.controller.snapshot().fullscreen,touch);
  }
});
test('native exit suppresses rotation even before fullscreenchange arrives',async()=>{
  const h=setup();await h.controller.enter(false);
  h.document.fullscreenElement=null;
  h.context.innerWidth=844;h.context.innerHeight=390;h.window.dispatchEvent(new Event('resize'));await flush();
  assert.equal(h.controller.snapshot().fullscreen,false);
  assert.equal(h.calls.filter(c=>c==='request').length,1);
});
test('missing Fullscreen API is explicit, prefixed WebView API remains usable',async()=>{
  const h=setup();delete h.document.documentElement.requestFullscreen;
  assert.equal(await h.controller.enter(),false);
  assert.equal(h.controller.snapshot().message,'Fullscreen is unavailable in this browser.');
  h.document.documentElement.webkitRequestFullscreen=()=>{h.document.webkitFullscreenElement=h.document.documentElement;return Promise.resolve();};
  assert.equal(await h.controller.enter(),true);assert.equal(h.controller.snapshot().fullscreen,true);
});
