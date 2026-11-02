'use strict';
// Shared by Node and the browser. A negotiated protocol, independent of the
// captured client's gzip/batch formats. All authoritative numbers are lossless.
var AshWire=(()=>{
  const PROTOCOL='ashflor-binary-v1',MAX_BYTES=2*1024*1024,MAX_ITEMS=500000,MAX_STRINGS=8192;
  const utf8=new TextEncoder(),text=new TextDecoder('utf-8',{fatal:true});
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const safe=k=>k!=='__proto__'&&k!=='constructor'&&k!=='prototype';
  function copy(v){if(Array.isArray(v))return v.map(x=>x===undefined?null:copy(x));if(object(v)){const out={};for(const k of Object.keys(v))if(v[k]!==undefined&&safe(k))out[k]=copy(v[k]);return out;}return v;}
  function clean(v,depth=0){
    if(depth>64)throw Error('Value too deep');
    if(Array.isArray(v)){for(let i=0;i<v.length;i++)if(v[i]===undefined)v[i]=null;else clean(v[i],depth+1);}
    else if(object(v))for(const k of Object.keys(v)){if(v[k]===undefined||!safe(k))delete v[k];else clean(v[k],depth+1);}
    return v;
  }
  const keyed=a=>a.length>0&&a.every(v=>object(v)&&(typeof v.id==='string'||typeof v.id==='number'))&&new Set(a.map(v=>v.id)).size===a.length;
  // 0 = replacement, 1 = object fields/deletions, 2 = array slots/length,
  // 3 = entities by stable id (order, creates, changes, removals).
  function diff(a,b){
    if(Object.is(a,b))return null;
    if(Array.isArray(a)&&Array.isArray(b)){
      if(keyed(a)&&keyed(b)){
        const old=new Map(a.map(v=>[v.id,v])),now=new Set(b.map(v=>v.id)),changes=[];
        for(const item of b){const patch=diff(old.get(item.id),item);if(patch)changes.push(item.id,patch);}
        const removed=a.filter(v=>!now.has(v.id)).map(v=>v.id),order=a.length===b.length&&a.every((v,i)=>v.id===b[i].id)?null:b.map(v=>v.id);
        return changes.length||removed.length||order?[3,order,changes,removed]:null;
      }
      const changes=[];for(let i=0;i<b.length;i++){const p=diff(a[i],b[i]);if(p)changes.push(i,p);}
      return changes.length||a.length!==b.length?[2,b.length,changes]:null;
    }
    if(object(a)&&object(b)){
      const changes=[],removed=[];
      for(const key of Object.keys(b)){const p=diff(a[key],b[key]);if(p)changes.push(key,p);}
      for(const key of Object.keys(a))if(!Object.hasOwn(b,key))removed.push(key);
      return changes.length||removed.length?[1,changes,removed]:null;
    }
    return [0,b];
  }
  function apply(a,p,depth=0){
    if(depth>64||!Array.isArray(p))throw Error('Invalid patch');
    if(p[0]===0&&p.length===2)return p[1];
    if(p[0]===1&&p.length===3&&object(a)){
      const out={...a};for(const k of p[2]){if(!safe(k))throw Error('Invalid key');delete out[k];}
      for(let i=0;i<p[1].length;i+=2){const k=p[1][i];if(typeof k!=='string'||!safe(k))throw Error('Invalid key');out[k]=apply(a[k],p[1][i+1],depth+1);}return out;
    }
    if(p[0]===2&&p.length===3&&Array.isArray(a)){
      if(!Number.isInteger(p[1])||p[1]<0||p[1]>MAX_ITEMS)throw Error('Invalid array length');
      const out=a.slice(0,p[1]);out.length=p[1];for(let i=0;i<p[2].length;i+=2){const k=p[2][i];if(!Number.isInteger(k)||k<0||k>=out.length)throw Error('Invalid index');out[k]=apply(a[k],p[2][i+1],depth+1);}return out;
    }
    if(p[0]===3&&p.length===4&&Array.isArray(a)){
      const items=new Map(a.map(v=>[v.id,v]));for(const id of p[3])items.delete(id);
      for(let i=0;i<p[2].length;i+=2){const id=p[2][i],v=apply(items.get(id),p[2][i+1],depth+1);if(v?.id!==id)throw Error('Entity identity mismatch');items.set(id,v);}
      const order=p[1]??a.map(v=>v.id);if(new Set(order).size!==order.length)throw Error('Duplicate entity');
      return order.map(id=>{if(!items.has(id))throw Error('Missing entity');return items.get(id);});
    }
    throw Error('Invalid patch baseline');
  }
  class Writer{
    constructor(strings){this.bytes=new Uint8Array(4096);this.view=new DataView(this.bytes.buffer);this.at=0;this.strings=strings;}
    reserve(n){if(this.at+n>MAX_BYTES)throw Error('Frame too large');if(this.at+n>this.bytes.length){const b=new Uint8Array(Math.min(MAX_BYTES,Math.max(this.bytes.length*2,this.at+n)));b.set(this.bytes);this.bytes=b;this.view=new DataView(b.buffer);}}
    byte(v){this.reserve(1);this.bytes[this.at++]=v;}
    uint(v){do{const next=v%128;v=Math.floor(v/128);this.byte(next+(v?128:0));}while(v);}
    value(v,depth=0){
      if(depth>64)throw Error('Value too deep');
      if(v===null){this.byte(0);return;}if(v===false){this.byte(1);return;}if(v===true){this.byte(2);return;}
      if(typeof v==='number'){
        if(!Number.isFinite(v))throw Error('Nonfinite wire number');
        if(Number.isSafeInteger(v)&&Math.abs(v)<=0xffffffff&&!Object.is(v,-0)){this.byte(v<0?4:3);this.uint(Math.abs(v));}
        else{this.byte(5);this.reserve(8);this.view.setFloat64(this.at,v,true);this.at+=8;}return;
      }
      if(typeof v==='string'){
        const known=this.strings.get(v);if(known!==undefined){this.byte(6);this.uint(known);return;}
        const bytes=utf8.encode(v);this.byte(7);this.uint(bytes.length);this.reserve(bytes.length);this.bytes.set(bytes,this.at);this.at+=bytes.length;
        if(this.strings.size<MAX_STRINGS)this.strings.set(v,this.strings.size);return;
      }
      if(Array.isArray(v)){this.byte(8);this.uint(v.length);for(const item of v)this.value(item,depth+1);return;}
      if(object(v)){const keys=Object.keys(v);this.byte(9);this.uint(keys.length);for(const key of keys){if(!safe(key))throw Error('Invalid key');this.value(key,depth+1);this.value(v[key],depth+1);}return;}
      throw Error('Unsupported wire value');
    }
  }
  class Reader{
    constructor(data,strings){this.bytes=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);if(this.bytes.length>MAX_BYTES)throw Error('Frame too large');this.view=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength);this.at=0;this.strings=strings;this.left=MAX_ITEMS;}
    byte(){if(this.at>=this.bytes.length)throw Error('Truncated frame');return this.bytes[this.at++];}
    uint(){let v=0,m=1;for(let i=0;i<8;i++){const b=this.byte();v+=(b&127)*m;if(!(b&128)){if(!Number.isSafeInteger(v))throw Error('Invalid integer');return v;}m*=128;}throw Error('Invalid varint');}
    value(depth=0){
      if(depth>64||--this.left<0)throw Error('Decode budget exceeded');const tag=this.byte();
      if(tag===0)return null;if(tag===1)return false;if(tag===2)return true;if(tag===3)return this.uint();if(tag===4)return-this.uint();
      if(tag===5){if(this.at+8>this.bytes.length)throw Error('Truncated number');const v=this.view.getFloat64(this.at,true);this.at+=8;if(!Number.isFinite(v))throw Error('Invalid number');return v;}
      if(tag===6){const id=this.uint();if(id>=this.strings.length)throw Error('Missing string');return this.strings[id];}
      if(tag===7){const n=this.uint();if(this.at+n>this.bytes.length)throw Error('Truncated string');const v=text.decode(this.bytes.subarray(this.at,this.at+n));this.at+=n;if(this.strings.length<MAX_STRINGS)this.strings.push(v);return v;}
      if(tag===8||tag===9){const n=this.uint();if(n>MAX_ITEMS)throw Error('Collection too large');const out=tag===8?[]:{};for(let i=0;i<n;i++){if(tag===8)out.push(this.value(depth+1));else{const k=this.value(depth+1);if(typeof k!=='string'||!safe(k)||Object.hasOwn(out,k))throw Error('Invalid key');out[k]=this.value(depth+1);}}return out;}
      throw Error('Invalid type tag');
    }
  }
  class Encoder{
    constructor(){this.seq=0;this.previous=null;this.strings=new Map();}
    prepare(frame,immutable=false){
      const next=immutable?clean(frame):copy(frame),reset=!this.previous||frame.map.roomId!==this.previous.map.roomId||this.seq%200===0;
      const strings=reset?new Map():new Map(this.strings),writer=new Writer(strings),seq=this.seq+1;
      writer.byte(65);writer.byte(83);writer.byte(1);writer.byte(reset?1:0);writer.uint(seq);writer.value(reset?[0,next]:diff(this.previous,next)??[1,[],[]]);
      const bytes=writer.bytes.slice(0,writer.at);
      return {bytes,commit:()=>{this.seq=seq;this.previous=next;this.strings=strings;}};
    }
  }
  class Decoder{
    constructor(){this.seq=0;this.previous=null;this.strings=[];}
    decode(data){
      const strings=this.strings.slice(),reader=new Reader(data,strings);
      if(reader.byte()!==65||reader.byte()!==83||reader.byte()!==1)throw Error('Unsupported wire version');
      const reset=reader.byte();if(reset!==0&&reset!==1)throw Error('Invalid reset');
      if(reset)strings.length=0;const seq=reader.uint();if(!reset&&seq!==this.seq+1)throw Error('Wire sequence mismatch');
      const patch=reader.value();if(reader.at!==reader.bytes.length)throw Error('Trailing bytes');
      if(reset&&patch[0]!==0)throw Error('Invalid keyframe');const frame=apply(reset?null:this.previous,patch);
      this.previous=frame;this.seq=seq;this.strings=strings;
      // Playback code can mutate its own objects; a retained decoder baseline
      // and older interpolation samples must never share those mutable values.
      return copy(frame);
    }
  }
  return {PROTOCOL,Encoder,Decoder};
})();
if(typeof module==='object'&&module.exports)module.exports=AshWire;
