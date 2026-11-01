'use strict';
const crypto=require('node:crypto');
const {AccountError}=require('./accounts');
class Social {
  constructor(db,clients,world){this.db=db;this.clients=clients;this.world=world;this.squads=new Map();db.guilds??={};db.guildInvites??={};this.invites=new Map();}
  error(message){throw new AccountError(409,message);}
  guild(a){return Object.values(this.db.guilds).find(g=>g.members.includes(a.id));}
  squad(c){return this.squads.get(c?.squadCode);}
  view(a){const g=this.guild(a),now=Date.now();return {selfId:a.id,canInvite:g?.leader===a.id,
    invites:(this.db.guildInvites[a.id]??[]).filter(i=>i.until>now&&this.db.guilds[i.guildId]).map(i=>({from:i.from,guild:this.db.guilds[i.guildId].name})),
    guild:g?{id:g.id,name:g.name,leader:this.db.accounts[g.leader]?.username??'',members:g.members.map(id=>({id,name:this.db.accounts[id]?.username??'',leader:id===g.leader,online:this.clients.has(id)}))}:null};}
  create(c,isPublic=false){this.leave(c);let code;do{code=crypto.randomBytes(4).toString('hex');}while(this.squads.has(code));
    const s={code,leaderId:c.id,public:isPublic,members:new Set([c.id]),ready:new Set(),biome:c.engine.save.biome,phase:'waiting',countdown:0};this.squads.set(code,s);c.squadCode=code;return s;}
  leave(c){const s=this.squad(c);delete c.squadCode;if(!s)return;s.members.delete(c.id);s.ready.delete(c.id);s.countdown=0;s.phase='waiting';
    if(!s.members.size)this.squads.delete(s.code);else if(s.leaderId===c.id)s.leaderId=s.members.values().next().value;}
  join(c,code){const s=this.squads.get(code.toLowerCase());if(!s)this.error('Squad not found');if(s.members.has(c.id))return;
    if(s.members.size>=4)this.error('Squad is full');if(s.phase!=='waiting')this.error('Squad has already started');if(c.engine.state==='playing')this.error('Return to the lobby before joining');
    this.leave(c);s.members.add(c.id);c.squadCode=s.code;c.engine.setBiome(s.biome);this.world.join(c);s.ready.clear();}
  command(c,m){const s=this.squad(c);switch(m.type){
    case 'squadCreate':if(c.engine.state!=='lobby')this.error('Return to the lobby first');this.create(c,m.public);break;
    case 'squadJoin':this.join(c,m.code);break;
    case 'squadFind':{if(c.engine.state!=='lobby')this.error('Return to the lobby first');const found=[...this.squads.values()].find(s=>s.public&&s.phase==='waiting'&&s.members.size<4&&s.biome===c.engine.save.biome&&!s.members.has(c.id));if(found)this.join(c,found.code);else this.create(c,true);break;}
    case 'squadLeave':this.leave(c);break;
    case 'squadPublic':if(!s||s.leaderId!==c.id)this.error('Only the squad leader can change visibility');s.public=m.public;break;
    case 'squadReady':if(!s)this.error('Create or join a squad first');if(s.phase==='playing'||s.phase==='ended')this.error('Return the squad to the lobby first');
      if(m.name)c.engine.save.name=m.name.trim().slice(0,20)||c.account.username;
      if(m.ready)s.ready.add(c.id);else s.ready.delete(c.id);
      if(s.ready.size===s.members.size){s.phase='countdown';s.countdown=3;}else{s.phase='waiting';s.countdown=0;}break;
    case 'squadReturn':if(!s||s.leaderId!==c.id)this.error('Only the squad leader can return everyone');for(const id of s.members){const p=this.clients.get(id);if(p){p.engine.state='lobby';p.engine.input={x:0,y:0};p.engine.save.biome=s.biome;this.world.join(p);}}s.phase='waiting';s.ready.clear();s.countdown=0;break;
    default:return false;
  }return true;}
  tick(dt){for(const s of this.squads.values()){
    if(s.phase==='countdown'){s.countdown=Math.max(0,s.countdown-dt);if(!s.countdown){s.phase='playing';for(const id of s.members){const c=this.clients.get(id);if(c){c.engine.start();this.world.bind(c);}}}}
    if(s.phase==='playing'&&[...s.members].every(id=>this.clients.get(id)?.engine.state!=='playing'))s.phase='ended';
  }}
  snapshot(c){const s=this.squad(c);if(!s)return null;return {code:s.code,leaderId:s.leaderId,selfId:c.id,public:s.public,mode:'adventure',biome:s.biome,phase:s.phase,countdown:s.countdown,
    members:[...s.members].map(id=>{const p=this.clients.get(id),e=p.engine;return {id,name:e.save.name,level:e.save.level,ready:s.ready.has(id),connected:true,state:e.state,hp:e.hp,maxHp:e.maxHp,loadout:e.save.loadout.slice(0,10),biome:e.save.biome};})};}
  async request(a,action,body){const g=this.guild(a),c=this.clients.get(a.id),now=Date.now();switch(action){
    case '':break;
    case 'create':{if(g)this.error('Leave your current guild first');const name=typeof body.name==='string'?body.name.trim():'';if(name.length<2||name.length>20||/[\u0000-\u001f<>]/.test(name))this.error('Guild name must contain 2–20 characters');if(Object.values(this.db.guilds).some(g=>g.name.toLowerCase()===name.toLowerCase()))this.error('Guild name already taken');const id=crypto.randomUUID();this.db.guilds[id]={id,name,leader:a.id,members:[a.id]};break;}
    case 'invite':{if(!g||g.leader!==a.id)this.error('Only the guild leader can invite');const target=Object.values(this.db.accounts).find(p=>p.username.toLowerCase()===String(body.username).toLowerCase());if(!target)this.error('Account not found');if(this.guild(target))this.error('Player already belongs to a guild');if(g.members.length>=50)this.error('Guild is full');this.db.guildInvites[target.id]=[{guildId:g.id,from:a.username,until:now+86400000}];break;}
    case 'respond':{if(typeof body.accept!=='boolean')this.error('Invalid response');const invite=(this.db.guildInvites[a.id]??[]).find(i=>i.until>now&&this.db.guilds[i.guildId]);if(!invite)this.error('Invitation expired');if(body.accept){if(g)this.error('Leave your current guild first');const target=this.db.guilds[invite.guildId];if(target.members.length>=50)this.error('Guild is full');target.members.push(a.id);}delete this.db.guildInvites[a.id];break;}
    case 'leave':if(g){g.members=g.members.filter(id=>id!==a.id);if(!g.members.length)delete this.db.guilds[g.id];else if(g.leader===a.id)g.leader=g.members[0];}break;
    case 'squad-invite':{const target=this.clients.get(body.target);if(!g||!target||!g.members.includes(target.id)||target.id===a.id)this.error('Guild member is not online');if(!c||c.engine.state!=='lobby'||target.engine.state==='playing')this.error('Both players must be in the lobby');let s=this.squad(c)??this.create(c);if(s.leaderId!==c.id)this.error('Only the squad leader can invite');if(s.members.size>=4)this.error('Squad is full');if(s.phase!=='waiting')this.error('Squad has already started');this.invites.set(target.id,{from:a.id,code:s.code,until:now+60000});target.ws.send(JSON.stringify({type:'squadInvite',fromId:a.id,from:a.username}));break;}
    case 'squad-respond':{if(typeof body.accept!=='boolean')this.error('Invalid response');const invite=this.invites.get(a.id);if(!invite||invite.until<now)this.error('Squad invitation expired');if(body.accept){if(!c)this.error('Connect to online play first');this.join(c,invite.code);}this.invites.delete(a.id);break;}
    default:throw new AccountError(404,'Not found');
  }return {view:this.view(a)};}
  recipients(c,channel){
    if(channel==='Public')return [...this.clients.values()];
    if(channel==='Local')return [...(c.room?.clients??[])];
    if(channel==='Squad'){const s=this.squad(c);return s?[...s.members].map(id=>this.clients.get(id)).filter(Boolean):[];}
    if(channel==='Guild'){const g=this.guild(c.account);return g?g.members.map(id=>this.clients.get(id)).filter(Boolean):[];}
    return [];
  }
}
module.exports={Social};
