/* Geometría de identidad y expresión. No realiza reconocimiento biométrico. */
(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],
    [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
  const LIPS=[61,146,91,181,84,17,314,405,321,375,291,185,40,39,37,0,267,269,270,409,78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
  const BROWS=[70,63,105,66,107,55,65,52,53,46,300,293,334,296,336,285,295,282,283,276];
  const EXPRESSIVE=new Set([...EYES.flat(),...LIPS,...BROWS]);
  function basis(p){
    const a=p[33],b=p[263],scale=Math.max(distance(a,b),1e-6),x={x:(b.x-a.x)/scale,y:(b.y-a.y)/scale};
    let y={x:-x.y,y:x.x};
    if((p[152].x-p[10].x)*y.x+(p[152].y-p[10].y)*y.y<0)y={x:-y.x,y:-y.y};
    return {origin:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},x,y,scale};
  }
  function normalize(p){const b=basis(p);return p.map(q=>({x:((q.x-b.origin.x)*b.x.x+(q.y-b.origin.y)*b.x.y)/b.scale,y:((q.x-b.origin.x)*b.y.x+(q.y-b.origin.y)*b.y.y)/b.scale}));}
  function project(p,b){return p.map(q=>({x:b.origin.x+b.scale*(q.x*b.x.x+q.y*b.y.x),y:b.origin.y+b.scale*(q.x*b.x.y+q.y*b.y.y)}));}
  function alpha(cutoff,dt){const tau=1/(2*Math.PI*cutoff);return 1/(1+tau/dt);}
  class EuroFilter{
    reset(){this.value=null;this.raw=null;this.velocity=0;}
    constructor(){this.reset();}
    filter(value,dt,cutoff,beta){
      if(this.value===null){this.value=this.raw=value;return value;}
      const derivative=(value-this.raw)/dt;this.raw=value;
      this.velocity=mix(this.velocity,derivative,alpha(1.5,dt));
      this.value=mix(this.value,value,alpha(cutoff+beta*Math.abs(this.velocity),dt));return this.value;
    }
  }
  class ExpressionSmoother{
    constructor(){this.reset();}
    reset(){this.filters=[];this.time=null;this.last=null;}
    filter(points,amount,now){
      const n=normalize(points),b=basis(points),elapsed=this.time===null?33:now-this.time,dt=clamp(elapsed/1000,.004,.12);
      if(!this.last||elapsed>240||n.some((p,i)=>distance(p,this.last[i])>.5)){this.filters=n.map(()=>[new EuroFilter(),new EuroFilter()]);}
      this.time=now;this.last=n;
      const stable=n.map((p,i)=>{
        // Mucho menos retardo en párpados, labios y cejas que en las mejillas.
        const cutoff=EXPRESSIVE.has(i)?mix(30,13,amount):mix(30,2.8,amount),beta=EXPRESSIVE.has(i)?35:18;
        return {x:this.filters[i][0].filter(p.x,dt,cutoff,beta),y:this.filters[i][1].filter(p.y,dt,cutoff,beta)};
      });
      return amount<=0?points:project(stable,b).map((p,i)=>({...points[i],...p}));
    }
  }
  function transfer(live,neutral,target,amount,options={}){
    const n=normalize(live),b=basis(live),strength=clamp(amount,0,1),boundary=new Set(options.oval||[]);
    const desired=target.map((p,i)=>{
      const gain=EXPRESSIVE.has(i)?1:.82;
      return {x:p.x+clamp(n[i].x-neutral[i].x,-.35,.35)*gain,y:p.y+clamp(n[i].y-neutral[i].y,-.45,.45)*gain};
    });
    // La apertura es relativa al ojo neutral del conductor, no a una anatomía fija.
    EYES.forEach((ids,k)=>{
      const corners=k?[263,362]:[33,133],top=k?386:159,bottom=k?374:145;
      const sourceCenter={x:(target[corners[0]].x+target[corners[1]].x)/2,y:(target[corners[0]].y+target[corners[1]].y)/2};
      const neutralCenter={x:(neutral[corners[0]].x+neutral[corners[1]].x)/2,y:(neutral[corners[0]].y+neutral[corners[1]].y)/2};
      const center={x:sourceCenter.x+(n[corners[0]].x+n[corners[1]].x)/2-neutralCenter.x,y:sourceCenter.y+(n[corners[0]].y+n[corners[1]].y)/2-neutralCenter.y};
      const open=clamp(distance(n[top],n[bottom])/Math.max(distance(neutral[top],neutral[bottom]),.008),.025,1.65);
      for(const id of ids){desired[id]={x:desired[id].x,y:center.y+(target[id].y-sourceCenter.y)*open};}
    });
    return project(n.map((p,i)=>{
      const weight=boundary.has(i)&&!options.fullHead?strength*.18:strength;
      return {x:mix(p.x,desired[i].x,weight),y:mix(p.y,desired[i].y,weight)};
    }),b);
  }
  function affine(from,to){
    const s=to.scale/from.scale;
    const a=s*(to.x.x*from.x.x+to.y.x*from.y.x),c=s*(to.x.x*from.x.y+to.y.x*from.y.y);
    const b=s*(to.x.y*from.x.x+to.y.y*from.y.x),d=s*(to.x.y*from.x.y+to.y.y*from.y.y);
    return [a,b,c,d,to.origin.x-a*from.origin.x-c*from.origin.y,to.origin.y-b*from.origin.x-d*from.origin.y];
  }
  function yuv([r,g,b]){return [.299*r+.587*g+.114*b,-.168736*r-.331264*g+.5*b,.5*r-.418688*g-.081312*b];}
  function rgb([y,u,v]){return [y+1.402*v,y-.344136*u-.714136*v,y+1.772*u];}
  function medianColor(colors){
    if(!colors.length)return null;
    return [0,1,2].map(c=>{const v=colors.map(q=>q[c]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];});
  }
  function tint(color,source,target,strength=1){
    const c=yuv(color),s=yuv(source),t=yuv(target),gain=clamp(t[0]/Math.max(s[0],.03),.4,2.6);
    const corrected=rgb([clamp(t[0]+(c[0]-s[0])*gain,0,1),t[1]+(c[1]-s[1])*.3,t[2]+(c[2]-s[2])*.3]);
    return corrected.map((v,i)=>clamp(mix(color[i],v,strength),0,1));
  }
  const api={basis,normalize,project,transfer,affine,ExpressionSmoother,EuroFilter,EYES,LIPS,EXPRESSIVE,yuv,rgb,medianColor,tint,clamp,mix};
  root.FaceAppearance=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
