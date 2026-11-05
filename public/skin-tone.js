/* Piel visible: segmentación aprendida, sin teñir ropa, cabello ni fondo. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
 const confidence=v=>smooth(.65,.94,v),motionGate=(a,b)=>1-smooth(.055,.19,Math.max(...a.map((v,i)=>Math.abs(v-b[i]))));
 function toneOffset(source,target){if(!source||!target)return [0,0,0];return target.map((v,i)=>clamp(v-source[i],i?-.16:-.48,i?.16:.48));}
 function offsets(face,body,reference,mode='reference',mix=.85){
  if(!reference||mode==='camera')return {face:[0,0,0],body:[0,0,0]};
  const camera=body||face,target=mode==='mixed'&&camera?reference.map((v,i)=>v*mix+camera[i]*(1-mix)):reference;
  return {face:toneOffset(face||body,target),body:toneOffset(body||face,target)};
 }
 class SkinToneView{
  constructor(client){
   this.client=client;this.canvas=document.createElement('canvas');this.canvas.className='skin-tone-layer';this.canvas.setAttribute('aria-hidden','true');
   const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false});if(!gl)throw new Error('WebGL no está disponible para unificar la piel.');
   const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('No se pudo preparar la piel visible.');return s;},p=this.program=gl.createProgram();
   gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}'));
   gl.attachShader(p,compile(gl.FRAGMENT_SHADER,`precision mediump float;
    varying vec2 uv;uniform sampler2D video;uniform sampler2D mask;uniform sampler2D origin;
    uniform float mirror;uniform float age;uniform vec3 faceOffset;uniform vec3 bodyOffset;uniform vec2 texel;
    vec3 current(vec2 p){return texture2D(video,vec2(mix(p.x,1.-p.x,mirror),p.y)).rgb;}
    void main(){
     vec3 color=current(uv);
     vec2 skin=texture2D(mask,uv).rg;float total=skin.x+skin.y;
     // Comparar a la resolución de la máscara evita huecos sobre poros,
     // arrugas y bordes finos que solo difieren por el reescalado del video.
     vec2 d=texel*.5;
     vec3 low=(current(uv+d)+current(uv-d)+current(uv+vec2(d.x,-d.y))+current(uv+vec2(-d.x,d.y)))*.25;
     vec3 old=(texture2D(origin,uv+d).rgb+texture2D(origin,uv-d).rgb+texture2D(origin,uv+vec2(d.x,-d.y)).rgb+texture2D(origin,uv+vec2(-d.x,d.y)).rgb)*.25;vec3 diff=abs(low-old);
     float gate=1.-smoothstep(.055,.19,max(diff.x,max(diff.y,diff.z)));
     float alpha=max(skin.x,skin.y)*gate*age;
     vec3 shift=mix(bodyOffset,faceOffset,skin.y/max(total,.001));
     float y=dot(color,vec3(.299,.587,.114))+shift.x;
     float u=dot(color,vec3(-.168736,-.331264,.5))+shift.y;
     float v=dot(color,vec3(.5,-.418688,-.081312))+shift.z;
     vec3 corrected=clamp(vec3(y+1.402*v,y-.344136*u-.714136*v,y+1.772*u),0.,1.);
     gl_FragColor=vec4(corrected*alpha,alpha);
    }`));
   gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('No se pudo enlazar la piel visible.');gl.useProgram(p);
   const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
   this.uniforms=Object.fromEntries(['mirror','age','faceOffset','bodyOffset','texel'].map(k=>[k,gl.getUniformLocation(p,k)]));
   this.textures=['video','mask','origin'].map((name,i)=>{gl.uniform1i(gl.getUniformLocation(p,name),i);gl.activeTexture(gl.TEXTURE0+i);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return t;});
   this.sizes=[];this.epoch=0;this.reset();
  }
  reset(){this.epoch++;this.ready=false;this.failed=false;this.sampleAt=-Infinity;this.next=0;this.faceTone=null;this.bodyTone=null;this.shiftFace=[0,0,0];this.shiftBody=[0,0,0];this.lastDraw=null;this.hide();}
  hide(){this.canvas.hidden=true;}
  upload(unit,image){const gl=this.gl,w=image.videoWidth||image.width,h=image.videoHeight||image.height;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[unit]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);if(this.sizes[unit]?.[0]===w&&this.sizes[unit]?.[1]===h)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.sizes[unit]=[w,h];}}
  accept(data,image,stamp){
   const mask=this.mask||(this.mask=document.createElement('canvas'));if(mask.width!==data.width||mask.height!==data.height){mask.width=data.width;mask.height=data.height;this.maskPixels=null;}
   const x=mask.getContext('2d'),pixels=this.maskPixels||(this.maskPixels=x.createImageData(mask.width,mask.height)),rgba=pixels.data;
   for(let i=0;i<data.skin.length;i++){const k=i*4;rgba[k]=Math.round(confidence(data.skin[i])*255);rgba[k+1]=Math.round(confidence(data.face[i])*255);rgba[k+2]=0;rgba[k+3]=255;}
   x.putImageData(pixels,0,0);this.upload(1,mask);this.upload(2,image);
   this.faceTone=data.faceTone?root.FaceAppearance.yuv(data.faceTone):null;this.bodyTone=data.skinTone?root.FaceAppearance.yuv(data.skinTone):this.faceTone;
   this.sampleAt=stamp;this.ready=!!(this.faceTone||this.bodyTone);this.mask=mask;
  }
  schedule(frame,now){
   if(this.busy||this.failed||now<this.next)return;this.busy=true;const epoch=this.epoch;
   const source=frame.video||frame,w=frame.width,h=frame.height,scale=Math.min(1,256/Math.max(w,h)),image=this.sampleCanvas||(this.sampleCanvas=document.createElement('canvas')),iw=Math.max(1,Math.round(w*scale)),ih=Math.max(1,Math.round(h*scale));if(image.width!==iw||image.height!==ih){image.width=iw;image.height=ih;}const x=image.getContext('2d');
   x.setTransform(1,0,0,1,0,0);if(frame.video&&frame.mirror){x.translate(image.width,0);x.scale(-1,1);}x.drawImage(source,0,0,image.width,image.height);
   this.client.segment(image,256).then(data=>{if(epoch===this.epoch)this.accept(data,image,now);}).catch(()=>{if(epoch===this.epoch){this.failed=true;this.hide();}}).finally(()=>{this.busy=false;this.next=performance.now()+Math.max(100,Math.min(300,(performance.now()-now)*1.5));});
  }
  draw(ctx,frame,reference,settings={},now=performance.now()){
   if(!settings.enabled||settings.colorMode==='camera'||!reference?.mean){this.hide();return false;}
   if(settings.schedule!==false)this.schedule(frame,now);
   if(!this.ready){this.hide();return false;}
   // La inferencia y el arranque del Worker pueden superar un segundo. Una
   // muestra inmóvil conserva el tono; el gate espacial retira el movimiento.
   const age=1-smooth(1800,4000,now-this.sampleAt);if(age<=0){this.hide();return false;}
   const gl=this.gl;gl.useProgram(this.program);if(this.canvas.width!==frame.width||this.canvas.height!==frame.height){this.canvas.width=frame.width;this.canvas.height=frame.height;}
   const desired=offsets(this.faceTone,this.bodyTone,reference.mean,settings.colorMode||'reference',settings.colorMix??.85),dt=this.lastDraw===null?1000:clamp(now-this.lastDraw,1,100),alpha=1-Math.exp(-dt/160);this.lastDraw=now;
   for(let i=0;i<3;i++){this.shiftFace[i]+=(desired.face[i]-this.shiftFace[i])*alpha;this.shiftBody[i]+=(desired.body[i]-this.shiftBody[i])*alpha;}
   this.upload(0,frame.video||frame);gl.uniform1f(this.uniforms.mirror,frame.video&&frame.mirror?1:0);gl.uniform1f(this.uniforms.age,age);gl.uniform2f(this.uniforms.texel,1/this.mask.width,1/this.mask.height);gl.uniform3fv(this.uniforms.faceOffset,this.shiftFace);gl.uniform3fv(this.uniforms.bodyOffset,this.shiftBody);
   gl.viewport(0,0,frame.width,frame.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);this.canvas.hidden=false;if(ctx)ctx.drawImage(this.canvas,0,0);return true;
  }
 }
 root.SkinTone={confidence,motionGate,offsets,toneOffset};root.SkinToneView=SkinToneView;if(typeof module!=='undefined')module.exports=root.SkinTone;
})(typeof window!=='undefined'?window:globalThis);
