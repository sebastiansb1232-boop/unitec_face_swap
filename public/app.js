/* Anotherface: cámara local, filtros por malla y guardado explícito de fotos. */
'use strict';
const $ = s => document.querySelector(s);
const video = $('#video'), overlay = $('#overlay'), ctx = overlay.getContext('2d');
const frame = document.createElement('canvas'), fc = frame.getContext('2d');
const SESSION_ID = crypto.randomUUID();
let model = null, modelPromise = null, modelFailed = false;
let stream = null, facing = 'user', generation = 0, busyCamera = false, sending = false;
let currentFilter = 'retrato', points = null, rawPoints = null, lastFrame = 0, pendingPhoto = null, uploading = false;
let comparing = false, analyzingReference=false, inference=null, handleResultsCallback=null, backgroundBusy=false,capturePreparing=false,engineBusy=false,backgroundRequest=null;
let portraitEngine='neural',cameraDevice='',resolutionLimit=0;
let neuralView=null,trackingStarted=0,lastTrackStarted=0,lastTrackVideoTime=-1,lastMetricUpdate=0,lastNeuralDraw=0,trackerMs=0,neuralMessage='',neuralSample=null,lastSubmittedSample=null;
const neuralMotion=new NeuralMotion(),neuralTracker=new NeuralTracker(),outputTracker=new NeuralTracker('image'),liveStabilizer=new FacePose.Stabilizer(),referenceViews=new ReferenceViews(),viewTimes=[],trackTimes=[];
let outputTrackingBusy=false,faceLostAt=0,faceLossReset=false;
const neuralInput=document.createElement('canvas');
let neuralFrame=document.createElement('canvas'),neuralCapture=document.createElement('canvas');
let neuralCaptureReady=false;
const referenceFace = new ReferenceFace(text => { const label=$('#reference-status'); if(label.textContent!==text) label.textContent=text; });
const headTransfer=new HeadTransfer(text=>{const label=$('#hair-status');if(label.textContent!==text)label.textContent=text;});
referenceFace.head=headTransfer;
const neuralPortrait=new NeuralPortrait(text=>{neuralMessage=text;updateNeuralStatus();},()=>setTimeout(submitNeural,0),async(image,crop,sourcePoints)=>{
  if(outputTrackingBusy||outputTracker.disabled)return null;
  outputTrackingBusy=true;
  try{
    // La inferencia y el registro siempre usan la cámara sin espejo.
    const result=await outputTracker.track(image,{refine:false});
    return result?.landmarks?.map(p=>({x:p.x,y:p.y,z:p.z}));
  }finally{outputTrackingBusy=false;}
});
neuralPortrait.photoOnly=true;headTransfer.suspended=true;neuralMessage='Avatar · Fotografías animadas con seguimiento en este dispositivo.';
const dog = new Image(); dog.src = 'assets/dog_filter.png';
const oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
let triangles = [], sendGeneration = 0;
function setStatus(text) { $('#studio-status').textContent = text; }
function clearPortraitBackground(){neuralView?.clearBackground();$('#portrait-background-status').textContent='Sin fondo preparado. Se conserva el contorno original para evitar recortes.';}
function clearTracking() { referenceFace.lost();liveStabilizer.reset();neuralPortrait.reset(true);neuralMotion.reset();neuralView?.reset();neuralSample=null;lastSubmittedSample=null;neuralCaptureReady=false;lastTrackVideoTime=-1;viewTimes.length=0;trackTimes.length=0; points = null; rawPoints = null; lastFrame = 0; ctx.clearRect(0,0,overlay.width,overlay.height);updateNeuralStatus(); }
function syncPresentation(){
  $('.video-wrap').classList.toggle('is-live',!!stream);
  $('.video-wrap').classList.toggle('native-camera',!!stream&&(currentFilter==='ninguno'||portraitEngine==='neural'&&currentFilter==='retrato'));
  if(!(stream&&portraitEngine==='neural'&&currentFilter==='retrato'))neuralView?.hide();
  if($('#camera-live-label'))$('#camera-live-label').textContent=stream?'Cámara activa':'Cámara apagada';
}
function cameraControls(active) {
  $('#start-camera').classList.toggle('hidden', active);
  $('#capture-btn').classList.toggle('hidden', !active);
  $('#capture-btn').disabled = !active || busyCamera || uploading || capturePreparing || backgroundBusy || (currentFilter==='retrato' && comparing);
  $('#reference-compare').disabled = !active || busyCamera;
  $('#switch-camera-btn').disabled = !active || busyCamera || analyzingReference || backgroundBusy;
  $('#stop-btn').disabled = !active || busyCamera;
  $('#start-camera').disabled = busyCamera;
  $('#camera-empty').classList.toggle('hidden', active);
  $('#reference-file').disabled=analyzingReference||backgroundBusy;
  for(const side of ['left','right']){$('#reference-'+side).disabled=analyzingReference||backgroundBusy;$('#reference-'+side+'-remove').disabled=analyzingReference||backgroundBusy;}
  $('#reference-default').disabled=analyzingReference||backgroundBusy||!referenceFace.ready;
  for(const id of ['portrait-background-capture','portrait-background-ai'])$('#'+id).disabled=!active||busyCamera||backgroundBusy||analyzingReference;
  $('#portrait-background-clear').disabled=backgroundBusy||!neuralView?.background;
  $('#reference-background').disabled=!active||busyCamera||backgroundBusy||analyzingReference;
  $('#camera-device').disabled=busyCamera||analyzingReference||backgroundBusy;
  $('#reference-resolution').disabled=busyCamera||backgroundBusy;
  $('#reference-engine').disabled=engineBusy||backgroundBusy;
  syncPresentation();
}
async function getModel() {
  if (model) return model;
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    if (!window.FaceMesh) throw new Error('No se pudo cargar el modelo. Revisa tu conexión y recarga la página.');
    const mesh = new FaceMesh({ locateFile: f => 'vendor/face-mesh/' + f });
    mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .65, minTrackingConfidence: .7 });
    const handleResults = results => {
      if (!stream || busyCamera || sendGeneration !== generation||currentFilter==='ninguno') return;
      trackTimes.push(performance.now());if(trackTimes.length>16)trackTimes.shift();
      const raw = results.multiFaceLandmarks?.[0];
      rawPoints = raw ? raw.map(p => ({ x: facing === 'user' ? 1-p.x : p.x, y:p.y, z:p.z })) : null;
      // Coordenadas de cámara y malla estabilizada tienen funciones distintas.
      points = rawPoints?.map(p => ({ x:p.x*overlay.width, y:p.y*overlay.height, z:p.z })) || null;
      const cameraPoints=points,safePoints=points&&MouthMotion.sanitize(points);
      if(safePoints)points=liveStabilizer.filter(safePoints,overlay.width,referenceFace.stability,performance.now());
      $('#face-status-overlay').textContent = points ? 'Rostro detectado · Seguimiento activo' : 'Mira a la cámara y busca buena luz';
      if(!points){referenceFace.lost();neuralSample=null;if(!faceLostAt)faceLostAt=performance.now();if(!faceLossReset&&performance.now()-faceLostAt>650){faceLossReset=true;neuralPortrait.reset(true);neuralPortrait.resetDriver();}}else{faceLostAt=0;faceLossReset=false;}
      if(portraitEngine==='neural'&&currentFilter==='retrato'){
        if(!points){neuralMotion.reset();neuralView?.reset();return;}
        const now=performance.now(),stable=points;
        trackerMs=now-trackingStarted;neuralMotion.update(stable,trackingStarted||now,overlay.width,cameraPoints);
        if(!comparing&&!analyzingReference&&referenceFace.ready){
          if(neuralCaptureReady&&!neuralPortrait.photoOnly){
            [neuralFrame,neuralCapture]=[neuralCapture,neuralFrame];
            neuralSample={frame:neuralFrame,points:safePoints,raw:rawPoints,reference:referenceViews.reference||referenceFace.choose(points),time:trackingStarted||now,generation};submitNeural();
          }else neuralSample=null;
        }
      }else drawFrame(results.image);
    };
    handleResultsCallback=handleResults;
    await mesh.initialize();
    const edges = window.FACEMESH_TESSELATION || [];
    // Cada triángulo de MediaPipe contiene tres aristas consecutivas.
    for (let i=0; i<edges.length; i+=3) {
      const ids = [...new Set(edges.slice(i,i+3).flat())];
      if (ids.length===3) triangles.push(ids);
    }
    try { await referenceFace.prepare(mesh, triangles);await ReferenceMatte.prepare(referenceFace.choose(),headTransfer.client);referenceViews.setFront(referenceFace.choose());updateReferenceViews(); }
    catch (error) { $('#reference-status').textContent = error.message; }
    if(referenceFace.ready&&referenceFace.mode==='auto'&&$('#reference-preview'))$('#reference-preview').src=referenceFace.choose().image.src;
    mesh.onResults(handleResults);
    try{neuralView=new NeuralView(triangles);$('.video-wrap').append(neuralView.canvas);}catch(error){$('#neural-status').textContent=error.message;}
    model = mesh;
    cameraControls(!!stream);
    return mesh;
  })();
  try { return await modelPromise; } catch (err) { modelPromise = null; throw err; }
}
function dimensions() {
  const limit=Math.min(resolutionLimit||960,matchMedia('(max-width:760px)').matches?720:960);
  const scale = Math.min(1, limit/video.videoWidth);
  overlay.width = frame.width = Math.round(video.videoWidth*scale);
  overlay.height = frame.height = Math.round(video.videoHeight*scale);
  $('.video-wrap').style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
  headTransfer.clearBackground();clearPortraitBackground();
}
video.addEventListener('resize',()=>{
  if(stream && video.videoWidth && !busyCamera){dimensions();clearTracking();}
});
function cameraError(error) {
  if (error.name === 'NotAllowedError') return 'La cámara está bloqueada. Permite su acceso en los ajustes del navegador y vuelve a intentarlo.';
  if (error.name === 'NotFoundError') return 'No se encontró una cámara en este dispositivo.';
  if (error.name === 'NotReadableError') return 'La cámara está ocupada. Cierra otras aplicaciones que la estén usando.';
  return error.message || 'No se pudo encender la cámara.';
}
async function openCamera(mode) {
  if (busyCamera) return;
  resetComparison(); referenceFace.reset();
  busyCamera = true; generation++; cameraControls(!!stream); clearTracking();
  const previous = stream;
  stream = null; previous?.getTracks().forEach(t => t.stop());
  setStatus('Abriendo cámara…');
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Abre esta página con HTTPS para utilizar la cámara.');
    const next = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30,max:60}, facingMode:{ideal:mode},...(cameraDevice?{deviceId:{exact:cameraDevice}}:{}) }, audio:false
    });
    stream = next; facing = mode; video.srcObject = next;
    await video.play();
    if (!video.videoWidth) await new Promise(resolve => video.addEventListener('loadedmetadata',resolve,{once:true}));
    dimensions();
    video.style.transform = mode==='user' ? 'scaleX(-1)' : 'none';
    stream.getVideoTracks()[0].addEventListener('ended', stopCamera, {once:true});
    busyCamera = false; cameraControls(true);
    refreshCameras();
    const current = generation;
    setStatus('Cargando filtros… Puedes tomar una foto sin filtro.');
    tick(current);
    liveView(current);
    try {
      if(currentFilter!=='ninguno')await getModel(); modelFailed = false;
      if (current === generation) setStatus('Elige un filtro y toma tu foto.');
    } catch (error) {
      modelFailed = true;
      if (current === generation) setStatus(error.message + ' Original sigue disponible.');
    }
  } catch (error) {
    stream?.getTracks().forEach(t=>t.stop()); stream=null; video.srcObject=null;
    busyCamera=false; cameraControls(false); setStatus(cameraError(error));
  }
}
function stopCamera() {
  resetComparison();
  backgroundRequest?.abort();
  headTransfer.clearBackground();clearPortraitBackground();
  neuralPortrait.reset();
  generation++; stream?.getTracks().forEach(t=>t.stop()); stream=null;
  video.srcObject=null; clearTracking(); cameraControls(false);
  $('#face-status-overlay').textContent='Cámara apagada'; setStatus('Cámara apagada.');
  $('#reference-status').textContent='Enciende la cámara para activar el retrato.';
}
$('#start-camera').addEventListener('click',()=>openCamera(facing));
$('#switch-camera-btn').addEventListener('click',()=>{cameraDevice='';openCamera(facing==='user'?'environment':'user');});
$('#stop-btn').addEventListener('click',stopCamera);
window.addEventListener('pagehide',stopCamera);
document.addEventListener('visibilitychange',()=>{ if(document.hidden && stream) stopCamera(); });
document.querySelectorAll('.filter-chip').forEach(button=>button.addEventListener('click',()=>{
  currentFilter=button.dataset.filter;
  viewTimes.length=0;trackTimes.length=0;lastMetricUpdate=0;
  neuralPortrait.reset(true);
  neuralMotion.reset();neuralView?.reset();
  resetComparison(); cameraControls(!!stream);
  $('#reference-controls').classList.toggle('hidden',currentFilter!=='retrato');
  referenceFace.rendered=false;
  syncPresentation();
  if(currentFilter==='ninguno'){points=null;rawPoints=null;$('#face-status-overlay').textContent='Original · Cámara en vivo';}
  if(currentFilter!=='ninguno' && !model) getModel().catch(error=>{modelFailed=true;$('#reference-status').textContent=error.message;});
  document.querySelectorAll('.filter-chip').forEach(b=>{
    b.classList.toggle('active',b===button); b.setAttribute('aria-pressed',String(b===button));
  });
  if (stream) {
    lastFrame=0; // Esperar un resultado nuevo; no mezclar video y puntos de otro instante.
    if(modelFailed && currentFilter!=='ninguno') setStatus('No se pudieron cargar los filtros. Recarga la página o usa Original.');
  }
}));
async function tick(current) {
  if(current!==generation || !stream) return;
  if (video.readyState>=2 && !sending) {
    if(currentFilter!=='ninguno'&&model && !analyzingReference) {
      const liveNeural=portraitEngine==='neural'&&currentFilter==='retrato';
      if(liveNeural&&video.currentTime===lastTrackVideoTime){if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(()=>tick(current));else setTimeout(()=>tick(current),8);return;}
      const trackInterval=neuralTracker.disabled?Math.max(33,Math.min(120,trackerMs)):16;
      if(liveNeural&&performance.now()-lastTrackStarted<trackInterval){setTimeout(()=>tick(current),8);return;}
      sending=true; sendGeneration=current;
      try {
        let source=video;
        if(liveNeural){
          const w=Math.min($('#reference-profile').value==='fluid'?256:384,video.videoWidth),h=Math.round(video.videoHeight*w/video.videoWidth);
          if(neuralInput.width!==w||neuralInput.height!==h){neuralInput.width=w;neuralInput.height=h;}
          neuralCaptureReady=!neuralPortrait.photoOnly&&neuralPortrait.enabled&&!neuralPortrait.busy&&performance.now()>=neuralPortrait.next&&!comparing&&!backgroundBusy;
          if(!neuralCaptureReady)neuralInput.getContext('2d').drawImage(video,0,0,w,h);
          else{
            if(neuralCapture.width!==overlay.width||neuralCapture.height!==overlay.height){neuralCapture.width=overlay.width;neuralCapture.height=overlay.height;}
            neuralCapture.getContext('2d').drawImage(video,0,0,neuralCapture.width,neuralCapture.height);
            neuralInput.getContext('2d').drawImage(neuralCapture,0,0,w,h);
          }
          source=neuralInput;trackingStarted=lastTrackStarted=performance.now();
          lastTrackVideoTime=video.currentTime;
        }
        inference=(async()=>{
          if(liveNeural){
            const result=await neuralTracker.track(source,{refine:false,timestamp:trackingStarted});
            if(result){handleResultsCallback({image:source,multiFaceLandmarks:result.landmarks?[result.landmarks]:[]});return;}
          }
          model.setOptions({refineLandmarks:!liveNeural});await model.send({image:source});
        })();await inference;
      }
      catch { clearTracking(); drawFrame(video); $('#face-status-overlay').textContent='Seguimiento no disponible'; }
      finally { sending=false;inference=null; }
    } else if(currentFilter!=='ninguno'&&!analyzingReference)drawFrame(video);
  }
  if(current===generation && stream) {
    if(portraitEngine==='neural'&&currentFilter==='retrato'&&model&&!analyzingReference){setTimeout(()=>tick(current),0);return;}
    // Inferir el siguiente fotograma disponible, sin añadir 33 ms al tiempo del modelo.
    if(video.requestVideoFrameCallback) video.requestVideoFrameCallback(()=>tick(current));
    else setTimeout(()=>tick(current),16);
  }
}
function mirrorFrame(canvas,source){
  const W=overlay.width,H=overlay.height;if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const c=canvas.getContext('2d');c.save();c.clearRect(0,0,W,H);if(facing==='user'){c.translate(W,0);c.scale(-1,1);}c.drawImage(source,0,0,W,H);c.restore();
}
function neuralSettings(){return {strength:referenceFace.opacity,identity_strength:Number($('#reference-identity').value)/100,mouth:referenceFace.mouth,eyes:referenceFace.eyes,forehead:referenceFace.forehead,chin:referenceFace.chin,softness:referenceFace.softness,color:0,detail:Math.max(0,Math.min(.35,(referenceFace.detail-.6)*.55)),quality:$('#reference-quality').value};}
function submitNeural(){
  const sample=neuralSample;
  if(!stream||comparing||analyzingReference||portraitEngine!=='neural'||currentFilter!=='retrato'||!sample||sample===lastSubmittedSample||sample.generation!==generation||performance.now()-sample.time>450)return;
  if(neuralPortrait.submit(sample.frame,sample.points,sample.reference,neuralSettings(),sample.raw,{mirror:facing==='user',capturedAt:sample.time}))lastSubmittedSample=sample;
}
function updateNeuralStatus(){
  const fps=viewTimes.length>1?(viewTimes.length-1)*1000/Math.max(viewTimes.at(-1)-viewTimes[0],1):0;
  const tracked=trackTimes.length>1?(trackTimes.length-1)*1000/Math.max(trackTimes.at(-1)-trackTimes[0],1):0,activeNeural=portraitEngine==='neural'&&currentFilter==='retrato';
  $('#neural-status').textContent=neuralMessage||'Modo ligero · Procesamiento en este dispositivo';
  const value=(id,n)=>{const e=$(id);if(e)e.textContent=n>0?n.toFixed(1):'—';};
  value('#fps-view',stream?fps:0);value('#fps-ai',stream&&activeNeural?neuralPortrait.fps:0);value('#fps-tracking',stream?tracked:0);
  if($('#engine-label'))$('#engine-label').textContent=currentFilter==='ninguno'?'Original':activeNeural&&neuralPortrait.photoOnly?'Avatar · Fotos 3D':activeNeural?({CUDAExecutionProvider:'GPU · CUDA',DmlExecutionProvider:'GPU · DirectML',CPUExecutionProvider:'CPU · ONNX'}[neuralPortrait.last?.provider||neuralPortrait.engineInfo?.provider]||'Motor neuronal'):'Modo ligero';
}
function recordView(now){
  viewTimes.push(now);while(viewTimes.length>60||viewTimes.length>2&&now-viewTimes[0]>1200)viewTimes.shift();
  if(now-lastMetricUpdate>500){lastMetricUpdate=now;updateNeuralStatus();}lastFrame=now;
}
function liveView(current){
  if(current!==generation||!stream)return;
  if(video.readyState>=2&&!busyCamera&&(currentFilter==='ninguno'||portraitEngine==='neural'&&currentFilter==='retrato')){
    if(currentFilter==='retrato'&&!comparing&&!analyzingReference){
      const now=performance.now();drawNeuralResult();lastNeuralDraw=now;
    }else{referenceFace.rendered=false;neuralView?.hide();}
    recordView(performance.now());
  }
  if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(()=>liveView(current));else setTimeout(()=>liveView(current),33);
}
function drawFrame(source) {
  if(!stream || busyCamera || !source) return;
  const W=overlay.width,H=overlay.height;
  fc.save(); fc.clearRect(0,0,W,H);
  if(facing==='user'){fc.translate(W,0);fc.scale(-1,1);}
  fc.drawImage(source,0,0,W,H);fc.restore();
  ctx.clearRect(0,0,W,H);ctx.drawImage(frame,0,0);
  if(points) {
    if(currentFilter==='retrato') {
      if(comparing) {referenceFace.rendered=false;$('#reference-status').textContent='Vista original · Pulsa Volver al retrato para aplicar el filtro.';}
      else if(portraitEngine==='neural'){
        drawNeuralResult();
      }
      else referenceFace.draw(ctx,frame,points);
    }
    if(currentFilter==='silueta') drawMesh();
    if(currentFilter==='perro') drawDog();
    if(currentFilter==='deform' || currentFilter==='remolino') drawWarp();
  }
  if(!(currentFilter==='ninguno'||portraitEngine==='neural'&&currentFilter==='retrato'))recordView(performance.now());
}
function drawNeuralResult(capture=false){
  const current=neuralMotion.predict(performance.now());
  const result=neuralPortrait.select(current,overlay.width,performance.now(),referenceViews.reference||referenceFace.choose(current),overlay.height);
  if(!result||!current||result.width!==overlay.width||result.height!==overlay.height||!neuralView){referenceFace.rendered=false;neuralView?.hide();return;}
  const source=capture?frame:{width:overlay.width,height:overlay.height,video,mirror:facing==='user'};
  referenceFace.rendered=neuralView.draw(capture?ctx:null,source,current,result,{identityLock:true,shape:referenceFace.shape,opacity:referenceFace.opacity,eyes:referenceFace.eyes,mouth:referenceFace.mouth,forehead:referenceFace.forehead,chin:referenceFace.chin,softness:referenceFace.softness,colorMode:$('#reference-color-mode').value,colorMix:Number($('#reference-color-mix').value)/100,liveMouth:$('#reference-live-mouth').checked,},performance.now());
  $('#active-filter-name').textContent=result.referencePhoto?(neuralPortrait.photoOnly?'Avatar fotográfico':'Apoyo fotográfico'):'IA neuronal';
  const status=referenceFace.rendered?(result.referencePhoto?(neuralPortrait.photoOnly?'Avatar fotográfico activo · ':'Referencia en vivo mientras se valida la IA · ')+({front:'Frontal',left:'Perfil 1',right:'Perfil 2'}[result.activeView]||'Referencia')+' · Gestos en vivo':result.registered?'Retrato neuronal activo · Ajuste refinado y gestos en vivo':'Retrato neuronal activo · Gestos en vivo'):'Ajustando el retrato a tu posición…';
  if($('#reference-status').textContent!==status)$('#reference-status').textContent=status;
}
function drawMesh() {
  ctx.strokeStyle='rgba(151,231,216,.35)';ctx.lineWidth=.65;
  ctx.beginPath();
  (window.FACEMESH_TESSELATION || []).forEach(([a,b])=>{
    if(points[a] && points[b]){ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);}
  });ctx.stroke();
  ctx.strokeStyle='#b4e9df';ctx.lineWidth=1.5;ctx.beginPath();
  (window.FACEMESH_CONTOURS || []).forEach(([a,b])=>{
    ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);
  });ctx.stroke();
  ctx.fillStyle='#e4fff7';ctx.beginPath();
  points.forEach(p=>{ctx.moveTo(p.x+1.1,p.y);ctx.arc(p.x,p.y,1.1,0,Math.PI*2);});ctx.fill();
}
function drawDog() {
  if(!dog.complete || !dog.naturalWidth) return;
  const p=points, eyes=[p[33],p[263]].sort((a,b)=>a.x-b.x);
  const angle=Math.atan2(eyes[1].y-eyes[0].y,eyes[1].x-eyes[0].x);
  const width=distance(p[234],p[454]), height=distance(p[10],p[152]);
  const sides=[p[54],p[284]].sort((a,b)=>a.x-b.x);
  // Reutiliza el PNG original; cada pieza se ancla independientemente.
  const piece=(crop,anchor,w,h,dx,dy,rotation)=>{
    ctx.save();ctx.translate(anchor.x,anchor.y);ctx.rotate(rotation);
    ctx.drawImage(dog,crop[0]*dog.width/680,crop[1]*dog.height/360,crop[2]*dog.width/680,crop[3]*dog.height/360,dx,dy,w,h);ctx.restore();
  };
  const ew=width*.48,eh=height*.40;
  piece([150,17,155,129],sides[0],ew,eh,-ew*.72,-eh*.78,angle-.10);
  piece([367,17,155,129],sides[1],ew,eh,-ew*.28,-eh*.78,angle+.10);
  const nw=Math.max(distance(p[98],p[327])*1.7,width*.28),nh=nw*82/143;
  piece([263,246,143,82],p[1],nw,nh,-nw*.5,-nh*.45,angle);
}
function drawTriangle(src,dst) {
  const [a,b,c]=src,[u,v,w]=dst;
  const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
  if(Math.abs(det)<.05) return;
  const A=((v.x-u.x)*(c.y-a.y)-(w.x-u.x)*(b.y-a.y))/det;
  const C=((w.x-u.x)*(b.x-a.x)-(v.x-u.x)*(c.x-a.x))/det;
  const B=((v.y-u.y)*(c.y-a.y)-(w.y-u.y)*(b.y-a.y))/det;
  const D=((w.y-u.y)*(b.x-a.x)-(v.y-u.y)*(c.x-a.x))/det;
  ctx.save();ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(v.x,v.y);ctx.lineTo(w.x,w.y);ctx.closePath();ctx.clip();
  ctx.transform(A,B,C,D,u.x-A*a.x-C*a.y,u.y-B*a.x-D*a.y);
  ctx.drawImage(frame,0,0);ctx.restore();
}
function drawWarp() {
  const nose=points[1],radius=distance(points[234],points[454])*.48;
  const boundary=new Set(oval);
  const warped=points.map((p,i)=>{
    if(boundary.has(i))return p;
    const dx=p.x-nose.x,dy=p.y-nose.y,r=Math.hypot(dx,dy)/Math.max(radius,1);
    const weight=Math.max(0,1-r)**2;
    if(currentFilter==='deform')return {x:nose.x+dx*(1+.5*weight),y:nose.y+dy*(1-.25*weight)};
    const angle=weight*.8,c=Math.cos(angle),s=Math.sin(angle);
    return {x:nose.x+dx*c-dy*s,y:nose.y+dx*s+dy*c};
  });
  ctx.save();ctx.beginPath();oval.forEach((i,j)=>{const p=points[i];j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.clip();
  triangles.forEach(ids=>drawTriangle(ids.map(i=>points[i]),ids.map(i=>warped[i])));
  ctx.restore();
}
$('#capture-btn').addEventListener('click',async()=>{
  if(!stream || busyCamera || uploading || capturePreparing) return setStatus('Espera a que la cámara esté lista.');
  if(currentFilter==='retrato'&&portraitEngine==='neural'){
    const started=performance.now(),cameraGeneration=generation,identityEpoch=neuralPortrait.epoch;
    capturePreparing=true;cameraControls(true);
    try{
      // Un clic entre detecciones espera una muestra fresca; nunca guarda la
      // cámara sin efecto ni espera a que termine otra generación neuronal.
      for(;;){
        if(!stream||generation!==cameraGeneration||neuralPortrait.epoch!==identityEpoch||currentFilter!=='retrato'||portraitEngine!=='neural'||comparing||analyzingReference)return setStatus('La captura se canceló al cambiar la cámara o el retrato.');
        const now=performance.now();
        if(video.readyState>=2&&model&&points&&neuralMotion.predict(now)){drawNeuralResult();if(referenceFace.rendered)break;}
        if(now-started>=1500)return setStatus('Espera a que se recupere el seguimiento del rostro.');
        await new Promise(resolve=>setTimeout(resolve,16));
      }
    }finally{capturePreparing=false;cameraControls(!!stream);}
  }
  if(!lastFrame || performance.now()-lastFrame>1500) return setStatus('Espera a que la cámara esté lista.');
  if(currentFilter!=='ninguno' && (!model || !points)) return setStatus('Para este filtro, coloca tu rostro de frente y espera a que se detecte.');
  if(currentFilter==='perro' && (!dog.complete || !dog.naturalWidth)) return setStatus('El filtro de perrito todavía no se ha cargado.');
  if(currentFilter==='retrato' && !referenceFace.rendered) return setStatus('Espera a que el retrato esté activo y termine la calibración.');
  if(currentFilter==='ninguno'){mirrorFrame(frame,video);ctx.clearRect(0,0,overlay.width,overlay.height);ctx.drawImage(frame,0,0);}
  if(currentFilter==='retrato'&&portraitEngine==='neural'){
    mirrorFrame(frame,video);ctx.clearRect(0,0,overlay.width,overlay.height);ctx.drawImage(frame,0,0);drawNeuralResult(true);
    if(!referenceFace.rendered)return setStatus('Espera a que se recupere el seguimiento del rostro.');
  }
  // El mismo lienzo mostrado: foto y malla pertenecen al mismo resultado del modelo.
  const image=overlay.toDataURL('image/jpeg',.88);
  const capturePoints=currentFilter==='retrato'&&portraitEngine==='neural'?neuralView?.latestPoints?.map((p,i)=>({x:p.x/overlay.width,y:p.y/overlay.height,z:rawPoints?.[i]?.z||0})):rawPoints;
  pendingPhoto={id:crypto.randomUUID(),session_id:SESSION_ID,filtro:currentFilter,image,
    landmarks:$('#save-landmarks').checked && capturePoints ? capturePoints.map(p=>({...p})) : null};
  $('#capture-preview').src=image;$('#download-link').href=image;
  $('#download-link').download='another-face-'+Date.now()+'.jpg';
  $('#capture-result').classList.remove('hidden');
  await uploadPhoto();
});
async function uploadPhoto() {
  if(!pendingPhoto || uploading)return;
  uploading=true;cameraControls(!!stream);$('#retry-upload').classList.add('hidden');
  $('#capture-upload-status').textContent='Guardando foto…';
  try {
    const res=await fetch('/api/captures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingPhoto),signal:AbortSignal.timeout(25000)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error || 'No se pudo guardar.');
    $('#capture-upload-status').textContent='Foto guardada. Ya está disponible para el administrador.';
    pendingPhoto=null;
  } catch(error) {
    $('#capture-upload-status').textContent='No se confirmó el guardado. Puedes descargarla o reintentar. '+(error.name==='TimeoutError'?'El servidor tardó demasiado.':error.message);
    $('#retry-upload').classList.remove('hidden');
  } finally {uploading=false;cameraControls(!!stream);}
}
$('#retry-upload').addEventListener('click',uploadPhoto);

$('#reference-shape').addEventListener('input',event=>{referenceFace.shape=Number(event.target.value)/100;$('#reference-shape-value').textContent=event.target.value+'%';referenceFace.rendered=false;});
$('#reference-opacity').addEventListener('input',event=>{referenceFace.opacity=Number(event.target.value)/100;$('#reference-opacity-value').textContent=event.target.value+'%';referenceFace.rendered=false;});
function updateColorControls(){
  const mode=$('#reference-color-mode').value,mix=Number($('#reference-color-mix').value)/100;
  $('#reference-color-mix-row').hidden=mode!=='mixed';$('#reference-color-mix-value').textContent=Math.round(mix*100)+'% referencia';
  referenceFace.colorMode=mode;referenceFace.colorBlend=mix;
}
$('#reference-color-mode').addEventListener('change',updateColorControls);
$('#reference-color-mix').addEventListener('input',updateColorControls);
$('#reference-color-lock').addEventListener('change',event=>{referenceViews.setColorLocked(event.target.checked);referenceFace.lockTone=event.target.checked;resetIdentity();updateReferenceViews();});
$('#reference-calibrate').addEventListener('click',()=>{referenceFace.reset();resetIdentity();$('#reference-status').textContent='Mira de frente, abre los ojos y relaja la boca para calibrar.';});
$('#reference-identity').addEventListener('input',event=>{$('#reference-identity-value').textContent=event.target.value+'%';neuralPortrait.reset(true);neuralView?.reset();});

for (const [control,property] of [['softness','softness'],['stability','stability'],['detail','detail'],['eyes','eyes'],['mouth','mouth'],['forehead','forehead'],['chin','chin']]) {
  $('#reference-'+control).addEventListener('input',event=>{
    referenceFace[property]=Number(event.target.value)/100;
    $('#reference-'+control+'-value').textContent=event.target.value+'%';
    referenceFace.rendered=false;
  });
}

function updateReferenceViews(){
  updateColorControls();
  for(const side of ['left','right']){
    const view=referenceViews.entries.get(side),preview=$('#reference-'+side+'-preview');preview.hidden=!view;
    if(view){preview.src=view.image.toDataURL('image/jpeg',.8);$('#reference-'+side+'-label').textContent='Cambiar foto';}else{preview.removeAttribute('src');$('#reference-'+side+'-label').textContent='Añadir foto';}
    $('#reference-'+side+'-remove').classList.toggle('hidden',!view);
  }
  $('#reference-views-status').textContent=referenceViews.count+' vista'+(referenceViews.count===1?'':'s')+' · '+(referenceViews.count===3?'Identidad frontal y ambos perfiles preparados.':'Añade perfiles opuestos de la misma persona, entre 25 y 70 grados.');
}
function resetIdentity(){neuralPortrait.reset();neuralView?.reset();neuralMotion.reset();liveStabilizer.reset();neuralSample=null;lastSubmittedSample=null;}
async function loadReference(event,side='front'){
  const file=event.target.files?.[0];if(!file||analyzingReference)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setStatus('Elige una foto JPG, PNG o WebP.');event.target.value='';return;}
  if(file.size>12*1024*1024){setStatus('La foto debe ocupar como máximo 12 MB.');event.target.value='';return;}
  analyzingReference=true;cameraControls(!!stream);setStatus('Analizando tu fotografía…');resetIdentity();let mesh;
  try{
    mesh=await getModel();if(inference)await inference;
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),image=document.createElement('canvas');
    image.width=Math.round(bitmap.width*scale);image.height=Math.round(bitmap.height*scale);image.getContext('2d').drawImage(bitmap,0,0,image.width,image.height);bitmap.close();let detected;
    mesh.onResults(r=>{if(r.multiFaceLandmarks?.length===1)detected=r.multiFaceLandmarks[0].map(p=>({...p}));});
    mesh.setOptions({maxNumFaces:2,refineLandmarks:true});await mesh.reset();await mesh.send({image});
    if(!detected)throw new Error('Usa una foto nítida con una sola persona y los ojos visibles.');
    const candidate={image,points:detected.map(p=>({x:p.x*image.width,y:p.y*image.height,z:p.z}))};
    const error=FacePose.validateView(candidate.points,image.width,side);if(error)throw new Error(error);
    if(side==='front'){
      const reference=referenceFace.setCustomReference(image,detected);await ReferenceMatte.prepare(reference,headTransfer.client);referenceViews.setFront(reference);$('#reference-name').textContent='Tu identidad de referencia';$('#reference-preview').src=image.toDataURL('image/jpeg',.85);
    }else{await ReferenceMatte.prepare(candidate,headTransfer.client);referenceViews.add(side,candidate);}
    updateReferenceViews();setStatus('Referencia preparada. '+referenceViews.count+' vista'+(referenceViews.count===1?'':'s')+' para la identidad neuronal.');
  }catch(error){setStatus(error.message||'No se pudo abrir esta foto.');}
  finally{if(mesh){mesh.setOptions({maxNumFaces:1});try{await mesh.reset();}catch{}mesh.onResults(handleResultsCallback);}analyzingReference=false;event.target.value='';cameraControls(!!stream);}
}
$('#reference-file').addEventListener('change',event=>loadReference(event,'front'));
for(const side of ['left','right']){
  $('#reference-'+side).addEventListener('change',event=>loadReference(event,side));
  $('#reference-'+side+'-remove').addEventListener('click',()=>{if(analyzingReference)return;referenceViews.remove(side);resetIdentity();updateReferenceViews();});
}
$('#reference-default').addEventListener('click',()=>{
  if(!referenceFace.ready||analyzingReference)return;referenceFace.useDefault();referenceViews.setFront(referenceFace.choose());updateReferenceViews();resetIdentity();
  $('#reference-name').textContent='Referencia incluida';$('#hair-status').textContent='El cabello se prepara al activar el retrato.';
  $('#reference-preview').src=referenceFace.choose()?.image.src||'assets/reference-face/portrait-2.png';
});
$('#reference-hair').addEventListener('change',event=>{
  headTransfer.mode=event.target.value;headTransfer.clearTracking();
  $('#hair-status').textContent=headTransfer.mode==='style'?'Para copiar el peinado, prepara el fondo sin nadie en el encuadre. Mantén la cámara quieta.':headTransfer.mode==='off'?'Cabello desactivado.':'El color de referencia se aplica a tu cabello conservando sus sombras.';
});
$('#reference-background').addEventListener('click',async()=>{
  if(!stream||backgroundBusy)return;const current=generation;backgroundBusy=true;cameraControls(true);
  try{
    for(let i=3;i>0;i--){$('#hair-status').textContent='Sal del encuadre. Captura de fondo en '+i+'…';await new Promise(r=>setTimeout(r,1000));if(current!==generation||!stream)return;}
    if(points){$('#hair-status').textContent='Todavía se detecta un rostro. Sal del encuadre y vuelve a preparar el fondo.';return;}
    if(performance.now()-lastFrame>1000){$('#hair-status').textContent='Espera a que vuelva la imagen de la cámara.';return;}
    headTransfer.captureBackground(frame);
  }finally{backgroundBusy=false;cameraControls(!!stream);}
});

async function preparePortraitBackground(ai){
  if(!stream||backgroundBusy||!neuralView)return;const current=generation,wasEnabled=neuralPortrait.enabled,mode=$('#reference-engine').value,controller=new AbortController();let prepared=false,timer;
  backgroundRequest=controller;
  backgroundBusy=true;neuralPortrait.enabled=false;cameraControls(true);
  const status=$('#portrait-background-status');
  try{
    if(ai){
      if(!neuralMotion.current){status.textContent='Mira a la cámara antes de generar el fondo.';return;}
      if(!(await neuralPortrait.available())||!neuralPortrait.engineInfo.background_available){status.textContent='Instala LaMa con instalar-relleno-ia.bat, reinicia el motor y comprueba el túnel.';return;}
      if(!neuralPortrait.engineInfo.background_safe){status.textContent='Actualiza y reinicia el motor de la PC a 1.13 para usar el relleno seguro. Capturar fondo sigue disponible.';return;}
      const deadline=performance.now()+110000;
      while(neuralPortrait.busy&&performance.now()<deadline){status.textContent='Esperando a que termine la generación actual…';await new Promise(r=>setTimeout(r,200));if(current!==generation||!stream)return;}
      if(neuralPortrait.busy)throw new Error('El motor sigue ocupado. Vuelve a intentarlo al terminar.');
      const c=document.createElement('canvas');mirrorFrame(c,video);const live=neuralMotion.current?.camera||neuralMotion.current?.points;
      if(!live)throw new Error('No se detecta el rostro. Vuelve a mirar a la cámara.');
      status.textContent='Pausando el motor facial y preparando el fondo con LaMa en CPU…';
      timer=setTimeout(()=>controller.abort(),185000);
      neuralPortrait.reset();const result=await neuralPortrait.request('background',{image:c.toDataURL('image/jpeg',.95),points:live.map(p=>[p.x,p.y])},controller.signal);
      const image=new Image();image.src=result.image;await image.decode();if(current!==generation||!stream)return;
      neuralView.setBackground(image,'ai');status.textContent='Fondo LaMa preparado · Mantén quieta la cámara. Puede inventar detalles del fondo.';prepared=true;
    }else{
      for(let i=3;i>0;i--){status.textContent='Sal del encuadre. Captura de fondo en '+i+'…';await new Promise(r=>setTimeout(r,1000));if(current!==generation||!stream)return;}
      if(points){status.textContent='Todavía se detecta una cara. Sal por completo del encuadre y vuelve a preparar el fondo.';return;}
      const c=document.createElement('canvas');mirrorFrame(c,video);neuralView.setBackground(c,'captured');status.textContent='Fondo capturado · Vuelve al encuadre y mantén quieta la cámara.';prepared=true;
    }
  }catch(error){if(current===generation)status.textContent=error.name==='AbortError'?'La preparación del fondo se canceló o tardó demasiado. Vuelve a intentarlo.':error.message;}
  finally{clearTimeout(timer);if(backgroundRequest===controller)backgroundRequest=null;backgroundBusy=false;if($('#reference-engine').value===mode)neuralPortrait.enabled=wasEnabled;cameraControls(!!stream);if(prepared&&current===generation)neuralPortrait.next=0;}
}
$('#portrait-background-capture').addEventListener('click',()=>preparePortraitBackground(false));
$('#portrait-background-ai').addEventListener('click',()=>preparePortraitBackground(true));
$('#portrait-background-clear').addEventListener('click',()=>{clearPortraitBackground();cameraControls(!!stream);});

function resetComparison() {
  comparing=false;$('#reference-compare').setAttribute('aria-pressed','false');
  $('#reference-compare').textContent='Comparar con original';
}
$('#reference-compare').addEventListener('click',()=>{
  if(!stream || busyCamera)return;
  comparing=!comparing;referenceFace.rendered=false;lastFrame=0;
  neuralPortrait.reset(true);
  neuralView?.reset();
  $('#reference-compare').setAttribute('aria-pressed',String(comparing));
  $('#reference-compare').textContent=comparing?'Volver al retrato':'Comparar con original';
  cameraControls(!!stream);
});
async function refreshCameras(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  try{
    const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'),select=$('#camera-device');
    select.replaceChildren(new Option('Automática', ''));inputs.forEach((d,i)=>select.add(new Option(d.label||'Cámara '+(i+1),d.deviceId)));
    select.value=cameraDevice;
  }catch{}
}
$('#camera-device').addEventListener('change',event=>{cameraDevice=event.target.value;if(stream)openCamera(facing);});
navigator.mediaDevices?.addEventListener?.('devicechange',refreshCameras);
$('#reference-resolution').addEventListener('change',event=>{resolutionLimit=Number(event.target.value);if(stream){dimensions();clearTracking();}});
$('#reference-engine').addEventListener('change',async event=>{
  const wantsNeural=event.target.value==='neural',wantsAvatar=event.target.value==='avatar',live=wantsNeural||wantsAvatar,previous=neuralPortrait.photoOnly?'avatar':portraitEngine==='neural'?'neural':'browser';engineBusy=true;cameraControls(!!stream);
  try{
    if(wantsNeural&&!(await neuralPortrait.available())){event.target.value=previous;neuralMessage=neuralPortrait.engineInfo?.error||'El motor de la PC no está disponible. Puedes continuar con Avatar en este dispositivo.';updateNeuralStatus();return;}
    portraitEngine=live?'neural':'browser';neuralPortrait.photoOnly=wantsAvatar;neuralPortrait.enabled=wantsNeural;neuralPortrait.reset();
    headTransfer.suspended=live;headTransfer.clearTracking();$('#reference-shape').disabled=false;$('#reference-identity').disabled=!wantsNeural;$('#reference-quality').disabled=!wantsNeural;
    if(wantsNeural)configureNeuralQuality();else if(wantsAvatar){$('#reference-quality').value='balanced';$('#reference-quality').options[0].textContent='Fotos · Reproyección en vivo';}
    $('#local-processing-note').classList.toggle('hidden',!live);
    const remote=neuralPortrait.engineInfo?.mode==='remote';
    $('#local-processing-note').textContent=wantsAvatar?'Avatar anima la fotografía frontal y los perfiles en este dispositivo. No envía la cámara al generador de la PC.':remote?'Las referencias y los recortes pasan por el servidor web y se generan en la PC del proyecto.':'Las referencias y los recortes se generan en la computadora que sirve esta página.';
    $('#video-processing-note').textContent=wantsAvatar?'Avatar procesa la cámara y las referencias en este dispositivo. Al tomar una foto, se guarda durante 4 horas.':wantsNeural?(remote?'El modo neuronal envía las referencias y los recortes al servidor del proyecto y al motor remoto. Al tomar una foto, se guarda durante 4 horas.':'El modo neuronal utiliza el motor de esta computadora. Al tomar una foto, se guarda durante 4 horas.'):'Al tomar una foto se guarda durante 4 horas. El video se procesa en este dispositivo.';
    $('#head-settings').classList.toggle('hidden',live);
    neuralMessage=wantsAvatar?'Avatar · Fotos en vivo · Añade ambos perfiles para mejorar los giros.':wantsNeural?(neuralPortrait.engineInfo?.acceleration_warning||'Motor listo. La textura neuronal se actualiza cuando llega una generación nueva.'):'Modo ligero · Procesamiento en este dispositivo';updateNeuralStatus();
    if(stream){dimensions();clearTracking();}syncPresentation();
  }finally{engineBusy=false;cameraControls(!!stream);}
});
$('#reference-profile').addEventListener('change',event=>{
  const profiles={natural:{shape:.95,complexion:.72,softness:.35,stability:.55,detail:1,eyes:0,mouth:0,forehead:0,chin:0},likeness:{shape:1,complexion:.82,softness:.3,stability:.5,detail:1.05,eyes:0,mouth:0,forehead:0,chin:0},fluid:{shape:.85,complexion:.7,softness:.4,stability:.45,detail:.9,eyes:0,mouth:0,forehead:0,chin:0}};
  const profile=profiles[event.target.value];if(!profile)return;$('#reference-identity').value=event.target.value==='likeness'?'90':event.target.value==='fluid'?'45':'65';$('#reference-identity-value').textContent=$('#reference-identity').value+'%';
  $('#reference-quality').value='balanced';configureNeuralQuality();neuralPortrait.reset(true);neuralView?.reset();
  for(const [key,value]of Object.entries(profile)){referenceFace[key]=value;if($('#reference-'+key))$('#reference-'+key).value=Math.round(value*100);if($('#reference-'+key+'-value'))$('#reference-'+key+'-value').textContent=Math.round(value*100)+'%';}
  resolutionLimit=event.target.value==='fluid'?480:0;$('#reference-resolution').value=String(resolutionLimit);
  headTransfer.mode=event.target.value==='fluid'?'off':'color';$('#reference-hair').value=headTransfer.mode;headTransfer.clearTracking();if(stream){dimensions();clearTracking();}
});
function configureNeuralQuality(){
  const native=neuralPortrait.engineInfo?.native_size||128,select=$('#reference-quality'),avatar=neuralPortrait.engineInfo?.model==='live_portrait_512';
  if(neuralPortrait.photoOnly){select.value='balanced';select.options[0].textContent='Fotos · Reproyección en vivo';select.options[1].disabled=true;return;}
  select.options[1].disabled=avatar;
  if(avatar){select.value='balanced';select.options[0].textContent='LivePortrait · 512 nativos'+(neuralPortrait.engineInfo.gesture_retargeting?' · Gestos IA':'');neuralPortrait.faceSize=512;return;}
  select.options[0].textContent=native===256?'256 nativo · 1 pasada':'Equilibrado · 1 pasada de 128';
  select.options[1].textContent=native===256?'Más detalle · 4 pasadas de 256':'Más detalle · 4 pasadas de 128';
  neuralPortrait.faceSize=select.value==='detail'?(native===256?640:480):(native===256?448:320);
}
$('#reference-identity').disabled=true;$('#head-settings').classList.add('hidden');$('#local-processing-note').classList.remove('hidden');$('#local-processing-note').textContent='Avatar anima tus fotos en este dispositivo. No necesita el motor de la PC ni el túnel.';configureNeuralQuality();
$('#reference-quality').addEventListener('change',()=>{configureNeuralQuality();neuralPortrait.reset(true);neuralView?.reset();});
cameraControls(false);
