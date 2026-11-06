'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('../public/portrait-quality'),A=require('../public/face-appearance'),{NeuralMotion}=require('../public/neural-motion');
function face(){
  const p=Array.from({length:468},(_,i)=>({x:150+60*Math.sin(i),y:150+70*Math.cos(i),z:Math.sin(i)*.03}));
  Q.OVAL.forEach((id,k)=>{const a=k/Q.OVAL.length*Math.PI*2;p[id]={x:150+90*Math.sin(a),y:140-110*Math.cos(a),z:.04};});
  Object.assign(p,{33:{x:90,y:100,z:0},133:{x:120,y:100,z:-.01},263:{x:210,y:100,z:0},362:{x:180,y:100,z:-.01},159:{x:105,y:95,z:0},145:{x:105,y:105,z:0},386:{x:195,y:95,z:0},374:{x:195,y:105,z:0},1:{x:150,y:145,z:-.08},61:{x:120,y:185,z:0},291:{x:180,y:185,z:0},13:{x:150,y:184,z:0},14:{x:150,y:186,z:0}});return p;
}
const adjacency=()=>Array.from({length:468},(_,i)=>new Set([(i+1)%468,(i+467)%468]));
test('geometría: ojos, boca y silueta conservan el anclaje y la profundidad actuales',()=>{
  const live=face(),dst=live.map(p=>({...p,x:p.x+18,y:p.y-12})),out=Q.anchorGeometry(live,dst,adjacency());
  for(const id of new Set([...Q.OVAL,...Q.HOLES.flat()]))assert.deepEqual(out[id],live[id]);
  out.forEach((p,i)=>assert.equal(p.z,live[i].z));assert.ok(out.some((p,i)=>p.x!==live[i].x));
});
test('el anclaje sigue siendo coherente con espejo, escala y giro',()=>{
  const live=face(),dst=live.map(p=>({...p,x:p.x+12,y:p.y-9})),theta=.28;
  const move=p=>({...p,x:700-1.6*(p.x*Math.cos(theta)-p.y*Math.sin(theta)),y:30+1.6*(p.x*Math.sin(theta)+p.y*Math.cos(theta))});
  const expected=Q.anchorGeometry(live,dst,adjacency()).map(move),out=Q.anchorGeometry(live.map(move),dst.map(move),adjacency());
  out.forEach((p,i)=>assert.ok(Math.hypot(p.x-expected[i].x,p.y-expected[i].y)<1e-7));
});
test('un guiño conserva solo ese ojo y una boca abierta conserva su abertura',()=>{
  const p=face();p[159].y=99.9;p[145].y=100.1;
  let amount=Q.featureAmounts(p,{eyes:.1,mouth:.2});assert.ok(amount[0]>.95);assert.equal(amount[1],.1);
  p[14].y=210;amount=Q.featureAmounts(p,{eyes:.1,mouth:.2});assert.ok(amount[2]>.9);
});
test('el registro acepta un ajuste pequeño y rechaza otra cara, un espejo y coordenadas dañadas',()=>{
  const input=face().map(p=>({x:p.x/320,y:p.y/280})),detected=input.map(p=>({x:p.x+.004,y:p.y+.003}));
  assert.ok(Q.registeredUV(detected,input,320,280));
  assert.equal(Q.registeredUV(detected.map(p=>({x:1-p.x,y:p.y})),input,320,280),null);
  const other=detected.map(p=>({...p,x:p.x+.65}));assert.equal(Q.registeredUV(other,input,320,280),null);
  detected[10].x=NaN;assert.equal(Q.registeredUV(detected,input,320,280),null);
});
test('las transiciones no superponen una pose o expresión anterior incompatible',()=>{
  const a={registered:true,yaw:.01,expression:[.2,.2,.03]},b={registered:true,yaw:.02,expression:[.21,.2,.04]};
  assert.equal(Q.textureTransition(a,b),35);
  assert.equal(Q.textureTransition(a,{...b,yaw:.2}),0);
  assert.equal(Q.textureTransition(a,{...b,expression:[.02,.2,.04]}),0);
  assert.equal(Q.textureTransition(a,{...b,registered:false}),0);
});
test('dos intercambios de la misma identidad solo se funden si pose y gesto son compatibles',()=>{
 const a={registered:true,stableIdentity:true,model:'hyperswap_1c_256',referenceId:'same',yaw:0,pitch:0,expression:[.2,.2,.01]},b={...a,yaw:.02,expression:[.21,.2,.02]};
 assert.equal(Q.textureTransition(a,b),35);assert.equal(Q.textureTransition(a,{...b,referenceId:'other'}),0);assert.equal(Q.textureTransition(a,{...b,expression:[.21,.2,.4]}),0);assert.equal(Q.textureTransition(a,{...b,yaw:.1}),0);
});
test('la profundidad detectada llega a la vista después de suavizar y predecir',()=>{
  const p=face(),smoother=new A.ExpressionSmoother(),motion=new NeuralMotion();
  motion.update(smoother.filter(p,.7,0),0);const next=p.map(q=>({...q,x:q.x+5}));
  const smooth=smoother.filter(next,.7,33);motion.update(smooth,33);const predicted=motion.predict(60);
  predicted.forEach((q,i)=>assert.equal(q.z,next[i].z));
});
test('la identidad permite reducir mentón y mandíbula conservando los párpados abiertos',()=>{
  const live=face(),reference=live.map(p=>({...p}));
  for(const id of Q.OVAL){if(reference[id].y>170){reference[id].y-=18;reference[id].x=150+(reference[id].x-150)*.85;}}
  reference[152].y=live[152].y-20;
  const profile=Q.identityProfile(live,live,reference);
  assert.ok(profile[152].y<-.06);assert.ok(profile[172].x>0);
  const leftTop=profile[159],leftBottom=profile[145];assert.ok(Math.abs(leftTop.y-leftBottom.y)<.01);
  assert.ok(profile.every(p=>Math.abs(p.x)<=.18&&Math.abs(p.y)<=.20));
});
test('el nuevo contorno mueve la cámara interior y mantiene fijo el anillo exterior',()=>{
  const live=face(),destination=live.map(p=>({...p,y:p.y-12})),skirt=Q.contourSkirt(live,destination);
  assert.equal(skirt.length,Q.OVAL.length);
  skirt.forEach((p,i)=>{assert.deepEqual(p.source,p.destination);assert.equal(p.innerDestination.y,p.innerSource.y-12);assert.ok(Math.hypot(p.source.x-live[Q.OVAL[i]].x,p.source.y-live[Q.OVAL[i]].y)>50);});
});
test('el moldeado no invierte triángulos ni aplasta una abertura',()=>{
  const live=[{x:0,y:0},{x:20,y:0},{x:0,y:20}],desired=live.map(p=>({...p}));desired[2].y=-30;
  const out=Q.constrainGeometry(live,desired,[[0,1,2]]);assert.ok(out[2].y>3.5);assert.ok(out[2].y<20);
});
test('el moldeado neuronal se suaviza y se desactiva exactamente a cero',()=>{
  const live=face(),reference=live.map(p=>({...p}));reference[152].y-=20;
  const uv=live.map(p=>({x:p.x/320,y:p.y/320}));
  const key={input:{width:320,height:320},inputUV:uv,uv,registered:true,referencePoints:reference};
  const shape=new Q.IdentityShape(),first=shape.apply(live,key,1,0,[]),settled=shape.apply(live,key,1,120,[]);
  assert.ok(settled[152].y<first[152].y);assert.ok(first[152].y<live[152].y);
  assert.deepEqual(shape.apply(live,key,0,130,[]),live);
  settled.forEach((p,i)=>assert.equal(p.z,live[i].z));
});

test('el registro rechaza ojos desplazados hacia la frente aunque la escala sea parecida',()=>{
 const input=face().map(p=>({x:p.x/320,y:p.y/280})),bad=input.map(p=>({...p,y:p.y-.15}));
 assert.equal(Q.registeredUV(bad,input,320,280),null);
});

test('el cambio de fotografía usa una transición menor de 50 ms y no mezcla identidades',()=>{const a={referencePhoto:true,stableIdentity:true,registered:true,referenceId:'same'},b={...a};assert.equal(Q.textureTransition(a,b),35);assert.equal(Q.textureTransition(a,{...b,referenceId:'other'}),0);});
