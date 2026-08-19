/* ============================================================
   PANÓPTICO — demo educativa UNITEC
   Cámara (PC y Android) + filtros que siguen el rostro +
   registro (opcional, por capas) en Supabase.
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

// ---------- Reloj del header ----------
function tickClock() {
  const el = $("#clock");
  if (el) el.textContent = new Date().toLocaleTimeString("es-PE", { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

// ---------- Supabase ----------
let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !window.SUPABASE_CONFIG) return null;
  const { url, anonKey } = window.SUPABASE_CONFIG;
  if (!url || !anonKey) return null; // config.js no generado / vacío todavía
  supabaseClient = window.supabase.createClient(url, anonKey);
  return supabaseClient;
}

// ---------- Consentimiento ----------
const consentCamera = $("#consent-camera");
const consentMeta = $("#consent-metadata");
const consentSnapshot = $("#consent-snapshot");
const consentLandmarks = $("#consent-landmarks");
const startBtn = $("#start-camera");
const consentHint = $("#consent-hint");

function refreshConsentState() {
  const ok = consentCamera.checked && consentMeta.checked;
  startBtn.disabled = !ok;
  consentHint.textContent = ok
    ? "Listo. Al activar la cámara podrás elegir un filtro."
    : "Marca al menos las dos primeras casillas para continuar.";
}
[consentCamera, consentMeta, consentSnapshot, consentLandmarks].forEach((el) =>
  el.addEventListener("change", refreshConsentState)
);
refreshConsentState();

// ---------- Estado de cámara / filtros ----------
const video = $("#video");
const overlay = $("#overlay");
const ctx = overlay.getContext("2d");
const studio = $("#estudio");
const statusEl = $("#studio-status");
const hud = {
  time: $("#hud-time"),
  tz: $("#hud-tz"),
  lang: $("#hud-lang"),
  agent: $("#hud-agent"),
  screen: $("#hud-screen"),
  session: $("#hud-session"),
  filter: $("#hud-filter"),
  face: $("#hud-face"),
  landmarks: $("#hud-landmarks"),
  count: $("#hud-count"),
};

let currentFilter = "ninguno";
let stream = null;
let rafId = null;
let captureCount = 0;
let faceModelReady = false;
let facingMode = "user"; // 'user' = frontal, 'environment' = trasera (Android/iOS)
let lastDetection = null; // { box, points, rawPoints }

async function loadFaceModel() {
  try {
    if (!window.faceapi) return false;
    const MODEL_URL =
      "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    ]);
    faceModelReady = true;
    return true;
  } catch (err) {
    console.warn("No se pudo cargar el modelo de detección facial:", err);
    faceModelReady = false;
    return false;
  }
}
loadFaceModel();

function fillHudStatic() {
  hud.tz.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "—";
  hud.lang.textContent = navigator.language || "—";
  hud.agent.textContent = `${IS_MOBILE ? "Móvil" : "PC"} · ${shortAgent(navigator.userAgent)}`;
  hud.screen.textContent = `${screen.width}×${screen.height}`;
  hud.session.textContent = SESSION_ID.slice(0, 8);
}

function shortAgent(ua) {
  const match = ua.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/);
  return match ? match[0] : "navegador desconocido";
}

function tickHudTime() {
  hud.time.textContent = new Date().toLocaleTimeString("es-PE");
}
setInterval(tickHudTime, 1000);

// ---------- Iniciar / cambiar cámara ----------
async function openCamera(mode) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  const constraints = {
    video: {
      width: { ideal: IS_MOBILE ? 480 : 640 },
      height: { ideal: IS_MOBILE ? 640 : 480 },
      facingMode: { ideal: mode },
    },
    audio: false,
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  video.style.transform = mode === "user" ? "scaleX(-1)" : "scaleX(1)";
  resizeCanvas();
}

startBtn.addEventListener("click", async () => {
  try {
    await openCamera(facingMode);
    studio.classList.remove("hidden");
    studio.scrollIntoView({ behavior: "smooth", block: "start" });

    fillHudStatic();
    window.addEventListener("resize", resizeCanvas);
    renderLoop();

    logEvent("camara_activada");
  } catch (err) {
    consentHint.textContent =
      "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
    console.error(err);
  }
});

$("#switch-camera-btn").addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  statusEl.textContent = `Cambiando a cámara ${facingMode === "user" ? "frontal" : "trasera"}...`;
  try {
    await openCamera(facingMode);
    statusEl.textContent = `Usando cámara ${facingMode === "user" ? "frontal" : "trasera"}.`;
  } catch (err) {
    statusEl.textContent = "Este dispositivo no tiene esa cámara disponible.";
    facingMode = facingMode === "user" ? "environment" : "user"; // revertir
  }
});

function resizeCanvas() {
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
}

$("#stop-btn").addEventListener("click", () => {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  cancelAnimationFrame(rafId);
  studio.classList.add("hidden");
  statusEl.textContent = "Cámara apagada.";
  logEvent("camara_apagada");
});

// ---------- Selección de filtro ----------
document.querySelectorAll(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    hud.filter.textContent = currentFilter;
  });
});

// ---------- Detección facial (compartida por todos los filtros) ----------
let lastDetectTime = 0;

async function detectFace(ts) {
  if (!faceModelReady) return;
  if (lastDetectTime && ts - lastDetectTime < 120) return; // ~8 fps de detección
  lastDetectTime = ts;
  try {
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
      .withFaceLandmarks(true); // true = usa el modelo "tiny" de landmarks

    if (result) {
      const scaleX = overlay.width / video.videoWidth;
      const scaleY = overlay.height / video.videoHeight;
      const mirrored = facingMode === "user";

      const mapPoint = (p) => ({
        x: mirrored ? overlay.width - p.x * scaleX : p.x * scaleX,
        y: p.y * scaleY,
      });

      lastDetection = {
        box: result.detection.box,
        points: result.landmarks.positions.map(mapPoint),
        rawPoints: result.landmarks.positions, // coords originales del video, para Supabase
      };
    } else {
      lastDetection = null;
    }
  } catch (e) {
    /* seguimos con la última detección conocida este frame */
  }

  hud.face.textContent = lastDetection ? "sí" : "no";
  hud.landmarks.textContent = lastDetection ? String(lastDetection.points.length) : "0";
}

// ---------- Loop de render + filtros ----------
async function renderLoop(ts) {
  if (video.readyState >= 2) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (faceModelReady && currentFilter !== "ninguno") {
      await detectFace(ts || performance.now());
    }

    if (currentFilter === "mascara") {
      drawMaskFilter(lastDetection);
    } else if (currentFilter === "cyberpunk") {
      drawCyberpunkFilter(lastDetection);
    } else if (currentFilter === "visor") {
      drawVisorFilter(lastDetection);
    } else if (currentFilter === "alerta") {
      drawAlertFilter(lastDetection);
    }
  }
  rafId = requestAnimationFrame(renderLoop);
}

function scaledBox(box) {
  if (!box) return null;
  const scaleX = overlay.width / video.videoWidth;
  const scaleY = overlay.height / video.videoHeight;
  const mirrored = facingMode === "user";
  const x = mirrored ? overlay.width - (box.x + box.width) * scaleX : box.x * scaleX;
  return { x, y: box.y * scaleY, w: box.width * scaleX, h: box.height * scaleY };
}

// Filtro 1: visor táctico — la retícula persigue el rostro detectado
function drawVisorFilter(detection) {
  const w = overlay.width, h = overlay.height;
  const b = detection ? scaledBox(detection.box) : null;
  const rx = b ? b.x : w * 0.28;
  const ry = b ? b.y : h * 0.18;
  const rw = b ? b.w : w * 0.44;
  const rh = b ? b.h : h * 0.64;

  ctx.strokeStyle = "rgba(255,176,0,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rx + rw / 2, 0); ctx.lineTo(rx + rw / 2, h);
  ctx.moveTo(0, ry + rh / 2); ctx.lineTo(w, ry + rh / 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,176,0,0.85)";
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillStyle = "rgba(255,176,0,0.9)";
  ctx.fillText(detection ? "RASTREANDO ROSTRO" : "BUSCANDO SUJETO...", rx, Math.max(14, ry - 8));
  ctx.fillText(`CONF: ${(70 + Math.sin(Date.now() / 400) * 20).toFixed(1)}%`, rx, ry + rh + 16);
}

// Filtro 2: cyberpunk — glitch general + marco que resalta si hay rostro
function drawCyberpunkFilter(detection) {
  const w = overlay.width, h = overlay.height;
  ctx.fillStyle = "rgba(255,0,150,0.06)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    if (Math.random() > 0.85) {
      const y = Math.random() * h;
      ctx.fillStyle = `rgba(0,255,255,${0.15 + Math.random() * 0.2})`;
      ctx.fillRect(0, y, w, 3 + Math.random() * 6);
    }
  }
  const b = detection ? scaledBox(detection.box) : null;
  if (b) {
    ctx.strokeStyle = "rgba(0,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.strokeStyle = "rgba(0,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, w - 8, h - 8);
}

// Filtro 3: alerta roja — mensaje de concientización + marco sobre el rostro
function drawAlertFilter(detection) {
  const w = overlay.width, h = overlay.height;
  ctx.fillStyle = "rgba(255,59,48,0.12)";
  ctx.fillRect(0, 0, w, h);
  const b = detection ? scaledBox(detection.box) : null;
  if (b) {
    ctx.strokeStyle = "rgba(255,59,48,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.strokeStyle = "rgba(255,59,48,0.7)";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, w, h);
  ctx.font = "bold 13px IBM Plex Mono, monospace";
  ctx.fillStyle = "#ff3b30";
  ctx.textAlign = "center";
  ctx.fillText("ESTA IMAGEN PODRÍA ESTAR SALIENDO DE TU DISPOSITIVO", w / 2, h - 18);
  ctx.textAlign = "left";
}

// Filtro 4: "face swap" — máscara dibujada y orientada con los landmarks reales
function drawMaskFilter(detection) {
  const w = overlay.width, h = overlay.height;

  if (!detection) {
    drawFaceShape(w / 2, h / 2.3, Math.min(w, h) * 0.25, 0, false);
    return;
  }

  const pts = detection.points; // 68 puntos ya escalados/espejados a coords del canvas
  // índices del modelo de 68 puntos: ojo izq 36-41, ojo der 42-47, mandíbula 0-16
  const leftEye = avgPoint(pts.slice(36, 42));
  const rightEye = avgPoint(pts.slice(42, 48));
  const jawLeft = pts[0];
  const jawRight = pts[16];

  const cx = (leftEye.x + rightEye.x) / 2;
  const cy =
    (leftEye.y + rightEye.y) / 2 +
    Math.hypot(jawRight.x - jawLeft.x, jawRight.y - jawLeft.y) * 0.18;
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const size = Math.hypot(jawRight.x - jawLeft.x, jawRight.y - jawLeft.y) * 0.62;

  drawFaceShape(cx, cy, size, angle, true);
}

function avgPoint(list) {
  const x = list.reduce((s, p) => s + p.x, 0) / list.length;
  const y = list.reduce((s, p) => s + p.y, 0) / list.length;
  return { x, y };
}

function drawFaceShape(cx, cy, r, angle, tracked) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.fillStyle = "#ffd58a";
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#161200";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.15, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.35, -r * 0.15, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#161200";
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.4); ctx.lineTo(-r * 0.2, -r * 0.45);
  ctx.moveTo(r * 0.5, -r * 0.4); ctx.lineTo(r * 0.2, -r * 0.45);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, r * 0.2, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.restore();

  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.fillStyle = "rgba(255,176,0,0.9)";
  ctx.fillText(
    tracked ? "rostro rastreado (68 puntos)" : "sin detección — máscara centrada",
    cx - r,
    cy + r * 1.5
  );
}

// ---------- Captura + registro ----------
$("#capture-btn").addEventListener("click", async () => {
  captureCount += 1;
  hud.count.textContent = String(captureCount);

  const wantsImage = consentSnapshot.checked;
  const wantsLandmarks = consentLandmarks.checked;
  let imageBase64 = null;
  let landmarksPayload = null;

  if (wantsImage) {
    const off = document.createElement("canvas");
    off.width = video.videoWidth;
    off.height = video.videoHeight;
    const octx = off.getContext("2d");
    if (facingMode === "user") {
      octx.translate(off.width, 0);
      octx.scale(-1, 1);
    }
    octx.drawImage(video, 0, 0, off.width, off.height);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.drawImage(overlay, 0, 0, off.width, off.height);
    imageBase64 = off.toDataURL("image/jpeg", 0.8);
  }

  if (wantsLandmarks && lastDetection) {
    landmarksPayload = lastDetection.rawPoints.map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));
  }

  await logEvent("captura", {
    filtro: currentFilter,
    con_imagen: wantsImage,
    imageBase64,
    con_landmarks: wantsLandmarks && !!landmarksPayload,
    landmarks: landmarksPayload,
  });
});

async function logEvent(evento, extra = {}) {
  statusEl.textContent = "Guardando registro...";
  const client = getSupabase();

  const payload = {
    session_id: SESSION_ID,
    evento,
    filtro: extra.filtro || currentFilter,
    con_imagen: !!extra.con_imagen,
    imagen_base64: extra.imageBase64 || null,
    con_landmarks: !!extra.con_landmarks,
    landmarks_faciales: extra.landmarks || null,
    navegador: `${IS_MOBILE ? "Móvil" : "PC"} · ${shortAgent(navigator.userAgent)}`,
    idioma: navigator.language,
    zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    resolucion_pantalla: `${screen.width}x${screen.height}`,
    creado_en: new Date().toISOString(),
  };

  if (!client) {
    statusEl.textContent =
      "Supabase no está configurado todavía (ver README, sección .env). Registro solo local.";
    console.log("[demo local, sin Supabase]", {
      ...payload,
      imagen_base64: payload.imagen_base64 ? "(imagen omitida en consola)" : null,
    });
    return;
  }

  const { error } = await client.from("sesiones_demo").insert(payload);
  if (error) {
    statusEl.textContent = "No se pudo guardar en Supabase: " + error.message;
    console.error(error);
  } else {
    statusEl.textContent = `Registrado (${evento}) a las ${new Date().toLocaleTimeString("es-PE")}.`;
  }
}
