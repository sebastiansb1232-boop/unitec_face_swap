/* Face Mesh fuera del hilo de la interfaz. Solo devuelve geometría, sin imágenes. */
'use strict';
importScripts('vendor/face-mesh/face_mesh.js');
let mesh=null,landmarks=null,refine=true,queue=Promise.resolve();
async function handle(data){
  if(data.type==='init'){
    const locateFile=file=>new URL('vendor/face-mesh/'+file,self.location.href).href;
    // El cargador de assets de esta versión de MediaPipe consulta esta configuración global en Workers.
    const assets={locateFile,onRuntimeInitialized(){
      // Esta distribución también omite majorVersion en la ruta Worker.
      const create=assets.GL.createContext.bind(assets.GL);
      assets.GL.createContext=(canvas,options)=>create(canvas,{...options,majorVersion:2});
    }};
    self.createMediapipeSolutionsPackedAssets=assets;
    mesh=new FaceMesh({locateFile});
    mesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.65,minTrackingConfidence:.7});
    mesh.onResults(result=>{landmarks=result.multiFaceLandmarks?.[0]||null;result.image?.close?.();});
    await mesh.initialize();
    // Adaptador para la versión local 0.4.1633559619: su ruta Worker crea el contexto
    // pero no lo asigna al lector de texturas que utiliza send(). No se modifica el vendor.
    const solution=mesh.g,context=solution?.h?.GL?.currentContext?.GLctx;
    if(!context)throw new Error('WebGL no está disponible en el Worker.');
    solution.D=context;
    return {};
  }
  if(data.type==='frame'){
    if(!mesh)throw new Error('Seguimiento no preparado.');
    const nextRefine=data.refine!==false;
    if(nextRefine!==refine){refine=nextRefine;mesh.setOptions({refineLandmarks:refine});await mesh.reset();}
    landmarks=null;
    try{await mesh.send({image:data.image});return {landmarks};}
    finally{data.image.close();}
  }
  throw new Error('Acción de seguimiento desconocida.');
}
self.onmessage=event=>{
  const data=event.data;
  queue=queue.then(async()=>{
    try{self.postMessage({id:data.id,...await handle(data)});}
    catch(error){self.postMessage({id:data.id,error:error.message||'No se pudo iniciar el seguimiento.'});}
  });
};
