'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../public/face-appearance');
function face(){
  const p=Array.from({length:468},(_,i)=>({x:90+(i%24)*5,y:40+Math.floor(i/24)*8}));
  p[33]={x:100,y:100};p[133]={x:135,y:100};p[263]={x:200,y:100};p[362]={x:165,y:100};
  p[159]={x:117,y:93};p[145]={x:117,y:107};p[386]={x:183,y:93};p[374]={x:183,y:107};p[10]={x:150,y:30};p[152]={x:150,y:240};p[13]={x:150,y:175};p[14]={x:150,y:177};return p;
}
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('la identidad conserva nariz y contorno de la referencia con expresión neutral',()=>{
  const p=face(),neutral=A.normalize(p),target=neutral.map(q=>({...q}));target[1].x+=.12;target[152].y+=.13;
  const out=A.normalize(A.transfer(p,neutral,target,1,{oval:[152],fullHead:true}));
  near(out[1].x,target[1].x);near(out[152].y,target[152].y);
  const zero=A.transfer(p,neutral,target,0);zero.forEach((q,i)=>{near(q.x,p[i].x);near(q.y,p[i].y);});
});
test('el cierre de párpados y la apertura de boca se trasladan a otra anatomía',()=>{
  const p=face(),neutral=A.normalize(p),target=neutral.map(q=>({...q}));target[159].y=-.11;target[145].y=.11;
  const closed=p.map(q=>({...q}));closed[159].y=99.8;closed[145].y=100.2;closed[14].y+=22;
  const out=A.normalize(A.transfer(closed,neutral,target,1));
  assert.ok(Math.abs(out[159].y-out[145].y)<.012,'el ojo de la referencia también se cierra');
  near(out[14].y-out[13].y,target[14].y-target[13].y+.22);
});
test('la estabilización reduce vibración sin congelar boca ni retrasar traslación',()=>{
  const p=face(),s=new A.ExpressionSmoother();let raw=[],filtered=[];
  for(let i=0;i<100;i++){
    const frame=p.map(q=>({...q}));frame[50].x+=(i%2?1:-1)*1.2;
    const out=s.filter(frame,.8,i*33);if(i>15){raw.push(frame[50].x);filtered.push(out[50].x);}
  }
  const variance=a=>{const m=a.reduce((s,v)=>s+v,0)/a.length;return a.reduce((s,v)=>s+(v-m)**2,0)/a.length;};
  assert.ok(variance(filtered)<variance(raw)*.4);
  const shifted=p.map(q=>({x:q.x+70,y:q.y+20}));shifted[14].y+=25;
  const out=s.filter(shifted,.8,3300);near(A.basis(out).origin.x,A.basis(shifted).origin.x);
  assert.ok(out[14].y>p[14].y+20+20,'la mayor parte del gesto aparece en el primer fotograma');
});
test('la transformación de cabeza mantiene anclaje con espejo, escala y giro',()=>{
  const p=face(),angle=.3,moved=p.map(q=>({x:-(q.x*Math.cos(angle)-q.y*Math.sin(angle))*1.7+800,y:(q.x*Math.sin(angle)+q.y*Math.cos(angle))*1.7+50}));
  const [a,b,c,d,e,f]=A.affine(A.basis(p),A.basis(moved));
  for(const i of [33,263,152,1]){near(a*p[i].x+c*p[i].y+e,moved[i].x);near(b*p[i].x+d*p[i].y+f,moved[i].y);}
});
test('el color del cabello conserva contraste y puede aclarar pelo oscuro',()=>{
  const source=[.12,.09,.07],target=[.62,.42,.19],dark=A.tint([.08,.06,.04],source,target),light=A.tint([.2,.16,.12],source,target);
  assert.ok(A.yuv(light)[0]>A.yuv(dark)[0]);assert.ok(A.yuv(dark)[0]>.25);
  const same=A.tint(source,source,target);same.forEach((v,i)=>near(v,target[i],1e-5));
  assert.deepEqual(A.tint(source,source,target,0),source);
});
