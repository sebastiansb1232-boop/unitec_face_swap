/* Capa WebGL sobre el video nativo. El lienzo 2D solo se utiliza al capturar. */
(function(root){
  'use strict';
  const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const HOLES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95]];
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rings(adjacency,ids){const out=Array(468).fill(1000),queue=[...ids];queue.forEach(i=>out[i]=0);for(let k=0;k<queue.length;k++)for(const j of adjacency[queue[k]])if(out[j]>out[queue[k]]+1){out[j]=out[queue[k]]+1;queue.push(j);}return out;}
  class NeuralView{
    constructor(triangles){
      this.canvas=document.createElement('canvas');this.canvas.className='neural-layer';this.canvas.setAttribute('aria-hidden','true');
      const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false});
      if(!gl)throw new Error('No se pudo activar la composición WebGL.');
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.hide();});
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('No se pudo preparar la composición neuronal.');return s;};
      const program=this.program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec2 pos;attribute vec2 sourceA;attribute vec2 sourceB;attribute vec2 live;attribute float edge;attribute float native;varying vec2 a;varying vec2 b;varying vec2 c;varying float border;varying float own;void main(){gl_Position=vec4(pos,0.,1.);a=sourceA;b=sourceB;c=live;border=edge;own=native;}`));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D photoA;uniform sampler2D photoB;uniform sampler2D inputA;uniform sampler2D inputB;uniform sampler2D camera;uniform float transition;uniform float intensity;uniform float onlyLive;uniform float cameraMirror;uniform float light;uniform float feather;varying vec2 a;varying vec2 b;varying vec2 c;varying float border;varying float own;void main(){vec2 uv=vec2(mix(c.x,1.-c.x,cameraMirror),c.y);vec3 original=texture2D(camera,uv).rgb;vec3 generated=mix(texture2D(photoA,a).rgb,texture2D(photoB,b).rgb,transition);vec3 baseline=mix(texture2D(inputA,a).rgb,texture2D(inputB,b).rgb,transition);vec3 weights=vec3(.299,.587,.114);float gain=clamp((dot(original,weights)+.08)/(dot(baseline,weights)+.08),.85,1.15);generated=clamp(generated*mix(1.,gain,light),0.,1.);float alpha=(onlyLive>.5?1.:smoothstep(0.,feather,border))*intensity;vec3 color=mix(generated,original,max(own,onlyLive));gl_FragColor=vec4(color*alpha,alpha);}`));
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('No se pudo enlazar la composición neuronal.');gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer=gl.createBuffer());
      this.data=new Float32Array(471*10);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
      [['pos',2,0],['sourceA',2,8],['sourceB',2,16],['live',2,24],['edge',1,32],['native',1,36]].forEach(([name,size,offset])=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset);});
      this.uniforms=Object.fromEntries(['transition','intensity','onlyLive','cameraMirror','light','feather'].map(n=>[n,gl.getUniformLocation(program,n)]));
      ['photoA','photoB','inputA','inputB','camera'].forEach((n,i)=>gl.uniform1i(gl.getUniformLocation(program,n),i));
      this.textures=Array.from({length:5},(_,i)=>{gl.activeTexture(gl.TEXTURE0+i);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return t;});
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const adj=Array.from({length:468},()=>new Set());for(const t of triangles)for(const i of t)for(const j of t)if(i!==j)adj[i].add(j);
      const eye=rings(adj,[...HOLES[0],...HOLES[1]]),mouth=rings(adj,HOLES[2]);this.edge=rings(adj,OVAL);this.regions=eye.map((d,i)=>[Math.max(0,1-d/4),Math.max(0,1-mouth[i]/4)]);
      const indices=triangles.flat();this.meshCount=indices.length;
      HOLES.forEach((ids,k)=>ids.forEach((id,i)=>indices.push(468+k,id,ids[(i+1)%ids.length])));this.holeCount=indices.length-this.meshCount;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices=gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);this.reset();
    }
    hide(){this.canvas.hidden=true;this.latestPoints=null;}
    reset(){this.key=null;this.previous=null;this.changed=0;this.hide();}
    upload(unit,image){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[unit]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}
    draw(ctx,frame,points,key,settings,now){
      if(!key?.uv||!points||this.lost){this.hide();return false;}
      const gl=this.gl,basis=root.FaceAppearance.basis(points),nose=points[1];
      const yaw=((nose.x-basis.origin.x)*basis.x.x+(nose.y-basis.origin.y)*basis.x.y)/basis.scale;
      const visibility=clamp((.32-Math.abs(yaw-(key.yaw??yaw)))/.14,0,1);
      if(visibility<=0){this.hide();return false;}
      if(this.canvas.width!==frame.width||this.canvas.height!==frame.height){this.canvas.width=frame.width;this.canvas.height=frame.height;}
      if(key!==this.key){
        this.previous=this.key||key;this.key=key;this.changed=now;
        this.upload(0,this.previous.image);this.upload(1,key.image);this.upload(2,this.previous.input||this.previous.image);this.upload(3,key.input||key.image);
      }
      gl.viewport(0,0,frame.width,frame.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);this.upload(4,frame.video||frame);
      gl.uniform1f(this.uniforms.transition,clamp((now-this.changed)/120,0,1));gl.uniform1f(this.uniforms.intensity,(settings.opacity??1)*visibility);
      gl.uniform1f(this.uniforms.cameraMirror,frame.video&&frame.mirror?1:0);gl.uniform1f(this.uniforms.light,key.input?(settings.light??.5):0);gl.uniform1f(this.uniforms.feather,1.6+(settings.softness??.65)*.95);
      const blink=Math.max(...[[33,133,159,145],[263,362,386,374]].map(([a,b,t,d])=>clamp((.18-distance(points[t],points[d])/Math.max(distance(points[a],points[b]),1))/.1,0,1)));
      const openness=distance(points[13],points[14])/Math.max(distance(points[61],points[291]),1),eyes=Math.max(settings.eyes??.35,blink*.98),mouth=Math.max(settings.mouth??.7,clamp((openness-.12)/.15,0,1)*.92);
      const uvA=this.previous.uv,uvB=key.uv,data=this.data;
      const vertex=(i,x,y,edge,own)=>{let k=i*10;data[k++]=x/frame.width*2-1;data[k++]=1-y/frame.height*2;data[k++]=uvA[i]?.x||0;data[k++]=uvA[i]?.y||0;data[k++]=uvB[i]?.x||0;data[k++]=uvB[i]?.y||0;data[k++]=x/frame.width;data[k++]=y/frame.height;data[k++]=edge;data[k]=own;};
      for(let i=0;i<468;i++)vertex(i,points[i].x,points[i].y,this.edge[i],Math.max(this.regions[i][0]*eyes,this.regions[i][1]*mouth));
      HOLES.forEach((ids,k)=>{let x=0,y=0;for(const i of ids){x+=points[i].x;y+=points[i].y;}vertex(468+k,x/ids.length,y/ids.length,4,1);});
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);
      gl.uniform1f(this.uniforms.onlyLive,0);gl.drawElements(gl.TRIANGLES,this.meshCount,gl.UNSIGNED_SHORT,0);
      gl.uniform1f(this.uniforms.onlyLive,1);gl.drawElements(gl.TRIANGLES,this.holeCount,gl.UNSIGNED_SHORT,this.meshCount*2);
      if(this.canvas.hidden)this.canvas.hidden=false;if(ctx)ctx.drawImage(this.canvas,0,0);this.latestPoints=points;return visibility>.3;
    }
  }
  root.NeuralView=NeuralView;
})(typeof window!=='undefined'?window:globalThis);
