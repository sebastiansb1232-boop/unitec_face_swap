/* Registro de texturas y límites geométricos compartidos por los dos motores. */
(function(root){
  'use strict';
  const A=root.FaceAppearance||(typeof require==='function'?require('./face-appearance'):null);
  const {basis,normalize,clamp}=A;
  const Mouth=root.MouthMotion||(typeof require==='function'?require('./mouth-motion'):null);
  const Pose=root.FacePose||(typeof require==='function'?require('./face-pose'):null);
  const Proportions=root.FaceProportions||(typeof require==='function'?require('./face-proportions'):null);
  const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const HOLES=[...A.EYES,[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95]];
  const eyeAndLip=new Set([...A.EYES.flat(),...A.LIPS]),BROWS=[...A.EXPRESSIVE].filter(i=>!eyeAndLip.has(i));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  function ringDistances(adjacency,ids){
    const out=Array(468).fill(1000),queue=[...ids];for(const id of ids)out[id]=0;
    for(let k=0;k<queue.length;k++)for(const id of adjacency[queue[k]]||[])if(out[id]>out[queue[k]]+1){out[id]=out[queue[k]]+1;queue.push(id);}
    return out;
  }
  function contourDistances(points){
    const b=basis(points),boundary=new Set(OVAL);
    return points.slice(0,468).map((p,i)=>{
      if(boundary.has(i))return 0;
      let nearest=Infinity;
      for(let k=0;k<OVAL.length;k++){
        const a=points[OVAL[k]],c=points[OVAL[(k+1)%OVAL.length]],dx=c.x-a.x,dy=c.y-a.y;
        const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(dx*dx+dy*dy,1e-8),0,1);
        nearest=Math.min(nearest,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
      }
      return nearest/b.scale;
    });
  }
  function featureRegions(adjacency,narrow=false){
    const seeds=[HOLES[0],HOLES[1],HOLES[2],[10,109,338],[152,148,377]],widths=narrow?[1.15,1.15,1.35,3,2]:[2.3,2.3,2.5,4.5,3];
    const rings=seeds.map(ids=>ringDistances(adjacency,ids));
    return Array.from({length:468},(_,i)=>rings.map((r,k)=>1-smooth(0,widths[k],r[i])));
  }
  function featureAmounts(points,settings={}){
    const blink=([a,b,top,bottom])=>clamp((.16-distance(points[top],points[bottom])/Math.max(distance(points[a],points[b]),1))/.09,0,1);
    const eyes=clamp(settings.eyes??.12,0,1),mouth=clamp(settings.mouth??.35,0,1);
    const opening=distance(points[13],points[14])/Math.max(distance(points[61],points[291]),1);
    return [Math.max(eyes,settings.identityLock?0:blink([33,133,159,145])*.98),Math.max(eyes,settings.identityLock?0:blink([263,362,386,374])*.98),Math.max(mouth,settings.identityLock?0:smooth(.13,.30,opening)*.95),clamp(settings.forehead??.10,0,1),clamp(settings.chin??.05,0,1)];
  }
  function alignedUV(points,matrix,size){
    if(!Array.isArray(matrix)||matrix.length!==6||!matrix.every(Number.isFinite)||!Number.isInteger(size)||size<128||size>1024||Math.abs(matrix[0]*matrix[4]-matrix[1]*matrix[3])<1e-8)return null;
    const uv=points.map(p=>({x:(matrix[0]*p[0]+matrix[1]*p[1]+matrix[2])/size,y:(matrix[3]*p[0]+matrix[4]*p[1]+matrix[5])/size}));
    return uv.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>3||Math.abs(p.y)>3)?null:uv;
  }
  function anchorGeometry(live,destination,adjacency,fullHead=false){
    const b=basis(live),local=normalize(live),yaw=Math.abs(local[1].x);
    const horizontal=1-smooth(.12,.55,yaw)*.62;
    const pinned=new Set(HOLES.flat());if(!fullHead)for(const id of OVAL)pinned.add(id);
    const rings=ringDistances(adjacency,[...pinned]);
    return destination.map((p,i)=>{
      if(pinned.has(i))return {...live[i]};
      const dx=p.x-live[i].x,dy=p.y-live[i].y;
      const x=clamp((dx*b.x.x+dy*b.x.y)/b.scale,-.14,.14)*horizontal;
      const y=clamp((dx*b.y.x+dy*b.y.y)/b.scale,-.14,.14);
      const influence=smooth(0,2.5,rings[i]);
      return {...live[i],x:live[i].x+b.scale*(x*b.x.x+y*b.y.x)*influence,y:live[i].y+b.scale*(x*b.x.y+y*b.y.y)*influence};
    });
  }
  function registeredUV(detected,input,width,height){
    if(!Array.isArray(detected)||detected.length<468)return null;
    const uv=detected.slice(0,478).map(p=>({x:p.x,y:p.y}));
    if(uv.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<-.2||p.x>1.2||p.y<-.2||p.y>1.2))return null;
    const pixel=p=>({x:p.x*width,y:p.y*height}),source=input.map(pixel),target=uv.map(pixel);
    const originalScale=basis(source).scale,generatedScale=basis(target).scale,ratio=generatedScale/Math.max(originalScale,1);
    if(ratio<.65||ratio>1.5||Math.sign(source[263].x-source[33].x)!==Math.sign(target[263].x-target[33].x))return null;
    const local=normalize(target),mouthY=(local[13].y+local[14].y)/2;
    if(local[1].y<-.05||mouthY<local[1].y+.05||local[152].y<mouthY+.12)return null;
    const drift=[33,263,1,61,291].map(i=>distance(source[i],target[i])/Math.max(originalScale,1)).sort((a,b)=>a-b);
    return drift[2]>.26||drift[4]>.55?null:uv;
  }
  function textureTransition(previous,next){
    if(!previous||previous===next||!previous.registered||!next.registered)return 0;
    if(previous.stableIdentity||next.stableIdentity){
      if(previous.referencePhoto&&next.referencePhoto&&previous.referenceId===next.referenceId)return 35;
      const swap=k=>/^(hyperswap|inswapper)/.test(k.model||'');
      if(!swap(previous)||!swap(next)||previous.referenceId!==next.referenceId)return 0;
      if(Math.abs((previous.yaw||0)-(next.yaw||0))>.045||Math.abs((previous.pitch||0)-(next.pitch||0))>.045)return 0;
      if(previous.expression&&next.expression&&previous.expression.some((v,i)=>Math.abs(v-next.expression[i])>.045))return 0;
      if(previous.generatedPoints&&next.generatedPoints&&expression(previous.generatedPoints).some((v,i)=>Math.abs(v-expression(next.generatedPoints)[i])>.06))return 0;
      if(previous.toneSource&&next.toneSource&&Math.abs(previous.toneSource.mean[0]-next.toneSource.mean[0])>.025)return 0;
      return 35;
    }
    if(Math.abs((previous.yaw||0)-(next.yaw||0))>.075)return 0;
    const a=previous.expression,b=next.expression;
    if(a&&b&&a.some((v,i)=>Math.abs(v-b[i])>.07))return 0;
    return 35;
  }
  function expression(points){
    const ratio=([a,b,t,d])=>distance(points[t],points[d])/Math.max(distance(points[a],points[b]),1);
    return [ratio([33,133,159,145]),ratio([263,362,386,374]),Mouth?Mouth.aperture(points):ratio([61,291,13,14])];
  }
  function identityProfile(input,generated,reference){
    if(!input||!generated||input.length<468||generated.length<468)return null;
    const n=normalize(input),g=normalize(generated),r=reference?.length>=468?normalize(reference):g;
    if([...n,...g,...r].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
    const frontal=1-smooth(.12,.38,Math.abs(r[1].x));
    const width=(p,a,b)=>Math.max(.08,Math.abs(p[a].x-p[b].x));
    const ratio=(a,b,limit=.18)=>1+(clamp(width(r,a,b)/width(g,a,b),1-limit,1+limit)-1)*frontal*.8;
    const cheek=ratio(234,454),jaw=ratio(172,397),nose=ratio(98,327,.22),mouth=ratio(61,291,.14);
    const mouthY=(g[13].y+g[14].y)/2,refMouth=(r[13].y+r[14].y)/2;
    // Un desplazamiento constante conserva el movimiento de mandíbula al hablar.
    const chin=clamp((r[152].y-refMouth)-(g[152].y-mouthY),-.22,.22)*frontal*.8;
    const desired=g.map(p=>{
      const cheekWeight=smooth(-.12,.25,p.y)*(1-smooth(.5,1,p.y)),jawWeight=smooth(.4,.95,p.y);
      let x=p.x*(1+(cheek-1)*cheekWeight+(jaw-1)*jawWeight);
      let y=p.y+chin*smooth(mouthY+.02,Math.max(mouthY+.08,g[152].y),p.y);
      const noseWeight=Math.exp(-(((p.x-g[1].x)/.22)**2+((p.y-g[1].y)/.28)**2));
      x+=(p.x-g[1].x)*(nose-1)*noseWeight;
      const lipWeight=Math.exp(-(((p.x-(g[61].x+g[291].x)/2)/.34)**2+((p.y-mouthY)/.17)**2));
      x+=(p.x-(g[61].x+g[291].x)/2)*(mouth-1)*lipWeight;
      return {x,y};
    });
    // La identidad modifica centros y anchuras. El conductor mantiene las aperturas.
    for(const [ids,a,b] of [[A.EYES[0],33,133],[A.EYES[1],263,362],[A.LIPS,61,291]]){
      const cn={x:(n[a].x+n[b].x)/2,y:(n[a].y+n[b].y)/2},cg={x:(desired[a].x+desired[b].x)/2,y:(desired[a].y+desired[b].y)/2};
      const scale=clamp(width(r,a,b)/width(n,a,b),.85,1.15)*frontal+clamp(width(g,a,b)/width(n,a,b),.85,1.15)*(1-frontal);
      for(const id of ids)desired[id]={x:cg.x+(n[id].x-cn.x)*scale,y:cg.y+(n[id].y-cn.y)*Math.sqrt(scale)};
    }
    return desired.map((p,i)=>({x:clamp(p.x-n[i].x,-.18,.18),y:clamp(p.y-n[i].y,-.20,.20)}));
  }
  function constrainGeometry(live,desired,triangles){
    const cross=(p,t)=>(p[t[1]].x-p[t[0]].x)*(p[t[2]].y-p[t[0]].y)-(p[t[1]].y-p[t[0]].y)*(p[t[2]].x-p[t[0]].x);
    const weights=live.map(()=>1),area=triangles.map(t=>cross(live,t));
    for(let pass=0;pass<24;pass++){
      const candidate=live.map((p,i)=>({...p,x:p.x+(desired[i].x-p.x)*weights[i],y:p.y+(desired[i].y-p.y)*weights[i]}));
      const bad=triangles.filter((t,i)=>Math.abs(area[i])>=.5&&cross(candidate,t)*Math.sign(area[i])<=Math.abs(area[i])*.18);
      if(!bad.length)return candidate;
      // Una fosa nasal pequeña no debe cancelar el cambio de toda la mandíbula.
      for(const id of new Set(bad.flat()))weights[id]=pass>15?0:weights[id]*.5;
    }
    return live.map(p=>({...p}));
  }
  function protectSilhouette(live,desired,scale){
    const edge=silhouetteEdges(live,silhouetteIds(live),scale);
    return desired.map((p,i)=>{const w=smooth(.005,.14,edge[i]);return {...p,x:live[i].x+(p.x-live[i].x)*w,y:live[i].y+(p.y-live[i].y)*w,z:(live[i].z||0)+((p.z||0)-(live[i].z||0))*w};});
  }
  class IdentityShape{
    reset(){this.key=null;this.uv=null;this.profile=null;this.offsets=null;this.time=null;this.identityKey=null;this.base3D=null;this.reference3D=null;this.offsets3D=null;this.calibrationCount=0;this.calibrationStamp=null;this.morphStamp=null;this.morphLocal=null;this.morphSettled=false;this.morphAmount=null;this.generatedKey=null;this.generatedShape=null;this.generatedBase=null;this.referenceShapes=null;this.screenLocal=null;this.morphTexture=null;this.swapDeltas=null;this.swapOffsets=null;this.swapSafe=null;this.swapStamp=null;this.swapKey=null;this.swapIdentity=null;this.proportions=null;this.swapSafe3D=null;}
    constructor(){this.reset();}
    apply(live,key,amount,now,triangles){
      if(key.generatedPoints&&/^(hyperswap|inswapper)/.test(key.model||'')&&key.inputUV)return this.applySwap(live,key,amount,now,triangles);
      if(Pose&&key.referenceViews?.length&&key.sourcePoints)return this.apply3D(live,key,amount,now,triangles);
      if(this.key!==key||this.uv!==key.uv){
        const pixel=uv=>uv.map(p=>({x:p.x*key.input.width,y:p.y*key.input.height}));
        this.profile=key.inputUV&&key.input?identityProfile(pixel(key.inputUV),pixel(key.registered?key.uv:key.inputUV),key.referencePoints):null;
        this.key=key;this.uv=key.uv;
      }
      if(!this.profile||amount<=0)return live.map(p=>({...p}));
      const b=basis(live),yaw=Math.abs(normalize(live)[1].x),strength=clamp(amount,0,1)*(1-smooth(.15,.5,yaw));
      const dt=this.time===null?16:clamp(now-this.time,0,120),alpha=1-Math.exp(-dt/140);this.time=now;
      if(!this.offsets)this.offsets=this.profile.map(()=>({x:0,y:0}));
      const desired=live.slice(0,468).map((p,i)=>{
        const o=this.offsets[i],target=this.profile[i];o.x+=(target.x*strength-o.x)*alpha;o.y+=(target.y*strength-o.y)*alpha;
        return {...p,x:p.x+b.scale*(o.x*b.x.x+o.y*b.y.x),y:p.y+b.scale*(o.x*b.x.y+o.y*b.y.y)};
      });
      return constrainGeometry(live.slice(0,468),this.allowContour===false?protectSilhouette(live,desired,b.scale):desired,triangles);
    }
    applySwap(live,key,amount,now,triangles){
      // Medir el cambio neuronal en el mismo marco que su fotograma de
      // entrada. Normalizar entrada y salida con poses distintas congelaba
      // facciones y podía mover ojos/nariz dos veces al girar.
      if(!this.swapDeltas)this.swapDeltas=new WeakMap();
      if(!this.swapDeltas.has(key)){
        const input=key.inputUV.slice(0,468).map(p=>({x:p.x*key.textureW,y:p.y*key.textureH})),b=A.basis(input),generated=key.generatedPoints;
        this.swapDeltas.set(key,input.map((p,i)=>{const dx=generated[i].x-p.x,dy=generated[i].y-p.y;return {x:(dx*b.x.x+dy*b.x.y)/b.scale,y:(dx*b.y.x+dy*b.y.y)/b.scale};}));
      }
      const b=A.basis(live),desired=this.swapDeltas.get(key),stamp=live.stamp??now,strength=clamp(amount,0,1),closed=Mouth.isClosed(live),update=this.swapStamp!==stamp||this.swapKey!==key||this.swapAmount!==strength||this.swapContour!==this.allowContour;
      if(!this.swapOffsets||this.swapIdentity!==key.referenceId){this.swapOffsets=desired.map(()=>({x:0,y:0}));this.swapTime=null;this.swapIdentity=key.referenceId;}
      if(update){
        const dt=this.swapTime===null?16:clamp(now-this.swapTime,1,100);this.swapTime=now;
        let proposal=live.slice(0,468).map((p,i)=>{
          const fast=eyeAndLip.has(i),limit=fast ? .035 : .085,weight=1-Math.exp(-dt/(fast?15:32)),o=this.swapOffsets[i];
          for(const axis of ['x','y'])o[axis]+=(clamp(desired[i][axis],-limit,limit)*strength-o[axis])*weight;
          return {...p,x:p.x+b.scale*(o.x*b.x.x+o.y*b.y.x),y:p.y+b.scale*(o.x*b.x.y+o.y*b.y.y)};
        });
        if(Proportions&&key.referenceViews?.length){this.proportions??=new Proportions.FaceProportions();proposal=this.proportions.apply(live,proposal,key,strength);if(triangles.length){const width=key.width||key.textureW,pose=Pose.basis(live,width);proposal=Pose.project(constrainMorph3D(Pose.normalize(live,width,pose),Pose.normalize(proposal,width,pose),triangles),pose);}}
        const allowed=this.allowContour===false?protectSilhouette(live,proposal,b.scale):proposal,constrained=constrainGeometry(live.slice(0,468),allowed,triangles);
        for(let i=0;i<constrained.length;i++){const raw=Math.hypot(allowed[i].x-live[i].x,allowed[i].y-live[i].y),safe=Math.hypot(constrained[i].x-live[i].x,constrained[i].y-live[i].y);constrained[i].z=(live[i].z||0)+((allowed[i].z||0)-(live[i].z||0))*(raw>1e-7?Math.min(1,safe/raw):1);}
        const safe=closed?Mouth.seal(constrained):constrained;
        if(this.proportions?.delta){const width=key.width||key.textureW,pose=Pose.basis(live,width),a=Pose.normalize(live,width,pose),d=Pose.normalize(safe,width,pose);this.swapSafe3D=d.map((p,i)=>({x:p.x-a[i].x,y:p.y-a[i].y,z:p.z-a[i].z}));}else this.swapSafe3D=null;
        this.swapSafe=safe.map((p,i)=>{const dx=p.x-live[i].x,dy=p.y-live[i].y;return {x:(dx*b.x.x+dy*b.x.y)/b.scale,y:(dx*b.y.x+dy*b.y.y)/b.scale};});
        this.swapStamp=stamp;this.swapKey=key;this.swapAmount=strength;this.swapContour=this.allowContour;
      }
      if(strength===0)return closed?Mouth.seal(live.slice(0,468)):live.slice(0,468).map(p=>({...p}));
      if(this.swapSafe3D){const width=key.width||key.textureW,pose=Pose.basis(live,width),local=Pose.normalize(live,width,pose);return Pose.project(local.map((p,i)=>({x:p.x+this.swapSafe3D[i].x,y:p.y+this.swapSafe3D[i].y,z:p.z+this.swapSafe3D[i].z})),pose);}
      return live.slice(0,468).map((p,i)=>{const o=this.swapSafe[i];return {...p,x:p.x+b.scale*(o.x*b.x.x+o.y*b.y.x),y:p.y+b.scale*(o.x*b.x.y+o.y*b.y.y)};});
    }
    apply3D(live,key,amount,now,triangles){
      const width=key.width||1,b=Pose.basis(live,width),identity=key.referenceId||key.referenceViews,stamp=live.stamp??now;
      if(this.identityKey===identity&&this.morphTexture===key&&this.morphStamp===stamp&&this.morphAmount===amount&&this.contourMode===this.allowContour&&this.screenLocal)return Pose.project(this.screenLocal,b);
      const local=Pose.normalize(live,width,b);
      if(this.identityKey!==identity){
        this.identityKey=identity;this.referenceShapes=key.referenceViews.map(v=>({side:v.side,yaw:Pose.basis(v.points,v.width||1).yaw,shape:Pose.normalize(v.points,v.width||1)}));this.reference3D=this.referenceShapes[0]?.shape;this.identity3D=Pose.fuseViews(key.referenceViews);this.base3D=Pose.normalize(key.sourcePoints,width);this.offsets3D=local.map(()=>({x:0,y:0,z:0}));this.calibrationCount=0;this.calibrationStamp=null;this.time=null;
      }
      if(!this.reference3D||amount<=0){this.offsets3D=local.map(()=>({x:0,y:0,z:0}));this.morphLocal=null;this.screenLocal=null;this.morphStamp=null;this.morphSettled=false;this.time=now;return live.map(p=>({...p}));}
      const expressions=expression(live);
      if(this.calibrationCount<6&&stamp!==this.calibrationStamp&&Math.abs(b.yaw)<.25&&expressions[0]>.12&&expressions[1]>.12&&expressions[2]<.15){
        this.calibrationStamp=stamp;
        const count=this.calibrationCount++;this.base3D=local.map((p,i)=>Object.fromEntries(['x','y','z'].map(axis=>[axis,(this.base3D[i][axis]*count+p[axis])/(count+1)])));
      }
      const selected=key.referencePhoto?this.referenceShapes.find(v=>v.side===key.activeView):null;
      const source=selected||this.referenceShapes.reduce((a,c)=>Math.abs(a.yaw-b.yaw)<Math.abs(c.yaw-b.yaw)?a:c);
      if(key.generatedPoints&&this.generatedKey!==key){this.generatedKey=key;this.generatedShape=Pose.normalize(key.generatedPoints,key.textureW);this.generatedBase=Pose.normalize(key.sourcePoints,width);}
      const reference=key.generatedPoints?this.generatedShape:key.referencePhoto?this.identity3D:source.shape,base=key.generatedPoints?this.generatedBase:this.base3D,desired=reference.map(p=>({...p}));
      // La geometría de identidad procede de la vista correspondiente. Los
      // residuos de todos los vértices no son gestos: en perfil incluían error
      // de profundidad y desplazaban boca, nariz y ojos por segunda vez.
      for(const [ids,a,c,t,d] of [[A.EYES[0],33,133,159,145],[A.EYES[1],263,362,386,374]]){
        const center=p=>({x:(p[a].x+p[c].x)/2,y:(p[a].y+p[c].y)/2,z:(p[a].z+p[c].z)/2});
        const refCenter=center(reference),refHeight=Math.max(Math.abs(reference[t].y-reference[d].y),.004),baseHeight=Math.max(Math.abs(base[t].y-base[d].y),.015);
        const open=key.generatedPoints?clamp((refHeight+clamp(Math.abs(local[t].y-local[d].y)-baseHeight,-.12,.08))/refHeight,.025,Math.abs(b.yaw)>.6?1.4:1.8):clamp(Math.abs(local[t].y-local[d].y)/baseHeight,.025,1.35);
        const photoCenter=center(source.shape),neutralHeight=Math.max(Math.abs(this.base3D[t].y-this.base3D[d].y),.015),expectedRatio=clamp(Math.abs(local[t].y-local[d].y)/neutralHeight,.025,1.35),photoHeight=Math.abs(source.shape[t].y-source.shape[d].y)*expectedRatio,assist=key.model==='live_portrait_512'?smooth(.025,.07,photoHeight-refHeight):0;
        for(const id of ids){const native=refCenter.y+(reference[id].y-refCenter.y)*open,photographic=refCenter.y+(source.shape[id].y-photoCenter.y)*expectedRatio;desired[id].y=native+(photographic-native)*assist;}
      }
      const mouth=Mouth.retarget(reference,local,base,live.signals);for(const id of A.LIPS)desired[id]=mouth.points[id];
      const mouthCenter=(reference[13].y+reference[14].y)/2,jaw=Math.max(0,mouth.delta)*.12;
      for(let i=0;i<desired.length;i++)desired[i].y+=jaw*smooth(mouthCenter+.1,reference[152].y,reference[i].y);
      const browLift=clamp(BROWS.reduce((sum,i)=>sum+local[i].y-base[i].y,0)/Math.max(BROWS.length,1),-.08,.08)*(1-smooth(.3,1.1,Math.abs(b.yaw)));
      for(const id of BROWS)desired[id].y+=browLift;
      const dt=this.time===null?16:clamp(now-this.time,0,100),alpha=1-Math.exp(-dt/(key.referencePhoto?30:55));this.time=now;
      const strength=clamp(amount,0,1),limits={x:this.range||.25,y:(this.range||.25)*1.12,z:(this.range||.25)*.8};
      let error=0;
      const output=local.map((p,i)=>{
        const offset=this.offsets3D[i],value={};
        for(const axis of ['x','y','z']){const delta=clamp(desired[i][axis]-p[axis],-limits[axis],limits[axis])*strength-offset[axis];error=Math.max(error,Math.abs(delta));offset[axis]+=delta*(A.LIPS.includes(i)?1-Math.exp(-dt/22):alpha);value[axis]=p[axis]+offset[axis];}
        return value;
      });
      this.morphLocal=constrainMorph3D(local,output,triangles);this.morphStamp=stamp;this.morphAmount=amount;this.morphSettled=error<.0001;this.morphTexture=key;this.contourMode=this.allowContour;
      let projected=Pose.project(this.morphLocal,b);
      if(this.allowContour===false)projected=protectSilhouette(live,projected,b.scale);
      const safe=constrainGeometry(live.slice(0,468),projected,triangles),unsealed=safe.map((p,i)=>({...p,z:projected[i].z})),out=mouth.closed?Mouth.seal(unsealed):unsealed;this.screenLocal=Pose.normalize(out,width,b);return out;
    }
  }
  function constrainMorph3D(live,desired,triangles){
    const normal=(p,t)=>Pose.cross(Pose.sub(p[t[1]],p[t[0]]),Pose.sub(p[t[2]],p[t[0]]));
    const areas=triangles.map(t=>normal(live,t)),weights=live.map(()=>1);
    for(let pass=0;pass<10;pass++){
      const out=live.map((p,i)=>({x:p.x+(desired[i].x-p.x)*weights[i],y:p.y+(desired[i].y-p.y)*weights[i],z:p.z+(desired[i].z-p.z)*weights[i]}));
      const bad=triangles.filter((t,i)=>{const a=areas[i],length=Pose.length(a);return length>1e-5&&Pose.dot(normal(out,t),a)<length*length*.12;});
      if(!bad.length)return out;
      for(const id of new Set(bad.flat()))weights[id]=pass>6?0:weights[id]*.45;
    }
    return live;
  }
  function contourSkirt(live,destination){
    const b=basis(live);
    return OVAL.map(id=>{
      const p=live[id],dx=p.x-b.origin.x,dy=p.y-b.origin.y,length=Math.max(Math.hypot(dx,dy),1),reach=b.scale*.55;
      return {source:{x:p.x+dx/length*reach,y:p.y+dy/length*reach},destination:{x:p.x+dx/length*reach,y:p.y+dy/length*reach},innerSource:p,innerDestination:destination[id]};
    });
  }
  function silhouetteIds(points){
    const ids=[...new Set([...OVAL,1,2,4,5,19,94,98,327,...A.LIPS.slice(0,20)])].sort((a,b)=>points[a].x-points[b].x||points[a].y-points[b].y),cross=(a,b,c)=>(points[b].x-points[a].x)*(points[c].y-points[a].y)-(points[b].y-points[a].y)*(points[c].x-points[a].x),half=order=>{const hull=[];for(const id of order){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),id)<=0)hull.pop();hull.push(id);}return hull.slice(0,-1);};return [...half(ids),...half(ids.slice().reverse())];
  }
  function silhouetteSkirt(live,destination,width,ids=silhouetteIds(live)){
    const b=basis(live),scale=Pose?Pose.basis(live,width).scale:b.scale,reach=Math.max(b.scale,scale*.8)*.65;
    return ids.map(id=>{const p=live[id],d=destination[id],dx=p.x-b.origin.x,dy=p.y-b.origin.y,l=Math.max(Math.hypot(dx,dy),1),extra=reach+distance(p,d);return {id,source:{x:p.x+dx/l*extra,y:p.y+dy/l*extra},destination:{x:p.x+dx/l*extra,y:p.y+dy/l*extra}};});
  }
  function silhouetteEdges(points,ids,scale){
    return points.slice(0,468).map(p=>{let nearest=Infinity;for(let k=0;k<ids.length;k++){const a=points[ids[k]],b=points[ids[(k+1)%ids.length]],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(dx*dx+dy*dy,1e-8),0,1);nearest=Math.min(nearest,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}return nearest/Math.max(scale,1);});
  }
  const api={OVAL,HOLES,smooth,ringDistances,contourDistances,featureRegions,featureAmounts,anchorGeometry,registeredUV,textureTransition,expression,identityProfile,constrainGeometry,constrainMorph3D,IdentityShape,contourSkirt,alignedUV,silhouetteIds,silhouetteSkirt,silhouetteEdges};
  root.PortraitQuality=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
