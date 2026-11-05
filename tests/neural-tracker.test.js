'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/neural-tracker.js'),'utf8');
function setup(fail=false){
  let terminated=0,closed=0;const messages=[];
  class Worker{
    postMessage(data,transfer){messages.push({data,transfer});queueMicrotask(()=>this.onmessage({data:fail&&data.type==='frame'?{id:data.id,error:'WebGL no disponible'}:{id:data.id,landmarks:data.type==='frame'?[{x:.5,y:.5}]:undefined}}));}
    terminate(){terminated++;}
  }
  const scope={Worker,OffscreenCanvas:class{},createImageBitmap:async()=>({close(){closed++;}}),setTimeout,clearTimeout};
  vm.runInNewContext(source,scope);return {tracker:new scope.NeuralTracker(),messages,counts:()=>({terminated,closed})};
}
test('seguimiento en segundo plano transfiere el fotograma y libera la imagen',async()=>{
  const {tracker,messages,counts}=setup();const first=await tracker.track({});const second=await tracker.track({});
  assert.equal(first.landmarks[0].x,.5);assert.equal(second.landmarks[0].y,.5);assert.equal(messages.filter(m=>m.data.type==='init').length,1);
  assert.equal(messages[1].transfer[0],messages[1].data.image);assert.deepEqual(counts(),{terminated:0,closed:2});assert.equal(tracker.pending.size,0);
});
test('un fallo del worker habilita la alternativa sin reintentos ni promesas pendientes',async()=>{
  const {tracker,messages,counts}=setup(true);assert.equal(await tracker.track({}),null);assert.equal(await tracker.track({}),null);
  assert.equal(tracker.disabled,true);assert.equal(messages.length,2);assert.equal(tracker.pending.size,0);assert.deepEqual(counts(),{terminated:1,closed:1});
});
test('un navegador sin OffscreenCanvas utiliza el seguimiento habitual',async()=>{
  const scope={setTimeout,clearTimeout};vm.runInNewContext(source,scope);const tracker=new scope.NeuralTracker();
  assert.equal(await tracker.track({}),null);assert.equal(tracker.worker,null);
});
