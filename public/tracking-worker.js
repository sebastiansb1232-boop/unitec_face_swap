/* Seguimiento temporal de MediaPipe Tasks; alternativa para navegadores antiguos. */
'use strict';
let task=null,mesh=null,landmarks=null,refine=false,queue=Promise.resolve(),backend=null,role='live',lastTimestamp=0;
const local=file=>new URL(file,self.location.href).href;
async function legacy(){
  importScripts(local('vendor/face-mesh/face_mesh.js'));
  const locateFile=file=>local('vendor/face-mesh/'+file),assets={locateFile,onRuntimeInitialized(){const create=assets.GL.createContext.bind(assets.GL);assets.GL.createContext=(canvas,options)=>create(canvas,{...options,majorVersion:2});}};
  self.createMediapipeSolutionsPackedAssets=assets;mesh=new FaceMesh({locateFile});
  mesh.setOptions({maxNumFaces:1,refineLandmarks:false,minDetectionConfidence:.55,minTrackingConfidence:.6});
  mesh.onResults(result=>{landmarks=result.multiFaceLandmarks?.[0]||null;result.image?.close?.();});await mesh.initialize();
  const solution=mesh.g,context=solution?.h?.GL?.currentContext?.GLctx;if(!context)throw new Error('WebGL no está disponible en el Worker.');solution.D=context;backend='legacy';
}
async function initialize(data){
  role=data.role==='image'?'image':'live';
  try{
    const {FaceLandmarker,FilesetResolver}=await import(local('vendor/tasks-vision/vision_bundle.mjs'));
    const vision=await FilesetResolver.forVisionTasks(local('vendor/tasks-vision/wasm'));
    // La detección ocasional de la salida no compite por la GPU de la cámara.
    let software=false;
    try{const probe=new OffscreenCanvas(1,1).getContext('webgl2'),debug=probe?.getExtension('WEBGL_debug_renderer_info');software=/swiftshader|llvmpipe|software|basic render/i.test(debug?probe.getParameter(debug.UNMASKED_RENDERER_WEBGL):'');probe?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
    for(const delegate of (role==='image'||data.forceCPU||software?['CPU']:['GPU','CPU'])){
      try{
        task=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:local('assets/models/face_landmarker.task'),delegate},runningMode:role==='image'?'IMAGE':'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55,outputFaceBlendshapes:role==='live',outputFacialTransformationMatrixes:false});
        backend='tasks-'+delegate.toLowerCase();break;
      }catch{task?.close();task=null;}
    }
    if(!task)await legacy();
  }catch{await legacy();}
  return {backend};
}
async function handle(data){
  if(data.type==='init')return initialize(data);
  if(data.type!=='frame')throw new Error('Acción de seguimiento desconocida.');
  if(!task&&!mesh)throw new Error('Seguimiento no preparado.');
  const started=performance.now();
  try{
    if(task){
      const timestamp=Math.max(lastTimestamp+.001,Number.isFinite(data.timestamp)?data.timestamp:performance.now());lastTimestamp=timestamp;
      const result=role==='image'?task.detect(data.image):task.detectForVideo(data.image,timestamp);
      return {signals:result.faceBlendshapes?.[0]?.categories?Object.fromEntries(result.faceBlendshapes[0].categories.map(c=>[c.categoryName,c.score])):null,landmarks:result.faceLandmarks?.[0]||null,faces:result.faceLandmarks?.length||0,backend,ms:performance.now()-started};
    }
    const nextRefine=data.refine!==false;if(nextRefine!==refine){refine=nextRefine;mesh.setOptions({refineLandmarks:refine});await mesh.reset();}
    if(data.reset)await mesh.reset();landmarks=null;await mesh.send({image:data.image});return {landmarks,backend,ms:performance.now()-started};
  }finally{data.image.close();}
}
self.onmessage=event=>{
  const data=event.data;queue=queue.then(async()=>{try{self.postMessage({id:data.id,...await handle(data)});}catch(error){self.postMessage({id:data.id,error:error.message||'No se pudo iniciar el seguimiento.'});}});
};
