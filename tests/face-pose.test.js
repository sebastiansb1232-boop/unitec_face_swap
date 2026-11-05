'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../public/face-pose'),Q=require('../public/portrait-quality'),A=require('../public/face-appearance'),{ReferenceViews}=require('../public/reference-views');
function setMouth(p,top,bottom){const upper=[191,80,81,82,13,312,311,310,415],lower=[95,88,178,87,14,317,402,318,324],outerUp=[185,40,39,37,0,267,269,270,409],outerDown=[146,91,181,84,17,314,405,321,375];for(let k=0;k<9;k++){const x=-.25+(k+1)*.05,w=Math.sin(Math.PI*(k+1)/10),mid=(top+bottom)/2;for(const [id,y] of [[upper[k],mid+(top-mid)*w],[lower[k],mid+(bottom-mid)*w],[outerUp[k],mid+(top-mid)*w-.035],[outerDown[k],mid+(bottom-mid)*w+.035]])p[id]={x,y,z:0};}return p;}
function canonical(){
 const p=Array.from({length:468},(_,i)=>({x:.45*Math.sin(i),y:.4+.6*Math.cos(i),z:.05*Math.sin(i*.5)}));
 Object.assign(p,{33:{x:-.5,y:0,z:0},133:{x:-.2,y:0,z:0},263:{x:.5,y:0,z:0},362:{x:.2,y:0,z:0},168:{x:0,y:.2,z:-.2},2:{x:0,y:.55,z:-.2},1:{x:0,y:.5,z:-.35},10:{x:0,y:-.6,z:.03},152:{x:0,y:1.4,z:0},159:{x:-.35,y:-.035,z:0},145:{x:-.35,y:.035,z:0},386:{x:.35,y:-.035,z:0},374:{x:.35,y:.035,z:0},61:{x:-.25,y:.85,z:0},291:{x:.25,y:.85,z:0},13:{x:0,y:.84,z:0},14:{x:0,y:.86,z:0}});return setMouth(p,.848,.852);
}
function view(p,yaw=0,mirror=false){
 const c=Math.cos(yaw),s=Math.sin(yaw),width=600;
 return p.map(q=>({x:mirror?width-(300+150*(q.x*c+q.z*s)):300+150*(q.x*c+q.z*s),y:150+150*q.y,z:150*(-q.x*s+q.z*c)/width}));
}
test('la estabilización reduce vibración de posición, escala y giro sin fijar la cabeza',()=>{
 const s=new P.Stabilizer(),base=canonical();let rawEnergy=0,filteredEnergy=0,previous,previousRaw,out;
 for(let i=0;i<90;i++){const sign=i%2?1:-1,p=view(base,sign*.012).map(q=>({...q,x:q.x+sign*1.8,y:q.y-sign*1.1}));out=s.filter(p,600,.85,i*33);const b=P.basis(out,600),r=P.basis(p,600);if(i>20){rawEnergy+=Math.hypot(r.origin.x-previousRaw.origin.x,r.origin.y-previousRaw.origin.y)+Math.abs(r.yaw-previousRaw.yaw)*150;filteredEnergy+=Math.hypot(b.origin.x-previous.origin.x,b.origin.y-previous.origin.y)+Math.abs(b.yaw-previous.yaw)*150;}previous=b;previousRaw=r;}
 assert.ok(filteredEnergy<rawEnergy*.55,'rigid frame must be filtered too');
 const moved=view(base,.35).map(q=>({...q,x:q.x+45}));for(let i=0;i<12;i++)out=s.filter(moved,600,.85,3000+i*33);assert.ok(Math.abs(P.basis(out,600).origin.x-P.basis(moved,600).origin.x)<3);assert.ok(Math.abs(P.basis(out,600).yaw-.35)<.02||Math.abs(P.basis(out,600).yaw+.35)<.02);
});
test('la boca fotográfica abre de perfil y cierra sin conservar la abertura de la foto',()=>{
 const reference=canonical(),opened=canonical();setMouth(opened,.70,1.04);
 for(const yaw of [-.9,0,.9]){const neutral=view(reference,yaw),live=view(opened,yaw),key={width:600,referencePhoto:true,activeView:'front',sourcePoints:neutral,referenceViews:[{side:'front',points:neutral,width:600}],referenceId:'mouth-'+yaw},shape=new Q.IdentityShape();let out;for(let i=0;i<60;i++)out=shape.apply(live,key,1,i*33,[]);const local=P.normalize(out,600);assert.ok(local[14].y-local[13].y>.25,'mouth must open at '+yaw);}
});
test('la silueta incluye una nariz que sobresale y el anillo cubre su contorno anterior',()=>{
 const p=view(canonical(),.9);p[1].x=Math.min(...p.map(q=>q.x))-25;const ids=Q.silhouetteIds(p);assert.ok(ids.includes(1));const dest=p.map(q=>({...q}));dest[1].x+=15;const skirt=Q.silhouetteSkirt(p,dest,600,ids),nose=skirt.find(q=>q.id===1);assert.ok(nose.source.x<p[1].x);assert.deepEqual(nose.source,nose.destination);assert.ok(Q.silhouetteEdges(dest,Q.silhouetteIds(dest),150).every(Number.isFinite));
});
test('una textura neuronal abierta conserva el gesto capturado sin aplicarlo dos veces',()=>{
 const p=setMouth(canonical(),.75,.95);const live=view(p),key={width:600,textureW:600,sourcePoints:live,generatedPoints:live,referenceViews:[{side:'front',points:view(canonical()),width:600}],referenceId:'generated-mouth'},shape=new Q.IdentityShape();let out;
 for(let i=0;i<50;i++)out=shape.apply(live,key,1,i*33,[]);assert.ok(Math.abs(out[14].y-out[13].y-(live[14].y-live[13].y))<.01);
});
test('la predicción angular mantiene distancias 3D en un giro',()=>{
 const {NeuralMotion}=require('../public/neural-motion'),m=new NeuralMotion(),p=canonical();m.update(view(p,.1),0,600);m.update(view(p,.2),100,600);const out=m.predict(130),actual=m.current.points,d=(v,a,b)=>Math.hypot(v[a].x-v[b].x,v[a].y-v[b].y,(v[a].z-v[b].z)*600);
 for(const [a,b] of [[33,263],[13,14],[1,152],[61,291]])assert.ok(Math.abs(d(out,a,b)-d(actual,a,b))<1e-6);
});
test('el marco 3D conserva proporciones en ambos perfiles y bajo espejo',()=>{
 const p=canonical(),expected=P.normalize(view(p),600);
 for(const yaw of [-1,-.6,.6,1])for(const mirror of [false,true]){
  const input=view(p,yaw,mirror),actual=P.normalize(input,600),roundtrip=P.project(actual,P.basis(input,600));
  actual.forEach((q,i)=>{for(const axis of ['x','y','z'])assert.ok(Math.abs(q[axis]-expected[i][axis])<1e-7);});
  roundtrip.forEach((q,i)=>{for(const axis of ['x','y','z'])assert.ok(Math.abs(q[axis]-input[i][axis])<1e-6);});
  assert.ok(Math.abs(P.basis(input,600).yaw+yaw)<1e-7);
 }
});
test('tres vistas coherentes conservan una única forma de identidad',()=>{
 const p=canonical(),views=[{side:'front',points:view(p),width:600},{side:'left',points:view(p,-.65),width:600},{side:'right',points:view(p,.65),width:600}],fused=P.fuseViews(views),expected=P.normalize(view(p),600);
 fused.forEach((q,i)=>{for(const axis of ['x','y','z'])assert.ok(Math.abs(q[axis]-expected[i][axis])<1e-6);});
});
test('la mandíbula no recupera las proporciones del conductor al girar',()=>{
 const driver=canonical(),target=canonical();target[152].y-=.20;
 const front=view(driver),reference=[{side:'front',points:view(target),width:600},{side:'left',points:view(target,-.7),width:600},{side:'right',points:view(target,.7),width:600}],key={width:600,sourcePoints:front,referenceViews:reference,referenceId:'same-identity'},shape=new Q.IdentityShape();
 let now=0;
 for(let i=0;i<40;i++)shape.apply(front,key,1,now+=33,[]);
 for(const yaw of [-.8,-.4,0,.4,.8]){
  const input=view(driver,yaw),out=shape.apply(input,key,1,now+=33,[]),local=P.normalize(out,600);
  assert.ok(Math.abs(local[152].y-1.2)<.015,'chin retained at yaw '+yaw);
 }
});
test('el álbum rechaza dos perfiles del mismo lado y cambia versión al retirar uno',()=>{
 const p=canonical(),ref=yaw=>({image:{width:600,height:500},points:view(p,yaw)}),album=new ReferenceViews();
 album.setFront(ref(0));album.add('left',ref(-.65));assert.throws(()=>album.add('right',ref(-.8)),/mismo lado/);album.add('right',ref(.65));
 assert.equal(album.reference.views.length,3);const before=album.reference.uid;album.remove('left');assert.equal(album.reference.views.length,2);assert.notEqual(album.reference.uid,before);
});
test('la matriz del recorte conserva correspondencias y rechaza matrices dañadas',()=>{
 const points=[[20,30],[40,60]],uv=Q.alignedUV(points,[2,0,10,0,2,-10],256);assert.equal(uv[0].x,50/256);assert.equal(uv[1].y,110/256);
 assert.equal(Q.alignedUV(points,[0,0,0,0,0,0],256),null);assert.equal(Q.alignedUV(points,[1,0,NaN,0,1,0],256),null);
});
test('priorizar identidad no sustituye automáticamente ojos o piel al parpadear',()=>{
 const points=view(canonical());points[159].y=points[145].y;
 const amounts=Q.featureAmounts(points,{identityLock:true,eyes:0,mouth:0,forehead:0,chin:0});assert.deepEqual(amounts,[0,0,0,0,0]);
});

test('la geometría se reutiliza entre detecciones sin recalibrar y responde al control de intensidad',()=>{
 const driver=canonical(),target=canonical();target[152].y-=.2;
 const front=view(driver);front.stamp=1;const key={width:600,sourcePoints:front,referenceViews:[{side:'front',points:view(target),width:600}],referenceId:'stable'},shape=new Q.IdentityShape();
 const first=shape.apply(front,key,1,0,[]);for(let i=1;i<40;i++)shape.apply(front,key,1,i*33,[]);
 assert.equal(shape.calibrationCount,1);shape.apply(front,key,1,1400,[]).forEach((p,i)=>{for(const axis of ['x','y','z'])assert.ok(Math.abs(p[axis]-first[i][axis])<1e-10);});
 let settled;for(let i=2;i<42;i++){front.stamp=i;settled=shape.apply(front,key,1,1400+i*33,[]);}
 const off=shape.apply(front,key,0,2850,[]);off.forEach((p,i)=>assert.ok(Math.hypot(p.x-front[i].x,p.y-front[i].y)<1e-7));
 const back=shape.apply(front,key,1,2883,[]);assert.ok(back[152].y>settled[152].y);
});

test('cada perfil conserva su geometría propia sin imponerle los labios de la frontal',()=>{
 const frontal=canonical(),side=canonical();for(const id of A.LIPS)side[id].y+=.12;side[1].z-=.1;
 const live=view(side,-.9),key={width:600,sourcePoints:live,referencePhoto:true,activeView:'left',referenceViews:[{side:'front',points:view(frontal),width:600},{side:'left',points:live,width:600}],referenceId:'real-profile-shape'},shape=new Q.IdentityShape();
 let out;for(let i=0;i<40;i++)out=shape.apply(live,key,1,i*33,[]);
 out.forEach((p,i)=>assert.ok(Math.hypot(p.x-live[i].x,p.y-live[i].y)<(A.LIPS.includes(i)?.31:1e-5)));
});
test('los gestos cambian párpados y labios sin arrastrar la nariz con residuos de otros vértices',()=>{
 const p=canonical(),neutral=view(p),key={width:600,sourcePoints:neutral,referenceViews:[{side:'front',points:neutral,width:600}],referenceId:'expressions'},shape=new Q.IdentityShape();
 for(let i=0;i<10;i++)shape.apply(neutral,key,1,i*33,[]);
 const gesture=canonical();gesture[159].y=-.008;gesture[145].y=.008;setMouth(gesture,.79,.91);
 const live=view(gesture);let out;for(let i=0;i<30;i++)out=shape.apply(live,key,1,400+i*33,[]);
 assert.ok(out[145].y-out[159].y<neutral[145].y-neutral[159].y);
 assert.ok(out[14].y-out[13].y>neutral[14].y-neutral[13].y);
 assert.ok(Math.hypot(out[1].x-neutral[1].x,out[1].y-neutral[1].y)<1e-5);
});
test('sin fondo preparado la silueta se conserva aunque cambien las proporciones interiores',()=>{
 const live=view(canonical()),reference=canonical();for(const p of reference){p.x*=.78;p.y*=.9;}
 const key={width:600,sourcePoints:live,referenceViews:[{side:'front',points:view(reference),width:600}],referenceId:'silhouette'},shape=new Q.IdentityShape();shape.allowContour=false;
 let result;for(let i=0;i<20;i++){live.stamp=i;result=shape.apply(live,key,1,i*33,[]);}
 for(const id of Q.silhouetteIds(live))assert.ok(Math.hypot(result[id].x-live[id].x,result[id].y-live[id].y)<1e-5);
 shape.allowContour=true;const expanded=shape.apply(live,key,1,700,[]);assert.ok(Math.abs(expanded[152].y-live[152].y)>1);
});
test('un punto interior desviado hacia cuello o cuerpo no amplía la máscara de fondo',()=>{const p=view(canonical());p[200].y=2000;p[14].y=2000;const ids=Q.silhouetteIds(p);assert.ok(!ids.includes(200));assert.ok(!ids.includes(14));p[1].x=2000;assert.ok(Q.silhouetteIds(p).includes(1));});
test('las señales de mandíbula y cierre llegan del seguimiento a la predicción',()=>{
 const {NeuralMotion}=require('../public/neural-motion'),s=new P.Stabilizer(),m=new NeuralMotion(),p=view(canonical());p.signals={jawOpen:.02,mouthClose:.85};
 m.update(s.filter(p,600,.8,10),10,600);assert.deepEqual(m.predict(30).signals,p.signals);
 const turned=view(canonical(),.25);turned.signals={jawOpen:.5,mouthClose:0};m.update(s.filter(turned,600,.8,43),43,600);
 assert.deepEqual(m.predict(65).signals,turned.signals);
});
