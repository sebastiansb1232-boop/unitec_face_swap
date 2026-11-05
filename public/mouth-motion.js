/* Labios como contorno; dientes y lengua se conservan como imagen interior. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const UPPER=[0,37,267],LOWER=[17,84,314],INNER_UP=[13,82,312,81,311,80,310],INNER_DOWN=[14,87,317,178,402,88,318];
 function frame(points){
  const a=points[61],b=points[291],dx=b.x-a.x,dy=b.y-a.y,width=Math.max(Math.hypot(dx,dy),1),x={x:dx/width,y:dy/width};let y={x:-x.y,y:x.x};
  if((points[152].x-points[10].x)*y.x+(points[152].y-points[10].y)*y.y<0)y={x:-y.x,y:-y.y};
  const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},heightAt=id=>((points[id].x-center.x)*y.x+(points[id].y-center.y)*y.y)/width,top=median(UPPER.map(heightAt)),bottom=median(LOWER.map(heightAt)),height=bottom-top;
  // Rechazar un contorno mal localizado en vez de convertirlo en una abertura.
  const valid=width>3&&height>.012&&height<1.8&&Math.abs(top)<1.1&&Math.abs(bottom)<1.6;
  return {origin:center,x,y,width,top,bottom,height:Math.max(height,.045),valid,at:heightAt};
 }
 function aperture(points){
  const f=frame(points),pairs=[[13,14],[82,87],[312,317]],gaps=pairs.map(([a,b])=>Math.max(0,f.at(b)-f.at(a)));
  const value=median(gaps);return f.valid?clamp(value,0,Math.max(0,f.bottom-f.top)):clamp(value,0,1.3);
 }
 function sanitize(points){
  const f=frame(points);if(!f.valid)return points;
  const out=points.map(p=>({...p})),margin=Math.min(.012,f.height*.1),middle=(f.top+f.bottom)/2;
  for(const [ids,min,max] of [[INNER_UP,f.top+margin,middle],[INNER_DOWN,middle,f.bottom-margin]])for(const id of ids){
   const old=f.at(id),next=clamp(old,min,max);if(Math.abs(next-old)<.0001)continue;
   out[id].x+=(next-old)*f.width*f.y.x;out[id].y+=(next-old)*f.width*f.y.y;
   out[id].z=((points[0].z||0)+(points[17].z||0))/2;
  }
  if(points.stamp!==undefined)out.stamp=points.stamp;return out;
 }
 function mapper(destination,camera){
  const a=frame(destination),b=frame(camera),height=Math.max(a.height,.045),sourceHeight=Math.max(b.height,.045),midA=(a.top+a.bottom)/2,midB=(b.top+b.bottom)/2;
  return p=>{const dx=(p.x-a.origin.x)/a.width,dy=(p.y-a.origin.y)/a.width,u=dx*a.x.x+dy*a.x.y,v=dx*a.y.x+dy*a.y.y,scaled=(v-midA)*sourceHeight/height+midB;
   return {x:b.origin.x+b.width*(u*b.x.x+scaled*b.y.x),y:b.origin.y+b.width*(u*b.x.y+scaled*b.y.y)};
  };
 }
 const api={frame,aperture,sanitize,mapper};root.MouthMotion=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
