'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/neural-capture.js'),'utf8');
function setup(){
 const canvases=[];
 const document={createElement(){const c={frame:null,width:0,height:0,transforms:[]};c.getContext=()=>({drawImage(image){c.frame=image.frame;},translate(...a){c.transforms.push(['translate',...a]);},scale(...a){c.transforms.push(['scale',...a]);}});canvases.push(c);return c;}};
 const scope={document,performance:{now:()=>1234}};vm.runInNewContext(source,scope);return {capture:scope.captureFaceSnapshot,canvases};
}
const mesh=()=>Array.from({length:478},()=>({x:.3,y:.4,z:.02}));
test('la foto y sus puntos conservan el mismo fotograma aunque el video avance durante la detección',async()=>{
 const {capture}=setup(),video={frame:1};let complete,tracked;
 const tracker={track(image){tracked=image;return new Promise(r=>{complete=r;});}};
 const pending=capture(video,960,540,{tracker,mirror:true});video.frame=2;
 assert.equal(tracked.frame,1);complete({landmarks:mesh(),signals:{jawOpen:.2}});
 const shot=await pending;assert.equal(shot.source.frame,1);assert.equal(shot.display.frame,1);assert.equal(shot.capturedAt,1234);
 assert.ok(Math.abs(shot.raw[0].x-.7)<1e-12);assert.equal(shot.points[0].x,672);assert.equal(shot.points[0].y,216);assert.equal(shot.points[0].z,.02);assert.equal(shot.points.signals.jawOpen,.2);assert.equal(shot.points.stamp,1234);
 assert.equal(JSON.stringify(shot.display.transforms),JSON.stringify([['translate',960,0],['scale',-1,1]]));
});
test('perder la cara en un recorte busca de nuevo sobre la misma foto completa',async()=>{
 const {capture}=setup(),calls=[];
 const shot=await capture({frame:7},640,480,{tracker:{async track(image,options){calls.push({image,options});return calls.length===1?{landmarks:null,tracking:{cropped:true}}:{landmarks:mesh()};}}});
 assert.equal(calls.length,2);assert.equal(calls[1].options.reset,true);assert.equal(calls[0].image,calls[1].image);assert.equal(shot.source.frame,7);assert.equal(shot.points.length,478);
});
test('el detector alternativo recibe la imagen congelada y una foto sin cara se rechaza',async()=>{
 const {capture}=setup();let fallbackImage;
 const shot=await capture({frame:9},640,480,{tracker:{track:async()=>null},fallback:async image=>{fallbackImage=image;return {landmarks:mesh()};}});
 assert.equal(fallbackImage,shot.source);assert.equal(shot.points[0].x,192);assert.equal(shot.display.transforms.length,0);
 await assert.rejects(()=>capture({frame:10},640,480,{tracker:{track:async()=>({landmarks:null})}}),/No se detectó un rostro/);
});
