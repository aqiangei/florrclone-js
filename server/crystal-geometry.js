'use strict';
var AshCrystalGeometry=class{
  constructor(width=2400,height=1800){this.width=width;this.height=height;this.center={x:width/2,y:height/2};this.crystalRadius=140;}
  isFreeCircle(x,y,r){return x>=r&&y>=r&&x<=this.width-r&&y<=this.height-r&&Math.hypot(x-this.center.x,y-this.center.y)>=this.crystalRadius+r;}
  projectInside(x,y,r){x=Math.max(r,Math.min(this.width-r,x));y=Math.max(r,Math.min(this.height-r,y));const dx=x-this.center.x,dy=y-this.center.y,d=Math.hypot(dx,dy),min=this.crystalRadius+r+.01;if(d<min){x=this.center.x+(d?dx/d:1)*min;y=this.center.y+(d?dy/d:0)*min;}return{x,y};}
  firstHit(x,y,dx,dy,r){let hit=null;const add=(time,nx,ny)=>{if(time>=0&&time<=1&&(!hit||time<hit.time)&&dx*nx+dy*ny<0)hit={time,nx,ny};};if(dx<0)add((r-x)/dx,1,0);if(dx>0)add((this.width-r-x)/dx,-1,0);if(dy<0)add((r-y)/dy,0,1);if(dy>0)add((this.height-r-y)/dy,0,-1);const ox=x-this.center.x,oy=y-this.center.y,a=dx*dx+dy*dy,b=2*(ox*dx+oy*dy),c=ox*ox+oy*oy-(r+this.crystalRadius)**2,d=b*b-4*a*c;if(a&&d>=0){const t=(-b-Math.sqrt(d))/(2*a),px=ox+dx*t,py=oy+dy*t,len=Math.hypot(px,py)||1;add(t,px/len,py/len);}return hit;}
  moveCircle(x,y,dx,dy,r,mode='slide'){({x,y}=this.projectInside(x,y,r));let hit=false,nx=0,ny=0;for(let i=0;i<3;i++){const h=this.firstHit(x,y,dx,dy,r);if(!h){x+=dx;y+=dy;break;}hit=true;nx=h.nx;ny=h.ny;x+=dx*h.time+nx*.01;y+=dy*h.time+ny*.01;if(mode==='stop')break;dx*=1-h.time;dy*=1-h.time;const dot=dx*nx+dy*ny;if(dot<0){dx-=dot*nx;dy-=dot*ny;}}return{...this.projectInside(x,y,r),hit,nx,ny};}
  sampleFree(r,rng=Math.random){return this.projectInside(r+rng()*(this.width-2*r),r+rng()*(this.height-2*r),r);}
};
if(typeof module!=='undefined'&&module.exports)module.exports=AshCrystalGeometry;
