'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../public/skin-tone'),A=require('../public/face-appearance');
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6));
test('rostro y cuerpo con distinta exposición convergen al mismo tono de referencia',()=>{
 const face=A.yuv([.65,.41,.31]),body=A.yuv([.43,.25,.18]),reference=A.yuv([.72,.55,.43]),t=S.offsets(face,body,reference);
 close(face.map((v,i)=>v+t.face[i]),reference);close(body.map((v,i)=>v+t.body[i]),reference);
});
test('el tono intermedio es único para ambas zonas y cámara desactiva la capa',()=>{
 const face=[.6,.01,.04],body=[.4,.03,.07],ref=[.7,-.02,.09],mixed=S.offsets(face,body,ref,'mixed',.6),expected=ref.map((v,i)=>v*.6+body[i]*.4);
 close(face.map((v,i)=>v+mixed.face[i]),expected);close(body.map((v,i)=>v+mixed.body[i]),expected);
 assert.deepEqual(S.offsets(face,body,ref,'camera'),{face:[0,0,0],body:[0,0,0]});
});
test('una máscara incierta o que quedó atrás del movimiento deja de teñir',()=>{
 assert.equal(S.confidence(.2),0);assert.equal(S.confidence(.64),0);assert.equal(S.confidence(.95),1);
 assert.equal(S.motionGate([.2,.3,.4],[.2,.3,.4]),1);assert.equal(S.motionGate([.2,.3,.4],[.6,.3,.4]),0);
 assert.ok(S.motionGate([.2,.3,.4],[.3,.3,.4])>0&&S.motionGate([.2,.3,.4],[.3,.3,.4])<1);
});
