'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('../public/reference-tone'),A=require('../public/face-appearance');
test('el matiz converge a la frontal sin borrar la iluminación de cada vista',()=>{
 const frontal=Array.from({length:80},(_,i)=>A.rgb([.62+(i-40)*.001,.015,.065])),lateral=Array.from({length:80},(_,i)=>A.rgb([.29+(i-40)*.001,-.02,.08])),target=T.statistics(frontal),source=T.statistics(lateral),result=T.statistics(lateral.map(p=>T.apply(p,T.correction(source,target))));
 for(const i of [1,2])assert.ok(Math.abs(result.mean[i]-target.mean[i])<.002);
 assert.ok(result.mean[0]>source.mean[0]&&result.mean[0]<target.mean[0]);assert.ok(result.mean[0]-source.mean[0]<.11,'no blanquear un perfil oscuro');assert.ok(result.spread>.04,'conservar gradientes');
});
test('la estimación tolera reflejos y sombras minoritarios sin reglas RGB de piel',()=>{
 for(const y of [.12,.4,.78]){const data=Array.from({length:80},()=>A.rgb([y,.02,.03])).concat(Array.from({length:10},()=>[0,0,0]),Array.from({length:10},()=>[1,1,1]));assert.ok(Math.abs(T.statistics(data).mean[0]-y)<.002);}
});
test('el tono propio y una referencia ausente no inventan otro color',()=>{
 const color=[.24,.39,.57],stats={mean:A.yuv(color),spread:.08};T.apply(color,T.correction(stats,stats)).forEach((v,i)=>assert.ok(Math.abs(v-color[i])<.0001));assert.deepEqual(T.correction(null,stats),{gain:[1,1,1],offset:[0,0,0]});
});
