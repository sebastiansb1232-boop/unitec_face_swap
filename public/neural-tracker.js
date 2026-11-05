/* Una captura en vuelo. Si OffscreenCanvas no funciona, permite el seguimiento habitual. */
(function(root){
  'use strict';
  class NeuralTracker{
    constructor(role='live'){this.role=role;this.disabled=!(root.Worker&&root.OffscreenCanvas&&root.createImageBitmap);this.pending=new Map();this.id=0;this.worker=null;this.ready=null;}
    reset(){this.lastPoints=null;this.lastRegion=null;this.frames=0;}
    request(type,body={},transfer=[],timeout=20000){
      return new Promise((resolve,reject)=>{
        const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('El seguimiento tardó demasiado.'));},timeout);
        this.pending.set(id,{resolve,reject,timer});
        try{this.worker.postMessage({id,type,...body},transfer);}
        catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
      });
    }
    fail(error){
      if(this.disabled&&this.failure)return;
      this.failure=error?.message||'Seguimiento en segundo plano desactivado.';
      this.disabled=true;this.worker?.terminate();this.worker=null;
      for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('Seguimiento no disponible en segundo plano.'));}
      this.pending.clear();
    }
    start(){
      if(this.ready)return this.ready;
      this.worker=new Worker('tracking-worker.js?v=18');
      this.worker.onmessage=event=>{
        const item=this.pending.get(event.data.id);if(!item)return;
        this.pending.delete(event.data.id);clearTimeout(item.timer);
        if(event.data.error)item.reject(new Error(event.data.error));else item.resolve(event.data);
      };
      this.worker.onerror=error=>this.fail(error);this.worker.onmessageerror=error=>this.fail(error);
      this.ready=this.request('init',{role:this.role,forceCPU:this.forceCPU===true},[],60000).then(info=>{this.backend=info.backend;return info;});return this.ready;
    }
    async track(source,options={}){
      if(this.disabled)return null;
      try{
        await this.start();
        const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;
        const region=this.role==='live'&&root.TrackingRegion?root.TrackingRegion.plan(this.lastPoints,w,h,options.inputSize||512,options.reset||!this.lastPoints||(this.frames||0)%12===0):null;
        const changed=region&&this.lastRegion&&(region.cropped!==this.lastRegion.cropped||Math.abs(Math.log(region.width/this.lastRegion.width))>.18);this.lastRegion=region;
        const image=region?await createImageBitmap(source,region.x,region.y,region.width,region.height,{resizeWidth:region.outputW,resizeHeight:region.outputH,resizeQuality:'high'}):await createImageBitmap(source);
        try{const result=await this.request('frame',{image,refine:options.refine!==false,reset:options.reset===true||!!changed,timestamp:options.timestamp??root.performance?.now?.()??Date.now()},[image]);
          if(region)result.landmarks=root.TrackingRegion.restore(result.landmarks,region);
          this.frames=(this.frames||0)+1;this.lastPoints=result.landmarks?.length>=468?result.landmarks:null;
          result.tracking={detected:result.landmarks?.length||0,cropped:!!region?.cropped,inputW:image.width,inputH:image.height};return result;
        }
        finally{image.close();}
      }catch(error){
        if(!this.forceCPU&&this.backend==='tasks-gpu'){
          this.worker?.terminate();this.worker=null;this.ready=null;this.forceCPU=true;
          for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();
          return this.track(source,options);
        }
        this.fail(error);return null;
      }
    }
  }
  root.NeuralTracker=NeuralTracker;
})(typeof window!=='undefined'?window:globalThis);
