'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
class AccountError extends Error {constructor(status,message){super(message);this.status=status;}}
class Accounts {
  constructor(db,api){
    this.db=db;this.api=api;db.accounts??={};this.pending=new Set();
    this.names=new Map(Object.values(db.accounts).map(a=>[a.username.toLowerCase(),a.id]));
    this.rewardPool=Object.entries(api.petals).filter(([,p])=>(p.minRarity??0)<=7&&!p.social&&!p.command).map(([type])=>type);
  }
  accountFor(token){const id=this.db.sessions[token]?.accountId;return id?this.db.accounts[id]:undefined;}
  async register(username,password){
    this.validate(username,password);const key=username.toLowerCase();
    if(this.names.has(key)||this.pending.has(key))throw new AccountError(409,'Username already taken');
    this.pending.add(key);
    try{
      const salt=crypto.randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,64)).toString('hex');
      const save=this.api.defaults();save.name=username;
      // A single registration grant; login never runs this branch.
      for(let i=0;i<20;i++){const type=this.rewardPool[crypto.randomInt(this.rewardPool.length)],item=`${type}:7`;save.inventory[item]=(save.inventory[item]??0)+1;}
      const id=crypto.randomUUID(),account={id,username,salt,passwordHash:hash,save,starterReward:{version:1,rarity:7,count:20,grantedAt:Date.now()}};
      this.db.accounts[id]=account;this.names.set(key,id);return account;
    }finally{this.pending.delete(key);}
  }
  async login(username,password){
    this.validate(username,password);
    const id=this.names.get(username.toLowerCase()),account=this.db.accounts[id];
    // Keep the expensive password check on missing accounts as well.
    const hash=await scrypt(password,account?.salt??'00000000000000000000000000000000',64);
    if(!account||!crypto.timingSafeEqual(hash,Buffer.from(account.passwordHash,'hex')))throw new AccountError(401,'Invalid credentials');
    return account;
  }
  validate(username,password){
    if(typeof username!=='string'||!/^[A-Za-z0-9_]{3,24}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128)
      throw new AccountError(400,'Username must be 3–24 letters, digits or underscores; password must be 10–128 characters');
  }
  issue(account){const token=crypto.randomBytes(32).toString('hex');this.db.sessions[token]={accountId:account.id};return token;}
  public(account){return {id:account.id,username:account.username,role:'player'};}
}
module.exports={Accounts,AccountError};
