/* Proporciones de identidad en un marco 3D común; no es reconstrucción fotogramétrica. */
(function(root){
 'use strict';
 const P=root.FacePose||(typeof require==='function'?require('./face-pose'):null),A=root.FaceAppearance||(typeof require==='function'?require('./face-appearance'):null),clamp=A.clamp;
 const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
 function measure(points,width){
  if(!points||points.length<468)return null;
  const n=P.normalize(points,width),lip=(n[13].y+n[14].y)/2;
  return {noseWidth:Math.abs(n[98].x-n[327].x),noseDepth:n[1].z-n[168].z,noseLength:n[1].y-n[168].y,chin:n[152].y-lip,jaw:Math.abs(n[172].x-n[397].x),cheek:Math.abs(n[234].x-n[454].x)};
 }
 function reference(views){
  const valid=(views||[]).filter(v=>v.points?.length>=468).map(v=>({m:measure(v.points,v.width||v.image?.width||1),yaw:Math.abs(P.basis(v.points,v.width||v.image?.width||1).yaw),front:v.side==='front'}));if(!valid.length)return null;
  return Object.fromEntries(Object.keys(valid[0].m).map(k=>{
   let sum=0,total=0;for(const v of valid){const weight=k==='noseDepth'?(v.yaw>.3?1:.35):(v.front?1:.25);sum+=v.m[k]*weight;total+=weight;}return [k,sum/total];
  }));
 }
 class FaceProportions{
  reset(){this.identity=null;this.delta=null;}
  constructor(){this.reset();}
  prepare(key){
   if(this.identity===key.referenceId&&this.delta)return;
   const target=reference(key.referenceViews),source=measure(key.generatedPoints,key.textureW);if(!target||!source){this.delta=null;return;}
   const ratio=k=>clamp(target[k]/Math.max(source[k],.08)-1,-.22,.22);
   const depth=Math.max(.025,Math.abs(source.noseDepth)),desiredDepth=target.noseDepth*source.noseDepth>0?Math.sign(source.noseDepth)*clamp(Math.abs(target.noseDepth),depth*.55,depth*1.45):source.noseDepth;
   this.delta={noseWidth:ratio('noseWidth'),noseDepth:clamp(desiredDepth-source.noseDepth,-.18,.18),noseLength:clamp(target.noseLength-source.noseLength,-.10,.10),chin:clamp(target.chin-source.chin,-.20,.20),jaw:ratio('jaw'),cheek:clamp(ratio('cheek'),-.10,.10)};this.identity=key.referenceId;
  }
  apply(live,destination,key,amount){
   this.prepare(key);if(!this.delta||amount<=0)return destination;
   const width=key.width||key.textureW,b=P.basis(live,width),local=P.normalize(destination,width,b),driver=P.normalize(live,width,b),nose=driver[1],lip=(driver[13].y+driver[14].y)/2,d=this.delta;
   const out=local.map((p,i)=>{
    // No mover los anclajes que definen el marco: la corrección del propio
    // puente no debe reinterpretarse como un cambio de pose de toda la cara.
    if(A.EXPRESSIVE.has(i)||i===2||i===168||i===10)return p;
    const n=driver[i],nasal=Math.exp(-(((n.x-nose.x)/.23)**2+((n.y-nose.y)/.28)**2)),lower=smooth(lip+.06,Math.max(lip+.15,driver[152].y),n.y),cheek=smooth(.05,.38,n.y)*(1-smooth(lip,lip+.3,n.y));
    return {x:p.x+amount*((n.x-nose.x)*d.noseWidth*nasal+n.x*(d.jaw*lower+d.cheek*cheek)),y:p.y+amount*(d.noseLength*nasal+d.chin*lower),z:p.z+amount*d.noseDepth*nasal};
   });return P.project(out,b);
  }
 }
 const api={measure,reference,FaceProportions};root.FaceProportions=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
