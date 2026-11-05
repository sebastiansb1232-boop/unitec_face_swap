/* Segmentación de la referencia una sola vez; no se ejecuta por fotograma. */
(function(root){
 'use strict';
 async function prepare(reference,client){
  if(reference.renderImage)return reference;
  try{
   const data=await client.segment(reference.image,512),mask=document.createElement('canvas');mask.width=data.width;mask.height=data.height;const m=mask.getContext('2d'),pixels=m.createImageData(mask.width,mask.height);
   for(let i=0;i<data.face.length;i++){
    const confidence=Math.max(data.face[i],data.skin[i]),t=Math.max(0,Math.min(1,(confidence-.10)/.65));pixels.data.set([255,255,255,Math.round(t*t*(3-2*t)*255)],i*4);
   }
   m.putImageData(pixels,0,0);
   // Los ojos y la abertura oral son parte del retrato, no agujeros del fondo.
   const w=reference.image.naturalWidth||reference.image.width,h=reference.image.naturalHeight||reference.image.height;
   const eyeWidth=k=>{const [a,b]=k?[263,362]:[33,133];return Math.hypot(reference.points[a].x-reference.points[b].x,reference.points[a].y-reference.points[b].y);};
   m.fillStyle='white';for(const ids of [...root.FaceAppearance.EYES.filter((_,k)=>eyeWidth(k)>eyeWidth(1-k)*.45),root.FaceAppearance.LIPS.slice(0,20)]){m.beginPath();ids.forEach((id,k)=>m[k?'lineTo':'moveTo'](reference.points[id].x/w*mask.width,reference.points[id].y/h*mask.height));m.closePath();m.fill();}
   const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(reference.image,0,0);x.globalCompositeOperation='destination-in';x.drawImage(mask,0,0,w,h);reference.renderImage=c;reference.matteReady=true;
  }catch(error){reference.matteError=error.message;}
  return reference;
 }
 root.ReferenceMatte={prepare};
})(typeof window!=='undefined'?window:globalThis);
