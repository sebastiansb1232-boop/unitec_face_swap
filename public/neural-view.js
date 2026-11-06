/* Rostro con alfa propio, registro de ojos/nariz y profundidad de la malla. */
(function(root){
  'use strict';
  const Q=root.PortraitQuality,{HOLES}=Q;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class NeuralView{
    constructor(triangles){
      this.triangles=triangles;this.shape=new Q.IdentityShape();this.surface=root.FaceSurface?.topology(triangles);this.protectedSurface=new Set([...root.FaceAppearance.EXPRESSIVE,...Q.OVAL]);
      this.canvas=document.createElement('canvas');this.canvas.className='neural-layer';this.canvas.setAttribute('aria-hidden','true');
      const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:true});
      if(!gl)throw new Error('No se pudo activar la composición WebGL.');
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.hide();});
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('No se pudo preparar la composición neuronal.');return s;};
      const program=this.program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,`
        attribute vec3 pos;attribute vec2 sourceA;attribute vec2 sourceB;attribute vec2 live;
        attribute float edge;attribute float native;attribute float erase;attribute vec2 driverUV;
        varying vec2 a;varying vec2 b;varying vec2 c;varying vec2 d;varying vec2 screenUV;varying float border;varying float own;varying float cover;
        void main(){gl_Position=vec4(pos,1.);a=sourceA;b=sourceB;c=live;d=driverUV;border=edge;own=native;cover=erase;screenUV=vec2((pos.x+1.)*.5,(1.-pos.y)*.5);}`));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        uniform sampler2D photoA;uniform sampler2D photoB;uniform sampler2D camera;uniform sampler2D background;uniform sampler2D oldFace;uniform float backgroundReady;
        uniform float transition;uniform float oralBlend;uniform float intensity;uniform float onlyLive;uniform float cameraMirror;
        uniform float feather;uniform float matteA;uniform float matteB;
        uniform vec3 complexion;uniform vec3 complexionA;uniform vec4 eyeA;uniform vec4 eyeB;uniform vec2 eyeAssist;uniform sampler2D driver;uniform vec3 motion;uniform vec4 mouthRegion;uniform vec2 cameraSize;uniform vec2 faceAxis;
        varying vec2 a;varying vec2 b;varying vec2 c;varying vec2 d;varying vec2 screenUV;varying float border;varying float own;varying float cover;
        vec2 cameraUV(vec2 p){return vec2(mix(p.x,1.-p.x,cameraMirror),p.y);}
        float regionDistance(vec4 e){vec2 p=(c-e.xy)*cameraSize;return length(vec2(dot(p,faceAxis),dot(p,vec2(-faceAxis.y,faceAxis.x)))/max(e.zw*cameraSize,vec2(.0001)));}
        float eyeMask(vec4 e){return 1.-smoothstep(.65,1.15,regionDistance(e));}
        vec3 colorize(vec3 color,vec3 change,float skinWeight){
          float Y=dot(color,vec3(.299,.587,.114))+change.x;
          float U=dot(color,vec3(-.168736,-.331264,.5))+change.y*skinWeight;
          float V=dot(color,vec3(.5,-.418688,-.081312))+change.z*skinWeight;
          return vec3(Y+1.402*V,Y-.344136*U-.714136*V,Y+1.772*U);
        }
        void main(){
          vec3 original=texture2D(camera,cameraUV(c)).rgb;
          if(onlyLive>.5){float alpha=onlyLive>1.5?smoothstep(0.,.25,cover):intensity;
            if(backgroundReady>.5){alpha=texture2D(oldFace,screenUV).a;original=texture2D(background,screenUV).rgb;}
            gl_FragColor=vec4(original*alpha,alpha);return;}
          vec4 left=texture2D(photoA,a),right=texture2D(photoB,b);
          float edgeAlpha=smoothstep(.001,feather,border);
          // Las capas PNG ya tienen un único borde interior; JPEG anterior usa el contorno.
          left*=mix(edgeAlpha,1.,matteA);right*=mix(edgeAlpha,1.,matteB);
          vec4 layer=mix(left,right,transition);
          float skinWeight=(1.-.8*max(eyeMask(eyeA),eyeMask(eyeB)))*(1.-smoothstep(.015,.12,cover));
          // Igualar ambas texturas antes de fundirlas. Usar solo la corrección
          // de la vista nueva provocaba un destello al cambiar de perfil.
          vec3 colorA=colorize(left.rgb/max(left.a,.001),complexionA,skinWeight);
          vec3 colorB=colorize(right.rgb/max(right.a,.001),complexion,skinWeight);
          vec3 generated=(colorA*left.a*(1.-transition)+colorB*right.a*transition)/max(layer.a,.001);
          generated=clamp(mix(generated,colorA,max(eyeMask(eyeA)*eyeAssist.x,eyeMask(eyeB)*eyeAssist.y)),0.,1.);
          float mouthMask=1.-smoothstep(.55,1.15,regionDistance(mouthRegion));
          float compensation=max(mouthMask*motion.z,max(eyeMask(eyeA)*motion.x,eyeMask(eyeB)*motion.y));
          // Diferencia temporal alineada: el detalle que cambia se suma a la
          // apariencia neuronal, sin sustituir una región por la boca cruda.
          vec3 earlier=texture2D(driver,d).rgb;
          generated=clamp(generated+clamp(original-earlier,vec3(-.65),vec3(.65))*compensation,0.,1.);
          float alpha=layer.a*intensity;
          float cameraAmount=max(own,oralBlend*smoothstep(.015,.11,cover));
          vec3 color=mix(generated,original,cameraAmount);
          gl_FragColor=vec4(color*alpha,alpha);
        }`));
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('No se pudo enlazar la composición neuronal.');gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer=gl.createBuffer());
      this.data=new Float32Array((this.surface?.vertexCount||475)*14);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
      [['pos',3,0],['sourceA',2,12],['sourceB',2,20],['live',2,28],['edge',1,36],['native',1,40],['erase',1,44],['driverUV',2,48]].forEach(([name,size,offset])=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,56,offset);});
      this.uniforms=Object.fromEntries(['transition','oralBlend','intensity','onlyLive','cameraMirror','feather','matteA','matteB','eyeA','eyeB','eyeAssist','complexion','complexionA','backgroundReady','motion','mouthRegion','cameraSize','faceAxis'].map(n=>[n,gl.getUniformLocation(program,n)]));
      ['photoA','photoB','camera','background','oldFace','driver'].forEach((n,i)=>gl.uniform1i(gl.getUniformLocation(program,n),i));
      this.textureSizes=[];this.textures=Array.from({length:6},(_,i)=>{gl.activeTexture(gl.TEXTURE0+i);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return t;});
      for(const unit of [2,3,4,5]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[unit]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));}
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      const adjacency=Array.from({length:468},()=>new Set());for(const t of triangles)for(const i of t)for(const j of t)if(i!==j)adjacency[i].add(j);
      this.regions=Q.featureRegions(adjacency,true);this.innerMouth=new Set(HOLES[2]);
      const indices=triangles.flat();this.meshCount=indices.length;
      const holes=[];HOLES.forEach((ids,k)=>ids.forEach((id,i)=>holes.push(468+k,id,ids[(i+1)%ids.length])));indices.push(...holes);this.holeCount=holes.length;
      if(this.surface){this.denseMeshCount=this.surface.indices.length;this.denseIndices=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.denseIndices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([...this.surface.indices,...holes]),gl.STATIC_DRAW);}
      this.backgroundBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.backgroundBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([471,472,473,473,472,474]),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices=gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);this.reset();
    }
    setBackground(image,kind='captured'){
      this.background={image,kind,width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};this.upload(3,image);this.backgroundStamp=null;this.shape.reset();
    }
    clearBackground(){this.background=null;this.backgroundStamp=null;this.shape.reset();}
    updateBackground(frame,cameraPoints,destination,stamp,key){
      const ready=this.background&&this.background.width===frame.width&&this.background.height===frame.height;
      this.gl.uniform1f(this.uniforms.backgroundReady,ready?1:0);
      if(!ready||stamp===this.backgroundStamp&&key===this.backgroundKey)return !!ready;this.backgroundStamp=stamp;this.backgroundKey=key;
      const c=this.backgroundMask||(this.backgroundMask=document.createElement('canvas'));c.width=256;c.height=Math.max(1,Math.round(256*frame.height/frame.width));const x=c.getContext('2d');
      const ids=Q.silhouetteIds(cameraPoints),margin=frame.width/64;this.backgroundRect=[Math.min(...ids.map(i=>cameraPoints[i].x))-margin,Math.min(...ids.map(i=>cameraPoints[i].y))-margin,Math.max(...ids.map(i=>cameraPoints[i].x))+margin,Math.max(...ids.map(i=>cameraPoints[i].y))+margin];
      x.scale(c.width/frame.width,c.height/frame.height);const path=(p,ring)=>{x.beginPath();ring.forEach((id,k)=>x[k?'lineTo':'moveTo'](p[id].x,p[id].y));x.closePath();};
      path(cameraPoints,ids);x.fillStyle=x.strokeStyle='white';x.lineJoin='round';x.lineWidth=2;x.fill();x.stroke();
      // Solo borrar la silueta realmente desocupada. Borrar la cara completa
      // dejaba un anillo de LaMa bajo el borde semitransparente de la cara.
      x.globalCompositeOperation='destination-out';path(destination,Q.silhouetteIds(destination));x.lineWidth=Math.max(1.5,root.FaceAppearance.basis(cameraPoints).scale*.025);x.fill();x.stroke();this.upload(4,c);return true;
    }
    hide(){this.canvas.hidden=true;this.latestPoints=null;}
    reset(){this.key=null;this.previous=null;this.changed=0;this.shape.reset();this.gaze=[{x:0,y:0},{x:0,y:0}];this.eyeBlend=[0,0];this.drawTime=null;this.oralBlend=0;this.boundaryStamp=null;this.boundaryKey=null;this.midEdges=null;this.midLocal=null;this.eyeReference=null;this.toneStats=new WeakMap();this.sceneTone=root.PortraitBlend?new root.PortraitBlend.SceneTone():null;this.toneSampleAt=-Infinity;this.liveTone=null;this.hide();}
    upload(unit,image){const gl=this.gl,w=image.videoWidth||image.naturalWidth||image.width,h=image.videoHeight||image.naturalHeight||image.height;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[unit]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);if(this.textureSizes[unit]?.[0]===w&&this.textureSizes[unit]?.[1]===h)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.textureSizes[unit]=[w,h];}}
    draw(ctx,frame,points,key,settings,now){
      if(!key?.uv||!points||this.lost||key.registrationRequired&&!key.registered){this.hide();return false;}
      const gl=this.gl,cameraPoints=points.camera||points,basis=root.FaceAppearance.basis(points),nose=points[1];
      const pose3D=key.stableIdentity&&root.FacePose?root.FacePose.basis(points,frame.width):null;
      const yaw=pose3D?pose3D.yaw:((nose.x-basis.origin.x)*basis.x.x+(nose.y-basis.origin.y)*basis.x.y)/basis.scale;
      const hasProfiles=key.referenceViews?.some(v=>v.side!=='front');
      const visibility=pose3D?(1-Q.smooth(key.referencePhoto ? .48 : .25,key.referencePhoto ? .85 : .62,Math.abs(yaw-(key.yaw??yaw))))*(1-Q.smooth(hasProfiles?1.30:1.05,1.50,Math.abs(yaw))):Q.smooth(0,.10,.24-Math.abs(yaw-(key.yaw??yaw)))*(1-Q.smooth(.58,.82,Math.abs(yaw)));
      if(visibility<=0||basis.scale<15){this.hide();return false;}
      const backgroundReady=!!(this.background&&this.background.width===frame.width&&this.background.height===frame.height);this.shape.range=backgroundReady ? .16 : .10;this.shape.allowContour=backgroundReady;
      const destination=this.shape.apply(points,key,(settings.shape??.65)*(settings.opacity??1)*visibility,now,this.triangles);
      this.updateBackground(frame,cameraPoints,destination,points.stamp??now,key);
      if(this.canvas.width!==frame.width||this.canvas.height!==frame.height){this.canvas.width=frame.width;this.canvas.height=frame.height;}
      const eyeReference=key.model==='live_portrait_512'&&key.generatedPoints&&key.referenceLayers?.length?key.referenceLayers.reduce((a,b)=>Math.abs(root.FacePose.basis(a.points,a.width).yaw-yaw)<Math.abs(root.FacePose.basis(b.points,b.width).yaw-yaw)?a:b):null;
      if(key!==this.key||eyeReference!==this.eyeReference){this.duration=eyeReference?0:Q.textureTransition(this.key,key);this.previous=this.duration?this.key:key;this.key=key;this.changed=now;this.eyeReference=eyeReference;this.referenceUV=eyeReference?.points.map(p=>({x:p.x/eyeReference.image.width,y:p.y/eyeReference.image.height}));this.upload(0,eyeReference?.image||this.previous.layer||this.previous.image);this.upload(1,key.layer||key.image);if(key.input&&key.crop?.uv)this.upload(5,key.input);}
      if(root.ReferenceTone&&root.PortraitBlend&&settings.integrate!==false){
        const sample=k=>{if(!this.toneStats.has(k)){const im=k.image,w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;this.toneStats.set(k,k.model!=='live_portrait_512'&&k.toneSource||root.ReferenceTone.sample(im,k.uv.map(p=>({x:p.x*w,y:p.y*h}))));}return this.toneStats.get(k);};
        if(eyeReference&&!this.toneStats.has(eyeReference))this.toneStats.set(eyeReference,root.ReferenceTone.sample(eyeReference.image,eyeReference.points));
        const source=sample(key),leftSource=eyeReference?this.toneStats.get(eyeReference):sample(this.previous);
        if(!settings.cameraTone&&now-this.toneSampleAt>220){
          this.toneSampleAt=now;const c=this.toneCanvas||(this.toneCanvas=document.createElement('canvas'));c.width=160;c.height=Math.max(1,Math.round(160*frame.height/frame.width));const x=c.getContext('2d',{willReadFrequently:true});
          if(frame.video&&frame.mirror){x.translate(c.width,0);x.scale(-1,1);}x.drawImage(frame.video||frame,0,0,c.width,c.height);
          this.liveTone=root.ReferenceTone.sample(c,cameraPoints.map(p=>({x:p.x*c.width/frame.width,y:p.y*c.height/frame.height})));
        }
        const cameraTone=settings.cameraTone||this.liveTone;
        const target=settings.cameraTone|| (cameraTone?{mean:this.sceneTone.update(cameraTone.mean,yaw,this.toneSampleAt)}:null),mode=settings.colorMode||'natural',mix=settings.colorMix??.65,t=root.PortraitBlend.tone(source,target,mode,mix,key.referenceTone),a=root.PortraitBlend.tone(leftSource,target,mode,mix,this.previous.referenceTone||key.referenceTone);gl.uniform3f(this.uniforms.complexion,...t);gl.uniform3f(this.uniforms.complexionA,...a);
      }else{gl.uniform3f(this.uniforms.complexion,0,0,0);gl.uniform3f(this.uniforms.complexionA,0,0,0);}
      const elapsed=this.drawTime===null?33:Math.max(1,Math.min(now-this.drawTime,100));this.drawTime=now;
      const liveExpression=Q.expression(points),nativeExpression=key.generatedPoints?Q.expression(key.generatedPoints):liveExpression;
      for(let k=0;k<2;k++){const desired=eyeReference?Q.smooth(.05,.14,liveExpression[k]-nativeExpression[k]):0;this.eyeBlend[k]+=(desired-this.eyeBlend[k])*(1-Math.exp(-elapsed/65));}
      gl.uniform2f(this.uniforms.eyeAssist,this.eyeBlend[0],this.eyeBlend[1]);
      [[33,133,159,145],[263,362,386,374]].forEach(([a,b,t,d],k)=>{const w=Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y),h=Math.hypot(points[t].x-points[d].x,points[t].y-points[d].y);gl.uniform4f(this.uniforms[k?'eyeB':'eyeA'],(points[a].x+points[b].x)/2/frame.width,(points[t].y+points[d].y)/2/frame.height,w*.65/frame.width,Math.max(h*.8,w*.07)/frame.height);});
      const transition=this.duration?clamp((now-this.changed)/this.duration,0,1):1;
      gl.viewport(0,0,frame.width,frame.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(this.uniforms.transition,transition);gl.uniform1f(this.uniforms.intensity,(settings.opacity??1)*visibility);
      gl.uniform1f(this.uniforms.cameraMirror,frame.video&&frame.mirror?1:0);
      gl.uniform1f(this.uniforms.feather,.045+(settings.softness??.65)*.055);gl.uniform1f(this.uniforms.matteA,this.previous.layer&&!this.previous.rectangularLayer?1:0);gl.uniform1f(this.uniforms.matteB,key.layer&&!key.rectangularLayer?1:0);
      const registeredUV=k=>{if(!k.registrationFromUV)return k.uv;const t=clamp((now-k.registrationStarted)/80,0,1);if(t>=1){k.registrationFromUV=null;return k.uv;}return k.uv.map((p,i)=>({x:k.registrationFromUV[i].x+(p.x-k.registrationFromUV[i].x)*t,y:k.registrationFromUV[i].y+(p.y-k.registrationFromUV[i].y)*t}));};
      const amounts=Q.featureAmounts(points,settings),uvA=this.referenceUV||registeredUV(this.previous),uvB=registeredUV(key),data=this.data;
      const driverUV=key.crop?.uv;
      const vertex=(i,p,cameraPoint,edge,own,hole=false,textureA=uvA[i],textureB=uvB[i],erase=1,snapshotUV=driverUV?.[i])=>{let k=i*14;data[k++]=p.x/frame.width*2-1;data[k++]=1-p.y/frame.height*2;data[k++]=clamp((p.z||0)*2-(hole ? .0002 : 0),-.95,.95);data[k++]=textureA?.x||0;data[k++]=textureA?.y||0;data[k++]=textureB?.x||0;data[k++]=textureB?.y||0;data[k++]=cameraPoint.x/frame.width;data[k++]=cameraPoint.y/frame.height;data[k++]=edge;data[k++]=own;data[k++]=erase;data[k++]=snapshotUV?.x||0;data[k]=snapshotUV?.y||0;};
      const stamp=points.stamp??now,freshSurface=this.boundaryStamp!==stamp||this.boundaryKey!==key||this.boundaryShape!==settings.shape||this.boundaryContour!==backgroundReady;if(freshSurface){this.boundaryStamp=stamp;this.boundaryKey=key;this.boundaryShape=settings.shape;this.boundaryContour=backgroundReady;this.boundaryIds=Q.silhouetteIds(points);this.edgeValues=Q.silhouetteEdges(destination,Q.silhouetteIds(destination),pose3D?.scale||basis.scale);this.midEdges=null;this.midLocal=null;}
      const edges=key.layer&&this.previous.layer&&!key.rectangularLayer&&!this.previous.rectangularLayer?null:this.edgeValues;
      const liveOral=root.PortraitBlend.interiorWeight(yaw,liveExpression[2],settings.identityLock&&settings.liveMouth!==false);
      this.oralBlend+=(liveOral-this.oralBlend)*(1-Math.exp(-elapsed/20));gl.uniform1f(this.uniforms.oralBlend,this.oralBlend);
      // El vídeo nativo ya presenta el cuerpo. Solo subir otra copia si una
      // región facial realmente necesita píxeles de cámara.
      const motionActive=settings.motion!==false&&!key.referencePhoto&&key.model!=='live_portrait_512'&&key.input&&driverUV,poseTrust=1-Q.smooth(.18,.48,Math.abs(yaw-(key.yaw??yaw))),mouthTop=points[0],mouthBottom=points[17],mouthWidth=Math.hypot(points[61].x-points[291].x,points[61].y-points[291].y);
      gl.uniform2f(this.uniforms.cameraSize,frame.width,frame.height);gl.uniform2f(this.uniforms.faceAxis,basis.x.x,basis.x.y);
      gl.uniform3f(this.uniforms.motion,motionActive ? .8*poseTrust : 0,motionActive ? .8*poseTrust : 0,motionActive&&settings.liveMouth!==true ? .85*poseTrust : 0);
      gl.uniform4f(this.uniforms.mouthRegion,(points[61].x+points[291].x)/2/frame.width,(mouthTop.y+mouthBottom.y)/2/frame.height,mouthWidth*.82/frame.width,Math.max(Math.hypot(mouthBottom.x-mouthTop.x,mouthBottom.y-mouthTop.y)*.8,mouthWidth*.27)/frame.height);
      if(motionActive||this.oralBlend>.002||amounts.some(v=>v>.002))this.upload(2,frame.video||frame);
      const samplingPoints=root.MouthMotion?root.MouthMotion.sanitize(cameraPoints):cameraPoints,oralMap=this.oralBlend>.002?root.MouthMotion?.interiorMapper(destination,samplingPoints):null;
      for(let i=0;i<468;i++){
        let own=0;for(let k=0;k<5;k++)own=Math.max(own,this.regions[i][k]*amounts[k]);
        vertex(i,destination[i],this.innerMouth.has(i)&&oralMap?oralMap(destination[i]):samplingPoints[i],edges?edges[i]:1,own,false,uvA[i],uvB[i],0,driverUV?.[i]);
      }
      const center=(ids,mesh)=>ids.reduce((p,i)=>({x:p.x+mesh[i].x/ids.length,y:p.y+mesh[i].y/ids.length,z:p.z+(mesh[i].z||0)/ids.length}),{x:0,y:0,z:0});
      HOLES.forEach((ids,k)=>{
        let target=center(ids,destination),textureA=center(ids,uvA),textureB=center(ids,uvB),snapshotUV=driverUV?center(ids,driverUV):null,livePoint=center(ids,samplingPoints);
        const iris=k===0?468:k===1?473:null,a=k===0?33:263,b=k===0?133:362;
        if(iris&&points[iris]&&uvA[iris]&&uvB[iris]){
          const liveCenter=center(ids,points),dx=points[b].x-points[a].x,dy=points[b].y-points[a].y,w=Math.max(Math.hypot(dx,dy),1),x=dx/w,y=dy/w;
          const tx=destination[b].x-destination[a].x,ty=destination[b].y-destination[a].y,top=k===0?159:386,bottom=k===0?145:374;
          const maxY=Math.min(.08,.35*Math.hypot(destination[top].x-destination[bottom].x,destination[top].y-destination[bottom].y)/Math.max(Math.hypot(tx,ty),1));
          const desiredX=clamp(((points[iris].x-liveCenter.x)*x+(points[iris].y-liveCenter.y)*y)/w,-.14,.14),desiredY=clamp((-(points[iris].x-liveCenter.x)*y+(points[iris].y-liveCenter.y)*x)/w,-maxY,maxY),g=this.gaze[k],alpha=1-Math.exp(-elapsed/15);g.x+=(desiredX-g.x)*alpha;g.y+=(desiredY-g.y)*alpha;const px=g.x,py=clamp(g.y,-maxY,maxY);
          target={...target,x:target.x+tx*px-ty*py,y:target.y+ty*px+tx*py};textureA=uvA[iris];textureB=uvB[iris];if(driverUV?.[iris])snapshotUV=driverUV[iris];if(cameraPoints[iris])livePoint=cameraPoints[iris];
        }
        vertex(468+k,target,k===2&&oralMap?oralMap(target):livePoint,1,amounts[k],true,textureA,textureB,k===2?1:0,snapshotUV);
      });
      if(backgroundReady){const [x0,y0,x1,y1]=this.backgroundRect;[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].forEach(([x,y],i)=>vertex(471+i,{x,y,z:0},{x,y},0,1,false,{x:0,y:0},{x:0,y:0}));}
      const dense=settings.dense!==false&&!!this.surface;
      if(dense){
        const surfaceBasis=root.FacePose?.basis(destination,frame.width),mids=this.midLocal&&surfaceBasis?root.FacePose.project(this.midLocal,surfaceBasis):root.FaceSurface.evaluate(destination,this.triangles,this.surface.edges,frame.width,this.protectedSurface);if(surfaceBasis&&!this.midLocal)this.midLocal=root.FaceSurface.local(mids,frame.width,surfaceBasis);
        // Interpolar atributos y curvar únicamente la posición. Boca, ojos y
        // contorno conservan sus mediciones; la superficie no inventa puntos.
        const hull=Q.silhouetteIds(destination),scale=pose3D?.scale||basis.scale;
        for(let j=0;j<this.surface.edges.length;j++){
          const e=this.surface.edges[j],offset=e.id*14;
          for(let k=0;k<14;k++)data[offset+k]=(data[e.a*14+k]+data[e.b*14+k])*.5;
          const p=mids[j];data[offset]=p.x/frame.width*2-1;data[offset+1]=1-p.y/frame.height*2;data[offset+2]=clamp(p.z*2,-.95,.95);
          if(edges&&this.midEdges){data[offset+9]=this.midEdges[j];}else if(edges){let nearest=Infinity;for(let k=0;k<hull.length;k++){const a=destination[hull[k]],b=destination[hull[(k+1)%hull.length]],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(dx*dx+dy*dy,1e-8),0,1);nearest=Math.min(nearest,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}data[offset+9]=e.count===1?0:nearest/Math.max(scale,1);}
        }
      }
      if(dense&&edges&&!this.midEdges)this.midEdges=this.surface.edges.map(e=>data[e.id*14+9]);
      const meshCount=dense?this.denseMeshCount:this.meshCount;this.renderVertices=dense?this.surface.surfaceCount:468;
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data.subarray(0,(dense?this.surface.vertexCount:backgroundReady?475:471)*14));
      // Nunca estirar cuello, ropa o fondo para esconder el contorno anterior.
      // Solo un fondo preparado permite retirar la silueta original.
      if(backgroundReady){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.backgroundBuffer);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.uniform1f(this.uniforms.onlyLive,2);gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);}
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,dense?this.denseIndices:this.indices);gl.uniform1f(this.uniforms.onlyLive,0);gl.drawElements(gl.TRIANGLES,meshCount,gl.UNSIGNED_SHORT,0);
      let offset=meshCount;const eyeWidth=k=>{const [a,b]=k?[263,362]:[33,133];return Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y);};
      HOLES.forEach((ids,k)=>{if(k===2&&this.oralBlend>.01)gl.disable(gl.DEPTH_TEST);if(k===2||Math.abs(yaw)<.75||eyeWidth(k)>eyeWidth(1-k)*.4)gl.drawElements(gl.TRIANGLES,ids.length*3,gl.UNSIGNED_SHORT,offset*2);if(k===2)gl.enable(gl.DEPTH_TEST);offset+=ids.length*3;});
      if(this.canvas.hidden)this.canvas.hidden=false;if(ctx)ctx.drawImage(this.canvas,0,0);this.latestPoints=destination;return visibility>.3;
    }
  }
  root.NeuralView=NeuralView;
})(typeof window!=='undefined'?window:globalThis);
