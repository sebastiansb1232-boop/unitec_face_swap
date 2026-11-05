/* Ajuste acotado de luz/color y mezcla de labios; sin suavizar la textura. */
(function(root){
 'use strict';const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function tone(source,target){
  if(!source||!target)return [0,0,0];
  return target.mean.map((v,i)=>clamp((v-source.mean[i])*.85,i?-.075:-.26,i?.075:.26));
 }
 class ToneFilter{
  constructor(){this.value=[0,0,0];this.time=null;}
  update(desired,now){const dt=this.time===null?33:clamp(now-this.time,0,250);this.time=now;const a=1-Math.exp(-dt/420);this.value=this.value.map((v,i)=>v+(desired[i]-v)*a);return this.value;}
 }
 function oralMix(yaw,live,source,photo){return Math.abs(yaw)<1.22&&live>.075&&(photo||Math.abs(live-source)>.09);}
 const api={tone,ToneFilter,oralMix};root.PortraitBlend=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
