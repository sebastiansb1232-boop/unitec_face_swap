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
      if(data.purpose==='skin'){
        const skin=masks[2].getAsFloat32Array().slice(),face=masks[3].getAsFloat32Array().slice(),canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height).data,facial=[[],[],[]],body=[[],[],[]];
        // La piel no necesita máscaras de pelo ni estadísticas del fondo.
        // Usar las mismas medianas YUV que las referencias evita mezclar
        // canales RGB de zonas con distinta iluminación.
        for(let i=0;i<skin.length;i+=2){if(face[i]<.85&&skin[i]<.9)continue;const r=pixels[i*4]/255,g=pixels[i*4+1]/255,b=pixels[i*4+2]/255,c=[.299*r+.587*g+.114*b,-.168736*r-.331264*g+.5*b,.5*r-.418688*g-.081312*b];for(let k=0;k<3;k++){if(face[i]>.85)facial[k].push(c[k]);if(skin[i]>.9)body[k].push(c[k]);}}
        self.postMessage({id,width,height,skin,face,faceToneYUV:facial[0].length>12?facial.map(median):null,skinToneYUV:body[0].length>12?body.map(median):null,elapsed:performance.now()-started},[skin.buffer,face.buffer]);return;
      }
      const hair=masks[1].getAsFloat32Array().slice(),skin=masks[2].getAsFloat32Array().slice(),face=masks[3].getAsFloat32Array().slice();
      const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height).data,channels=[[],[],[]],faceChannels=[[],[],[]],skinChannels=[[],[],[]],backgroundChannels=[[],[],[]],background=masks[0].getAsFloat32Array();
      for(let i=0;i<hair.length;i+=2)for(let c=0;c<3;c++){
        if(hair[i]>.85)channels[c].push(pixels[i*4+c]/255);
        if(face[i]>.85)faceChannels[c].push(pixels[i*4+c]/255);
        if(skin[i]>.9)skinChannels[c].push(pixels[i*4+c]/255);
        if(background[i]>.95&&i<width*height*.75)backgroundChannels[c].push(pixels[i*4+c]/255);
      }
      const tone=channels[0].length>12?channels.map(median):null;
      const faceTone=faceChannels[0].length>12?faceChannels.map(median):null;
      const skinTone=skinChannels[0].length>12?skinChannels.map(median):null;
      const backgroundTone=backgroundChannels[0].length>30?backgroundChannels.map(median):null;
      const backgroundSpread=backgroundTone?median(backgroundChannels[0].map((_,i)=>Math.hypot(...backgroundTone.map((v,c)=>backgroundChannels[c][i]-v)))):1;
      self.postMessage({id,width,height,hair,skin,face,tone,faceTone,skinTone,backgroundTone,backgroundSpread,elapsed:performance.now()-started},[hair.buffer,skin.buffer,face.buffer]);
    }finally{result.close();}
  }catch(error){self.postMessage({id,error:error.message||'No se pudo segmentar el cabello.'});}
  finally{bitmap?.close();}
};
