/* Rostro con alfa propio, registro de ojos/nariz y profundidad de la malla. */
(function(root){
  'use strict';
  const Q=root.PortraitQuality,{HOLES}=Q;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class NeuralView{
    constructor(triangles){
      this.triangles=triangles;this.shape=new Q.IdentityShape();
      this.canvas=document.createElement('canvas');this.canvas.className='neural-layer';this.canvas.setAttribute('aria-hidden','true');
      const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:true});
      if(!gl)throw new Error('No se pudo activar la composición WebGL.');
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.hide();});
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('No se pudo preparar la composición neuronal.');return s;};
      const program=this.program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,`
        attribute vec3 pos;attribute vec2 sourceA;attribute vec2 sourceB;attribute vec2 live;
        attribute float edge;attribute float native;attribute float erase;
        varying vec2 a;varying vec2 b;varying vec2 c;varying float border;varying float own;varying float cover;
        void main(){gl_Position=vec4(pos,1.);a=sourceA;b=sourceB;c=live;border=edge;own=native;cover=erase;}`));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        uniform sampler2D photoA;uniform sampler2D photoB;uniform sampler2D camera;
        uniform float transition;uniform float intensity;uniform float onlyLive;uniform float cameraMirror;
        uniform float light;uniform float feather;uniform float matteA;uniform float matteB;uniform float baselineLuma;
        uniform vec3 complexion;uniform vec2 probeA;uniform vec2 probeB;uniform vec2 probeC;uniform vec4 eyeA;uniform vec4 eyeB;uniform vec2 eyeAssist;
        varying vec2 a;varying vec2 b;varying vec2 c;varying float border;varying float own;varying float cover;
        vec2 cameraUV(vec2 p){return vec2(mix(p.x,1.-p.x,cameraMirror),p.y);}
        float eyeMask(vec4 e){return 1.-smoothstep(.65,1.15,length((c-e.xy)/max(e.zw,vec2(.00001))));}
        void main(){
          vec3 original=texture2D(camera,cameraUV(c)).rgb;
          if(onlyLive>.5){float alpha=onlyLive>1.5?smoothstep(0.,.25,cover):intensity;gl_FragColor=vec4(original*alpha,alpha);return;}
          vec4 left=texture2D(photoA,a),right=texture2D(photoB,b);
          float edgeAlpha=smoothstep(.001,feather,border);
          // Las capas PNG ya tienen un único borde interior; JPEG anterior usa el contorno.
          left*=mix(edgeAlpha,1.,matteA);right*=mix(edgeAlpha,1.,matteB);
          vec4 layer=mix(left,right,transition);
          vec3 generated=layer.rgb/max(layer.a,.001);generated=mix(generated,left.rgb/max(left.a,.001),max(eyeMask(eyeA)*eyeAssist.x,eyeMask(eyeB)*eyeAssist.y));
          vec3 weights=vec3(.299,.587,.114);
          float currentLuma=(dot(texture2D(camera,cameraUV(probeA)).rgb,weights)+dot(texture2D(camera,cameraUV(probeB)).rgb,weights)+dot(texture2D(camera,cameraUV(probeC)).rgb,weights))/3.;
          // Ganancia global: la sombra de la nariz original no se imprime sobre la nueva.
          float gain=clamp((currentLuma+.08)/(baselineLuma+.08),.90,1.10);
          generated=clamp(generated*mix(1.,gain,light),0.,1.);
          // Corrección uniforme y acotada: conserva poros y gradientes.
          float skinWeight=1.-.8*max(eyeMask(eyeA),eyeMask(eyeB));
          float Y=dot(generated,weights)+complexion.x*skinWeight;
          float U=dot(generated,vec3(-.168736,-.331264,.5))+complexion.y*skinWeight;
          float V=dot(generated,vec3(.5,-.418688,-.081312))+complexion.z*skinWeight;
          generated=clamp(vec3(Y+1.402*V,Y-.344136*U-.714136*V,Y+1.772*U),0.,1.);
          float alpha=layer.a*intensity;
          vec3 color=mix(generated,original,own);
          gl_FragColor=vec4(color*alpha,alpha);
        }`));
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('No se pudo enlazar la composición neuronal.');gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer=gl.createBuffer());
      this.data=new Float32Array((471+468)*12);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
      [['pos',3,0],['sourceA',2,12],['sourceB',2,20],['live',2,28],['edge',1,36],['native',1,40],['erase',1,44]].forEach(([name,size,offset])=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,48,offset);});
      this.uniforms=Object.fromEntries(['transition','intensity','onlyLive','cameraMirror','light','feather','matteA','matteB','baselineLuma','probeA','probeB','probeC','eyeA','eyeB','eyeAssist','complexion'].map(n=>[n,gl.getUniformLocation(program,n)]));
      ['photoA','photoB','camera'].forEach((n,i)=>gl.uniform1i(gl.getUniformLocation(program,n),i));
      this.textureSizes=[];this.textures=Array.from({length:3},(_,i)=>{gl.activeTexture(gl.TEXTURE0+i);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return t;});
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      const adjacency=Array.from({length:468},()=>new Set());for(const t of triangles)for(const i of t)for(const j of t)if(i!==j)adjacency[i].add(j);
      this.regions=Q.featureRegions(adjacency,true);
      const indices=triangles.flat();this.meshCount=indices.length;
      HOLES.forEach((ids,k)=>ids.forEach((id,i)=>indices.push(468+k,id,ids[(i+1)%ids.length])));this.holeCount=indices.length-this.meshCount;
      this.baseIndices=indices.slice();this.skirtBuffer=gl.createBuffer();this.skirtSignature='';
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices=gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);this.reset();
    }
    hide(){this.canvas.hidden=true;this.latestPoints=null;}
    reset(){this.key=null;this.previous=null;this.changed=0;this.shape.reset();this.gaze=[{x:0,y:0},{x:0,y:0}];this.eyeBlend=[0,0];this.drawTime=null;this.boundaryStamp=null;this.eyeReference=null;this.toneFilter=root.PortraitBlend?new root.PortraitBlend.ToneFilter():null;this.toneStats=new WeakMap();this.toneSampleAt=-Infinity;this.liveTone=null;this.toneTargetReady=false;this.hide();}
    upload(unit,image){const gl=this.gl,w=image.videoWidth||image.naturalWidth||image.width,h=image.videoHeight||image.naturalHeight||image.height;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[unit]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);if(this.textureSizes[unit]?.[0]===w&&this.textureSizes[unit]?.[1]===h)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.textureSizes[unit]=[w,h];}}
    draw(ctx,frame,points,key,settings,now){
      if(!key?.uv||!points||this.lost||key.registrationRequired&&!key.registered){this.hide();return false;}
      const gl=this.gl,basis=root.FaceAppearance.basis(points),nose=points[1];
      const pose3D=key.stableIdentity&&root.FacePose?root.FacePose.basis(points,frame.width):null;
      const yaw=pose3D?pose3D.yaw:((nose.x-basis.origin.x)*basis.x.x+(nose.y-basis.origin.y)*basis.x.y)/basis.scale;
      const hasProfiles=key.referenceViews?.some(v=>v.side!=='front');
      const visibility=pose3D?(1-Q.smooth(key.referencePhoto ? .48 : .25,key.referencePhoto ? .85 : .62,Math.abs(yaw-(key.yaw??yaw))))*(1-Q.smooth(hasProfiles?1.30:1.05,1.50,Math.abs(yaw))):Q.smooth(0,.10,.24-Math.abs(yaw-(key.yaw??yaw)))*(1-Q.smooth(.58,.82,Math.abs(yaw)));
      if(visibility<=0||basis.scale<15){this.hide();return false;}
      const destination=this.shape.apply(points,key,(settings.shape??.82)*(settings.opacity??1)*visibility,now,this.triangles);
      if(this.canvas.width!==frame.width||this.canvas.height!==frame.height){this.canvas.width=frame.width;this.canvas.height=frame.height;}
      const eyeReference=key.generatedPoints&&key.referenceLayers?.length?key.referenceLayers.reduce((a,b)=>Math.abs(root.FacePose.basis(a.points,a.width).yaw-yaw)<Math.abs(root.FacePose.basis(b.points,b.width).yaw-yaw)?a:b):null;
      if(key!==this.key||eyeReference!==this.eyeReference){this.duration=eyeReference?0:Q.textureTransition(this.key,key);this.previous=this.duration?this.key:key;this.key=key;this.changed=now;this.eyeReference=eyeReference;this.referenceUV=eyeReference?.points.map(p=>({x:p.x/eyeReference.image.width,y:p.y/eyeReference.image.height}));this.upload(0,eyeReference?.image||this.previous.layer||this.previous.image);this.upload(1,key.layer||key.image);}
      if(root.ReferenceTone&&root.PortraitBlend&&settings.integrate!==false){
        if(!this.toneStats.has(key)){const im=key.image,w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;this.toneStats.set(key,root.ReferenceTone.sample(im,key.uv.map(p=>({x:p.x*w,y:p.y*h}))));}
        if(now-this.toneSampleAt>220){
          this.toneSampleAt=now;const c=this.toneCanvas||(this.toneCanvas=document.createElement('canvas'));c.width=160;c.height=Math.max(1,Math.round(160*frame.height/frame.width));const x=c.getContext('2d',{willReadFrequently:true});
          if(frame.video&&frame.mirror){x.translate(c.width,0);x.scale(-1,1);}x.drawImage(frame.video||frame,0,0,c.width,c.height);
          this.liveTone=root.ReferenceTone.sample(c,points.map(p=>({x:p.x*c.width/frame.width,y:p.y*c.height/frame.height})));
        }
        const source=this.toneStats.get(key);
        if(this.liveTone&&!this.toneTargetReady){this.toneFilter.value=this.liveTone.mean.slice();this.toneTargetReady=true;}
        const target=this.liveTone?{mean:this.toneFilter.update(this.liveTone.mean,now)}:null,t=root.PortraitBlend.tone(source,target);gl.uniform3f(this.uniforms.complexion,...t);
      }else gl.uniform3f(this.uniforms.complexion,0,0,0);
      const elapsed=this.drawTime===null?33:Math.max(1,Math.min(now-this.drawTime,100));this.drawTime=now;
      const liveExpression=Q.expression(points),nativeExpression=key.generatedPoints?Q.expression(key.generatedPoints):liveExpression;
      for(let k=0;k<2;k++){const desired=eyeReference?Q.smooth(.05,.14,liveExpression[k]-nativeExpression[k]):0;this.eyeBlend[k]+=(desired-this.eyeBlend[k])*(1-Math.exp(-elapsed/65));}
      gl.uniform2f(this.uniforms.eyeAssist,this.eyeBlend[0],this.eyeBlend[1]);
      [[33,133,159,145],[263,362,386,374]].forEach(([a,b,t,d],k)=>{const w=Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y),h=Math.hypot(points[t].x-points[d].x,points[t].y-points[d].y);gl.uniform4f(this.uniforms[k?'eyeB':'eyeA'],(points[a].x+points[b].x)/2/frame.width,(points[t].y+points[d].y)/2/frame.height,w*.65/frame.width,Math.max(h*.8,w*.07)/frame.height);});
      const transition=this.duration?clamp((now-this.changed)/this.duration,0,1):1;
      gl.viewport(0,0,frame.width,frame.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.upload(2,frame.video||frame);
      gl.uniform1f(this.uniforms.transition,transition);gl.uniform1f(this.uniforms.intensity,(settings.opacity??1)*visibility);
      gl.uniform1f(this.uniforms.cameraMirror,frame.video&&frame.mirror?1:0);gl.uniform1f(this.uniforms.light,key.lightLuma>0?(settings.light??.5):0);
      gl.uniform1f(this.uniforms.baselineLuma,(this.previous.lightLuma||key.lightLuma||.4)*(1-transition)+(key.lightLuma||.4)*transition);
      gl.uniform1f(this.uniforms.feather,.035+(settings.softness??.5)*.08);gl.uniform1f(this.uniforms.matteA,this.previous.layer&&!this.previous.rectangularLayer?1:0);gl.uniform1f(this.uniforms.matteB,key.layer&&!key.rectangularLayer?1:0);
      [50,280,151].forEach((id,k)=>gl.uniform2f(this.uniforms[['probeA','probeB','probeC'][k]],points[id].x/frame.width,points[id].y/frame.height));
      const registeredUV=k=>{if(!k.registrationFromUV)return k.uv;const t=clamp((now-k.registrationStarted)/80,0,1);if(t>=1){k.registrationFromUV=null;return k.uv;}return k.uv.map((p,i)=>({x:k.registrationFromUV[i].x+(p.x-k.registrationFromUV[i].x)*t,y:k.registrationFromUV[i].y+(p.y-k.registrationFromUV[i].y)*t}));};
      const amounts=Q.featureAmounts(points,settings),uvA=this.referenceUV||registeredUV(this.previous),uvB=registeredUV(key),data=this.data;
      const vertex=(i,p,cameraPoint,edge,own,hole=false,textureA=uvA[i],textureB=uvB[i],erase=1)=>{let k=i*12;data[k++]=p.x/frame.width*2-1;data[k++]=1-p.y/frame.height*2;data[k++]=clamp((p.z||0)*2-(hole ? .0002 : 0),-.95,.95);data[k++]=textureA?.x||0;data[k++]=textureA?.y||0;data[k++]=textureB?.x||0;data[k++]=textureB?.y||0;data[k++]=cameraPoint.x/frame.width;data[k++]=cameraPoint.y/frame.height;data[k++]=edge;data[k++]=own;data[k]=erase;};
      const stamp=points.stamp??now;if(this.boundaryStamp!==stamp){this.boundaryStamp=stamp;this.boundaryIds=Q.silhouetteIds(points);this.edgeValues=Q.silhouetteEdges(destination,Q.silhouetteIds(destination),pose3D?.scale||basis.scale);}
      const edges=key.layer&&this.previous.layer&&!key.rectangularLayer&&!this.previous.rectangularLayer?null:this.edgeValues;
      const oralOpening=liveExpression[2],sourceOpening=key.sourcePoints?Q.expression(key.sourcePoints)[2]:oralOpening;
      const liveOral=settings.identityLock&&(root.PortraitBlend?root.PortraitBlend.oralMix(yaw,oralOpening,sourceOpening,key.referencePhoto):Math.abs(yaw)<1.22&&oralOpening>.075&&(key.referencePhoto||Math.abs(oralOpening-sourceOpening)>.09)),oralIds=new Set([...HOLES[2],...root.FaceAppearance.LIPS]);
      for(let i=0;i<468;i++)vertex(i,destination[i],points[i],edges?edges[i]:1,Math.max(liveOral&&oralIds.has(i)?.99:0,...this.regions[i].map((weight,k)=>weight*amounts[k])));
      const center=(ids,mesh)=>ids.reduce((p,i)=>({x:p.x+mesh[i].x/ids.length,y:p.y+mesh[i].y/ids.length,z:p.z+(mesh[i].z||0)/ids.length}),{x:0,y:0,z:0});
      HOLES.forEach((ids,k)=>{
        let target=center(ids,destination),textureA=center(ids,uvA),textureB=center(ids,uvB);
        const iris=k===0?468:k===1?473:null,a=k===0?33:263,b=k===0?133:362;
        if(iris&&points[iris]&&uvA[iris]&&uvB[iris]){
          const liveCenter=center(ids,points),dx=points[b].x-points[a].x,dy=points[b].y-points[a].y,w=Math.max(Math.hypot(dx,dy),1),x=dx/w,y=dy/w;
          const tx=destination[b].x-destination[a].x,ty=destination[b].y-destination[a].y,top=k===0?159:386,bottom=k===0?145:374;
          const maxY=Math.min(.08,.35*Math.hypot(destination[top].x-destination[bottom].x,destination[top].y-destination[bottom].y)/Math.max(Math.hypot(tx,ty),1));
          const desiredX=clamp(((points[iris].x-liveCenter.x)*x+(points[iris].y-liveCenter.y)*y)/w,-.14,.14),desiredY=clamp((-(points[iris].x-liveCenter.x)*y+(points[iris].y-liveCenter.y)*x)/w,-maxY,maxY),g=this.gaze[k],alpha=1-Math.exp(-elapsed/65);g.x+=(desiredX-g.x)*alpha;g.y+=(desiredY-g.y)*alpha;const px=g.x,py=clamp(g.y,-maxY,maxY);
          target={...target,x:target.x+tx*px-ty*py,y:target.y+ty*px+tx*py};textureA=uvA[iris];textureB=uvB[iris];
        }
        vertex(468+k,target,center(ids,points),1,k===2&&liveOral?Math.max(amounts[k],.99):amounts[k],true,textureA,textureB);
      });
      const skirt=Q.silhouetteSkirt(points,destination,frame.width,this.boundaryIds),signature=this.boundaryIds.join(',');skirt.forEach((p,i)=>vertex(471+i,p.destination,p.source,0,1,false,{x:0,y:0},{x:0,y:0},0));
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.skirtBuffer);if(signature!==this.skirtSignature){const indices=this.baseIndices.slice();skirt.forEach((p,i)=>{const j=(i+1)%skirt.length;indices.push(p.id,skirt[j].id,471+i,skirt[j].id,471+j,471+i);});this.backgroundCount=indices.length;gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.DYNAMIC_DRAW);this.skirtSignature=signature;}
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data.subarray(0,(471+skirt.length)*12));
      // Recoloca la captura bajo el nuevo mentón y borra el contorno anterior.
      // El anillo exterior permanece fijo y se funde con el video sin rellenado de IA.
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.uniform1f(this.uniforms.onlyLive,2);gl.drawElements(gl.TRIANGLES,this.backgroundCount-this.baseIndices.length,gl.UNSIGNED_SHORT,this.baseIndices.length*2);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.uniform1f(this.uniforms.onlyLive,0);gl.drawElements(gl.TRIANGLES,this.meshCount,gl.UNSIGNED_SHORT,0);
      let offset=this.meshCount;const eyeWidth=k=>{const [a,b]=k?[263,362]:[33,133];return Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y);};
      HOLES.forEach((ids,k)=>{if(k===2||Math.abs(yaw)<.75||eyeWidth(k)>eyeWidth(1-k)*.4)gl.drawElements(gl.TRIANGLES,ids.length*3,gl.UNSIGNED_SHORT,offset*2);offset+=ids.length*3;});
      if(this.canvas.hidden)this.canvas.hidden=false;if(ctx)ctx.drawImage(this.canvas,0,0);this.latestPoints=destination;return visibility>.3;
    }
  }
  root.NeuralView=NeuralView;
})(typeof window!=='undefined'?window:globalThis);
