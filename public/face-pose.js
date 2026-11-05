/* Marco facial 3D: pose instantánea separada de identidad y expresión. */
(function(root){
  'use strict';
  const A=root.FaceAppearance||(typeof require==='function'?require('./face-appearance'):null);
  const clamp=A.clamp,dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  const mul=(p,s)=>({x:p.x*s,y:p.y*s,z:p.z*s});
  const length=p=>Math.hypot(p.x,p.y,p.z),unit=p=>mul(p,1/Math.max(length(p),1e-8));
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const pixel=(p,width)=>({x:p.x,y:p.y,z:(p.z||0)*width});
  function basis(points,width=1){
    const at=i=>pixel(points[i],width),left=at(33),right=at(263),chin=at(152),forehead=at(10),eye=sub(right,left),scale=Math.max(length(eye),1e-6),x=unit(eye);
    let vertical=sub(at(2),at(168));
    if(length(vertical)<scale*.06)vertical=sub(chin,forehead);
    let orthogonal=sub(vertical,mul(x,dot(vertical,x)));
    if(length(orthogonal)<scale*.04){vertical=sub(chin,forehead);orthogonal=sub(vertical,mul(x,dot(vertical,x)));}
    if(length(orthogonal)<scale*.04)orthogonal={x:-x.y,y:x.x,z:0};
    let y=unit(orthogonal);
    if(dot(y,sub(chin,forehead))<0)y=mul(y,-1);
    let z=unit(cross(x,y));if(z.z<0)z=mul(z,-1);
    const origin={x:(left.x+right.x)/2,y:(left.y+right.y)/2,z:(left.z+right.z)/2};
    return {origin,x,y,z,scale,width,yaw:Math.atan2(x.z,Math.hypot(x.x,x.y)),pitch:Math.atan2(y.z,Math.hypot(y.x,y.y))};
  }
  function normalize(points,width=1,b=basis(points,width)){
    return points.slice(0,468).map(p=>{const d=sub(pixel(p,width),b.origin);return {x:dot(d,b.x)/b.scale,y:dot(d,b.y)/b.scale,z:dot(d,b.z)/b.scale};});
  }
  function project(local,b){
    return local.map(p=>({x:b.origin.x+b.scale*(p.x*b.x.x+p.y*b.y.x+p.z*b.z.x),y:b.origin.y+b.scale*(p.x*b.x.y+p.y*b.y.y+p.z*b.z.y),z:(b.origin.z+b.scale*(p.x*b.x.z+p.y*b.y.z+p.z*b.z.z))/b.width}));
  }
  function fuseViews(views){
    const valid=(views||[]).filter(v=>v.points?.length>=468),front=valid.find(v=>v.side==='front')||valid[0];if(!front)return null;
    const expressive=new Set([...A.EYES.flat(),...A.LIPS]);
    const shapes=valid.map(v=>({shape:normalize(v.points,v.width||1),pose:basis(v.points,v.width||1),weight:v===front?1:.32}));
    const frontal=normalize(front.points,front.width||1);
    return frontal.map((p,i)=>{
      if(expressive.has(i))return {...p};
      const value={x:0,y:0,z:0};let sum=0;
      for(const view of shapes){
        const near=p.x*view.pose.yaw>=0,weight=view.weight*(Math.abs(view.pose.yaw)<.2?1:near?1:.2);sum+=weight;
        for(const axis of ['x','y','z'])value[axis]+=view.shape[i][axis]*weight;
      }
      return {x:value.x/sum,y:value.y/sum,z:value.z/sum};
    });
  }
  function validateView(points,width,side){
    if(!points||points.length<468||points.some(p=>![p.x,p.y,p.z||0].every(Number.isFinite)))return 'No se pudo obtener una malla facial completa.';
    const pose=basis(points,width),yaw=Math.abs(pose.yaw);
    if(side==='front'&&yaw>.48)return 'La foto frontal debe mirar hacia la cámara.';
    if(side!=='front'&&(yaw<.18||yaw>1.38))return 'Utiliza un perfil de tres cuartos: gira aproximadamente entre 25 y 70 grados, con ambos ojos visibles.';
    return null;
  }
  class Stabilizer{
    reset(){this.filters=null;this.time=null;this.previous=null;}
    constructor(){this.reset();}
    filter(points,width,amount,now){
      const b=basis(points,width),local=normalize(points,width,b),elapsed=this.time===null?33:now-this.time,dt=clamp(elapsed/1000,.008,.1);
      if(!this.filters||elapsed>300){this.filters=local.map(()=>[new A.EuroFilter(),new A.EuroFilter(),new A.EuroFilter()]);}
      this.time=now;
      const stable=local.map((p,i)=>{
        const fast=A.EXPRESSIVE.has(i),cutoff=fast?20:7,beta=fast?45:25,values=['x','y','z'].map((axis,k)=>this.filters[i][k].filter(p[axis],dt,cutoff,beta));
        return {x:p.x+(values[0]-p.x)*amount,y:p.y+(values[1]-p.y)*amount,z:p.z+(values[2]-p.z)*amount};
      });
      const out=project(stable,b);return out.concat(points.slice(468).map(p=>({...p})));
    }
  }
  const api={basis,normalize,project,fuseViews,validateView,Stabilizer,cross,dot,sub,length};
  root.FacePose=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
