'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NeuralMotion,faceCrop}=require('../public/neural-motion');
const A=require('../public/face-appearance');
function face(){const p=Array.from({length:478},(_,i)=>({x:320+65*Math.sin(i),y:230+90*Math.cos(i)}));p[33]={x:270,y:200};p[263]={x:370,y:200};p[10]={x:320,y:125};p[152]={x:320,y:335};p[13]={x:320,y:280};p[14]={x:320,y:288};return p;}
test('recorte facial reduce el área y mantiene la correspondencia de textura',()=>{
 const p=face(),crop=faceCrop(p,1280,720,320);assert.ok(crop.width*crop.height<1280*720*.25);assert.ok(Math.max(crop.outputW,crop.outputH)<=320);
 for(const i of [33,263,1,13,152]){assert.ok(Math.abs(crop.uv[i].x-crop.points[i][0]/crop.outputW)<1e-9);assert.ok(Math.abs(crop.uv[i].y-crop.points[i][1]/crop.outputH)<1e-9);}
});
test('recorte junto al borde se mantiene dentro de la imagen',()=>{
 const p=face().map(q=>({x:q.x-290,y:q.y-110})),c=faceCrop(p,640,480);assert.equal(c.x,0);assert.ok(c.y>=0&&c.x+c.width<=640&&c.y+c.height<=480);
 assert.equal(faceCrop(Array.from({length:478},()=>({x:10,y:10})),640,480),null);
});
test('predicción breve acompaña traslación sin modificar el gesto de la boca',()=>{
 const m=new NeuralMotion(),p=face();m.update(p,0);m.update(p.map(q=>({x:q.x+20,y:q.y+5})),100);const out=m.predict(140);
 assert.ok(A.basis(out).origin.x>A.basis(m.current.points).origin.x);
 const n=A.normalize(out),actual=A.normalize(m.current.points);assert.ok(Math.abs((n[14].y-n[13].y)-(actual[14].y-actual[13].y))<1e-10);assert.equal(m.fps,10);
});
test('seguimiento perdido, reinicio o coordenadas inválidas retiran el rostro almacenado',()=>{
 const m=new NeuralMotion();m.update(face(),100);assert.equal(m.predict(801),null);m.reset();assert.equal(m.predict(120),null);
 const bad=face();bad[2].x=NaN;m.update(bad,130);assert.equal(m.current,null);
});
