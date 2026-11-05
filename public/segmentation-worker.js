/* MediaPipe se ejecuta fuera del hilo de interfaz. Ninguna imagen sale del equipo. */
let taskPromise;
function task(){
  if(!taskPromise)taskPromise=(async()=>{
    // Worker clásico: el cargador WASM de esta versión utiliza importScripts.
    const {FilesetResolver,ImageSegmenter}=await import('./vendor/tasks-vision/vision_bundle.mjs');
    const files=await FilesetResolver.forVisionTasks(new URL('./vendor/tasks-vision/wasm',self.location.href).href);
    return ImageSegmenter.createFromOptions(files,{
      baseOptions:{modelAssetPath:new URL('./models/selfie_multiclass_256x256.tflite',self.location.href).href,delegate:'CPU'},
      runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true
    });
  })();
  return taskPromise;
}
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
self.onmessage=async({data})=>{
  const {id,bitmap}=data;
  try{
    const segmenter=await task();
    if(!bitmap){self.postMessage({id,ready:true});return;}
    const started=performance.now(),result=segmenter.segment(bitmap);
    try{
      const masks=result.confidenceMasks;if(!masks||masks.length<6)throw new Error('El modelo no devuelve las seis categorías esperadas.');
      const width=masks[0].width,height=masks[0].height;
      const hair=masks[1].getAsFloat32Array().slice(),skin=masks[2].getAsFloat32Array().slice(),face=masks[3].getAsFloat32Array().slice();
      const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height).data,channels=[[],[],[]],faceChannels=[[],[],[]],backgroundChannels=[[],[],[]],background=masks[0].getAsFloat32Array();
      for(let i=0;i<hair.length;i+=2)for(let c=0;c<3;c++){
        if(hair[i]>.85)channels[c].push(pixels[i*4+c]/255);
        if(face[i]>.85)faceChannels[c].push(pixels[i*4+c]/255);
        if(background[i]>.95&&i<width*height*.75)backgroundChannels[c].push(pixels[i*4+c]/255);
      }
      const tone=channels[0].length>12?channels.map(median):null;
      const faceTone=faceChannels[0].length>12?faceChannels.map(median):null;
      const backgroundTone=backgroundChannels[0].length>30?backgroundChannels.map(median):null;
      const backgroundSpread=backgroundTone?median(backgroundChannels[0].map((_,i)=>Math.hypot(...backgroundTone.map((v,c)=>backgroundChannels[c][i]-v)))):1;
      self.postMessage({id,width,height,hair,skin,face,tone,faceTone,backgroundTone,backgroundSpread,elapsed:performance.now()-started},[hair.buffer,skin.buffer,face.buffer]);
    }finally{result.close();}
  }catch(error){self.postMessage({id,error:error.message||'No se pudo segmentar el cabello.'});}
  finally{bitmap?.close();}
};
