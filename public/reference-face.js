/* Transferencia fotográfica por malla, con anclaje de rasgos y borde interior. */
(function (root) {
  'use strict';
  const Appearance=root.FaceAppearance||(typeof require==='function'?require('./face-appearance.js'):null);
  const Quality=root.PortraitQuality||(typeof require==='function'?require('./portrait-quality.js'):null);
  const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const EYES = [[33,160,158,133,153,144],[362,385,387,263,373,380]];
  const HOLES = [[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],
    [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],
    [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95]];
  const BOUNDARY = new Set(OVAL), APERTURES = new Set(HOLES.flat());
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const smooth = n => {n=clamp(n,0,1);return n*n*(3-2*n);};
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const mix = (a,b,t) => a+(b-a)*t;
  function basis(p) {
    const a=p[33], b=p[263], scale=Math.max(dist(a,b),1e-6);
    const x={x:(b.x-a.x)/scale,y:(b.y-a.y)/scale};
    let y={x:-x.y,y:x.x};
    if((p[152].x-p[10].x)*y.x+(p[152].y-p[10].y)*y.y<0)y={x:-y.x,y:-y.y};
    return {origin:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},x,y,scale};
  }
  function normalize(p) {
    const b=basis(p);
    return p.map(v=>({x:((v.x-b.origin.x)*b.x.x+(v.y-b.origin.y)*b.x.y)/b.scale,
      y:((v.x-b.origin.x)*b.y.x+(v.y-b.origin.y)*b.y.y)/b.scale}));
  }
  function project(p,b) {
    return p.map(v=>({x:b.origin.x+b.scale*(v.x*b.x.x+v.y*b.y.x),y:b.origin.y+b.scale*(v.x*b.x.y+v.y*b.y.y)}));
  }
  function pose(p) {const n=normalize(p);return {yaw:n[1].x,pitch:n[1].y};}
  function neutralEnough(p) {
    const b=basis(p),n=normalize(p),mouth=dist(p[78],p[308]);
    // Apertura relativa: no exigir una altura de párpado propia de una sola anatomía.
    return b.scale>35 && Math.abs(n[1].x)<.2 && n[1].y>-.05 && n[1].y<1 &&
      dist(p[13],p[14])/Math.max(mouth,1)<.16 && EYES.every(e=>dist(p[e[1]],p[e[5]])/Math.max(dist(p[e[0]],p[e[3]]),1)>.045);
  }
  function average(shapes) {
    return shapes[0].map((_,i)=>({x:shapes.reduce((s,p)=>s+p[i].x,0)/shapes.length,y:shapes.reduce((s,p)=>s+p[i].y,0)/shapes.length}));
  }
  function topology(triangles) {
    const adjacency=Array.from({length:468},()=>new Set());
    triangles.forEach(t=>t.forEach(a=>t.forEach(b=>{if(a!==b)adjacency[a].add(b);})));return adjacency;
  }
  function ringDistance(adjacency,ids) {
    const depths=Array(468).fill(Infinity),queue=[...ids];queue.forEach(i=>{depths[i]=0;});
    for(let k=0;k<queue.length;k++)for(const j of adjacency[queue[k]])if(depths[j]>depths[queue[k]]+1){depths[j]=depths[queue[k]]+1;queue.push(j);}
    return depths;
  }
  function signedArea(p,t) {const [a,b,c]=t.map(i=>p[i]);return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
  function protectTriangles(live,dst,triangles) {
    if(!triangles.length)return dst;
    const minimum=basis(live).scale**2*.000015;
    // Reducir toda la deformación conserva continuidades y aperturas, sin ocultar triángulos.
    for(let attempt=0;attempt<7;attempt++) {
      const valid=triangles.every(t=>{const a=signedArea(live,t);return Math.abs(a)<minimum||signedArea(dst,t)/a>=.16;});
      if(valid)return dst;
      dst=dst.map((p,i)=>({x:mix(live[i].x,p.x,.5),y:mix(live[i].y,p.y,.5)}));
    }
    return live.map(p=>({x:p.x,y:p.y}));
  }
  function retarget(live,neutral,target,amount,triangles=[],adjacency=null) {
    const b=basis(live),scale=clamp(amount,0,1);
    let offsets=live.map((_,i)=>({x:BOUNDARY.has(i)?0:clamp(target[i].x-neutral[i].x,-.14,.14)*scale,
      y:BOUNDARY.has(i)?0:clamp(target[i].y-neutral[i].y,-.14,.14)*scale}));
    if(adjacency)for(let pass=0;pass<2;pass++)offsets=offsets.map((p,i)=>{
      if(BOUNDARY.has(i)||!adjacency[i].size)return p;
      const ids=[...adjacency[i]],mean=ids.reduce((s,j)=>({x:s.x+offsets[j].x/ids.length,y:s.y+offsets[j].y/ids.length}),{x:0,y:0});
      return {x:mix(p.x,mean.x,.35),y:mix(p.y,mean.y,.35)};
    });
    HOLES.forEach(ids=>{
      const center=ids.reduce((s,i)=>({x:s.x+offsets[i].x/ids.length,y:s.y+offsets[i].y/ids.length}),{x:0,y:0});ids.forEach(i=>{offsets[i]=center;});
    });
    const dst=live.map((p,i)=>({x:p.x+b.scale*(offsets[i].x*b.x.x+offsets[i].y*b.y.x),y:p.y+b.scale*(offsets[i].x*b.x.y+offsets[i].y*b.y.y)}));
    return protectTriangles(live,dst,triangles);
  }
  class LandmarkSmoother {
    reset(){this.previous=null;this.time=null;}
    filter(live,amount,now) {
      const local=normalize(live),dt=clamp((now-(this.time??now-33))/1000,.008,.15),b=basis(live);
      if(!this.previous||amount<=0){this.previous=local;this.time=now;return live;}
      const filtered=local.map((p,i)=>{
        // Los párpados y labios internos conservan el dato de este fotograma.
        const delta=dist(p,this.previous[i]);
        if(APERTURES.has(i)||BOUNDARY.has(i)||delta>.16)return p;
        const speed=delta/dt,alpha=1-Math.exp(-dt/(.065*amount/(1+speed*9)));
        return {x:mix(this.previous[i].x,p.x,alpha),y:mix(this.previous[i].y,p.y,alpha)};
      });
      this.previous=filtered;this.time=now;return project(filtered,b);
    }
  }
  function rgbToYuv([r,g,b]) {return [.299*r+.587*g+.114*b,-.168736*r-.331264*g+.5*b,.5*r-.418688*g-.081312*b];}
  function yuvToRgb([y,u,v]) {return [y+1.402*v,y-.344136*u-.714136*v,y+1.772*u];}
  function robustStats(colors) {
    if(!colors.length)return null;
    const values=colors.map(rgbToYuv),quantile=(a,q)=>{a=a.slice().sort((x,y)=>x-y);return a[Math.floor((a.length-1)*q)];};
    // Cuantiles relativos, sin reglas RGB que excluyan pieles claras u oscuras.
    const median=[0,1,2].map(c=>quantile(values.map(v=>v[c]),.5));
    const luminance=values.map(v=>v[0]);
    return {mean:median,spread:Math.max(.012,quantile(luminance,.85)-quantile(luminance,.15))};
  }
  function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(dx*dx+dy*dy,1e-10),0,1);
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
  function edgeDistances(points) {
    const scale=basis(points).scale;
    return points.map((p,i)=>BOUNDARY.has(i)?0:Math.min(...OVAL.map((id,k)=>segmentDistance(p,points[id],points[OVAL[(k+1)%OVAL.length]])))/scale);
  }
  function boxPass(input,output,w,h,r,horizontal) {
    const lines=horizontal?h:w,length=horizontal?w:h,step=horizontal?4:w*4,divisor=2*r+1;
    for(let line=0;line<lines;line++) {
      const base=horizontal?line*w*4:line*4;
      for(let channel=0;channel<4;channel++) {
        let sum=0;for(let k=-r;k<=r;k++)sum+=input[base+clamp(k,0,length-1)*step+channel];
        for(let i=0;i<length;i++) {
          output[base+i*step+channel]=sum/divisor;
          sum+=input[base+clamp(i+r+1,0,length-1)*step+channel]-input[base+clamp(i-r,0,length-1)*step+channel];
        }
      }
    }
  }
  function normalizedBlur(pixels,w,h,radius,buffers={}) {
    const length=w*h*4;
    if(buffers.a?.length!==length){buffers.a=new Float32Array(length);buffers.b=new Float32Array(length);buffers.out=new Uint8ClampedArray(length);}
    const {a,b,out}=buffers,r=Math.max(1,Math.round(radius));
    for(let i=0;i<length;i+=4){const weight=pixels[i+3]/255;a[i]=pixels[i]*weight;a[i+1]=pixels[i+1]*weight;a[i+2]=pixels[i+2]*weight;a[i+3]=weight;}
    // Convolución normalizada: el fondo transparente no oscurece el borde de la piel.
    for(let pass=0;pass<3;pass++){boxPass(a,b,w,h,r,true);boxPass(b,a,w,h,r,false);}
    for(let i=0;i<length;i+=4){const weight=a[i+3];for(let c=0;c<3;c++)out[i+c]=weight>.005?a[i+c]/weight:0;out[i+3]=weight>.005?255:0;}
    return out;
  }
  class LightField {
    constructor(){
      this.raw=document.createElement('canvas');this.ctx=this.raw.getContext('2d',{willReadFrequently:true});
      this.canvas=document.createElement('canvas');this.output=this.canvas.getContext('2d');this.buffers={};
    }
    update(image,points) {
      const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,eye=basis(points).scale,pad=eye*.24;
      const xs=OVAL.map(i=>points[i].x),ys=OVAL.map(i=>points[i].y);
      const x=Math.min(...xs)-pad,y=Math.min(...ys)-pad,w=Math.max(...xs)-x+pad,h=Math.max(...ys)-y+pad;
      // Resolución fija: evita reallocaciones cuando el rostro se acerca o se aleja.
      const size=144;
      if(this.raw.width!==size){this.raw.width=this.raw.height=this.canvas.width=this.canvas.height=size;this.result=this.output.createImageData(size,size);}
      const ctx=this.ctx,sx=size/w,sy=size/h;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,size,size);ctx.save();ctx.scale(sx,sy);ctx.translate(-x,-y);
      ctx.beginPath();OVAL.forEach((id,k)=>{const p=points[id];k?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.clip();ctx.drawImage(image,0,0,iw,ih);
      // Evitar que blancos de ojos y dientes contaminen la estimación de iluminación.
      ctx.globalCompositeOperation='destination-out';
      const outerLips=[61,40,37,0,267,270,291,321,314,17,84,91];
      for(const ids of [HOLES[0],HOLES[1],outerLips]){
        const center=ids.reduce((s,i)=>({x:s.x+points[i].x/ids.length,y:s.y+points[i].y/ids.length}),{x:0,y:0});
        ctx.beginPath();ids.forEach((id,k)=>{const p={x:center.x+(points[id].x-center.x)*1.12,y:center.y+(points[id].y-center.y)*1.35};k?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fill();
      }
      ctx.restore();
      const pixels=ctx.getImageData(0,0,size,size).data,radius=clamp(eye*Math.sqrt(sx*sy)*.095,2,11);
      this.result.data.set(normalizedBlur(pixels,size,size,radius,this.buffers));this.output.putImageData(this.result,0,0);
      this.rect=[x/iw,y/ih,w/iw,h/ih];return this;
    }
  }
  class SkinSampler {
    constructor(){this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});}
    sample(image,p) {
      const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height,scale=Math.min(1,240/Math.max(w,h));
      const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
      this.ctx.drawImage(image,0,0,width,height);
      const data=this.ctx.getImageData(0,0,width,height).data,sx=width/w,sy=height/h;
      const forehead={x:mix(p[151].x,p[10].x,.3),y:mix(p[151].y,p[10].y,.3)};
      const regions=[[p[50],p[101],p[118]],[p[280],p[330],p[347]],[forehead,p[108],p[337]]];
      const radius=clamp(basis(p).scale*sx*.035,1.2,5);
      const colors=regions.map(anchors=>{
        const pixels=[];
        for(const a of anchors)for(let y=Math.ceil(a.y*sy-radius);y<=a.y*sy+radius;y++)for(let x=Math.ceil(a.x*sx-radius);x<=a.x*sx+radius;x++){
          if(x<0||y<0||x>=width||y>=height||(x-a.x*sx)**2+(y-a.y*sy)**2>radius**2)continue;
          const i=(y*width+x)*4;if(data[i+3]>0)pixels.push([data[i]/255,data[i+1]/255,data[i+2]/255]);
        }
        return pixels;
      });
      const fallback=robustStats(colors.flat());if(!fallback)return null;
      return colors.map(values=>robustStats(values)||fallback);
    }
    irises(image,points){
      if(points.length<478)return [[.16,.12,.09],[.16,.12,.09]];
      const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
      this.canvas.width=w;this.canvas.height=h;this.ctx.drawImage(image,0,0,w,h);
      const pixels=this.ctx.getImageData(0,0,w,h).data;
      return [468,473].map(id=>{
        const center=points[id],radius=Math.max(1,dist(points[id+1],points[id+3])*.5),samples=[];
        for(let y=Math.floor(center.y-radius);y<=center.y+radius;y++)for(let x=Math.floor(center.x-radius);x<=center.x+radius;x++){
          const r=Math.hypot(x-center.x,y-center.y)/radius;
          if(x<0||y<0||x>=w||y>=h||r<.4||r>.82)continue;
          const i=(y*w+x)*4;samples.push([pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255]);
        }
        return Appearance.medianColor(samples)||[.16,.12,.09];
      });
    }
  }
  const VERTEX=`
    attribute vec3 pos; attribute vec2 uvA; attribute vec2 uvB; attribute vec2 uvLive;
    attribute float edge; attribute float feature;
    varying vec2 texA; varying vec2 texB; varying vec2 cameraUV; varying vec2 outputUV;
    varying float border; varying float ownFeature;
    void main(){gl_Position=vec4(pos,1.);texA=uvA;texB=uvB;cameraUV=uvLive;outputUV=vec2((pos.x+1.)*.5,(1.-pos.y)*.5);border=edge;ownFeature=feature;}`;
  const FRAGMENT=`
    precision mediump float;
    uniform sampler2D photoA; uniform sampler2D photoB; uniform sampler2D camera;
    uniform sampler2D lightA; uniform sampler2D lightB; uniform sampler2D lightLive;
    uniform vec4 rectA; uniform vec4 rectB; uniform vec4 rectLive;
    uniform vec3 fallbackA; uniform vec3 fallbackB; uniform vec3 fallbackLive;
    // strength, transition, tone, anchura de mezcla en unidades de distancia entre ojos.
    uniform vec4 settings; uniform float onlyLive; uniform vec3 material; uniform float completeHead;
    uniform vec4 irisLeft; uniform vec4 irisRight; uniform vec3 irisToneLeft; uniform vec3 irisToneRight;
    varying vec2 texA; varying vec2 texB; varying vec2 cameraUV; varying vec2 outputUV;
    varying float border; varying float ownFeature;
    vec3 toYUV(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(-.168736,-.331264,.5)),dot(c,vec3(.5,-.418688,-.081312)));}
    vec3 toRGB(vec3 c){return vec3(c.x+1.402*c.z,c.x-.344136*c.y-.714136*c.z,c.x+1.772*c.y);}
    vec3 localColor(vec4 sample,vec3 fallback){return mix(fallback,toYUV(sample.rgb),step(.5,sample.a));}
    vec3 relight(vec3 color,vec3 lowSource,vec3 lowTarget,vec3 referenceMean,vec3 native){
      vec3 source=toYUV(color);float detail=source.x-lowSource.x;
      // Una sola iluminación: no volver a sumar las sombras amplias de la foto.
      float scene=clamp(lowTarget.x/max(fallbackLive.x,.035),.55,1.5);
      float targetY=mix(lowTarget.x,referenceMean.x*scene,material.x*.28);
      float gain=clamp(targetY/max(lowSource.x,.045),.7,1.4);
      vec2 chroma=mix(lowTarget.yz,referenceMean.yz,material.x*.78)+clamp(source.yz-lowSource.yz,vec2(-.06),vec2(.06))*.7;
      float volume=clamp(lowSource.x-referenceMean.x,-.10,.10)*.28;
      vec3 result=vec3(targetY+volume+detail*gain*material.y,chroma);
      return mix(clamp(toRGB(result),0.,1.),color,completeHead*.6);
    }
    vec3 tintIris(vec3 color,vec4 eye,vec3 tone){
      float radius=length((cameraUV-eye.xy)/max(eye.zw,vec2(.00001)));
      vec3 c=toYUV(color),t=toYUV(tone);
      // Sclera, reflejos y pupila conservan sus valores; solo cambia el anillo del iris.
      float mask=(1.-smoothstep(.8,1.,radius))*smoothstep(.19,.44,radius)*(1.-smoothstep(.55,.8,c.x));
      vec3 iris=toRGB(vec3(mix(c.x,t.x+(c.x-.18)*.65,.75),t.yz));
      return mix(color,clamp(iris,0.,1.),mask*.88);
    }
    void main(){
      vec3 native=texture2D(camera,cameraUV).rgb;
      if(onlyLive>.5){native=tintIris(tintIris(native,irisLeft,irisToneLeft),irisRight,irisToneRight);gl_FragColor=vec4(native*settings.x,settings.x);return;}
      vec3 base=localColor(texture2D(lightLive,(cameraUV-rectLive.xy)/rectLive.zw),fallbackLive);
      vec3 a=localColor(texture2D(lightA,(texA-rectA.xy)/rectA.zw),fallbackA);
      vec3 b=localColor(texture2D(lightB,(texB-rectB.xy)/rectB.zw),fallbackB);
      vec3 ca=relight(texture2D(photoA,texA).rgb,a,base,fallbackA,native);
      vec3 cb=relight(texture2D(photoB,texB).rgb,b,base,fallbackB,native);
      vec3 face=mix(mix(ca,cb,settings.y),native,ownFeature);
      // El borde se suaviza una vez, hacia dentro de la silueta.
      float alpha=smoothstep(.001,settings.w,border)*settings.x;
      gl_FragColor=vec4(face*alpha,alpha);
    }`;
  class MeshRenderer {
    constructor(triangles) {
      this.canvas=document.createElement('canvas');
      const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,depth:true});
      if(!gl)throw new Error('Este dispositivo no permite el filtro de retrato (WebGL).');
      this.lost=false;this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('No se pudo preparar el filtro gráfico.');return s;};
      const program=this.program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('No se pudo enlazar el filtro gráfico.');
      gl.useProgram(program);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      [['pos',3,0],['uvA',2,12],['uvB',2,20],['uvLive',2,28],['edge',1,36],['feature',1,40]].forEach(([name,size,offset])=>{
        const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,44,offset);
      });
      this.u=Object.fromEntries(['rectA','rectB','rectLive','fallbackA','fallbackB','fallbackLive','settings','onlyLive','material','completeHead','irisLeft','irisRight','irisToneLeft','irisToneRight'].map(n=>[n,gl.getUniformLocation(program,n)]));
      ['photoA','photoB','camera','lightA','lightB','lightLive'].forEach((n,i)=>gl.uniform1i(gl.getUniformLocation(program,n),i));
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      this.textures=new Map();this.videoTexture=this.texture();this.lightTexture=this.texture();this.liveLight=new LightField();this.triangles=triangles;this.adjacency=topology(triangles);
      this.native=Array(468).fill(0);this.regions=Quality.featureRegions(this.adjacency);
      this.vertices=new Float32Array(triangles.length*33);
      this.holeTriangles=[];
      HOLES.forEach((ids,k)=>ids.forEach((id,j)=>this.holeTriangles.push([468+k,id,ids[(j+1)%ids.length]])));
      this.holeVertices=new Float32Array(this.holeTriangles.length*33);
    }
    texture(){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
    bindReference(ref,unit,lightUnit){
      const gl=this.gl;let textures=this.textures.get(ref);
      if(!textures){
        if(!ref.light)ref.light=new LightField().update(ref.image,ref.points);
        gl.activeTexture(gl.TEXTURE0+unit);const photo=this.texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ref.image);
        gl.activeTexture(gl.TEXTURE0+lightUnit);const light=this.texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ref.light.canvas);
        textures={photo,light};this.textures.set(ref,textures);
      }
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,textures.photo);
      gl.activeTexture(gl.TEXTURE0+lightUnit);gl.bindTexture(gl.TEXTURE_2D,textures.light);
    }
    releaseCustomReferences(){for(const [ref,textures] of this.textures)if(ref.custom){this.gl.deleteTexture(textures.photo);this.gl.deleteTexture(textures.light);this.textures.delete(ref);}}
    batch(a,b,live,dst,edges,frame,triangles,data,onlyLive) {
      const gl=this.gl,W=frame.width,H=frame.height;let k=0;
      for(const t of triangles)for(const i of t){
        const p=dst[i],sa=a.points[i]||live[i],sb=b.points[i]||live[i];
        data[k++]=p.x/W*2-1;data[k++]=1-p.y/H*2;
        data[k++]=clamp((live[i]?.z||0)*2-(onlyLive ? .0002 : 0),-.95,.95);
        data[k++]=sa.x/a.image.width;data[k++]=sa.y/a.image.height;data[k++]=sb.x/b.image.width;data[k++]=sb.y/b.image.height;
        data[k++]=live[i].x/W;data[k++]=live[i].y/H;
        data[k++]=onlyLive?1:edges[i];data[k++]=onlyLive?1:this.native[i];
      }
      gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.uniform1f(this.u.onlyLive,onlyLive?1:0);gl.drawArrays(gl.TRIANGLES,0,data.length/11);
    }
    draw(a,b,blend,live,dst,frame,colors,settings) {
      if(this.lost)throw new Error('Se perdió el contexto gráfico. Recarga para reactivar el retrato.');
      const gl=this.gl;
      if(this.canvas.width!==frame.width||this.canvas.height!==frame.height){this.canvas.width=frame.width;this.canvas.height=frame.height;}
      gl.viewport(0,0,frame.width,frame.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      this.bindReference(a,0,3);this.bindReference(b,1,4);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.videoTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,frame);
      this.liveLight.update(frame,live);
      gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,this.lightTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.liveLight.canvas);
      const mean=stats=>[0,1,2].map(c=>stats.reduce((sum,s)=>sum+s.mean[c],0)/stats.length);
      gl.uniform3fv(this.u.fallbackA,mean(a.colors));gl.uniform3fv(this.u.fallbackB,mean(b.colors));gl.uniform3fv(this.u.fallbackLive,mean(colors));
      gl.uniform4fv(this.u.rectA,a.light.rect);gl.uniform4fv(this.u.rectB,b.light.rect);gl.uniform4fv(this.u.rectLive,this.liveLight.rect);
      gl.uniform4f(this.u.settings,settings.opacity,blend,settings.tone,.012+settings.softness*.035);
      gl.uniform3f(this.u.material,settings.complexion??.92,settings.detail??1,0);
      gl.uniform1f(this.u.completeHead,settings.fullHead?1:0);
      [468,473].forEach((id,k)=>{
        const p=settings.allPoints?.[id],r=p?dist(settings.allPoints[id+1],settings.allPoints[id+3])*.5:0;
        gl.uniform4f(this.u[k?'irisRight':'irisLeft'],p?p.x/frame.width:-2,p?p.y/frame.height:-2,r/frame.width,r/frame.height);
        gl.uniform3fv(this.u[k?'irisToneRight':'irisToneLeft'],a.irises?.[k]||[.16,.12,.09]);
      });
      const edges=edgeDistances(live);
      const amounts=Quality.featureAmounts(live,settings);
      this.native=this.regions.map(r=>Math.max(...r.map((weight,k)=>weight*amounts[k])));
      this.batch(a,b,live,dst,edges,frame,this.triangles,this.vertices,false);
      const source=live.slice(),destination=dst.slice();
      for(const ids of HOLES){const center=arr=>ids.reduce((s,i)=>({x:s.x+arr[i].x/ids.length,y:s.y+arr[i].y/ids.length,z:s.z+(arr[i].z||0)/ids.length}),{x:0,y:0,z:0});source.push(center(live));destination.push(center(dst));}
      this.batch(a,b,source,destination,edges,frame,this.holeTriangles,this.holeVertices,true);
      return this.canvas;
    }
  }
  class ReferenceFace {
    constructor(status){this.status=status;this.references=[];this.ready=false;this.shape=.95;this.opacity=1;this.tone=1;this.complexion=.7;this.lockTone=true;this.colorMode='reference';this.colorBlend=.85;this.detail=.95;this.softness=.45;this.stability=.55;this.eyes=0;this.mouth=0;this.forehead=0;this.chin=0;this.mode='auto';this.smoother=new Appearance.ExpressionSmoother();this.reset();}
    reset(){this.neutral=null;this.samples=[];this.lastNormalized=null;this.lastReference=null;this.rendered=false;this.currentReference=null;this.transition=null;this.colors=null;this.lastToneTime=null;this.visibility=0;this.lastDraw=null;this.smoother.reset();}
    lost(){this.rendered=false;this.samples=[];this.lastNormalized=null;this.colors=null;this.lastToneTime=null;this.visibility=0;this.lastDraw=null;this.smoother.reset();this.head?.clearTracking();if(this.ready)this.status('Coloca tu rostro frente a la cámara para activar el retrato.');}
    async prepare(mesh,triangles) {
      this.ready=false;this.triangles=triangles;this.status('Preparando el filtro de retrato…');const references=[];let detected=null;
      this.sampler=new SkinSampler();mesh.onResults(r=>{detected=r.multiFaceLandmarks?.[0]?.map(p=>({...p}));});
      try {
        for(const index of [1,0,3]){
          const image=new Image();image.src='assets/reference-face/portrait-'+(index+1)+'.png';
          try {
            await image.decode();await mesh.reset();detected=null;await mesh.send({image});if(!detected)continue;
            const points=detected.map(p=>({x:p.x*image.naturalWidth,y:p.y*image.naturalHeight,z:p.z})),colors=this.sampler.sample(image,points);
            if(colors){references.push({image,points,normalized:normalize(points.slice(0,468)),pose:pose(points),colors,index,irises:this.sampler.irises(image,points)});break;}
          }catch(error){console.warn('Referencia no disponible:',index+1,error.message);}
        }
        const neutrals=references.filter(r=>r.index!==2);if(!neutrals.length)throw new Error('No se pudo analizar una foto neutral. Revisa tu conexión y recarga.');
        this.target=average(neutrals.map(r=>r.normalized));this.references=references;this.originalReferences=references;this.renderer=new MeshRenderer(triangles);this.ready=true;
        this.status('Filtro listo. Mira de frente y relaja la boca para calibrar.');
      } finally {await mesh.reset();}
    }
    setCustomReference(image,landmarks){
      if(!landmarks||landmarks.length<468)throw new Error('No se encontró un rostro completo. Prueba una foto frontal y bien iluminada.');
      const points=landmarks.map(p=>({x:p.x*image.width,y:p.y*image.height,z:p.z})),colors=this.sampler.sample(image,points);
      if(!colors)throw new Error('No se pudo analizar el color de esta foto.');
      this.renderer??=new MeshRenderer(this.triangles);this.renderer.releaseCustomReferences();
      const ref={image,points,normalized:normalize(points.slice(0,468)),pose:pose(points),colors,index:4,custom:true,irises:this.sampler.irises(image,points)};
      this.references=[ref];this.mode='custom';this.target=ref.normalized;this.ready=true;this.reset();this.head?.clearTracking();if(!this.head?.suspended)this.head?.prepareReference(ref);
      this.status('Tu referencia está lista. Mira de frente para calibrar tus gestos.');return ref;
    }
    useDefault(){this.renderer.releaseCustomReferences();this.references=this.originalReferences;this.mode='auto';this.reset();this.head?.clearTracking();}
    choose(live) {
      // Mantener la misma foto evita que cambien los rasgos al mover la cabeza.
      if(this.mode==='custom')return this.references[0];
      if(this.mode==='auto')return this.references.find(r=>r.index===1)||this.references[0];
      if(this.mode!=='auto')return this.references.find(r=>String(r.index)===this.mode)||this.references[0];
      const p=pose(live),candidates=this.references.filter(r=>r.index!==2);
      const score=r=>Math.abs(r.pose.yaw-p.yaw)*3+Math.abs(r.pose.pitch-p.pitch)+(r.index===0?.35:r.index===3?.065:0);
      const best=candidates.reduce((a,b)=>score(a)<score(b)?a:b);
      if(!this.lastReference||score(best)+.09<score(this.lastReference))this.lastReference=best;return this.lastReference;
    }
    referencesAt(desired,now) {
      if(!this.currentReference)this.currentReference=desired;
      if(this.transition&&now-this.transition.started>=360){this.currentReference=this.transition.to;this.transition=null;}
      if(!this.transition&&desired!==this.currentReference)this.transition={from:this.currentReference,to:desired,started:now};
      return this.transition?{a:this.transition.from,b:this.transition.to,blend:smooth((now-this.transition.started)/360)}:{a:desired,b:desired,blend:0};
    }
    updateColors(frame,live,now) {
      if(this.colorMode==='reference'){this.colors=this.choose(live)?.colors||null;return;}
      if(this.colors&&now-this.lastToneTime<100)return;
      const sampled=this.sampler.sample(frame,live);if(!sampled)return;
      const alpha=this.colors?1-Math.exp(-clamp(now-this.lastToneTime,0,1000)/240):1;
      this.colors=sampled.map((s,i)=>({mean:s.mean.map((v,c)=>mix(this.colors?.[i].mean[c]??v,v,alpha)),spread:mix(this.colors?.[i].spread??s.spread,s.spread,alpha)}));this.lastToneTime=now;
    }
    draw(ctx,frame,allPoints,now=performance.now()) {
      this.rendered=false;if(!this.ready)return;const live=allPoints.slice(0,468);
      if(live.length!==468||!live.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))||basis(live).scale<20){this.lost();return;}
      if(!this.neutral){
        if(!neutralEnough(live)){this.samples=[];this.lastNormalized=null;this.status('Calibración: mira de frente, abre los ojos y mantén la boca relajada y cerrada.');return;}
        const n=normalize(live);if(this.lastNormalized&&Math.max(...n.map((p,i)=>dist(p,this.lastNormalized[i])))>.06)this.samples=[];
        this.lastNormalized=n;this.samples.push(n);this.status('Mantén la expresión neutral… '+Math.round(this.samples.length/12*100)+'%');
        if(this.samples.length<12)return;this.neutral=average(this.samples);this.samples=[];
      }
      const yaw=Math.abs(pose(live).yaw),desiredOpacity=smooth((.65-yaw)/.18),dt=clamp(now-(this.lastDraw??now-33),0,200);
      this.lastDraw=now;this.visibility=mix(this.visibility,desiredOpacity,1-Math.exp(-dt/95));
      if(yaw>.72||this.visibility<.01){this.visibility=0;this.status('Vuelve un poco hacia la cámara: las fotos disponibles son frontales.');return;}
      const stable=this.smoother.filter(live,this.stability,now);
      try {
        this.updateColors(frame,live,now);if(!this.colors)return;
        const ref=this.choose(live),r=this.referencesAt(ref,now);
        let fullHead=false;
        if(this.head)this.head.complexion=this.complexion;
        try{fullHead=this.head?.drawBefore(ctx,frame,stable,ref,this.opacity*this.visibility,now)||false;}catch(error){this.head?.status(error.message);}
        let dst=Appearance.transfer(stable,this.neutral,ref.normalized,this.shape,{oval:OVAL,fullHead});
        dst=Quality.anchorGeometry(live,dst,this.renderer.adjacency,fullHead);
        dst=protectTriangles(live,dst,this.renderer.triangles);
        ctx.drawImage(this.renderer.draw(r.a,r.b,r.blend,live,dst,frame,this.colors,{opacity:this.opacity*this.visibility,tone:this.tone,softness:this.softness,complexion:this.colorMode==='reference'?1:this.colorMode==='mixed'?this.colorBlend:0,detail:this.detail,allPoints,fullHead,composite:ctx.canvas,eyes:this.eyes,mouth:this.mouth,forehead:this.forehead,chin:this.chin}),0,0);
        this.rendered=this.visibility>.5 && yaw<.58;
        this.status(yaw>.48?'Gira un poco hacia la cámara para mejorar el ajuste.':'Retrato activo · Ojos anclados y bordes limpios');
      }catch(error){this.ready=false;this.status(error.message);}
    }
  }
  root.ReferenceFace=ReferenceFace;
  if(typeof module!=='undefined')module.exports={basis,normalize,pose,neutralEnough,average,retarget,HOLES,OVAL,topology,protectTriangles,signedArea,LandmarkSmoother,rgbToYuv,yuvToRgb,robustStats,segmentDistance,edgeDistances,normalizedBlur,LightField};
})(typeof window!=='undefined'?window:globalThis);
