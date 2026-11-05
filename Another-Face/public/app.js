/* Anotherface: cámara local, filtros por malla y guardado explícito de fotos. */
'use strict';
const $ = s => document.querySelector(s);
const video = $('#video'), overlay = $('#overlay'), ctx = overlay.getContext('2d');
const frame = document.createElement('canvas'), fc = frame.getContext('2d');
const SESSION_ID = crypto.randomUUID();
let model = null, modelPromise = null, modelFailed = false;
let stream = null, facing = 'user', generation = 0, busyCamera = false, sending = false;
let currentFilter = 'retrato', points = null, rawPoints = null, lastFrame = 0, pendingPhoto = null, uploading = false;
let comparing = false, analyzingReference=false, inference=null, handleResultsCallback=null, backgroundBusy=false;
let portraitEngine='browser',cameraDevice='',resolutionLimit=0;
let neuralView=null,trackingStarted=0,lastTrackStarted=0,lastMetricUpdate=0,trackerMs=0,neuralMessage='',neuralSample=null,lastSubmittedSample=null;
const neuralMotion=new NeuralMotion(),neuralTracker=new NeuralTracker(),viewTimes=[],trackTimes=[];
const neuralInput=document.createElement('canvas'),neuralFrame=document.createElement('canvas');
const referenceFace = new ReferenceFace(text => { const label=$('#reference-status'); if(label.textContent!==text) label.textContent=text; });
const headTransfer=new HeadTransfer(text=>{const label=$('#hair-status');if(label.textContent!==text)label.textContent=text;});
referenceFace.head=headTransfer;
const neuralPortrait=new NeuralPortrait(text=>{neuralMessage=text;updateNeuralStatus();},()=>setTimeout(submitNeural,0));
const dog = new Image(); dog.src = 'assets/dog_filter.png';
const oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
let triangles = [], sendGeneration = 0;
function setStatus(text) { $('#studio-status').textContent = text; }
function clearTracking() { referenceFace.lost();neuralPortrait.reset(true);neuralMotion.reset();neuralView?.reset();neuralSample=null;lastSubmittedSample=null;viewTimes.length=0;trackTimes.length=0; points = null; rawPoints = null; lastFrame = 0; ctx.clearRect(0,0,overlay.width,overlay.height);updateNeuralStatus(); }
function syncPresentation(){
  $('.video-wrap').classList.toggle('is-live',!!stream);
  $('.video-wrap').classList.toggle('native-camera',!!stream&&(currentFilter==='ninguno'||portraitEngine==='neural'&&currentFilter==='retrato'));
  if(!(stream&&portraitEngine==='neural'&&currentFilter==='retrato'))neuralView?.hide();
  if($('#camera-live-label'))$('#camera-live-label').textContent=stream?'Cámara activa':'Cámara apagada';
}
function cameraControls(active) {
  $('#start-camera').classList.toggle('hidden', active);
  $('#capture-btn').classList.toggle('hidden', !active);
  $('#capture-btn').disabled = !active || busyCamera || uploading || (currentFilter==='retrato' && comparing);
  $('#reference-compare').disabled = !active || busyCamera;
  $('#switch-camera-btn').disabled = !active || busyCamera || analyzingReference || backgroundBusy;
  $('#stop-btn').disabled = !active || busyCamera;
  $('#start-camera').disabled = busyCamera;
  $('#camera-empty').classList.toggle('hidden', active);
  $('#reference-file').disabled=analyzingReference;
  $('#reference-default').disabled=analyzingReference||!referenceFace.ready;
  $('#reference-background').disabled=!active||busyCamera||backgroundBusy||analyzingReference;
  $('#camera-device').disabled=busyCamera||analyzingReference;
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
      // Coordenadas exactas del fotograma: no inventar puntos intermedios ni reutilizar otra cara.
      points = rawPoints?.map(p => ({ x:p.x*overlay.width, y:p.y*overlay.height, z:p.z })) || null;
      $('#face-status-overlay').textContent = points ? 'Rostro detectado · Seguimiento activo' : 'Mira a la cámara y busca buena luz';
      if (!points) {referenceFace.lost();neuralPortrait.reset(true);}
      if(portraitEngine==='neural'&&currentFilter==='retrato'){
        if(!points){neuralMotion.reset();neuralView?.reset();return;}
        const now=performance.now(),stable=referenceFace.smoother.filter(points,referenceFace.stability,now);
        trackerMs=now-trackingStarted;neuralMotion.update(stable,trackingStarted||now);
        if(!comparing&&!analyzingReference&&referenceFace.ready){
          mirrorFrame(neuralFrame,results.image);
          neuralSample={points:stable,raw:rawPoints,reference:referenceFace.choose(points),time:trackingStarted||now,generation};submitNeural();
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
    try { await referenceFace.prepare(mesh, triangles); }
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
  const limit=Math.min(resolutionLimit||960,portraitEngine==='neural'?640:matchMedia('(max-width:760px)').matches?720:960);
  const scale = Math.min(1, limit/video.videoWidth);
  overlay.width = frame.width = Math.round(video.videoWidth*scale);
  overlay.height = frame.height = Math.round(video.videoHeight*scale);
  $('.video-wrap').style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
  headTransfer.clearBackground();
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
      video: { width:{ideal:1280}, height:{ideal:720}, facingMode:{ideal:mode},...(cameraDevice?{deviceId:{exact:cameraDevice}}:{}) }, audio:false
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
  headTransfer.clearBackground();
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
      const trackInterval=neuralTracker.disabled?Math.max(80,Math.min(500,trackerMs*1.8)):$('#reference-profile').value==='fluid'?33:50;
      if(liveNeural&&performance.now()-lastTrackStarted<trackInterval){setTimeout(()=>tick(current),8);return;}
      sending=true; sendGeneration=current;
      try {
        let source=video;
        if(liveNeural){
          const w=Math.min($('#reference-profile').value==='fluid'?320:480,video.videoWidth),h=Math.round(video.videoHeight*w/video.videoWidth);
          if(neuralInput.width!==w||neuralInput.height!==h){neuralInput.width=w;neuralInput.height=h;}
          neuralInput.getContext('2d').drawImage(video,0,0,w,h);source=neuralInput;trackingStarted=lastTrackStarted=performance.now();
        }
        inference=(async()=>{
          if(liveNeural){
            const result=await neuralTracker.track(source,{refine:$('#reference-profile').value!=='fluid'});
            if(result){handleResultsCallback({image:source,multiFaceLandmarks:result.landmarks?[result.landmarks]:[]});return;}
          }
          model.setOptions({refineLandmarks:!(liveNeural&&$('#reference-profile').value==='fluid')});await model.send({image:source});
        })();await inference;
      }
      catch { clearTracking(); drawFrame(video); $('#face-status-overlay').textContent='Seguimiento no disponible'; }
      finally { sending=false;inference=null; }
    } else if(currentFilter!=='ninguno'&&!analyzingReference)drawFrame(video);
  }
  if(current===generation && stream) {
    // Inferir el siguiente fotograma disponible, sin añadir 33 ms al tiempo del modelo.
    if(video.requestVideoFrameCallback) video.requestVideoFrameCallback(()=>tick(current));
    else setTimeout(()=>tick(current),16);
  }
}
function mirrorFrame(canvas,source){
  const W=overlay.width,H=overlay.height;if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const c=canvas.getContext('2d');c.save();c.clearRect(0,0,W,H);if(facing==='user'){c.translate(W,0);c.scale(-1,1);}c.drawImage(source,0,0,W,H);c.restore();
}
function neuralSettings(){return {strength:referenceFace.opacity,mouth:referenceFace.mouth,eyes:referenceFace.eyes,forehead:referenceFace.forehead,chin:referenceFace.chin,softness:referenceFace.softness,color:(1-referenceFace.complexion)*.75,detail:Math.max(0,Math.min(.35,(referenceFace.detail-.6)*.55))};}
function submitNeural(){
  const sample=neuralSample;
  if(!stream||comparing||analyzingReference||portraitEngine!=='neural'||currentFilter!=='retrato'||!sample||sample===lastSubmittedSample||sample.generation!==generation||performance.now()-sample.time>450)return;
  if(neuralPortrait.submit(neuralFrame,sample.points,sample.reference,neuralSettings(),sample.raw))lastSubmittedSample=sample;
}
function updateNeuralStatus(){
  const fps=viewTimes.length>1?(viewTimes.length-1)*1000/Math.max(viewTimes.at(-1)-viewTimes[0],1):0;
  const tracked=trackTimes.length>1?(trackTimes.length-1)*1000/Math.max(trackTimes.at(-1)-trackTimes[0],1):0,activeNeural=portraitEngine==='neural'&&currentFilter==='retrato';
  $('#neural-status').textContent=neuralMessage||'Modo ligero · Procesamiento en este dispositivo';
  const value=(id,n)=>{const e=$(id);if(e)e.textContent=n>0?n.toFixed(1):'—';};
  value('#fps-view',stream?fps:0);value('#fps-ai',stream&&activeNeural?neuralPortrait.fps:0);value('#fps-tracking',stream?tracked:0);
  if($('#engine-label'))$('#engine-label').textContent=currentFilter==='ninguno'?'Original':activeNeural?({CUDAExecutionProvider:'GPU · CUDA',DmlExecutionProvider:'GPU · DirectML',CPUExecutionProvider:'CPU · ONNX'}[neuralPortrait.last?.provider||neuralPortrait.engineInfo?.provider]||'Motor neuronal'):'Modo ligero';
}
function recordView(now){
  viewTimes.push(now);while(viewTimes.length>60||viewTimes.length>2&&now-viewTimes[0]>1200)viewTimes.shift();
  if(now-lastMetricUpdate>500){lastMetricUpdate=now;updateNeuralStatus();}lastFrame=now;
}
function liveView(current){
  if(current!==generation||!stream)return;
  if(video.readyState>=2&&!busyCamera&&(currentFilter==='ninguno'||portraitEngine==='neural'&&currentFilter==='retrato')){
    if(currentFilter==='retrato'&&!comparing&&!analyzingReference)drawNeuralResult();else{referenceFace.rendered=false;neuralView?.hide();}
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
  const result=neuralPortrait.last;
  const current=neuralMotion.predict(performance.now());
  if(!result||!current||result.width!==overlay.width||result.height!==overlay.height||!neuralView){referenceFace.rendered=false;neuralView?.hide();return;}
  const source=capture?frame:{width:overlay.width,height:overlay.height,video,mirror:facing==='user'};
  referenceFace.rendered=neuralView.draw(capture?ctx:null,source,current,result,{opacity:referenceFace.opacity,eyes:referenceFace.eyes,mouth:referenceFace.mouth,softness:referenceFace.softness,light:$('#reference-light')?.checked===false?0:.5},performance.now());
  $('#reference-status').textContent=referenceFace.rendered?'Retrato neuronal activo · Gestos en vivo':'Ajustando el retrato a tu posición…';
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
  if(!stream || busyCamera || uploading || !lastFrame || performance.now()-lastFrame>1500) return setStatus('Espera a que la cámara esté lista.');
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
$('#reference-calibrate').addEventListener('click',()=>{referenceFace.reset();$('#reference-status').textContent='Mira de frente, abre los ojos y relaja la boca para calibrar.';});

for (const [control,property] of [['softness','softness'],['stability','stability'],['complexion','complexion'],['detail','detail'],['eyes','eyes'],['mouth','mouth'],['forehead','forehead'],['chin','chin']]) {
  $('#reference-'+control).addEventListener('input',event=>{
    referenceFace[property]=Number(event.target.value)/100;
    $('#reference-'+control+'-value').textContent=event.target.value+'%';
    referenceFace.rendered=false;
  });
}

$('#reference-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file||analyzingReference)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setStatus('Elige una foto JPG, PNG o WebP.');event.target.value='';return;}
  if(file.size>12*1024*1024){setStatus('La foto debe ocupar como máximo 12 MB.');event.target.value='';return;}
  analyzingReference=true;cameraControls(!!stream);setStatus('Analizando tu referencia en este dispositivo…');
  neuralPortrait.reset();
  neuralView?.reset();
  let mesh;
  try{
    mesh=await getModel();if(inference)await inference;
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
    const image=document.createElement('canvas');image.width=Math.round(bitmap.width*scale);image.height=Math.round(bitmap.height*scale);image.getContext('2d').drawImage(bitmap,0,0,image.width,image.height);bitmap.close();
    let detected;
    mesh.onResults(r=>{if(r.multiFaceLandmarks?.length===1)detected=r.multiFaceLandmarks[0].map(p=>({...p}));});
    mesh.setOptions({maxNumFaces:2,refineLandmarks:true});await mesh.reset();await mesh.send({image});
    if(!detected)throw new Error('Usa una foto frontal con una sola persona, ojos visibles y buena luz.');
    referenceFace.setCustomReference(image,detected);$('#reference-name').textContent='Tu foto de referencia';
    if($('#reference-preview'))$('#reference-preview').src=image.toDataURL('image/jpeg',.85);
    setStatus('Referencia cargada. Activa Retrato y calibra mirando de frente.');
  }catch(error){setStatus(error.message||'No se pudo abrir esta foto.');}
  finally{
    if(mesh){mesh.setOptions({maxNumFaces:1});try{await mesh.reset();}catch{}mesh.onResults(handleResultsCallback);}
    analyzingReference=false;event.target.value='';cameraControls(!!stream);
  }
});
$('#reference-default').addEventListener('click',()=>{
  if(!referenceFace.ready||analyzingReference)return;
  referenceFace.useDefault();$('#reference-name').textContent='Referencia incluida';$('#hair-status').textContent='El cabello se prepara al activar el retrato.';
  neuralPortrait.reset();
  neuralView?.reset();
  if($('#reference-preview'))$('#reference-preview').src=referenceFace.choose()?.image.src||'assets/reference-face/portrait-2.png';
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
  const wantsNeural=event.target.value==='neural';event.target.disabled=true;
  try{
    if(wantsNeural&&!(await neuralPortrait.available())){event.target.value='browser';$('#neural-status').textContent=neuralPortrait.engineInfo?.error||(neuralPortrait.engineInfo?.mode==='remote'?'El motor remoto no está disponible. Comprueba que la PC servidora y el túnel estén activos.':'El motor aún no está disponible. Inícialo con npm.cmd run start:ai o espera a que termine de cargar. La instalación inicial está en instalar-ia-local.bat.');return;}
    portraitEngine=wantsNeural?'neural':'browser';neuralPortrait.enabled=wantsNeural;neuralPortrait.reset();
    headTransfer.suspended=wantsNeural;headTransfer.clearTracking();
    $('#reference-shape').disabled=wantsNeural;
    if($('#reference-light'))$('#reference-light').disabled=!wantsNeural;
    $('#local-processing-note').classList.toggle('hidden',!wantsNeural);
    const remote=neuralPortrait.engineInfo?.mode==='remote';
    $('#local-processing-note').textContent=remote?'La referencia y los recortes faciales pasan por el servidor web y se procesan en la PC remota del proyecto. La cámara sigue en vivo entre resultados de IA.':'La referencia y el recorte facial se procesan en la computadora que sirve esta página. La cámara sigue en vivo entre resultados de IA.';
    $('#video-processing-note').textContent=wantsNeural?(remote?'El modo neuronal envía la referencia y recortes faciales al servidor del proyecto y al motor remoto. Al tomar una foto, se guarda durante 4 horas.':'El modo neuronal envía fotogramas al motor de esta computadora para procesarlos. Al tomar una foto, se guarda durante 4 horas.'):'Al tomar una foto, se envía al administrador y queda disponible durante 4 horas. El video se procesa en este dispositivo.';
    $('#head-settings').classList.toggle('hidden',wantsNeural);
    neuralMessage=wantsNeural?(neuralPortrait.engineInfo?.acceleration_warning||'Motor listo. El primer fotograma puede tardar más.'):'Modo ligero · Procesamiento en este dispositivo';updateNeuralStatus();
    if(stream){dimensions();clearTracking();}syncPresentation();
  }finally{event.target.disabled=false;}
});
$('#reference-profile').addEventListener('change',event=>{
  const profiles={natural:{shape:.82,complexion:.62,softness:.65,stability:.72,detail:1,eyes:.35,mouth:.7,forehead:.75,chin:.12},likeness:{shape:.96,complexion:.86,softness:.6,stability:.65,detail:1,eyes:.15,mouth:.45,forehead:.5,chin:.08},fluid:{shape:.76,complexion:.55,softness:.7,stability:.8,detail:.95,eyes:.55,mouth:.85,forehead:.8,chin:.18}};
  const profile=profiles[event.target.value];if(!profile)return;
  for(const [key,value]of Object.entries(profile)){referenceFace[key]=value;$('#reference-'+key).value=Math.round(value*100);$('#reference-'+key+'-value').textContent=Math.round(value*100)+'%';}
  resolutionLimit=event.target.value==='fluid'?480:0;$('#reference-resolution').value=String(resolutionLimit);
  headTransfer.mode=event.target.value==='fluid'?'off':'color';$('#reference-hair').value=headTransfer.mode;headTransfer.clearTracking();if(stream){dimensions();clearTracking();}
});
if($('#reference-light'))$('#reference-light').disabled=true;
cameraControls(false);
