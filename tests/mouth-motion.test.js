'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../public/mouth-motion');
function mouth(){const p=Array.from({length:478},()=>({x:150,y:160,z:0}));p[61]={x:100,y:160,z:0};p[291]={x:200,y:160,z:0};p[10]={x:150,y:40,z:0};p[152]={x:150,y:280,z:0};for(const id of [0,37,267])p[id]={x:150,y:140,z:0};for(const id of [17,84,314])p[id]={x:150,y:190,z:0};for(const id of [13,82,312,81,311,80,310])p[id]={x:150,y:147,z:0};for(const id of [14,87,317,178,402,88,318])p[id]={x:150,y:180,z:0};return p;}
test('un punto interior que sigue la lengua no arrastra el borde del labio',()=>{const p=mouth();p[14].y=250;p[14].z=-.8;const out=M.sanitize(p);assert.ok(out[14].y<190);assert.equal(out[17].y,p[17].y);assert.equal(out[14].z,0);assert.ok(M.aperture(out)<.5);assert.equal(p[14].y,250);});
test('una muestra central dañada no convierte la lengua en una apertura enorme',()=>{const p=mouth(),expected=M.aperture(p);p[14].y+=100;assert.ok(Math.abs(M.aperture(p)-expected)<1e-8);});
test('el mapa interior conserva una transformación afín y deja margen dentro de los labios',()=>{const p=mouth(),dest=p.map(q=>({...q,x:q.x*1.2+30,y:q.y*.8-10})),map=M.interiorMapper(dest,p);assert.ok(map(dest[13]).y>p[13].y);assert.ok(map(dest[14]).y<p[14].y);const a={x:180,y:130},b={x:240,y:150},mid=map({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),ma=map(a),mb=map(b);assert.ok(Math.hypot(mid.x-(ma.x+mb.x)/2,mid.y-(ma.y+mb.y)/2)<1e-8);});
const up=[191,80,81,82,13,312,311,310,415],down=[95,88,178,87,14,317,402,318,324],outerUp=[185,40,39,37,0,267,269,270,409],outerDown=[146,91,181,84,17,314,405,321,375];
function expression(gap){const p=mouth();for(let i=0;i<9;i++){const x=110+i*10,w=Math.sin(Math.PI*(i+1)/10);for(const [id,y] of [[up[i],160-gap*w/2],[down[i],160+gap*w/2],[outerUp[i],155-gap*w/2],[outerDown[i],165+gap*w/2]])p[id]={x,y,z:0};}return p;}
test('sanear una boca cerrada conserva su cierre en vez de forzar una abertura',()=>{
 const p=expression(0);p.stamp=7;p.signals={jawOpen:0,mouthClose:.9};const out=M.sanitize(p);
 assert.equal(M.localOpening(out),0);assert.equal(out[13].y,out[14].y);assert.equal(out.stamp,7);assert.equal(out.signals,p.signals);
});
test('hablar y cerrar preserva el espesor del labio y sella todas las parejas interiores',()=>{
 const ref=expression(20),base=expression(0);
 for(const gap of [0,8,35,15,0]){const live=expression(gap),result=M.retarget(ref,live,base,{jawOpen:gap/70,mouthClose:gap?0:.9});
  for(let i=0;i<9;i++){assert.ok(Math.abs((result.points[up[i]].y-result.points[outerUp[i]].y)-5)<1e-7);assert.ok(Math.abs((result.points[outerDown[i]].y-result.points[down[i]].y)-5)<1e-7);}
  if(!gap){assert.equal(result.closed,true);const sealed=M.seal(result.points);for(let i=0;i<9;i++)assert.deepEqual(sealed[up[i]],sealed[down[i]]);}
  else assert.ok(M.localOpening(result.points)>M.localOpening(ref));
 }
});
test('la lengua no abre el contorno cuando la mandíbula y los labios indican cierre',()=>{
 const closed=expression(0),tongue=expression(0);tongue[14].y=260;
 const safe=M.sanitize(tongue),out=M.retarget(expression(20),safe,closed,{jawOpen:0,mouthClose:.9});
 assert.equal(out.closed,true);assert.equal(M.localOpening(out.points),0);assert.equal(out.points[17].y-out.points[14].y,5);
});
