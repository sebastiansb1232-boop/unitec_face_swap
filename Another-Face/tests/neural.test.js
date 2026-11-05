'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/neural-portrait.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const response=data=>({ok:true,status:200,json:async()=>data});
function client(fetch,onDelivered){
  const scope={fetch,AbortController,setTimeout,clearTimeout,performance,FaceAppearance:require('../public/face-appearance'),neuralFaceCrop:require('../public/neural-motion').faceCrop,Image:class{async decode(){}},document:{createElement:()=>({width:640,height:480,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,camera'})}};
  vm.runInNewContext(source,scope);let completed=0;const n=new scope.NeuralPortrait(()=>{},()=>{completed++;onDelivered?.(n);});n.enabled=true;n.maxFps=1e9;
  return {n,completed:()=>completed};
}
const frame={width:640,height:480},points=Array.from({length:478},(_,i)=>({x:300+40*Math.sin(i),y:200+60*Math.cos(i)}));
points[33]={x:260,y:180};points[263]={x:340,y:180};points[10]={x:300,y:120};points[152]={x:300,y:290};
const ref={image:{width:640,height:480},points};
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
  try{const r=await original('http://127.0.0.1:'+server.address().port+'/api/neural/status');assert.deepEqual(await r.json(),{ready:false,provider:null});}
  finally{global.fetch=original;await new Promise(r=>server.close(r));}
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
