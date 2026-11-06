'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/neural-portrait.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const response=data=>({ok:true,status:200,json:async()=>data});
function client(fetch,onDelivered,fitGenerated,fastAlignment=false){
  const schedule=fastAlignment?(fn,delay)=>setTimeout(fn,delay===2500?5:delay):setTimeout;
  const scope={fetch,AbortController,AbortSignal,setTimeout:schedule,clearTimeout,performance,FaceAppearance:require('../public/face-appearance'),PortraitQuality:require('../public/portrait-quality'),neuralFaceCrop:require('../public/neural-motion').faceCrop,Image:class{async decode(){}},document:{createElement:()=>({width:640,height:480,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,camera'})}};
  vm.runInNewContext(source,scope);let completed=0;const n=new scope.NeuralPortrait(()=>{},()=>{completed++;onDelivered?.(n);},fitGenerated);n.enabled=true;n.maxFps=1e9;
  return {n,completed:()=>completed,scope};
}
const frame={width:640,height:480},points=Array.from({length:478},(_,i)=>({x:300+40*Math.sin(i),y:200+60*Math.cos(i)}));
points[33]={x:260,y:180};points[263]={x:340,y:180};points[10]={x:300,y:120};points[152]={x:300,y:290};points[1]={x:300,y:215};points[61]={x:280,y:250};points[291]={x:320,y:250};points[13]={x:300,y:249};points[14]={x:300,y:251};
const ref={image:{width:640,height:480},points};
test('los ajustes no cancelan ni duplican una inferencia que sigue trabajando',async()=>{
 let release,signal,frames=0;const {n}=client((url,options)=>url.endsWith('/reference')?Promise.resolve(response({reference_id:'id'})):(frames++,signal=options.signal,new Promise(r=>release=r)));
 n.submit(frame,points,ref,{},[]);await tick();const driver=n.driverId;n.reset(true);assert.equal(signal.aborted,false);assert.equal(n.driverId,driver);assert.equal(n.submit(frame,points,ref,{},[]),false);release(response({image:'stale',ms:100}));await tick();assert.equal(frames,1);assert.equal(n.last,null);
});
test('un motor ocupado espacia reintentos sin acumular fotogramas',async()=>{
 const {n}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):{ok:false,status:429,json:async()=>({error:'ocupado',retry_ms:500})});const waits=[];
 for(let i=0;i<3;i++){n.next=0;n.submit(frame,points,ref,{},[]);await tick();waits.push(n.next-performance.now());assert.equal(n.busy,false);}assert.ok(waits[0]>450&&waits[1]>950&&waits[2]>1950);
});
test('la calibración requiere muestras neutrales distintas y conserva el conductor al ajustar',()=>{
 const {n,scope}=client(async()=>response({}));scope.FacePose=require('../public/face-pose');const p=points.map(q=>({...q,z:0}));p[133]={x:290,y:180,z:0};p[362]={x:310,y:180,z:0};for(const [t,d,x] of [[159,145,275],[386,374,325]]){p[t]={x,y:175,z:0};p[d]={x,y:185,z:0};}
 assert.equal(n.submit(frame,p,ref,{},[],{capturedAt:1}),false);assert.equal(n.submit(frame,p,ref,{},[],{capturedAt:1}),false);assert.equal(n.neutralSamples,1);const id=n.driverId;n.reset(true);assert.equal(n.driverId,id);assert.equal(n.neutralSamples,1);n.resetDriver();assert.equal(n.driverId,id+1);assert.equal(n.neutralSamples,0);
});
test('un gesto nuevo no sustituye toda la textura neuronal por una fotografía',()=>{
 const {n,scope}=client(async()=>response({}));scope.FacePose={basis:()=>({yaw:0,pitch:0})};const key={registered:true,received:1000,yaw:0,expression:[0,0,0],requestMs:20000};n.last=key;n.validCache.set(0,key);assert.equal(n.select(points,640,2000,ref,480),key);
});
test('volver a ambos perfiles reutiliza inmediatamente una identidad ya generada y rechaza otra referencia',()=>{
 let requests=0;const {n,scope}=client(async()=>{requests++;return response({});});scope.FacePose={basis:p=>({yaw:p.yaw||0,pitch:0})};const reference={...ref,uid:'persistent'},keys=[-.7,0,.7].map(yaw=>({model:'hyperswap_1c_256',referenceId:'persistent',registered:true,received:1000,yaw,pitch:0,expression:scope.PortraitQuality.expression(points),requestMs:150}));
 n.last=keys[2];keys.forEach((key,i)=>n.validCache.set(i,key));
 for(const [i,yaw]of [[0,-.7],[2,.7],[1,0]]){const p=points.map(v=>({...v}));p.yaw=yaw;assert.equal(n.select(p,640,20000,reference,480),keys[i]);}
 assert.equal(requests,0);assert.equal(n.select(points,640,20000,{...reference,uid:'other'},480),null);assert.equal(n.select(points,640,47000,reference,480),null);
});
test('neural: un solo fotograma en vuelo y la referencia se reutiliza',async()=>{
  let refs=0,frames=0;const {n,completed}=client(async url=>{if(url.endsWith('/reference')){refs++;return response({reference_id:'test-reference'});}frames++;return response({image:'result',ms:20,provider:'CPUExecutionProvider'});});
  const raw=[{x:.2,y:.4,z:0}];n.submit(frame,points,ref,{},raw);n.submit(frame,points,ref,{},raw);
  raw[0].x=.9;await tick();await tick();assert.equal(refs,1);assert.equal(frames,1);assert.equal(completed(),1);assert.equal(n.last.raw[0].x,.2);
  n.submit(frame,points,ref,{},raw);await tick();assert.equal(refs,1);assert.equal(frames,2);
  assert.ok(n.last.image);assert.ok(n.last.crop.outputW<=320);assert.equal(n.last.uv.length,478);
});
test('neural: una referencia atrasada no reaparece después de apagar o cambiar rostro',async()=>{
  let release,frames=0;const {n,completed}=client(url=>{if(url.endsWith('/reference'))return new Promise(r=>release=r);frames++;return Promise.resolve(response({image:'result',ms:20}));});
  n.submit(frame,points,ref,{},[]);n.reset();release(response({reference_id:'stale'}));await tick();
  assert.equal(frames,0);assert.equal(n.token,null);assert.equal(n.last,null);assert.equal(completed(),0);assert.equal(n.busy,false);
});
test('neural: se descarta el fotograma que llega después de un reinicio',async()=>{
  let release;const {n,completed}=client(url=>url.endsWith('/reference')?Promise.resolve(response({reference_id:'id'})):new Promise(r=>release=r));
  n.submit(frame,points,ref,{},[]);await tick();n.reset(true);release(response({image:'stale',ms:50}));await tick();await tick();
  assert.equal(n.last,null);assert.equal(completed(),0);
});
test('neural: un motor ocupado produce espera sin acumular solicitudes',async()=>{
  let calls=0;const {n}=client(async url=>{calls++;return url.endsWith('/reference')?response({reference_id:'id'}):{ok:false,status:429,json:async()=>({error:'ocupado'})};});
  n.submit(frame,points,ref,{},[]);await tick();n.submit(frame,points,ref,{},[]);assert.equal(calls,2);assert.ok(n.next>performance.now());
});
test('neural: libera la solicitud antes de avisar y permite usar la captura más reciente',async()=>{
  const states=[];let frames=0;
  const {n}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):(frames++,response({image:'result',ms:20,provider:'CUDAExecutionProvider'})),current=>{
    states.push(current.busy);if(states.length===1)current.submit(frame,points,ref,{},[]);
  });
  n.submit(frame,points,ref,{},[]);await tick();await tick();
  assert.equal(frames,2);assert.deepEqual(states,[false,false]);assert.equal(n.last.provider,'CUDAExecutionProvider');
  assert.ok(n.last.input);assert.notEqual(n.last.input,frame);assert.ok(n.last.input.width<=320);
});
test('proxy: estado desactivado cuando no responde el servicio local',async()=>{
  const {app}=require('../server'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const original=global.fetch;global.fetch=async url=>{if(String(url).startsWith('http://127.0.0.1:8766'))throw Error('offline');return original(url);};
  try{const r=await original('http://127.0.0.1:'+server.address().port+'/api/neural/status'),data=await r.json();assert.equal(data.ready,false);assert.equal(data.provider,null);assert.equal(data.proxy_protocol,5);assert.equal(data.web_version,require('../package.json').version);}
  finally{global.fetch=original;await new Promise(r=>server.close(r));}
});
test('neural: la capa alfa y el registro generado llegan juntos a la vista',async()=>{
  const {n}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):response({image:'preview',layer:'rgba-layer',light_luma:.42,passes:4,quality:'detail',ms:80}),null,async(_image,crop)=>crop.uv.map(p=>({x:p.x+.003,y:p.y+.002})));
  n.submit(frame,points,ref,{quality:'detail'},[]);await tick();await tick();
  assert.equal(n.last.layer.src,'rgba-layer');assert.equal(n.last.registered,true);assert.equal(n.last.passes,4);assert.equal(n.last.lightLuma,.42);
  assert.notEqual(n.last.uv[1].x,n.last.crop.uv[1].x);
});
test('neural: un análisis fallido conserva el resultado sin registrar otra cara',async()=>{
  const {n,completed}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):response({image:'preview',layer:'layer',ms:50}),null,async()=>{throw new Error('tracking offline');});
  n.submit(frame,points,ref,{},[]);await tick();await tick();
  assert.equal(completed(),1);assert.equal(n.last.registered,false);assert.equal(n.last.uv,n.last.crop.uv);
});
test('neural: un registro que termina después de apagar no reaparece',async()=>{
  let finish;const {n,completed}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):response({image:'preview',ms:50}),null,async(_image,crop)=>new Promise(resolve=>{finish=()=>resolve(crop.uv);}));
  n.submit(frame,points,ref,{},[]);await tick();const beforeStop=completed();assert.equal(beforeStop,1);n.reset();finish();await tick();await tick();
  assert.equal(n.last,null);assert.equal(completed(),beforeStop);assert.equal(n.busy,false);
});
test('neural: un registro lento refina la textura actual sin contar otra generación',async()=>{
  let finish;const {n}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):response({image:'preview',ms:50}),null,async(_image,crop)=>new Promise(resolve=>{finish=()=>resolve(crop.uv);}),true);
  n.submit(frame,points,ref,{},[]);await new Promise(r=>setTimeout(r,30));
  const current=n.last,count=n.arrivals.length;assert.ok(current);assert.equal(current.registered,false);
  finish();await tick();assert.equal(n.last,current);assert.equal(current.registered,true);assert.equal(n.arrivals.length,count);
});
test('neural: un registro lento conserva una textura válida sin modificar la generación nueva',async()=>{
  let finish,analyses=0;const {n}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):response({image:'preview',ms:50}),null,async(_image,crop)=>++analyses===1?new Promise(resolve=>{finish=()=>resolve(crop.uv.map(p=>({...p,x:p.x+.003})));}):crop.uv,true);
  n.submit(frame,points,ref,{},[]);await new Promise(r=>setTimeout(r,30));const old=n.last;
  n.submit(frame,points,ref,{},[]);await tick();await tick();const current=n.last,uv=current.uv;
  assert.notEqual(old,current);finish();await tick();assert.equal(n.last,current);assert.equal(current.uv,uv);assert.equal(old.registered,true);assert.equal(n.validCache.size,1);assert.equal([...n.validCache.values()][0],current);
});
test('proxy: rechaza cuerpo inválido y origen ajeno antes de llamar al motor',async()=>{
  const {app}=require('../server'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const original=global.fetch;let forwarded=0;global.fetch=async url=>{if(String(url).startsWith('http://127.0.0.1:8766')){forwarded++;return response({});}return original(url);};
  try{const url='http://127.0.0.1:'+server.address().port+'/api/neural/frame';
    assert.equal((await original(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    assert.equal((await original(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.invalid'},body:'{}'})).status,403);
    assert.equal(forwarded,0);
  }finally{global.fetch=original;await new Promise(r=>server.close(r));}
});

test('neural: perfiles se preparan como una identidad y el espejo se corrige antes del envío',async()=>{
  const calls=[];const {n}=client(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return url.endsWith('/reference')?response({reference_id:'id'}):response({image:'preview',layer:'patch',transport:'patch',texture_size:256,affine:[1,0,0,0,1,0],native_size:256,ms:20});});
  n.engineInfo={render_protocol:4,patch_output:true};
  const reference={...ref,uid:'three',views:['front','left','right'].map(side=>({...ref,side}))};
  n.submit(frame,points,reference,{quality:'balanced'},[],{mirror:true});await tick();await tick();
  assert.equal(calls[0].body.views.length,2);assert.equal(calls[1].body.settings.transport,'patch');assert.equal(n.last.referenceCount,3);
  const expected=require('../public/neural-motion').faceCrop(points.map(p=>({...p,x:frame.width-p.x})),640,480,n.faceSize);
  assert.deepEqual(calls[1].body.points,expected.points);assert.equal(n.last.textureW,256);assert.equal(n.busy,false);
  n.submit(frame,points,reference,{},[],{mirror:true});await tick();assert.equal(calls.filter(c=>c.url.endsWith('/reference')).length,1);
});
test('neural: un registro pendiente no bloquea la siguiente inferencia',async()=>{
  let frames=0;const {n}=client(async url=>url.endsWith('/reference')?response({reference_id:'id'}):(frames++,response({image:'preview',ms:20})),null,()=>new Promise(()=>{}));
  n.submit(frame,points,ref,{},[]);await tick();assert.equal(n.busy,false);assert.ok(n.last);
  n.submit(frame,points,ref,{},[]);await tick();assert.equal(frames,2);assert.equal(n.arrivals.length,2);
});
test('neural: una referencia incompatible se pausa hasta corregir las fotos',async()=>{
  let calls=0;const {n}=client(async()=>{calls++;return {ok:false,status:400,json:async()=>({error:'Referencias incompatibles'})};});
  n.submit(frame,points,ref,{},[]);await tick();n.next=0;assert.equal(n.submit(frame,points,ref,{},[]),false);assert.equal(calls,1);n.reset();assert.equal(n.invalidReference,null);
});

test('avatar fotográfico usa las fotos y no requiere llamadas al generador',async()=>{
 let requests=0;const {n,scope}=client(async()=>{requests++;throw new Error('No debe llamar al motor');});n.photoOnly=true;n.enabled=false;
 const P=scope.FacePose=require('../public/face-pose'),local=P.normalize(points,640);
 const pose=yaw=>P.project(local,{origin:{x:300,y:200,z:0},scale:80,width:640,x:{x:Math.cos(yaw),y:0,z:-Math.sin(yaw)},y:{x:0,y:1,z:0},z:{x:Math.sin(yaw),y:0,z:Math.cos(yaw)}});
 const views=[['front',0],['left',-.65],['right',.65]].map(([side,yaw])=>({side,image:{width:640,height:480},points:pose(yaw),width:640}));
 const reference={...views[0],uid:'photo-identity',views},front=n.select(pose(0),640,10,reference,480);
 assert.equal(front.referencePhoto,true);assert.equal(front.activeView,'front');assert.equal(front.passes,0);assert.equal(front.image,views[0].image);assert.equal(front.uv[33].x,views[0].points[33].x/640);
 assert.equal(n.select(pose(0),640,20,reference,480),front);assert.equal(n.select(pose(-.65),640,30,reference,480).activeView,'left');assert.equal(n.select(pose(.65),640,40,reference,480).activeView,'right');
 assert.equal(n.submit(frame,points,reference,{},[]),false);assert.equal(requests,0);assert.equal(n.arrivals.length,0);
 n.reset();assert.equal(n.photoCache.size,0);
});

test('neural: bloquea versiones incompatibles de Render y del motor antes de enviar fotos',async()=>{
 for(const [info,allowed,message] of [[{ready:true,render_protocol:5,patch_output:true},false,/Render/],[{ready:true,proxy_protocol:5,render_protocol:4,patch_output:true},false,/PC/],[{ready:true,proxy_protocol:5,render_protocol:5,patch_output:true},true,null]]){
  const {n}=client(async()=>response(info));assert.equal(await n.available(),allowed);if(message)assert.match(n.engineInfo.error,message);
 }
});
test('neural: el intercambio no acepta un motor que solo anima fotografías',async()=>{
 const info={ready:true,proxy_protocol:5,render_protocol:5,patch_output:true,model:'live_portrait_512',engine_kind:'portrait_animation'},c=client(async()=>response(info));
 assert.equal(await c.n.available(),false);assert.match(c.n.engineInfo.error,/iniciar-intercambio-ia/);
 c.n.allowPortrait=true;assert.equal(await c.n.available(),true);
 const swap=client(async()=>response({...info,model:'hyperswap_1c_256',engine_kind:'face_swap'}));
 assert.equal(await swap.n.available(),true);swap.n.allowPortrait=true;assert.equal(await swap.n.available(),false);
});
test('neural: espera el intercambio registrado sin sustituirlo por una foto',()=>{
 const {n,scope}=client(async()=>response({}));scope.FacePose=require('../public/face-pose');
 const reference={...ref,uid:'alignment-check',views:[{...ref,side:'front',width:640}]};
 const photo=n.photoKey(points,640,480,reference,10),valid={...photo,registered:true,referencePhoto:false,received:10,yaw:0,pitch:0,expression:scope.PortraitQuality.expression(points)},broken={...valid,registered:false};
 n.last=broken;n.cache.set(0,broken);assert.equal(n.select(points,640,20,reference,480),null);assert.equal(n.photoCache.size,1);
 n.validCache.set(0,valid);assert.equal(n.select(points,640,30,reference,480),valid);
 n.reset();assert.equal(n.validCache.size,0);assert.equal(n.select(points,640,40,reference,480),null);n.allowPortrait=true;assert.equal(n.select(points,640,50,reference,480).referencePhoto,true);
});

test('las fotos amplias se recortan antes de reducir para conservar detalle facial',()=>{
 const {n,scope}=client(async()=>response({}));let canvas,draw;
 scope.document.createElement=()=>canvas={width:0,height:0,getContext:()=>({drawImage(...args){draw=args;}}),toDataURL:()=> 'data:image/jpeg;base64,reference'};
 const image={width:3000,height:2000},mesh=points.map(p=>({...p,x:p.x+1000,y:p.y+600})),encoded=n.encodeReference({image,points:mesh,side:'front'}),crop=scope.neuralFaceCrop(mesh,3000,2000,1024);
 assert.equal(canvas.width,crop.width);assert.equal(canvas.height,crop.height);assert.equal(draw[0],image);assert.equal(draw[1],crop.x);assert.deepEqual(encoded.points,crop.points);
 assert.equal(encoded.points[33][0],mesh[33].x-crop.x);
});
