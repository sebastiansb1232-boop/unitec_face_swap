/* Color coherente por identidad, calculado una vez por fotografía o resultado. */
(function(root){
 'use strict';
 const A=root.FaceAppearance||(typeof require==='function'?require('./face-appearance'):null),clamp=A.clamp;
 const quantile=(v,q)=>{const s=v.slice().sort((a,b)=>a-b);return s[Math.floor((s.length-1)*q)];};
 function statistics(colors){
  if(colors.length<12)return null;
  const data=colors.map(A.yuv),mean=[0,1,2].map(i=>quantile(data.map(p=>p[i]),.5)),spread=Math.max(.018,quantile(data.map(p=>p[0]),.8)-quantile(data.map(p=>p[0]),.2));return {mean,spread};
 }
 function correction(source,target){
  if(!source||!target)return {gain:[1,1,1],offset:[0,0,0]};
  // El matiz se unifica; la exposición se acerca con moderación para conservar
  // relieve y evitar blanquear un perfil tomado con otra iluminación.
  const gain=[clamp(Math.sqrt(target.spread/Math.max(source.spread,.018)),.97,1.03),1,1];
  return {gain,offset:target.mean.map((v,i)=>clamp((v-source.mean[i]*gain[i])*(i?1:.35),i?-.15:-.10,i?.15:.10))};
 }
 function apply(color,t,amount=1){const out=A.rgb(A.yuv(color).map((v,i)=>v*t.gain[i]+t.offset[i]));return out.map((v,i)=>clamp(color[i]+(v-color[i])*amount,0,1));}
 function sample(image,points){
  if(!root.document||!points||points.length<468)return null;
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height,scale=Math.min(1,256/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
  const width=(a,b)=>Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y),left=width(33,133),right=width(263,362),regions=[[50,101,118],[280,330,347],[151,108,337]],colors=[];
  for(let k=0;k<regions.length;k++){
   if(k===0&&left<right*.5||k===1&&right<left*.5)continue;
   const ids=regions[k],x=ids.reduce((s,i)=>s+points[i].x/ids.length,0)*scale,y=ids.reduce((s,i)=>s+points[i].y/ids.length,0)*scale,r=Math.max(2,Math.min(8,width(33,263)*scale*.08)),x0=Math.max(0,Math.round(x-r)),y0=Math.max(0,Math.round(y-r)),x1=Math.min(c.width,Math.round(x+r+1)),y1=Math.min(c.height,Math.round(y+r+1));
   if(x1<=x0||y1<=y0)continue;const p=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;for(let i=0;i<p.length;i+=4)if(p[i+3]>240)colors.push([p[i]/255,p[i+1]/255,p[i+2]/255]);
  }
  return statistics(colors);
 }
 function prepare(canvas,points,target,source){
  if(!target||!points||points.length<468)return canvas;const t=correction(source||sample(canvas,points),target);
  if(t.offset.every(v=>Math.abs(v)<.001)&&t.gain.every(v=>Math.abs(v-1)<.003))return canvas;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,canvas.width,canvas.height),mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;const m=mask.getContext('2d'),hull=root.PortraitQuality?.silhouetteIds(points)||[10,338,454,397,152,172,234,109],center=hull.reduce((p,id)=>({x:p.x+points[id].x/hull.length,y:p.y+points[id].y/hull.length}),{x:0,y:0});
  const path=(ids,inset=0)=>{m.beginPath();ids.forEach((id,i)=>m[i?'lineTo':'moveTo'](points[id].x+(center.x-points[id].x)*inset,points[id].y+(center.y-points[id].y)*inset));m.closePath();};
  const eyeSpan=Math.hypot(points[33].x-points[263].x,points[33].y-points[263].y);m.filter='blur('+Math.max(2,eyeSpan*.08)+'px)';path(hull,.10);m.fillStyle='white';m.fill();m.filter='none';m.globalCompositeOperation='destination-in';path(hull);m.fill();
  m.filter='blur('+Math.max(1,eyeSpan*.012)+'px)';m.globalCompositeOperation='destination-out';const eyeWidth=k=>{const [a,b]=k?[263,362]:[33,133];return Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y);};
  for(let k=0;k<2;k++)if(eyeWidth(k)>eyeWidth(1-k)*.4){path(A.EYES[k]);m.fill();}path(A.LIPS.slice(0,20));m.fill();const weights=m.getImageData(0,0,mask.width,mask.height).data,p=data.data;
  for(let i=0;i<p.length;i+=4){const weight=weights[i+3]/255;if(!weight)continue;const r=p[i]/255,g=p[i+1]/255,b=p[i+2]/255,y=(.299*r+.587*g+.114*b)*t.gain[0]+t.offset[0],u=(-.168736*r-.331264*g+.5*b)+t.offset[1],v=(.5*r-.418688*g-.081312*b)+t.offset[2];p[i]=Math.round(clamp(r+(y+1.402*v-r)*weight,0,1)*255);p[i+1]=Math.round(clamp(g+(y-.344136*u-.714136*v-g)*weight,0,1)*255);p[i+2]=Math.round(clamp(b+(y+1.772*u-b)*weight,0,1)*255);}
  ctx.putImageData(data,0,0);return canvas;
 }
 function balance(image,points,target,source){if(!target||!source)return image;const t=correction(source,target);if(t.offset.every(v=>Math.abs(v)<.001)&&t.gain.every(v=>Math.abs(v-1)<.003))return image;const c=document.createElement('canvas');c.width=image.naturalWidth||image.width;c.height=image.naturalHeight||image.height;c.getContext('2d').drawImage(image,0,0);return prepare(c,points,target,source);}
 const api={statistics,correction,apply,sample,prepare,balance};root.ReferenceTone=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
