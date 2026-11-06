'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../public/face-pose'),Q=require('../public/portrait-quality'),F=require('../public/face-proportions'),A=require('../public/face-appearance');
function canonical(){
 const p=Array.from({length:478},(_,i)=>({x:.4*Math.sin(i),y:.4+.5*Math.cos(i),z:.03*Math.sin(i*.5)}));
 Q.OVAL.forEach((id,k)=>{const a=k/Q.OVAL.length*Math.PI*2;p[id]={x:.72*Math.sin(a),y:.45-1.0*Math.cos(a),z:.05};});
 Object.assign(p,{33:{x:-.5,y:0,z:0},263:{x:.5,y:0,z:0},168:{x:0,y:.2,z:-.1},2:{x:0,y:.55,z:-.1},1:{x:0,y:.5,z:-.38},10:{x:0,y:-.55,z:.05},152:{x:0,y:1.45,z:.02},98:{x:-.12,y:.53,z:-.22},327:{x:.12,y:.53,z:-.22},172:{x:-.6,y:1.15,z:.04},397:{x:.6,y:1.15,z:.04},234:{x:-.72,y:.4,z:.04},454:{x:.72,y:.4,z:.04},61:{x:-.25,y:.85,z:0},291:{x:.25,y:.85,z:0},13:{x:0,y:.85,z:0},14:{x:0,y:.85,z:0}});
 const u=[191,80,81,82,13,312,311,310,415],d=[95,88,178,87,14,317,402,318,324];for(let i=0;i<9;i++)p[u[i]]=p[d[i]]={x:-.2+i*.05,y:.85,z:0};
 return p;
}
function view(points,yaw=0,mirror=false){const c=Math.cos(yaw),s=Math.sin(yaw);return points.map(p=>({x:mirror?600-(300+150*(p.x*c+p.z*s)):300+150*(p.x*c+p.z*s),y:150+150*p.y,z:150*(-p.x*s+p.z*c)/600}));}
function setup(){const source=canonical(),target=canonical();target[1].z+=.14;target[152].y-=.18;target[172].x+=.08;target[397].x-=.08;const p=view(source),key={model:'hyperswap_1c_256',referenceId:'identity',width:600,textureW:600,textureH:600,sourcePoints:p,generatedPoints:p,inputUV:p.map(q=>({x:q.x/600,y:q.y/600})),referenceViews:[['front',0],['left',-.8],['right',.8]].map(([side,yaw])=>({side,width:600,points:view(target,yaw)}))};return {source,target,key};}
test('nariz y mandíbula se acercan a la misma identidad en frontal y ambos perfiles',()=>{
 const {source,target,key}=setup(),shape=new Q.IdentityShape();shape.allowContour=true;const goal=F.measure(view(target),600);
 for(const mirror of [false,true])for(const yaw of [0,-.9,.9]){const live=view(source,yaw,mirror);live.stamp=(mirror?10:0)+yaw+2;const out=shape.apply(live,key,1,100,[]),before=F.measure(live,600),after=F.measure(out,600);assert.ok(Math.abs(after.noseDepth-goal.noseDepth)<Math.abs(before.noseDepth-goal.noseDepth)*.4);assert.ok(Math.abs(after.chin-goal.chin)<.015);assert.ok(Math.abs(after.jaw-goal.jaw)<Math.abs(before.jaw-goal.jaw));}
});
test('las proporciones no recalibran el rostro al recibir otra textura ni desplazan labios y ojos',()=>{
 const {source,key}=setup(),live=view(source),f=new F.FaceProportions(),first=f.apply(live,live,key,1),delta=f.delta;
 const other={...key,generatedPoints:key.generatedPoints.map(p=>({...p,y:p.y+20}))};f.apply(view(source,.8),view(source,.8),other,1);assert.equal(f.delta,delta);
 for(const id of A.EXPRESSIVE)for(const axis of ['x','y','z'])assert.ok(Math.abs(first[id][axis]-live[id][axis])<1e-8);
 f.reset();assert.equal(f.delta,null);
});
test('sin fondo preparado se conserva la silueta original y el control cero devuelve la cámara',()=>{
 const {source,key}=setup(),live=view(source,.9),s=new Q.IdentityShape();s.allowContour=false;const out=s.apply(live,key,1,100,[]);
 for(const id of Q.silhouetteIds(live))assert.ok(Math.hypot(out[id].x-live[id].x,out[id].y-live[id].y)<1e-6);
 const off=s.apply(live,key,0,133,[]);off.forEach((p,i)=>assert.ok(Math.hypot(p.x-live[i].x,p.y-live[i].y)<1e-6));
});
test('una profundidad de referencia extrema no invierte la nariz ni anula todo el ajuste',()=>{
 const {key}=setup();key.referenceViews.forEach(v=>{const b=P.basis(v.points,600),n=P.normalize(v.points,600,b);n[1].z=n[168].z+(n[1].z-n[168].z)*.01;v.points=P.project(n,b);});const f=new F.FaceProportions();f.prepare(key);assert.ok(f.delta.noseDepth>0);assert.ok(f.delta.noseDepth<.13);assert.ok(f.delta.chin<0);
});
