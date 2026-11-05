/* Seguimiento y predicción breve de movimiento; no genera rostros nuevos. */
(function(root){
  'use strict';
  const A=root.FaceAppearance||(typeof require==='function'?require('./face-appearance'):null);
  const {basis,normalize,project,clamp}=A;
  class NeuralMotion{
    constructor(){this.reset();}
    reset(){this.previous=null;this.current=null;this.times=[];}
    update(points,time){
      if(!points||points.length<468||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))){this.reset();return;}
      const next={points:points.map(p=>({...p})),basis:basis(points),time};next.points.stamp=time;
      this.previous=this.current;this.current=next;this.times.push(time);this.times=this.times.slice(-16);
    }
    get fps(){return this.times.length>1?(this.times.length-1)*1000/Math.max(this.times.at(-1)-this.times[0],1):0;}
    predict(now){
      const c=this.current,p=this.previous;if(!c||now-c.time>700)return null;
      if(!p||c.time-p.time<8||c.time-p.time>700)return c.points;
      const dt=(c.time-p.time)/1000,look=clamp((now-c.time)/1000,0,.035),b=c.basis,old=p.basis;
      const speed=b.scale*3,dx=clamp((b.origin.x-old.origin.x)/dt,-speed,speed)*look,dy=clamp((b.origin.y-old.origin.y)/dt,-speed,speed)*look;
      // Solo anticipar traslación; extrapolar el ancho 2D al girar estiraba la cara.
      const out=c.points.map(q=>({...q,x:q.x+dx,y:q.y+dy}));out.stamp=c.time;return out;
    }
  }
  function faceCrop(points,width,height,limit=320){
    const ids=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
    const xs=ids.map(i=>points[i].x),ys=ids.map(i=>points[i].y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),w=maxX-minX,h=maxY-minY;
    if(w<18||h<18)return null;
    const x=Math.max(0,Math.floor(minX-w*.24)),y=Math.max(0,Math.floor(minY-h*.22));
    const cropW=Math.max(1,Math.min(width,Math.ceil(maxX+w*.24))-x),cropH=Math.max(1,Math.min(height,Math.ceil(maxY+h*.18))-y);
    const scale=Math.min(1,limit/Math.max(cropW,cropH));
    const outputW=Math.max(1,Math.round(cropW*scale)),outputH=Math.max(1,Math.round(cropH*scale));
    const sx=outputW/cropW,sy=outputH/cropH;
    return {x,y,width:cropW,height:cropH,outputW,outputH,points:points.map(p=>[(p.x-x)*sx,(p.y-y)*sy]),uv:points.map(p=>({x:(p.x-x)/cropW,y:(p.y-y)/cropH}))};
  }
  root.NeuralMotion=NeuralMotion;root.neuralFaceCrop=faceCrop;
  if(typeof module!=='undefined')module.exports={NeuralMotion,faceCrop};
})(typeof window!=='undefined'?window:globalThis);
