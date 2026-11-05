'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {aiConnection}=require('../ai-connection'),{neuralRouter}=require('../neural-proxy'),{setupRemote}=require('../scripts/setup-remote-ai'),{checkWorker}=require('../scripts/check-ai-worker');
const TOKEN='private_test_key_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const env={ANOTHERFACE_AI_URL:'https://gpu.example.test',ANOTHERFACE_AI_TOKEN:TOKEN};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const healthy=()=>response({ready:true,auth_required:true,provider:'CUDAExecutionProvider',model:'test',threads:4});
const input={image:'data:image/jpeg;base64,camera',points:Array.from({length:468},()=>[1,2]),reference_id:'reference_token_0123456789'};
async function fixture(fn,config=env){
  const app=express();app.use(express.json());app.use('/api/neural',neuralRouter({env:config,fetch:fn}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  return {base:'http://127.0.0.1:'+server.address().port+'/api/neural',close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
const post=(url,body=input,options={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),...options});
test('configuración: el uso local conserva su dirección y no exige clave',()=>{
  const c=aiConnection({});assert.equal(c.base,'http://127.0.0.1:8766');assert.equal(c.remote,false);assert.deepEqual(c.headers,{});
});
test('configuración: el motor remoto exige HTTPS, origen simple y una clave válida',()=>{
  for(const url of ['http://gpu.example.test','ftp://gpu.example.test','https://user:pwd@gpu.example.test','https://gpu.example.test/frame','https://gpu.example.test/?key=x','https://gpu.example.test/#fragment'])assert.throws(()=>aiConnection({...env,ANOTHERFACE_AI_URL:url}));
  for(const token of ['', 'short', 'x'.repeat(32)+'\nsecret'])assert.throws(()=>aiConnection({...env,ANOTHERFACE_AI_TOKEN:token}));
  assert.equal(aiConnection(env).headers.Authorization,'Bearer '+TOKEN);
});
test('estado remoto: autentica, bloquea redirecciones y mantiene la clave fuera de la respuesta',async()=>{
  let calls=0;const f=await fixture(async(url,options)=>{calls++;assert.equal(url,env.ANOTHERFACE_AI_URL+'/healthz');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+TOKEN);return healthy();});
  try{for(let i=0;i<2;i++){const r=await fetch(f.base+'/status'),data=await r.json();assert.equal(data.ready,true);assert.equal(data.mode,'remote');assert.equal(data.provider,'CUDAExecutionProvider');assert.ok(!JSON.stringify(data).includes(TOKEN));assert.ok(!JSON.stringify(data).includes('gpu.example.test'));assert.equal(r.headers.get('cache-control'),'no-store');}assert.equal(calls,1);}finally{await f.close();}
});
test('motor remoto sin protección: se rechaza antes de enviar una imagen',async()=>{
  let frames=0;const f=await fixture(async url=>{if(url.endsWith('/healthz'))return response({ready:true,auth_required:false});frames++;return response({});});
  try{assert.equal((await (await fetch(f.base+'/status')).json()).ready,false);assert.equal((await post(f.base+'/frame')).status,503);assert.equal(frames,0);}finally{await f.close();}
});
test('clave incorrecta: informa del problema sin exponer la respuesta privada del motor',async()=>{
  const f=await fixture(async()=>response({detail:TOKEN},401));
  try{const data=await (await fetch(f.base+'/status')).json();assert.equal(data.ready,false);assert.match(data.error,/clave/);assert.ok(!JSON.stringify(data).includes(TOKEN));}finally{await f.close();}
});
test('referencia y fotograma: conserva la carga útil y solo añade la credencial del servidor',async()=>{
  const seen=[];const f=await fixture(async(url,options)=>{
    if(url.endsWith('/healthz'))return healthy();seen.push(url);assert.deepEqual(JSON.parse(options.body),input);assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    return response(url.endsWith('/reference')?{reference_id:input.reference_id}:{image:'data:image/jpeg;base64,result',ms:12,provider:'CUDAExecutionProvider'});
  });
  try{assert.equal((await post(f.base+'/reference')).status,200);const data=await (await post(f.base+'/frame')).json();assert.equal(data.image,'data:image/jpeg;base64,result');assert.equal(seen.length,2);}finally{await f.close();}
});
test('el relleno de fondo conserva autenticación, informa disponibilidad y espera su resultado',async()=>{
  let backgroundCalls=0;const f=await fixture(async(url,options)=>{
    if(url.endsWith('/healthz'))return response({ready:true,auth_required:true,background_available:true,background_safe:true,gesture_retargeting:true});
    assert.equal(url,env.ANOTHERFACE_AI_URL+'/background');assert.equal(options.headers.Authorization,'Bearer '+TOKEN);assert.deepEqual(JSON.parse(options.body),input);backgroundCalls++;
    return response({image:'data:image/jpeg;base64,background',model:'lama_fp32',ms:500});
  });
  try{const status=await (await fetch(f.base+'/status')).json();assert.equal(status.background_available,true);assert.equal(status.background_safe,true);assert.equal(status.gesture_retargeting,true);assert.ok(!JSON.stringify(status).includes(TOKEN));const r=await post(f.base+'/background');assert.equal(r.status,200);assert.equal((await r.json()).model,'lama_fp32');assert.equal(backgroundCalls,1);}finally{await f.close();}
});
test('el relleno ausente indica cómo instalarlo sin reenviar detalles del motor',async()=>{
  const f=await fixture(async url=>url.endsWith('/healthz')?healthy():response({detail:TOKEN},409));
  try{const r=await post(f.base+'/background');assert.equal(r.status,409);const message=await r.text();assert.match(message,/instalar-relleno-ia/);assert.ok(!message.includes(TOKEN));}finally{await f.close();}
});
test('errores del motor: conserva caducidad y espera sin reenviar detalles sensibles',async()=>{
  for(const status of [410,429,422]){
    const f=await fixture(async url=>url.endsWith('/healthz')?healthy():response({detail:TOKEN},status));
    try{const r=await post(f.base+'/frame');assert.equal(r.status,status);assert.ok(!(await r.text()).includes(TOKEN));}finally{await f.close();}
  }
});
test('configuración incompleta: permite abrir la web y devuelve estado no disponible sin llamadas externas',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return healthy();},{ANOTHERFACE_AI_URL:env.ANOTHERFACE_AI_URL});
  try{const data=await (await fetch(f.base+'/status')).json();assert.equal(data.ready,false);assert.equal(data.mode,'invalid');assert.equal((await post(f.base+'/frame')).status,503);assert.equal(calls,0);}finally{await f.close();}
});
test('un cierre de navegador aborta también la conexión de inferencia remota',async()=>{
  let started,signal;const ready=new Promise(r=>started=r);const f=await fixture((url,options)=>{
    if(url.endsWith('/healthz'))return Promise.resolve(healthy());signal=options.signal;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  });
  try{const controller=new AbortController(),pending=post(f.base+'/frame',input,{signal:controller.signal});await ready;controller.abort();await assert.rejects(pending);await new Promise(r=>setTimeout(r,40));assert.equal(signal.aborted,true);}finally{await f.close();}
});
test('una respuesta de estado excesiva no llega al navegador',async()=>{
  const f=await fixture(async()=>new Response('x'.repeat(70000)));
  try{const data=await (await fetch(f.base+'/status')).json();assert.equal(data.ready,false);assert.ok(JSON.stringify(data).length<500);}finally{await f.close();}
});
test('setup remoto: crea una clave privada una sola vez y la reutiliza',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'another-face-test-'));
  try{const first=setupRemote(dir),before=fs.readFileSync(first.file,'utf8');assert.equal(first.created,true);assert.match(before,/ANOTHERFACE_AI_TOKEN=[A-Za-z0-9_-]{43}\n/);assert.equal(setupRemote(dir).created,false);assert.equal(fs.readFileSync(first.file,'utf8'),before);if(process.platform!=='win32')assert.equal(fs.statSync(first.file).mode&0o777,0o600);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('el comprobador impide exponer un motor abierto y valida uno protegido',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'another-face-test-'));
  try{setupRemote(dir);await assert.rejects(checkWorker(dir,async()=>response({ready:true})),/no está protegido/);let calls=0;const data=await checkWorker(dir,async(url,options)=>{calls++;return options.headers?healthy():response({},401);});assert.equal(data.ready,true);assert.equal(calls,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
