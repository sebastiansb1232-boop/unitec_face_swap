/* Solo envía fotogramas al motor de la computadora tras elegir este modo. */
(function(root){
  'use strict';
  class NeuralPortrait{
    constructor(status,onResult){this.status=status;this.onResult=onResult;this.epoch=0;this.enabled=false;this.busy=false;this.next=0;this.reference=null;this.token=null;this.last=null;this.arrivals=[];this.faceSize=320;this.maxFps=30;}
    reset(keepReference=false){this.epoch++;this.abort?.abort();this.last=null;this.arrivals=[];this.fps=0;this.next=0;if(!keepReference){this.reference=null;this.token=null;}}
    async available(){try{const r=await fetch('/api/neural/status',{signal:AbortSignal.timeout(8000)});this.engineInfo=await r.json();return r.ok&&this.engineInfo.ready===true;}catch{return false;}}
    async request(path,body,signal){
      const r=await fetch('/api/neural/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
      const data=await r.json();if(!r.ok){const error=new Error(data.error||'No se pudo procesar el fotograma.');error.status=r.status;throw error;}return data;
    }
    submit(frame,points,reference,settings,normalized){
      if(!this.enabled||this.busy||performance.now()<this.next||!reference)return false;
      const crop=root.neuralFaceCrop(points,frame.width,frame.height,this.faceSize);if(!crop)return false;
      this.busy=true;const epoch=this.epoch,controller=this.abort=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
      const canvas=document.createElement('canvas');canvas.width=crop.outputW;canvas.height=crop.outputH;canvas.getContext('2d').drawImage(frame,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
      const snapshot=crop.points,raw=normalized?.map(p=>({...p})),yaw=root.FaceAppearance.normalize(points)[1].x;
      const started=performance.now();let delivered=false;
      (async()=>{
        if(this.reference!==reference||!this.token){
          this.status(this.engineInfo?.mode==='remote'?'Preparando la referencia en el motor remoto del proyecto…':'Preparando la referencia en el motor de esta computadora…');
          const source=document.createElement('canvas');source.width=reference.image.width;source.height=reference.image.height;source.getContext('2d').drawImage(reference.image,0,0);
          const data=await this.request('reference',{image:source.toDataURL('image/jpeg',.95),points:reference.points.map(p=>[p.x,p.y])},controller.signal);
          if(epoch!==this.epoch)return;this.reference=reference;this.token=data.reference_id;
        }
        const result=await this.request('frame',{reference_id:this.token,image:canvas.toDataURL('image/jpeg',.9),points:snapshot,settings:{...settings,strength:1}},controller.signal);
        const image=new Image();image.src=result.image;await image.decode();if(epoch!==this.epoch||!this.enabled)return;
        const now=performance.now();this.arrivals.push(now);this.arrivals=this.arrivals.slice(-8);
        const fps=this.fps=this.arrivals.length>1?(this.arrivals.length-1)*1000/(now-this.arrivals[0]):0;
        this.last={image,input:canvas,raw,width:frame.width,height:frame.height,uv:crop.uv,yaw,crop,received:now,ms:result.ms,timing:result.timing,provider:result.provider};
        this.next=now+Math.max(0,1000/this.maxFps-(now-started));
        const provider={DmlExecutionProvider:'DirectML',CUDAExecutionProvider:'CUDA',CPUExecutionProvider:'CPU'}[result.provider]||'ONNX';
        this.status('IA: '+(fps?fps.toFixed(1)+' FPS':'primera imagen')+' · '+provider+' · '+result.ms+' ms');delivered=true;
      })().catch(error=>{
        if(epoch!==this.epoch)return;
        this.fps=0;
        if(error.status===410){this.token=null;this.reference=null;}
        this.next=performance.now()+(error.status===429?400:1800);
        this.status(error.name==='AbortError'?'El motor tardó demasiado; prueba el modo ligero.':error.message);
      }).finally(()=>{clearTimeout(timeout);this.busy=false;if(delivered&&epoch===this.epoch&&this.enabled)this.onResult();});
      return true;
    }
  }
  root.NeuralPortrait=NeuralPortrait;
})(typeof window!=='undefined'?window:globalThis);
