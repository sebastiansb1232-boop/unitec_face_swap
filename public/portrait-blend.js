/* Ajuste acotado de luz/color y mezcla de labios; sin suavizar la textura. */
(function(root){
 'use strict';const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function target(camera,reference,mode='natural',referenceAmount=.65){
  if(!reference)return camera?.slice()||null;
  if(!camera)return mode==='natural'?null:reference.slice();
  if(mode==='camera')return camera.slice();
  const amount=mode==='natural'?.6:mode==='mixed'?clamp(referenceAmount,0,1):1;
  // El matiz puede proceder de la foto; la exposición pertenece al escenario.
  // El cuello conserva su sombra, en lugar de igualar su brillo a la frontal.
  return camera.map((v,i)=>v+clamp((reference[i]-v)*(i?amount:amount*.12),i?-.065:-.035,i?.065:.035));
 }
 function tone(source,camera,mode='natural',referenceAmount=.65,reference=null){
  if(!source)return [0,0,0];
  const mean=target(camera?.mean,(reference||source).mean,mode,referenceAmount);if(!mean)return [0,0,0];
  return mean.map((v,i)=>clamp(v-source.mean[i],i?-.16:-.48,i?.16:.48));
 }
 class ToneFilter{
  constructor(){this.value=[0,0,0];this.time=null;}
  update(desired,now){const dt=this.time===null?33:clamp(now-this.time,0,250);this.time=now;const a=1-Math.exp(-dt/420);this.value=this.value.map((v,i)=>v+(desired[i]-v)*a);return this.value;}
 }
 function interiorWeight(yaw,opening,enabled=true){
  if(!enabled)return 0;const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  return smooth(.065,.20,opening)*(1-smooth(1.,1.28,Math.abs(yaw)));
 }
 const api={target,tone,ToneFilter,interiorWeight};root.PortraitBlend=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
