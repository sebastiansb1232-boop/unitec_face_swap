/* Superficie curva de render. Los vértices añadidos no son detecciones nuevas. */
(function(root){
 'use strict';
 function topology(triangles,first=475){
  const map=new Map(),edges=[],indices=[];
  function mid(a,b){const key=Math.min(a,b)+':'+Math.max(a,b);if(!map.has(key)){map.set(key,first+edges.length);edges.push({a,b,id:first+edges.length,count:0});}const id=map.get(key);edges[id-first].count++;return id;}
  for(const [a,b,c] of triangles){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
  return {edges,indices,vertexCount:first+edges.length,surfaceCount:468+edges.length};
 }
 function evaluate(points,triangles,edges,width,protectedIds=new Set()){
  const p=points.map(v=>({x:v.x,y:v.y,z:(v.z||0)*width})),normals=p.map(()=>({x:0,y:0,z:0}));
  for(const [a,b,c] of triangles){const u={x:p[b].x-p[a].x,y:p[b].y-p[a].y,z:p[b].z-p[a].z},v={x:p[c].x-p[a].x,y:p[c].y-p[a].y,z:p[c].z-p[a].z},n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};for(const id of [a,b,c])for(const axis of ['x','y','z'])normals[id][axis]+=n[axis];}
  for(const n of normals){const length=Math.max(Math.hypot(n.x,n.y,n.z),1e-8);n.x/=length;n.y/=length;n.z/=length;}
  const limit=Math.max(1,Math.hypot(p[33].x-p[263].x,p[33].y-p[263].y)*.012);
  return edges.map(e=>{
   const a=p[e.a],b=p[e.b],m={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2};
   if(e.count===2&&!protectedIds.has(e.a)&&!protectedIds.has(e.b)){
    const na=normals[e.a],nb=normals[e.b],da=(m.x-a.x)*na.x+(m.y-a.y)*na.y+(m.z-a.z)*na.z,db=(m.x-b.x)*nb.x+(m.y-b.y)*nb.y+(m.z-b.z)*nb.z,delta={x:-(da*na.x+db*nb.x)*.5,y:-(da*na.y+db*nb.y)*.5,z:-(da*na.z+db*nb.z)*.5},gain=Math.min(1,limit/Math.max(Math.hypot(delta.x,delta.y,delta.z),1e-8));for(const axis of ['x','y','z'])m[axis]+=delta[axis]*gain;
   }
   return {x:m.x,y:m.y,z:m.z/width};
  });
 }
 function local(points,width,b){return points.map(p=>{const d={x:p.x-b.origin.x,y:p.y-b.origin.y,z:(p.z||0)*width-b.origin.z},dot=a=>d.x*a.x+d.y*a.y+d.z*a.z;return {x:dot(b.x)/b.scale,y:dot(b.y)/b.scale,z:dot(b.z)/b.scale};});}
 const api={topology,evaluate,local};root.FaceSurface=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
