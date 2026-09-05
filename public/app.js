/* Anotherface: cámara local, filtros por malla y guardado explícito de fotos. */
'use strict';
const $ = s => document.querySelector(s);
const video = $('#video'), overlay = $('#overlay'), ctx = overlay.getContext('2d');
const frame = document.createElement('canvas'), fc = frame.getContext('2d');
const SESSION_ID = crypto.randomUUID();
const VERSION = '0.4.1633559619';
let model = null, modelPromise = null, modelFailed = false;
let stream = null, facing = 'user', generation = 0, busyCamera = false, sending = false;
let currentFilter = 'ninguno', points = null, rawPoints = null, lastFrame = 0, pendingPhoto = null, uploading = false;
const dog = new Image(); dog.src = 'assets/dog_filter.png';
const oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
let triangles = [], sendGeneration = 0;
function setStatus(text) { $('#studio-status').textContent = text; }
function clearTracking() { points = null; rawPoints = null; lastFrame = 0; ctx.clearRect(0,0,overlay.width,overlay.height); }
function cameraControls(active) {
  $('#start-camera').classList.toggle('hidden', active);
  $('#capture-btn').classList.toggle('hidden', !active);
  $('#capture-btn').disabled = !active || busyCamera || uploading;
  $('#switch-camera-btn').disabled = !active || busyCamera;
  $('#stop-btn').disabled = !active || busyCamera;
  $('#start-camera').disabled = busyCamera;
  $('#camera-empty').classList.toggle('hidden', active);
}
async function getModel() {
  if (model) return model;
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    if (!window.FaceMesh) throw new Error('No se pudo cargar el modelo. Revisa tu conexión y recarga la página.');
    const mesh = new FaceMesh({ locateFile: f => 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@' + VERSION + '/' + f });
    mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .65, minTrackingConfidence: .7 });
    mesh.onResults(results => {
      if (!stream || busyCamera || sendGeneration !== generation) return;
      const raw = results.multiFaceLandmarks?.[0];
      rawPoints = raw ? raw.map(p => ({ x: facing === 'user' ? 1-p.x : p.x, y:p.y, z:p.z })) : null;
      // Coordenadas exactas del fotograma: no inventar puntos intermedios ni reutilizar otra cara.
      points = rawPoints?.map(p => ({ x:p.x*overlay.width, y:p.y*overlay.height, z:p.z })) || null;
      $('#face-status-overlay').textContent = points ? points.length + ' puntos · Rostro detectado' : 'Busca una posición de frente y con buena luz';
      drawFrame(results.image);
    });
    await mesh.initialize();
    const edges = window.FACEMESH_TESSELATION || [];
    // Cada triángulo de MediaPipe contiene tres aristas consecutivas.
    for (let i=0; i<edges.length; i+=3) {
      const ids = [...new Set(edges.slice(i,i+3).flat())];
      if (ids.length===3) triangles.push(ids);
    }
    model = mesh;
    return mesh;
  })();
  try { return await modelPromise; } catch (err) { modelPromise = null; throw err; }
}
function dimensions() {
  const scale = Math.min(1, 960/video.videoWidth);
  overlay.width = frame.width = Math.round(video.videoWidth*scale);
  overlay.height = frame.height = Math.round(video.videoHeight*scale);
  $('.video-wrap').style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
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
  busyCamera = true; generation++; cameraControls(!!stream); clearTracking();
  const previous = stream;
  stream = null; previous?.getTracks().forEach(t => t.stop());
  setStatus('Abriendo cámara…');
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Abre esta página con HTTPS para utilizar la cámara.');
    const next = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:1280}, height:{ideal:720}, facingMode:{ideal:mode} }, audio:false
    });
    stream = next; facing = mode; video.srcObject = next;
    await video.play();
    if (!video.videoWidth) await new Promise(resolve => video.addEventListener('loadedmetadata',resolve,{once:true}));
    dimensions();
    video.style.transform = mode==='user' ? 'scaleX(-1)' : 'none';
    stream.getVideoTracks()[0].addEventListener('ended', stopCamera, {once:true});
    busyCamera = false; cameraControls(true);
    const current = generation;
    setStatus('Cargando filtros… Puedes tomar una foto sin filtro.');
    tick(current);
    try {
      await getModel(); modelFailed = false;
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
  generation++; stream?.getTracks().forEach(t=>t.stop()); stream=null;
  video.srcObject=null; clearTracking(); cameraControls(false);
  $('#face-status-overlay').textContent='Cámara apagada'; setStatus('Cámara apagada.');
}
$('#start-camera').addEventListener('click',()=>openCamera(facing));
$('#switch-camera-btn').addEventListener('click',()=>openCamera(facing==='user'?'environment':'user'));
$('#stop-btn').addEventListener('click',stopCamera);
window.addEventListener('pagehide',stopCamera);
document.addEventListener('visibilitychange',()=>{ if(document.hidden && stream) stopCamera(); });
document.querySelectorAll('.filter-chip').forEach(button=>button.addEventListener('click',()=>{
  currentFilter=button.dataset.filter;
  document.querySelectorAll('.filter-chip').forEach(b=>{
    b.classList.toggle('active',b===button); b.setAttribute('aria-pressed',String(b===button));
  });
  if (stream) {
    drawFrame(video);
    if(modelFailed && currentFilter!=='ninguno') setStatus('No se pudieron cargar los filtros. Recarga la página o usa Original.');
  }
}));
async function tick(current) {
  if(current!==generation || !stream) return;
  if (video.readyState>=2 && !sending) {
    if(model) {
      sending=true; sendGeneration=current;
      try { await model.send({image:video}); }
      catch { clearTracking(); drawFrame(video); $('#face-status-overlay').textContent='Seguimiento no disponible'; }
      finally { sending=false; }
    } else drawFrame(video);
  }
  if(current===generation && stream) setTimeout(()=>tick(current),33);
}
function drawFrame(source) {
  if(!stream || busyCamera || !source) return;
  const W=overlay.width,H=overlay.height;
  fc.save(); fc.clearRect(0,0,W,H);
  if(facing==='user'){fc.translate(W,0);fc.scale(-1,1);}
  fc.drawImage(source,0,0,W,H);fc.restore();
  ctx.clearRect(0,0,W,H);ctx.drawImage(frame,0,0);
  if(points) {
    if(currentFilter==='silueta') drawMesh();
    if(currentFilter==='perro') drawDog();
    if(currentFilter==='deform' || currentFilter==='remolino') drawWarp();
  }
  lastFrame=performance.now();
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
  // El mismo lienzo mostrado: foto y malla pertenecen al mismo resultado del modelo.
  const image=overlay.toDataURL('image/jpeg',.88);
  pendingPhoto={id:crypto.randomUUID(),session_id:SESSION_ID,filtro:currentFilter,image,
    landmarks:$('#save-landmarks').checked && rawPoints ? rawPoints.map(p=>({...p})) : null};
  $('#capture-preview').src=image;$('#download-link').href=image;
  $('#download-link').download='anotherface-'+Date.now()+'.jpg';
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
if(!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let queued=false;
  document.addEventListener('pointermove',event=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{
      document.documentElement.style.setProperty('--mx',event.clientX/innerWidth*100+'%');
      document.documentElement.style.setProperty('--my',event.clientY/innerHeight*100+'%');
      document.documentElement.style.setProperty('--hue',String(160+event.clientX/innerWidth*80));queued=false;
    });
  },{passive:true});
}
