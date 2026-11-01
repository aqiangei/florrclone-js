// Display-rate playback of authoritative petal samples. The simulation remains
// on the server; interpolation does not infer petal rules or apply any damage.
const onlineMotionHistory=new WeakMap();
function recordOnlineMotion(engine,snapshot){
  const now=engine.clock.now(),room=snapshot.map.roomId;
  let history=onlineMotionHistory.get(engine);
  if(!history||history.room!==room||history.state!==snapshot.self.state||
    Math.hypot(snapshot.self.x-(history.samples.at(-1)?.snapshot.self.x??snapshot.self.x),snapshot.self.y-(history.samples.at(-1)?.snapshot.self.y??snapshot.self.y))>250){
    history={room,state:snapshot.self.state,samples:[],gap:0};onlineMotionHistory.set(engine,history);
  }
  const last=history.samples.at(-1);
  if(last)history.gap=Math.max(Math.min(200,now-last.at),history.gap*.98);
  history.samples.push({at:now,snapshot});if(history.samples.length>10)history.samples.shift();
}
function smoothOnlineMotion(engine){
  const history=onlineMotionHistory.get(engine);if(!history||history.samples.length<2)return;
  const samples=history.samples,latest=samples.at(-1),now=engine.clock.now();
  const delay=Math.min(200,Math.max(80,1000/(latest.snapshot.rates.snapshotHz||20)+15,history.gap+15));
  const renderAt=now-delay;
  let from=samples[0],to=from;
  for(let i=1;i<samples.length;i++){to=samples[i];if(to.at>=renderAt)break;from=to;}
  const fraction=to.at===from.at?1:Math.max(0,Math.min(1,(renderAt-from.at)/(to.at-from.at)));
  function ring(petals,body,a,b){
    for(let i=0;i<petals.length;i++){
      const petal=petals[i],start=a.petals[i],end=b.petals[i];
      if(!petal||!start||!end||start.type!==end.type||start.rarity!==end.rarity||
        start.spawnTime!==end.spawnTime||!!start.dropped!==!!end.dropped||petal.type!==end.type||petal.rarity!==end.rarity||
        petal.spawnTime!==end.spawnTime||!!petal.dropped!==!!end.dropped)continue;
      const interpolate=(p,q)=>{
        const ax=p.x-(end.dropped?0:a.x),ay=p.y-(end.dropped?0:a.y);
        const bx=q.x-(end.dropped?0:b.x),by=q.y-(end.dropped?0:b.y);
        return {x:ax+(bx-ax)*fraction+(end.dropped?0:body.x),y:ay+(by-ay)*fraction+(end.dropped?0:body.y)};
      };
      Object.assign(petal,interpolate(start,end));
      for(let unit=0;unit<(petal.motion?.length??0);unit++){
        const p=start.motion?.[unit],q=end.motion?.[unit];
        if(p&&q)Object.assign(petal.motion[unit],interpolate(p,q));
      }
    }
  }
  ring(engine.petals,engine,from.snapshot.self,to.snapshot.self);
  const oldPlayers=new Map(from.snapshot.players.map(p=>[p.id,p])),newPlayers=new Map(to.snapshot.players.map(p=>[p.id,p]));
  for(const player of engine.remotePlayers){const a=oldPlayers.get(player.id),b=newPlayers.get(player.id);if(a&&b)ring(player.petals,player,a,b);}
}
