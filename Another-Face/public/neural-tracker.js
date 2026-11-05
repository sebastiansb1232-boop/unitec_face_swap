/* Una captura en vuelo. Si OffscreenCanvas no funciona, permite el seguimiento habitual. */
(function(root){
  'use strict';
  class NeuralTracker{
    constructor(){this.disabled=!(root.Worker&&root.OffscreenCanvas&&root.createImageBitmap);this.pending=new Map();this.id=0;this.worker=null;this.ready=null;}
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
      this.worker=new Worker('tracking-worker.js?v=7');
      this.worker.onmessage=event=>{
        const item=this.pending.get(event.data.id);if(!item)return;
        this.pending.delete(event.data.id);clearTimeout(item.timer);
        if(event.data.error)item.reject(new Error(event.data.error));else item.resolve(event.data);
      };
      this.worker.onerror=error=>this.fail(error);this.worker.onmessageerror=error=>this.fail(error);
      this.ready=this.request('init',{},[],60000);return this.ready;
    }
    async track(source,options={}){
      if(this.disabled)return null;
      try{
        await this.start();const image=await createImageBitmap(source);
        try{return await this.request('frame',{image,refine:options.refine!==false},[image]);}
        finally{image.close();}
      }catch(error){this.fail(error);return null;}
    }
  }
  root.NeuralTracker=NeuralTracker;
})(typeof window!=='undefined'?window:globalThis);
