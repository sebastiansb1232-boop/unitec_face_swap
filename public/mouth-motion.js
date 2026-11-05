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
  const out=points.map(p=>({...p})),margin=Math.min(.012,f.height*.1);
  for(const [ids,min,max] of [[INNER_UP,f.top+margin,f.bottom-margin],[INNER_DOWN,f.top+margin,f.bottom-margin]])for(const id of ids){
   const old=f.at(id),next=clamp(old,min,max);if(Math.abs(next-old)<.0001)continue;
   out[id].x+=(next-old)*f.width*f.y.x;out[id].y+=(next-old)*f.width*f.y.y;
   out[id].z=((points[0].z||0)+(points[17].z||0))/2;
  }
  if(points.stamp!==undefined)out.stamp=points.stamp;if(points.signals)out.signals=points.signals;return out;
 }
 function interiorMapper(destination,camera){
  const a=frame(destination),b=frame(camera),upper=f=>median([13,82,312].map(f.at)),lower=f=>median([14,87,317].map(f.at));
  const aTop=upper(a),aBottom=lower(a),bTop=upper(b),bBottom=lower(b),midA=(aTop+aBottom)/2,midB=(bTop+bBottom)/2;
  const heightA=Math.max(aBottom-aTop,.025),heightB=Math.max(bBottom-bTop,.015);
  // Solo la cavidad: reducir el muestreo evita tomar el labio de la cámara.
  return p=>{const dx=(p.x-a.origin.x)/a.width,dy=(p.y-a.origin.y)/a.width,u=(dx*a.x.x+dy*a.x.y)*.94,v=((dx*a.y.x+dy*a.y.y-midA)/heightA)*heightB*.88+midB;
   return {x:b.origin.x+b.width*(u*b.x.x+v*b.y.x),y:b.origin.y+b.width*(u*b.x.y+v*b.y.y)};
  };
 }
 const UP=[191,80,81,82,13,312,311,310,415],DOWN=[95,88,178,87,14,317,402,318,324],OUT_UP=[185,40,39,37,0,267,269,270,409],OUT_DOWN=[146,91,181,84,17,314,405,321,375];
 function localFrame(p){const dx=p[291].x-p[61].x,dy=p[291].y-p[61].y,w=Math.max(Math.hypot(dx,dy),1e-6),x={x:dx/w,y:dy/w};let y={x:-x.y,y:x.x};if((p[152].x-p[10].x)*y.x+(p[152].y-p[10].y)*y.y<0)y={x:-y.x,y:-y.y};return {x,y,w};}
 function localOpening(p){const f=localFrame(p);return median([[13,14],[82,87],[312,317]].map(([a,b])=>Math.max(0,((p[b].x-p[a].x)*f.y.x+(p[b].y-p[a].y)*f.y.y)/f.w)));}
 function isClosed(p,signals=p.signals){const open=localOpening(p);return open<.025||!!signals&&(signals.mouthClose>.72||signals.jawOpen<.025&&open<.08);}
 function retarget(reference,live,base,signals){
  const out=reference.map(p=>({...p})),f=localFrame(reference),sourceOpen=localOpening(reference);let current=localOpening(live);
  if(signals&&Number.isFinite(signals.jawOpen))current=Math.min(current,.12+signals.jawOpen*.95);
  if(isClosed(live,signals))current=0;
  const desired=isClosed(live,signals)?0:clamp(sourceOpen+current-localOpening(base),0,1.05),change=desired-sourceOpen;
  if(Math.abs(change)<1e-5)return {points:out,delta:0,closed:current===0};
  const center=(p,axis)=>(p[61][axis]+p[291][axis])/2,shift={x:clamp(center(live,'x')-center(base,'x'),-.05,.05),y:clamp(center(live,'y')-center(base,'y'),-.05,.05)},smile=clamp(localFrame(live).w/localFrame(base).w,.92,1.08),cx=center(reference,'x');
  for(let k=0;k<UP.length;k++){
   const a=UP[k],b=DOWN[k],gap=Math.max(0,(reference[b].x-reference[a].x)*f.y.x+(reference[b].y-reference[a].y)*f.y.y),u=(k+1)/10,weight=Math.sin(Math.PI*u),target=sourceOpen>.03?gap*desired/sourceOpen:Math.max(0,gap+change*f.w*weight),d=(target-gap)/2;
   for(const [id,direction] of [[a,-1],[OUT_UP[k],-1],[b,1],[OUT_DOWN[k],1]]){out[id].x=cx+(reference[id].x-cx)*smile+shift.x+f.y.x*d*direction;out[id].y=reference[id].y+shift.y+f.y.y*d*direction;}
  }
  return {points:out,delta:change,closed:current===0};
 }
 function seal(points){const out=points.map(p=>({...p}));for(let k=0;k<UP.length;k++){const a=UP[k],b=DOWN[k];for(const axis of ['x','y','z']){const mid=((points[a][axis]||0)+(points[b][axis]||0))/2;out[a][axis]=out[b][axis]=mid;}}return out;}
 const api={frame,aperture,sanitize,interiorMapper,localOpening,isClosed,retarget,seal};root.MouthMotion=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
