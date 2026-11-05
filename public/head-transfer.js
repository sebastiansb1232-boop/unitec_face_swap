/* Cabello segmentado y transferencia de cabeza 2D con fondo limpio opcional. */
(function(root){
  'use strict';
  const {basis,affine,clamp,mix}=root.FaceAppearance;
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  function canvas(w=1,h=1){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function fit(c,w,h){if(c.width!==w||c.height!==h){c.width=w;c.height=h;}return c.getContext('2d');}
  function maskCanvas(data,kind,points,imageW,imageH){
    const c=canvas(data.width,data.height),ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height),b=basis(points);
    const chin=((points[152].x-b.origin.x)*b.y.x+(points[152].y-b.origin.y)*b.y.y)/b.scale;
    for(let i=0;i<data.hair.length;i++){
      const x=(i%data.width+.5)/data.width*imageW,y=(Math.floor(i/data.width)+.5)/data.height*imageH;
      const nx=((x-b.origin.x)*b.x.x+(y-b.origin.y)*b.x.y)/b.scale,ny=((x-b.origin.x)*b.y.x+(y-b.origin.y)*b.y.y)/b.scale;
      const roi=(1-smooth(1.35,1.85,Math.abs(nx)))*smooth(-2.4,-1.9,ny)*(1-smooth(chin+.75,chin+1.1,ny));
      const skinROI=(1-smooth(chin+(kind==='skin'?.15:-.06),chin+(kind==='skin'?.85:.18),ny))*(1-smooth(1.05,1.3,Math.abs(nx)));
      let value=kind==='hair'?data.hair[i]:kind==='skin'?Math.max(data.face[i],data.skin[i])*skinROI:kind==='erase'?Math.max(data.hair[i],data.face[i]*(1-smooth(chin-.25,chin-.08,ny))):Math.max(data.hair[i],Math.max(data.face[i],data.skin[i])*skinROI);
      value=smooth(.12,.88,value)*roi;
      pixels.data.set([255,255,255,Math.round(value*255)],i*4);
    }
    if(kind==='erase'){
      // Ampliar solo la retirada, antes del recorte nuevo, para eliminar el halo del pelo anterior.
      const source=pixels.data.slice(),r=3;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
        let a=0;for(let j=Math.max(0,y-r);j<=Math.min(c.height-1,y+r);j++)for(let k=Math.max(0,x-r);k<=Math.min(c.width-1,x+r);k++)a=Math.max(a,source[(j*c.width+k)*4+3]);
        pixels.data[(y*c.width+x)*4+3]=a;
      }
    }
    ctx.putImageData(pixels,0,0);return c;
  }
  function stabilizeMask(fresh,previous,kind,currentBasis,w,h){
    if(!previous)return fresh;
    const out=canvas(fresh.width,fresh.height),ctx=out.getContext('2d');
    ctx.save();ctx.scale(out.width/w,out.height/h);ctx.transform(...affine(previous.basis,currentBasis));ctx.globalAlpha=.22;ctx.drawImage(previous[kind],0,0,previous.w,previous.h);ctx.restore();
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.78;ctx.drawImage(fresh,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return out;
  }
  class SegmentationClient{
    constructor(){this.serial=0;this.pending=new Map();}
    ensure(){
      if(this.promise)return this.promise;
      this.promise=(async()=>{
        if(!root.Worker||!root.createImageBitmap)throw new Error('Este navegador no permite segmentar el cabello. El rostro sigue disponible.');
        this.worker=new Worker('segmentation-worker.js?v=4');
        this.worker.onmessage=({data})=>{const item=this.pending.get(data.id);if(!item)return;clearTimeout(item.timer);this.pending.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data);};
        this.worker.onerror=()=>{this.fail(new Error('No se pudo cargar la segmentación. Comprueba que copiaste las carpetas models y vendor.'));};
        await this.request(null);return this;
      })().catch(error=>{this.worker?.terminate();this.worker=null;this.promise=null;throw error;});
      return this.promise;
    }
    fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.worker?.terminate();this.worker=null;this.promise=null;}
    request(bitmap){
      const id=++this.serial;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.fail(new Error('La segmentación tardó demasiado. Puedes continuar con el rostro.'));},45000);
        this.pending.set(id,{resolve,reject,timer});
        try{this.worker.postMessage({id,bitmap},bitmap?[bitmap]:[]);}catch(error){clearTimeout(timer);this.pending.delete(id);bitmap?.close();reject(error);}
      });
    }
    async segment(image,max=640){
      await this.ensure();const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height,scale=Math.min(1,max/Math.max(w,h));
      const bitmap=await createImageBitmap(image,{resizeWidth:Math.round(w*scale),resizeHeight:Math.round(h*scale),resizeQuality:'low'});
      return this.request(bitmap);
    }
  }
  class HairRenderer{
    constructor(){
      this.canvas=canvas();const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true});
      if(!gl)throw new Error('WebGL no está disponible para colorear el cabello.');
      const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('No se pudo preparar el color del cabello.');return s;};
      const p=this.program=gl.createProgram();
      gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}'));
      gl.attachShader(p,shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 uv;uniform sampler2D image;uniform sampler2D mask;uniform vec3 sourceTone;uniform vec3 targetTone;uniform float strength;
        vec3 yuv(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(-.168736,-.331264,.5)),dot(c,vec3(.5,-.418688,-.081312)));}
        vec3 rgb(vec3 c){return vec3(c.x+1.402*c.z,c.x-.344136*c.y-.714136*c.z,c.x+1.772*c.y);}
        void main(){vec3 original=texture2D(image,uv).rgb,c=yuv(original),s=yuv(sourceTone),t=yuv(targetTone);float gain=clamp(t.x/max(s.x,.03),.4,2.6);vec3 changed=clamp(rgb(vec3(clamp(t.x+(c.x-s.x)*gain,0.,1.),t.yz+(c.yz-s.yz)*.3)),0.,1.);float a=texture2D(mask,uv).a*strength;gl_FragColor=vec4(changed*a,a);}`));
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('No se pudo enlazar el color del cabello.');gl.useProgram(p);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      this.textures=[0,1].map(i=>{gl.activeTexture(gl.TEXTURE0+i);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});
      gl.uniform1i(gl.getUniformLocation(p,'image'),0);gl.uniform1i(gl.getUniformLocation(p,'mask'),1);
      this.u=Object.fromEntries(['sourceTone','targetTone','strength'].map(n=>[n,gl.getUniformLocation(p,n)]));
    }
    draw(frame,mask,source,target,strength){
      const gl=this.gl;if(this.canvas.width!==frame.width||this.canvas.height!==frame.height){this.canvas.width=frame.width;this.canvas.height=frame.height;}
      gl.viewport(0,0,frame.width,frame.height);[frame,mask].forEach((img,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);});
      gl.uniform3fv(this.u.sourceTone,source);gl.uniform3fv(this.u.targetTone,target);gl.uniform1f(this.u.strength,strength);gl.drawArrays(gl.TRIANGLES,0,6);return this.canvas;
    }
  }
  class HeadTransfer{
    constructor(status){this.status=status;this.client=new SegmentationClient();this.mode='color';this.strength=.92;this.epoch=0;this.lastRequest=-Infinity;this.interval=170;this.mask=canvas();this.work=canvas();this.background=null;this.reference=null;}
    clearTracking(){this.epoch++;this.live=null;this.lastRequest=-Infinity;this.lastMode='none';}
    clearBackground(){this.background=null;this.clearTracking();}
    captureBackground(frame){this.background=canvas(frame.width,frame.height);this.background.getContext('2d').drawImage(frame,0,0);this.status('Fondo preparado. Vuelve al encuadre; mantén el celular quieto.');}
    async prepareReference(ref){
      if(ref.head||ref.headPromise)return ref.headPromise;
      ref.headPromise=(async()=>{
        this.status('Separando cabello y rostro de la referencia…');
        const data=await this.client.segment(ref.image,1024),w=ref.image.naturalWidth||ref.image.width,h=ref.image.naturalHeight||ref.image.height;
        const mask=maskCanvas(data,'head',ref.points,w,h),cutout=canvas(w,h),c=cutout.getContext('2d');
        if(data.backgroundTone&&data.tone&&data.backgroundSpread<.13){
          const separation=Math.hypot(...data.tone.map((v,i)=>v-data.backgroundTone[i]));
          if(separation>.1){
            // Refinar el borde contra fondos uniformes evita conservar un halo de la foto.
            const small=canvas(data.width,data.height),sc=small.getContext('2d');sc.drawImage(ref.image,0,0,small.width,small.height);
            const photo=sc.getImageData(0,0,small.width,small.height).data,mc=mask.getContext('2d'),matte=mc.getImageData(0,0,mask.width,mask.height);
            for(let i=0;i<data.hair.length;i++)if(data.face[i]+data.skin[i]<.35){
              const difference=Math.hypot(...data.backgroundTone.map((v,j)=>photo[i*4+j]/255-v));
              matte.data[i*4+3]*=smooth(.022,Math.min(.13,separation*.42),difference);
            }
            mc.putImageData(matte,0,0);
          }
        }
        c.drawImage(ref.image,0,0);c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0,w,h);c.globalCompositeOperation='source-over';
        ref.head={cutout,tone:data.tone,mask};this.status(data.tone?'Cabello listo. El color seguirá las luces y sombras de tu pelo.':'Referencia sin cabello visible; el rostro sigue disponible.');
        return ref.head;
      })().catch(error=>{ref.headError=error.message;this.status(error.message);return null;});
      return ref.headPromise;
    }
    update(frame,points,now){
      if(this.mode==='off'||this.busy||now-this.lastRequest<this.interval)return;
      this.busy=true;this.lastRequest=now;const epoch=this.epoch,w=frame.width,h=frame.height,snapshot=points.map(p=>({...p}));
      this.client.segment(frame).then(data=>{
        if(epoch!==this.epoch)return;
        this.interval=clamp(data.elapsed*1.25,130,420);this.inferenceTime=data.elapsed;
        const completed=performance.now(),anchor=basis(snapshot),yaw=FaceAppearance.normalize(snapshot)[1].x,previous=this.live&&completed-this.live.capturedAt<650&&Math.abs(yaw-this.live.yaw)<.08?this.live:null;
        this.live={hair:stabilizeMask(maskCanvas(data,'hair',snapshot,w,h),previous,'hair',anchor,w,h),head:this.mode==='style'?stabilizeMask(maskCanvas(data,'erase',snapshot,w,h),previous,'head',anchor,w,h):null,tone:data.tone&&previous?.tone?data.tone.map((v,i)=>mix(previous.tone[i],v,.65)):data.tone,basis:anchor,w,h,now:completed,capturedAt:now,yaw};
      }).catch(error=>{this.status(error.message);this.interval=5000;}).finally(()=>{this.busy=false;});
    }
    canFullHead(ref,frame){return this.mode==='style'&&!!ref.head&&!!this.background&&this.background.width===frame.width&&this.background.height===frame.height&&!!this.live&&Math.abs(this.live.yaw-(ref.pose?.yaw||0))<.18;}
    drawMask(kind,points,w,h){
      const c=fit(this.mask,w,h);c.clearRect(0,0,w,h);c.save();c.setTransform(...affine(this.live.basis,basis(points)));c.drawImage(this.live[kind],0,0,this.live.w,this.live.h);c.restore();return this.mask;
    }
    drawBefore(ctx,frame,points,ref,opacity,now){
      this.lastMode='none';
      if(this.mode==='off'||this.suspended)return false;
      if(this.reference!==ref){this.reference=ref;this.prepareReference(ref);}
      this.update(frame,points,now);
      if(!this.live||now-this.live.capturedAt>Math.min(800,Math.max(300,(this.inferenceTime||0)*1.8))||Math.abs(FaceAppearance.normalize(points)[1].x-this.live.yaw)>.11)return false;
      // La piel pertenece a la malla del rostro. Otra máscara retrasada producía halos.
      if(this.canFullHead(ref,frame)){
        const mask=this.drawMask('head',points,frame.width,frame.height),work=fit(this.work,frame.width,frame.height);
        work.clearRect(0,0,frame.width,frame.height);work.globalCompositeOperation='source-over';work.drawImage(this.background,0,0);
        work.globalCompositeOperation='destination-in';work.filter='blur(2px)';work.drawImage(mask,0,0);work.filter='none';work.globalCompositeOperation='source-over';
        ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(this.work,0,0);ctx.setTransform(...affine(basis(ref.points),basis(points)));ctx.drawImage(ref.head.cutout,0,0);ctx.restore();
        this.lastMode='style';return true;
      }
      if(ref.head?.tone&&this.live.tone){
        this.hairRenderer??=new HairRenderer();const mask=this.drawMask('hair',points,frame.width,frame.height);
        ctx.drawImage(this.hairRenderer.draw(frame,mask,this.live.tone,ref.head.tone,this.strength*opacity),0,0);
        this.lastMode='color';
      }
      return false;
    }
  }
  root.HeadTransfer=HeadTransfer;
})(typeof window!=='undefined'?window:globalThis);
