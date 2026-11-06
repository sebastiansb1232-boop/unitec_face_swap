/* Recorte de cámara anterior al reescalado; todas las salidas siguen normalizadas. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const outline=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,1];
 function plan(points,width,height,limit=512,global=false){
  if(!(width>0&&height>0))return null;
  let x=0,y=0,w=width,h=height;
  if(!global&&points?.length>=468){
   const p=outline.map(i=>points[i]);
   if(p.every(v=>Number.isFinite(v?.x)&&Number.isFinite(v?.y))){
    const x0=Math.min(...p.map(v=>v.x))*width,x1=Math.max(...p.map(v=>v.x))*width,y0=Math.min(...p.map(v=>v.y))*height,y1=Math.max(...p.map(v=>v.y))*height;
    const side=Math.max((x1-x0)*1.75,(y1-y0)*1.45);
    if(side>35&&side<Math.max(width,height)*1.15){w=Math.min(width,Math.ceil(side));h=Math.min(height,Math.ceil(side));x=Math.round(clamp((x0+x1-w)/2,0,width-w));y=Math.round(clamp((y0+y1-h)/2,0,height-h));}
   }
  }
  const scale=Math.min(1,clamp(limit,192,768)/Math.max(w,h));
  return {x,y,width:w,height:h,outputW:Math.max(1,Math.round(w*scale)),outputH:Math.max(1,Math.round(h*scale)),sourceW:width,sourceH:height,cropped:w<width||h<height};
 }
 function restore(points,region){return !points||!region?points:points.map(p=>({...p,x:(region.x+p.x*region.width)/region.sourceW,y:(region.y+p.y*region.height)/region.sourceH,z:(p.z||0)*region.width/region.sourceW}));}
 function sequence(points,width,height,limit,previous,force=false){
  const candidate=plan(points,width,height,limit,force||!points);
  if(force||!previous||!points||previous.sourceW!==width||previous.sourceH!==height)return candidate;
  const scale=Math.min(1,clamp(limit,192,768)/Math.max(previous.width,previous.height));
  if(previous.outputW!==Math.round(previous.width*scale)||previous.outputH!==Math.round(previous.height*scale))return candidate;
  // Mantener el marco permite reutilizar el seguimiento temporal de VIDEO.
  // Solo reencuadrar cuando la cara alcanza el margen o cambia mucho de tamaño.
  const p=outline.map(i=>points[i]);if(!p.every(v=>Number.isFinite(v?.x)&&Number.isFinite(v?.y)))return candidate;
  const xs=p.map(v=>v.x*width),ys=p.map(v=>v.y*height),pad=Math.min(previous.width,previous.height)*.1;
  const inside=Math.min(...xs)>previous.x+pad&&Math.max(...xs)<previous.x+previous.width-pad&&Math.min(...ys)>previous.y+pad&&Math.max(...ys)<previous.y+previous.height-pad;
  const fit=candidate&&candidate.width/previous.width;
  return inside&&fit>.72&&fit<1.36&&previous.cropped?previous:candidate;
 }
 function same(a,b){return !!a&&!!b&&['x','y','width','height','outputW','outputH','sourceW','sourceH'].every(k=>a[k]===b[k]);}
 function usable(points,width,height){
  if(points?.length<468||!points?.every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Number.isFinite(p?.z??0)&&p.x>-.5&&p.x<1.5&&p.y>-.5&&p.y<1.5))return false;
  const span=Math.hypot((points[33].x-points[263].x)*width,(points[33].y-points[263].y)*height),heightPx=Math.hypot((points[10].x-points[152].x)*width,(points[10].y-points[152].y)*height);
  return span>=3&&heightPx>=12&&span<width*1.1&&heightPx<Math.max(width,height)*1.5;
 }
 const api={plan,restore,sequence,same,usable};root.TrackingRegion=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
