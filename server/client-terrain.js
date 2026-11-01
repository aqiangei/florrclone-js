// One failed decorative image must not disable all map textures. Readiness is
// represented by the loaded-tile count so cached terrain repaints on recovery.
const ashTerrainLoads=new WeakMap();
function ashLoadTerrainTiles(definitions,cache,progress){
  let state=ashTerrainLoads.get(cache);
  if(!state){state={pending:new Map(),attempts:new Map(),failed:new Set()};ashTerrainLoads.set(cache,state);}
  async function load(id,file){
    if(cache.has(id))return;
    if(state.pending.has(id))return state.pending.get(id);
    const attempt=(state.attempts.get(id)??0)+1;state.attempts.set(id,attempt);
    const job=(async()=>{
      const img=new Image();let timer;
      try{
        img.src='/assets/world-tiles/'+file;
        await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Tile decode timeout')),5000);})]);
        const tile=document.createElement('canvas');tile.width=tile.height=256;
        const context=tile.getContext('2d');if(!context)throw Error('Tile canvas unavailable');
        context.drawImage(img,0,0,256,256);cache.set(id,tile);state.failed.delete(id);progress();
      }catch(error){
        state.failed.add(id);
        if(attempt<3)setTimeout(()=>void load(id,file),500*attempt);
        else console.warn('Terrain tile unavailable:',file,error.message);
      }finally{clearTimeout(timer);state.pending.delete(id);}
    })();
    state.pending.set(id,job);return job;
  }
  return Promise.all(Object.entries(definitions).map(([id,file])=>load(Number(id),file)));
}
function ashTerrainFallback(cache,id){
  const family=id>=1&&id<=5?[1,2,3,4,5]:id>=6&&id<=9?[6,7,8,9]:id>=10&&id<=13?[10,11,12,13]:[];
  for(const alternative of family){const tile=cache.get(alternative);if(tile)return tile;}
}
