'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/tracking-worker.js'),'utf8');
function setup(role='live'){
 const calls=[],context=vm.createContext({self:{location:{href:'https://test.invalid/tracking-worker.js'}},URL,performance:{now:()=>100},mockTask:{async setOptions(options){calls.push(options.runningMode);},detect(){calls.push('detect');return {faceLandmarks:[]};},detectForVideo(_image,timestamp){calls.push(['video',timestamp]);return {faceLandmarks:[]};}}});vm.runInContext(source,context);vm.runInContext("task=mockTask;role='"+role+"';runningMode='"+(role==='live'?'VIDEO':'IMAGE')+"';backend='tasks-cpu';",context);let closed=0;const frame=extra=>context.handle({type:'frame',image:{close(){closed++;}},timestamp:10,...extra});return {frame,calls,closed:()=>closed};
}
test('el seguimiento mantiene VIDEO dentro del mismo marco y reinicia el grafo al reencuadrar',async()=>{
 const {frame,calls,closed}=setup();assert.equal((await frame({})).mode,'VIDEO');assert.equal((await frame({})).mode,'VIDEO');assert.equal(calls.filter(c=>typeof c==='string').length,0);assert.ok(calls[1][1]>calls[0][1]);
 await frame({reset:true});assert.equal(JSON.stringify(calls.slice(2,4)),JSON.stringify(['IMAGE','VIDEO']));assert.equal(closed(),3);
});
test('una foto usa IMAGE independiente y el video vuelve a seguimiento temporal después',async()=>{
 const {frame,calls}=setup();assert.equal((await frame({still:true})).mode,'IMAGE');assert.equal((await frame({})).mode,'VIDEO');assert.equal(JSON.stringify(calls.slice(0,3)),JSON.stringify(['IMAGE','detect','VIDEO']));const image=setup('image');assert.equal((await image.frame({reset:true})).mode,'IMAGE');assert.equal(JSON.stringify(image.calls),JSON.stringify(['detect']));
});
