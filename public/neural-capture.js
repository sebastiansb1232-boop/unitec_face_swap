/* Imagen y detección de una foto comparten un único fotograma inmutable. */
(function(root){
 'use strict';
 async function captureFaceSnapshot(video,width,height,options){
  const source=document.createElement('canvas');source.width=width;source.height=height;source.getContext('2d').drawImage(video,0,0,width,height);
  const capturedAt=root.performance.now();let result=await options.tracker.track(source,{refine:true,inputSize:768});
  if(result&&!result.landmarks&&result.tracking?.cropped)result=await options.tracker.track(source,{refine:true,inputSize:768,reset:true});
  if(!result&&options.fallback)result=await options.fallback(source);
  if(!result?.landmarks||result.landmarks.length<468)throw new Error('No se detectó un rostro en la foto. Vuelve al encuadre y repite la captura.');
  const raw=result.landmarks.map(p=>({x:options.mirror?1-p.x:p.x,y:p.y,z:p.z||0}));
  let points=raw.map(p=>({x:p.x*width,y:p.y*height,z:p.z}));points.stamp=capturedAt;if(result.signals)points.signals=result.signals;
  if(root.MouthMotion)points=root.MouthMotion.sanitize(points);
  const display=document.createElement('canvas');display.width=width;display.height=height;const x=display.getContext('2d');if(options.mirror){x.translate(width,0);x.scale(-1,1);}x.drawImage(source,0,0);
  return {source,display,raw,points,capturedAt};
 }
 root.captureFaceSnapshot=captureFaceSnapshot;if(typeof module!=='undefined')module.exports=captureFaceSnapshot;
})(typeof window!=='undefined'?window:globalThis);
