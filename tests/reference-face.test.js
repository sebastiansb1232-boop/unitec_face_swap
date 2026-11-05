'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalize,retarget,HOLES}=require('../public/reference-face.js');
function mesh(){
 const p=Array.from({length:468},(_,i)=>({x:80+(i%20)*8,y:40+Math.floor(i/20)*8}));
 p[33]={x:100,y:100};p[263]={x:200,y:100};p[10]={x:150,y:30};p[152]={x:150,y:260};
 return p;
}
test('normalización conserva geometría con espejo, escala y giro',()=>{
 const p=mesh(),normal=normalize(p),theta=.25;
 for(const sign of [-1,1]){
  const moved=p.map(({x,y})=>({x:sign*(x*Math.cos(theta)-y*Math.sin(theta))*2+700,y:(x*Math.sin(theta)+y*Math.cos(theta))*2+20}));
  const actual=normalize(moved);
  actual.forEach((q,i)=>{assert.ok(Math.abs(q.x-normal[i].x)<1e-10);assert.ok(Math.abs(q.y-normal[i].y)<1e-10);});
 }
});
test('cero moldeado conserva puntos y moldeado mantiene apertura de ojos y boca',()=>{
 const p=mesh(),neutral=normalize(p),target=neutral.map((q,i)=>({x:q.x+.1*Math.sin(i),y:q.y+.08*Math.cos(i)}));
 assert.deepEqual(retarget(p,neutral,target,0),p);
 const result=retarget(p,neutral,target,1);
 assert.notDeepEqual(result,p);
 for(const ids of HOLES)for(const i of ids){
  assert.ok(Math.abs((result[i].x-result[ids[0]].x)-(p[i].x-p[ids[0]].x))<1e-10);
  assert.ok(Math.abs((result[i].y-result[ids[0]].y)-(p[i].y-p[ids[0]].y))<1e-10);
 }
});
test('captura retrato pasa validación y llega al almacenamiento; filtro desconocido se rechaza',async()=>{
 const {app}=require('../server');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const originalFetch=global.fetch,oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://storage-test.invalid';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 let saved;
 global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://storage-test.invalid')){saved=JSON.parse(options.body);return new Response(null,{status:201});}
  return originalFetch(url,options);
 };
 try{
  const body={id:crypto.randomUUID(),session_id:crypto.randomUUID(),filtro:'retrato',image:'data:image/jpeg;base64,/9j/2Q==',landmarks:null};
  const url='http://127.0.0.1:'+server.address().port+'/api/captures';
  const post=()=>originalFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post()).status,201);assert.equal(saved.filtro,'retrato');assert.equal(saved.imagen_base64,body.image);
  body.filtro='inventado';assert.equal((await post()).status,400);
 }finally{
  global.fetch=originalFetch;
  if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
  await new Promise(r=>server.close(r));
 }
});

const {rgbToYuv,yuvToRgb,robustStats,protectTriangles,signedArea,LandmarkSmoother,OVAL}=require('../public/reference-face.js');
test('muestras robustas ignoran minorías de reflejos y sombras sin excluir tonos oscuros',()=>{
 const skin=[.16,.10,.07],stat=robustStats([...Array(40).fill(skin),...Array(6).fill([0,0,0]),...Array(6).fill([1,1,1])]);
 stat.mean.forEach((v,i)=>assert.equal(v,rgbToYuv(skin)[i]));
 assert.equal(robustStats([]),null);
 for(const rgb of [[.1,.3,.8],[.8,.5,.1]])yuvToRgb(rgbToYuv(rgb)).forEach((v,i)=>assert.ok(Math.abs(v-rgb[i])<1e-5));
});
test('protección impide inversión de triángulos y conserva el contorno',()=>{
 const p=mesh(),dst=p.map(p=>({...p}));
 p[20]={x:90,y:90};p[21]={x:130,y:90};p[22]={x:110,y:140};
 dst[20]={...p[20]};dst[21]={...p[21]};dst[22]={x:110,y:30};
 const t=[20,21,22],result=protectTriangles(p,dst,[t]);
 assert.ok(signedArea(result,t)/signedArea(p,t)>=.16);
 const neutral=normalize(p),target=neutral.map(q=>({x:q.x+.4,y:q.y-.4}));
 const warped=retarget(p,neutral,target,1,[t]);
 for(const i of OVAL)assert.deepEqual(warped[i],p[i]);
});
test('estabilización conserva parpadeos y apertura, y no retrasa traslación de cabeza',()=>{
 const p=mesh(),s=new LandmarkSmoother();s.reset();s.filter(p,.6,0);
 const moved=p.map(q=>({x:q.x+60,y:q.y+15}));
 moved[159].y+=3;moved[14].y+=7;
 const output=s.filter(moved,.6,33);
 for(const i of [...HOLES.flat(),...OVAL])assert.ok(dist(output[i],moved[i])<1e-8);
 function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
});
const {normalizedBlur,edgeDistances}=require('../public/reference-face.js');
test('la iluminación conserva un color constante hasta el borde sin contaminarse con el fondo transparente',()=>{
 const w=40,h=32,data=new Uint8ClampedArray(w*h*4),tone=[52,31,20];
 for(let y=8;y<24;y++)for(let x=8;x<32;x++){const i=(y*w+x)*4;data.set([...tone,255],i);}
 const out=normalizedBlur(data,w,h,3);
 let count=0;
 for(let i=0;i<out.length;i+=4)if(out[i+3]){count++;for(let c=0;c<3;c++)assert.ok(Math.abs(out[i+c]-tone[c])<=1);}
 assert.ok(count>16*24,'el color se extiende al borde de forma normalizada');
 assert.ok(normalizedBlur(new Uint8ClampedArray(w*h*4),w,h,3).every(v=>v===0));
});
test('la iluminación conserva gradientes y no mezcla colores de un fotograma anterior',()=>{
 const w=48,h=24,data=new Uint8ClampedArray(w*h*4),buffers={};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set([30+x*4,30+x*3,30+x*2,255],(y*w+x)*4);
 const out=normalizedBlur(data,w,h,2,buffers).slice();
 for(let x=10;x<38;x++)assert.ok(out[(12*w+x)*4]<=out[(12*w+x+1)*4]);
 data.fill(0);for(let i=0;i<data.length;i+=4)data.set([22,17,12,255],i);
 const dark=normalizedBlur(data,w,h,2,buffers);
 for(let i=0;i<dark.length;i+=4)assert.deepEqual(Array.from(dark.slice(i,i+4)),[22,17,12,255]);
});
test('la anchura física del borde es estable bajo espejo, giro y escala',()=>{
 const p=mesh();OVAL.forEach((id,k)=>{const a=k/OVAL.length*Math.PI*2;p[id]={x:150+120*Math.sin(a),y:150-170*Math.cos(a)};});
 const original=edgeDistances(p),angle=.42;
 const transformed=p.map(q=>({x:-(q.x*Math.cos(angle)-q.y*Math.sin(angle))*2.3+1000,y:(q.x*Math.sin(angle)+q.y*Math.cos(angle))*2.3+50}));
 const actual=edgeDistances(transformed);
 for(let i=0;i<468;i++)assert.ok(Math.abs(original[i]-actual[i])<1e-9);
 for(const i of OVAL)assert.equal(actual[i],0);
});
