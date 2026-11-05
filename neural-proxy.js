'use strict';
const express=require('express');
const {aiConnection}=require('./ai-connection');
async function jsonLimited(response,limit){
  if(!response.body?.getReader)return response.json();
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error('Respuesta demasiado grande.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function neuralRouter(options={}){
  const router=express.Router();let config,error,healthCache=null,healthPending=null;
  const versions={web_version:require('./package.json').version,proxy_protocol:5,engine_version:null};
  try{config=aiConnection(options.env||process.env);}catch(e){error=e.message;}
  const request=(path,init={})=>(options.fetch||global.fetch)(config.base+path,{redirect:'error',...init,headers:{...config.headers,...init.headers}});
  async function health(){
    if(healthCache&&healthCache.until>Date.now())return healthCache.data;
    if(healthPending)return healthPending;
    healthPending=(async()=>{
      const r=await request('/healthz',{signal:AbortSignal.timeout(config.remote?6000:1800)});
      if(!r.ok)throw new Error(r.status===401?'El motor rechazó la clave privada. Comprueba que coincida con .env.ai.':'No se pudo conectar con el motor de IA.');
      const data=await jsonLimited(r,65536);
      if(config.remote&&data.auth_required!==true)throw new Error('El motor remoto debe iniciarse con start:worker para exigir autenticación.');
      const result={ready:data.ready===true,web_version:require('./package.json').version,engine_version:data.app_version||null,proxy_protocol:5,provider:data.provider||null,model:data.model||null,engine_kind:data.engine_kind||null,native_size:data.native_size||128,render_protocol:data.render_protocol||1,reference_views:data.reference_views||1,patch_output:data.patch_output===true,background_available:data.background_available===true,background_safe:data.background_safe===true,background_busy:data.background_busy===true,gesture_retargeting:data.gesture_retargeting===true,threads:data.threads||null,device:data.device??null,acceleration_warning:data.acceleration_warning||null,mode:config.remote?'remote':'local'};
      healthCache={until:Date.now()+(result.ready?10000:750),data:result};return result;
    })();
    try{return await healthPending;}finally{healthPending=null;}
  }
  router.get('/status',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(error)return res.json({...versions,ready:false,provider:null,mode:'invalid',error});
    try{res.json(await health());}
    catch(e){res.json({...versions,...(config.remote?{ready:false,provider:null,mode:'remote',error:e.message.startsWith('El motor')?e.message:'No se pudo conectar con el motor remoto. Comprueba que la PC y el túnel estén encendidos.'}:{ready:false,provider:null})});}
  });
  for(const action of ['reference','frame','background'])router.post('/'+action,async(req,res)=>{
    if(typeof req.body?.image!=='string'||!Array.isArray(req.body.points)||![468,478].includes(req.body.points.length))return res.status(400).json({error:'La imagen y la malla facial son obligatorias.'});
    res.set('Cache-Control','no-store');
    if(error)return res.status(503).json({error});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),action==='background'?180000:req.body.settings?.quality==='detail'?90000:42000);
    const abort=()=>controller.abort(),closed=()=>{if(!res.writableEnded)abort();};req.once('aborted',abort);res.once('close',closed);
    try{
      if(config.remote&&!(await health()).ready)throw new Error('Motor no preparado.');
      if(controller.signal.aborted)return;
      const upstream=await request('/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body),signal:controller.signal});
      const data=await jsonLimited(upstream,6_000_000);
      if(!upstream.ok){
        healthCache=null;
        const status=[400,409,410,422,426,429].includes(upstream.status)?upstream.status:503;
        const messages={400:'La imagen o la malla no son válidas.',409:'Falta LaMa. Ejecuta instalar-relleno-ia.bat y reinicia el motor.',410:'La referencia caducó. Vuelve a activar el retrato.',422:'Los ajustes enviados no son válidos.',426:'Actualiza Render, recarga la página y reinicia el motor de la PC con la misma entrega.',429:'El motor está ocupado; espera el siguiente fotograma.',503:'El motor no está disponible o rechazó la conexión.'};
        if(action==='background'&&status===503)messages[503]='No se pudo preparar el fondo. Usa Capturar fondo; si el motor quedó desconectado, reinícialo.';
        if(action==='reference'&&data.detail==='Las referencias no son compatibles. Usa fotos nítidas de la misma persona y perfiles de tres cuartos.')messages[400]=data.detail;
        if(status===429){const retry=Math.min(8000,Math.max(500,(Number(upstream.headers.get('retry-after'))||1)*1000));res.set('Retry-After',String(Math.ceil(retry/1000)));return res.status(status).json({error:messages[status],retry_ms:retry});}
        return res.status(status).json({error:messages[status]});
      }
      res.json(data);
    }catch{
      healthCache=null;if(!res.destroyed&&!res.writableEnded)res.status(503).json({error:config.remote?'El motor remoto no está disponible. Comprueba la PC, el túnel y las variables privadas de Render.':'El motor neuronal local no está disponible. Inicia el proyecto con npm run start:ai.'});
    }finally{clearTimeout(timer);req.off('aborted',abort);res.off('close',closed);}
  });
  return router;
}
module.exports={neuralRouter};
