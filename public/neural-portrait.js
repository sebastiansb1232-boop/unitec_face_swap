/* Una inferencia en vuelo. Registro y cámara avanzan sin esperar una segunda red. */
(function(root){
  'use strict';
  class NeuralPortrait{
    constructor(status,onResult,fitGenerated){this.status=status;this.onResult=onResult;this.fitGenerated=fitGenerated;this.epoch=0;this.driverId=0;this.neutralSamples=0;this.enabled=false;this.allowPortrait=false;this.busy=false;this.next=0;this.reference=null;this.token=null;this.last=null;this.arrivals=[];this.faceSize=384;this.maxFps=60;this.cache=new Map();this.validCache=new Map();this.photoCache=new Map();}
    resetDriver(){this.driverId++;this.neutralSamples=0;this.neutralStamp=null;}
    reset(keepReference=false){this.epoch++;if(!keepReference){this.abort?.abort();this.resetDriver();}this.last=null;this.cache.clear();this.validCache.clear();this.photoCache.clear();this.photoIdentity=null;this.arrivals=[];this.fps=0;this.next=0;if(!keepReference){this.reference=null;this.token=null;this.invalidReference=null;}}
    async available(expected=this.allowPortrait?'portrait':'swap'){
      try{
        const r=await fetch('/api/neural/status',{signal:AbortSignal.timeout(8000)});this.engineInfo=await r.json();const info=this.engineInfo;
        if((info.proxy_protocol||0)<5||info.ready&&((info.render_protocol||0)<5||!info.patch_output)){info.error='Actualiza Render y el motor de la PC con la misma entrega.';return false;}
        const portrait=info.model==='live_portrait_512'||info.engine_kind==='portrait_animation';
        if(info.ready&&expected==='swap'&&portrait){info.error='Ese motor anima una foto. Inicia iniciar-intercambio-ia.bat para intercambiar el rostro sobre tu cámara.';return false;}
        if(info.ready&&expected==='portrait'&&!portrait){info.error='Para esta opción fotográfica inicia iniciar-avatar-ia.bat. Intercambio neuronal utiliza el motor actual.';return false;}
        return r.ok&&info.ready===true;
      }catch{return false;}
    }
    async request(path,body,signal){
      const r=await fetch('/api/neural/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
      const data=await r.json();if(!r.ok){const error=new Error(data.error||'No se pudo procesar el fotograma.');error.status=r.status;error.action=path;error.retryMs=data.retry_ms;throw error;}return data;
    }
    encodeReference(view){
      // Recortar antes de reducir conserva detalle facial en fotos de cuerpo.
      const crop=root.neuralFaceCrop(view.points,view.image.width,view.image.height,1024);
      if(!crop)throw new Error('La referencia necesita un rostro más grande y nítido.');
      const canvas=document.createElement('canvas');canvas.width=crop.outputW;canvas.height=crop.outputH;canvas.getContext('2d').drawImage(view.image,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
      return {image:canvas.toDataURL('image/jpeg',.96),points:crop.points,...(view.side?{side:view.side}:{})};
    }
    photoKey(points,width,height,reference,now){
      if(!reference||!root.FacePose||!points)return null;
      const views=reference.views||[{side:'front',image:reference.image,points:reference.points,width:reference.image.width}],identity=reference.uid||reference;
      if(identity!==this.photoIdentity||this.photoWidth!==width){this.photoCache.clear();this.photoIdentity=identity;this.photoWidth=width;this.photoSide=null;}
      const pose=root.FacePose.basis(points,width),cost=v=>Math.abs(root.FacePose.basis(v.points,v.width||v.image.width).yaw-pose.yaw);
      let view=views.reduce((a,b)=>cost(a)<cost(b)?a:b);const previous=views.find(v=>v.side===this.photoSide);if(previous&&cost(previous)<=cost(view)+.025)view=previous;this.photoSide=view.side;
      if(!this.photoCache.has(view.side)){
        const uv=view.points.map(p=>({x:p.x/view.image.width,y:p.y/view.image.height}));
        let lightLuma=0;try{const sample=document.createElement('canvas');sample.width=sample.height=32;const ctx=sample.getContext('2d');ctx.drawImage(view.image,0,0,32,32);lightLuma=[50,280,151].reduce((sum,id)=>{const p=view.points[id],pixel=ctx.getImageData(Math.max(0,Math.min(31,Math.round(p.x/view.image.width*31))),Math.max(0,Math.min(31,Math.round(p.y/view.image.height*31))),1,1).data;return sum+(.299*pixel[0]+.587*pixel[1]+.114*pixel[2])/765;},0);}catch{}
        this.photoCache.set(view.side,{referenceTone:reference.skinTone||reference.toneTarget||views[0].tone,image:view.renderImage||view.image,layer:null,rectangularLayer:true,referencePhoto:true,activeView:view.side,uv,inputUV:uv,input:view.image,textureW:view.image.width,textureH:view.image.height,width,height,sourcePoints:points.map(p=>({...p})),referenceViews:views.map(v=>({side:v.side,points:v.points,width:v.width||v.image.width})),referenceId:identity,referencePoints:reference.points,registered:true,stableIdentity:true,yaw:root.FacePose.basis(view.points,view.image.width).yaw,received:now,lightLuma,passes:0,model:'photo_avatar',referenceCount:views.length});
      }
      return this.photoCache.get(view.side);
    }
    select(points,width,now=performance.now(),reference=null,height=null){
      const photo=this.photoOnly||this.allowPortrait?this.photoKey(points,width,height,reference,now):null;
      if(this.photoOnly)return photo;
      if(!this.last)return photo;
      if(!root.FacePose||!points)return this.last.registered?this.last:photo;
      const pose=root.FacePose.basis(points,width),expression=root.PortraitQuality.expression(points);let best=null,score=Infinity;
      for(const key of this.validCache.values()){
        const lifetime=/^(hyperswap|inswapper)/.test(key.model||'')?45000:Math.max(1800,Math.min(10000,(this.last.requestMs||1000)*2.5));
        if(!key.registered||key.referenceId&&reference&&key.referenceId!==(reference.uid||reference)||now-key.received>lifetime)continue;
        const poseCost=Math.abs(pose.yaw-key.yaw)+Math.abs(pose.pitch-(key.pitch||0))*.5;
        const expressionCost=key.expression?expression.reduce((s,v,i)=>s+Math.abs(v-key.expression[i]),0)*.25:0;
        const cost=poseCost*4+expressionCost*.6+(now-key.received)/1500000;
        if(cost<score){best=key;score=cost;}
      }
      if(!best)return photo;
      if(Math.abs(pose.yaw-best.yaw)>.48)return photo;
      return best;
    }
    submit(frame,points,reference,settings,normalized,options={}){
      if(!this.enabled||this.busy||performance.now()<this.next||!reference||this.invalidReference===reference)return false;
      if(root.FacePose&&this.neutralSamples<3){
        const pose=root.FacePose.basis(points,frame.width),gesture=root.PortraitQuality.expression(points),stamp=options.capturedAt??performance.now();
        if(Math.abs(pose.yaw)>.35||gesture[2]>.18||Math.min(gesture[0],gesture[1])<.07){this.neutralSamples=0;this.status('Calibración IA · Mira de frente, abre los ojos y relaja la boca.');return false;}
        if(stamp!==this.neutralStamp){this.neutralStamp=stamp;this.neutralSamples++;}
        if(this.neutralSamples<3){this.status('Calibrando el gesto neutral de la IA…');return false;}
      }
      const sourcePoints=points.map(p=>({...p})),inputPoints=options.mirror?points.map(p=>({...p,x:frame.width-p.x})):points;
      const limit=settings.quality==='detail'?this.faceSize:Math.min(this.faceSize,this.engineInfo?.native_size===256?448:320),crop=root.neuralFaceCrop(inputPoints,frame.width,frame.height,limit);if(!crop)return false;
      this.busy=true;const epoch=this.epoch,controller=this.abort=new AbortController(),timeout=setTimeout(()=>controller.abort(),settings.quality==='detail'?95000:45000);
      const canvas=document.createElement('canvas');canvas.width=crop.outputW;canvas.height=crop.outputH;canvas.getContext('2d').drawImage(frame,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
      const snapshot=crop.points,raw=normalized?.map(p=>({...p})),pose=root.FacePose?root.FacePose.basis(sourcePoints,frame.width):{yaw:root.FaceAppearance.normalize(points)[1].x,pitch:0};
      const started=performance.now();let delivered=false;
      (async()=>{
        const views=reference.views||[{side:'front',image:reference.image,points:reference.points,width:reference.image.width}];
        if(this.reference!==reference||!this.token){
          if(views.length>1&&(this.engineInfo?.render_protocol||0)<4)throw new Error('Actualiza el motor de la PC para utilizar tres fotografías.');
          this.status('Preparando '+views.length+' referencia'+(views.length===1?'':'s')+' como una sola identidad…');
          const front=views.find(v=>v.side==='front')||views[0],primary=this.encodeReference(front),extra=views.filter(v=>v!==front).map(v=>this.encodeReference(v));
          const body={image:primary.image,points:primary.points,...(extra.length?{views:extra}:{})};
          const data=await this.request('reference',body,controller.signal);
          if(epoch!==this.epoch)return;this.reference=reference;this.token=data.reference_id;
        }
        const compact=this.engineInfo?.patch_output===true;
        const result=await this.request('frame',{client_protocol:5,reference_id:this.token,image:canvas.toDataURL('image/jpeg',.92),points:snapshot,settings:{...settings,strength:1,driver_id:this.driverId,transport:compact?'patch':'legacy'}},controller.signal);
        const image=new Image();image.src=result.image;await image.decode();if(epoch!==this.epoch||!this.enabled)return;
        let layer=null;if(result.layer){layer=new Image();layer.src=result.layer;await layer.decode();}
        const patch=result.transport==='patch',textureW=patch?result.texture_size:crop.outputW,textureH=patch?result.texture_size:crop.outputH;
        const inputUV=patch?root.PortraitQuality.alignedUV(snapshot,result.affine,result.texture_size):crop.uv;
        if(!inputUV)throw new Error('El motor devolvió un registro facial incompatible.');
        const now=performance.now(),bin=Math.round(pose.yaw/.26),key={image,layer,registrationRequired:true,rectangularLayer:result.matte_kind==='mesh',activeView:result.active_view,input:canvas,inputUV,textureW,textureH,sourcePoints,referenceViews:views.map(v=>({side:v.side,points:v.points,width:v.width||v.image.width})),referenceId:reference.uid||reference,referencePoints:reference.points,raw,width:frame.width,height:frame.height,uv:inputUV,yaw:pose.yaw,pitch:pose.pitch,crop,registered:false,stableIdentity:true,expression:root.PortraitQuality?.expression(sourcePoints),lightLuma:result.light_luma,passes:result.passes||1,quality:result.quality,gestureRetargeting:result.gesture_retargeting===true,model:result.model,nativeSize:result.native_size,outputSize:result.output_size,referenceCount:result.reference_views||views.length,alignmentMs:0,received:now,capturedAt:options.capturedAt||started,ms:result.ms,timing:result.timing,requestMs:Math.round(now-started),provider:result.provider};
        const alignmentStarted=performance.now();
        if(this.fitGenerated&&root.PortraitQuality){
          Promise.resolve(this.fitGenerated(image,{...crop,outputW:textureW,outputH:textureH,uv:inputUV},sourcePoints)).then(detected=>{
            const safeDetected=root.MouthMotion?root.MouthMotion.sanitize(detected.map(p=>({x:p.x*textureW,y:p.y*textureH,z:p.z||0}))):null;
            const corrected=safeDetected?safeDetected.map(p=>({x:p.x/textureW,y:p.y/textureH,z:p.z})):detected;
            const fitted=root.PortraitQuality.registeredUV(corrected,inputUV,textureW,textureH);
            if(!fitted||epoch!==this.epoch||!this.enabled)return;
            // No mostrar la textura con el UV anterior ni interpolar desde él:
            // sus ojos podrían estar en la frente. La primera vista ya es válida.
            key.uv=fitted;key.registered=true;key.alignmentMs=Math.round(performance.now()-alignmentStarted);
            key.referenceLayers=views;key.generatedPoints=corrected.slice(0,468).map(p=>({x:p.x*textureW,y:p.y*textureH,z:p.z||0}));if(root.MouthMotion)key.generatedPoints=root.MouthMotion.sanitize(key.generatedPoints);
            key.referenceTone=reference.skinTone||reference.toneTarget;key.toneTarget=reference.toneTarget;key.toneSource=root.ReferenceTone?.sample(image,key.generatedPoints)||null;
            // El intercambio recibe una sola corrección en el compositor.
            // Volver a blanquear aquí para luego oscurecerlo perdía matices.
            if(key.model==='live_portrait_512'&&key.toneTarget&&key.toneSource){key.image=root.ReferenceTone.balance(image,key.generatedPoints,key.toneTarget,key.toneSource);key.layer=null;}
            const previous=this.validCache.get(bin);
            if(!previous||previous.received<key.received){this.validCache.delete(bin);this.validCache.set(bin,key);while(this.validCache.size>11)this.validCache.delete(this.validCache.keys().next().value);}
          }).catch(()=>{});
          // Permite un resultado ya resuelto; nunca espera al Worker de registro.
          await Promise.resolve();
        }
        controller.signal.throwIfAborted();if(epoch!==this.epoch||!this.enabled)return;
        const received=performance.now();this.arrivals.push(received);this.arrivals=this.arrivals.slice(-12);
        const fps=this.fps=this.arrivals.length>1?(this.arrivals.length-1)*1000/(received-this.arrivals[0]):0;
        key.published=true;this.cache.delete(bin);this.cache.set(bin,key);while(this.cache.size>9)this.cache.delete(this.cache.keys().next().value);
        this.last=key;this.retryCount=0;this.next=received+Math.max(0,1000/this.maxFps-(received-started));
        const provider={DmlExecutionProvider:'DirectML',CUDAExecutionProvider:'CUDA',CPUExecutionProvider:'CPU'}[result.provider]||'ONNX',model=result.model==='live_portrait_512'?(result.gesture_retargeting?'LivePortrait · Gestos IA':'LivePortrait'):result.model?.startsWith('hyperswap')?'HyperSwap 1C':'InSwapper';
        this.status('IA: '+(fps?fps.toFixed(1)+' FPS':'primera imagen')+' · '+model+' · '+provider+' · '+result.ms+' ms · '+views.length+' vista'+(views.length===1?'':'s')+(result.passes===4?' · 4 pasadas':''));delivered=true;
      })().catch(error=>{
        if(epoch!==this.epoch)return;this.fps=0;if(error.status===410){this.token=null;this.reference=null;}if(error.status===400&&error.action==='reference')this.invalidReference=reference;
        this.retryCount=error.status===429?(this.retryCount||0)+1:0;
        const wait=error.status===429?Math.min(8000,Math.max(error.retryMs||0,500*2**Math.min(this.retryCount-1,4))):1800;
        this.next=performance.now()+wait;this.status(error.status===429?'GPU ocupada · Vista local activa · Reintentando en '+(wait/1000).toFixed(1)+' s':error.name==='AbortError'?'El motor tardó demasiado. Reduce el detalle neuronal.':error.message);
      }).finally(()=>{clearTimeout(timeout);this.busy=false;if(delivered&&epoch===this.epoch&&this.enabled)this.onResult();});
      return true;
    }
  }
  root.NeuralPortrait=NeuralPortrait;
})(typeof window!=='undefined'?window:globalThis);
