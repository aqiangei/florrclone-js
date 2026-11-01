'use strict';
const PICKUP_BUDGET=128,VISIBLE_BUDGET=256,CELL=256;
// Keep every unexpired reward. The grid narrows work; a bounded max-heap
// selects nearest items without sorting or allocating a record for every drop.
class LootField{
  constructor(api){this.api=api;this.source=null;this.knownLength=0;this.cells=new Map();this.entries=new WeakMap();this.ids=new Map();this.stats={peakDrops:0,invalidDrops:0,expiredDrops:0,collectedDrops:0,pickupCandidates:0,viewCandidates:0};}
  valid(d){return d&&typeof d==='object'&&Number.isSafeInteger(d.id)&&d.id>=0&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&Number.isFinite(d.life)&&d.life>0&&Object.hasOwn(this.api.petals,d.type)&&Number.isInteger(d.rarity)&&d.rarity>=0&&d.rarity<this.api.rarityCount;}
  place(d,entry){
    const cx=Math.floor(d.x/CELL),cy=Math.floor(d.y/CELL),key=`${cx},${cy}`;if(entry.key===key)return;
    this.unplace(d,entry);let cell=this.cells.get(key);if(!cell){cell=new Set();cell.cx=cx;cell.cy=cy;this.cells.set(key,cell);}cell.add(d);entry.key=key;
  }
  unplace(d,entry){if(entry.key===undefined)return;const cell=this.cells.get(entry.key);cell?.delete(d);if(!cell?.size)this.cells.delete(entry.key);entry.key=undefined;}
  ensure(drops){
    if(this.source!==drops||drops.length<this.knownLength){this.source=drops;this.knownLength=0;this.cells.clear();this.entries=new WeakMap();this.ids.clear();}
    for(let i=this.knownLength;i<drops.length;i++){
      const d=drops[i];if(!this.valid(d)||this.ids.has(d.id)){this.stats.invalidDrops++;continue;}
      const entry={slot:i,key:undefined};this.entries.set(d,entry);this.ids.set(d.id,d);this.place(d,entry);
    }
    this.knownLength=drops.length;this.stats.peakDrops=Math.max(this.stats.peakDrops,this.ids.size);
  }
  removeAt(slot){
    const drops=this.source,d=drops[slot],entry=d&&typeof d==='object'?this.entries.get(d):null;
    if(entry){this.unplace(d,entry);this.entries.delete(d);this.ids.delete(d.id);}
    const last=drops.pop();if(slot<drops.length){drops[slot]=last;const moved=this.entries.get(last);if(moved)moved.slot=slot;}
    this.knownLength=drops.length;
  }
  begin(drops,dt){
    this.ensure(drops);
    for(let i=0;i<drops.length;){const d=drops[i],entry=d&&typeof d==='object'?this.entries.get(d):null;
      if(!entry){this.removeAt(i);continue;}
      d.life-=dt;if(d.life<=0||!Number.isFinite(d.life)){this.stats.expiredDrops++;this.removeAt(i);}else i++;
    }
  }
  moved(candidates){
    for(const d of candidates??[]){const entry=this.entries.get(d);if(!entry)continue;
      if(d.life<=0){this.stats.collectedDrops++;this.removeAt(entry.slot);}else if(Number.isFinite(d.x)&&Number.isFinite(d.y))this.place(d,entry);
    }
  }
  nearest(engine,radius,limit,pickup=false){
    const heap=[],r2=radius*radius,burrow=engine.burrowLeft>0,reach=burrow?engine.radius+9:28;
    const worse=(a,b)=>a.distance>b.distance||a.distance===b.distance&&a.drop.id>b.drop.id;
    const consider=d=>{
      if(!(d.life>0)||!engine.ownsWorldDrop(d))return;
      const distance=(d.x-engine.x)**2+(d.y-engine.y)**2;
      if(distance>r2||pickup&&(burrow||d.type==='Blood Sacrifice')&&distance>=reach*reach)return;
      const key=pickup?'pickupCandidates':'viewCandidates';this.stats[key]++;
      if(heap.length===limit&&(distance>heap[0].distance||distance===heap[0].distance&&d.id>=heap[0].drop.id))return;
      const item={drop:d,distance};
      if(heap.length<limit){heap.push(item);let i=heap.length-1;while(i>0){const parent=(i-1)>>1;if(!worse(heap[i],heap[parent]))break;[heap[i],heap[parent]]=[heap[parent],heap[i]];i=parent;}}
      else{heap[0]=item;let i=0;for(;;){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&worse(heap[child+1],heap[child]))child++;if(!worse(heap[child],heap[i]))break;[heap[i],heap[child]]=[heap[child],heap[i]];i=child;}}
    };
    const left=Math.floor((engine.x-radius)/CELL),top=Math.floor((engine.y-radius)/CELL),width=Math.ceil(2*radius/CELL)+1,height=width;
    if(width*height>this.cells.size*4){for(const cell of this.cells.values()){if(cell.cx<left||cell.cx>left+width||cell.cy<top||cell.cy>top+height)continue;for(const d of cell)consider(d);}}
    else for(let dx=0;dx<=width;dx++)for(let dy=0;dy<=height;dy++){const cell=this.cells.get(`${left+dx},${top+dy}`);if(cell)for(const d of cell)consider(d);}
    return heap.sort((a,b)=>a.distance-b.distance||a.drop.id-b.drop.id).map(item=>item.drop);
  }
  pickup(engine){return this.nearest(engine,engine.burrowLeft>0?engine.radius+9:Math.max(28,120+(engine.pickup??0)),PICKUP_BUDGET,true);}
  visible(engine,range){return this.nearest(engine,range+80,VISIBLE_BUDGET);}
}
module.exports={LootField,PICKUP_BUDGET,VISIBLE_BUDGET};
