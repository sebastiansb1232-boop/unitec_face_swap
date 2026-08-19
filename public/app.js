/* ============================================================
   PANÓPTICO — demo educativa UNITEC
   Cámara + filtros + registro (opcional) en Supabase.
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
  if (!url || url.includes("TU-PROYECTO")) return null; // no configurado todavía
  supabaseClient = window.supabase.createClient(url, anonKey);
  return supabaseClient;
}

// ---------- Consentimiento ----------
const consentCamera = $("#consent-camera");
const consentMeta = $("#consent-metadata");
const consentSnapshot = $("#consent-snapshot");
const startBtn = $("#start-camera");
const consentHint = $("#consent-hint");

function refreshConsentState() {
  const ok = consentCamera.checked && consentMeta.checked;
  startBtn.disabled = !ok;
  consentHint.textContent = ok
    ? "Listo. Al activar la cámara podrás elegir un filtro."
    : "Marca al menos las dos primeras casillas para continuar.";
}
[consentCamera, consentMeta, consentSnapshot].forEach((el) =>
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
  count: $("#hud-count"),
};

let currentFilter = "ninguno";
let stream = null;
let rafId = null;
let captureCount = 0;
let faceModelReady = false;

async function loadFaceModel() {
  try {
    const MODEL_URL =
      "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
    if (!window.faceapi) return false;
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
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
  hud.agent.textContent = `${navigator.platform || "?"} · ${shortAgent(navigator.userAgent)}`;
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

// ---------- Iniciar cámara ----------
startBtn.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    studio.classList.remove("hidden");
    studio.scrollIntoView({ behavior: "smooth", block: "start" });

    fillHudStatic();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    renderLoop();

    logEvent("camara_activada");
  } catch (err) {
    consentHint.textContent =
      "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
    console.error(err);
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

// ---------- Loop de render + filtros ----------
let lastDetectTime = 0;
let lastBox = null;

async function renderLoop(ts) {
  if (video.readyState >= 2) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (currentFilter === "mascara" && faceModelReady) {
      if (!lastDetectTime || ts - lastDetectTime > 150) {
        lastDetectTime = ts;
        try {
          const det = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })
          );
          lastBox = det ? det.box : null;
        } catch (e) {
          /* silencioso: seguimos sin landmarks este frame */
        }
      }
      drawMaskFilter(lastBox);
    } else if (currentFilter === "cyberpunk") {
      drawCyberpunkFilter();
    } else if (currentFilter === "visor") {
      drawVisorFilter();
    } else if (currentFilter === "alerta") {
      drawAlertFilter();
    } else if (currentFilter === "mascara" && !faceModelReady) {
      drawMaskFilter(null); // fallback centrado si el modelo no cargó
    }
  }
  rafId = requestAnimationFrame(renderLoop);
}

// Filtro 1: visor táctico (retícula + esquinas + datos falsos de "análisis")
function drawVisorFilter() {
  const w = overlay.width, h = overlay.height;
  ctx.strokeStyle = "rgba(255,176,0,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.strokeRect(w * 0.28, h * 0.18, w * 0.44, h * 0.64);
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillStyle = "rgba(255,176,0,0.85)";
  ctx.fillText("ANALIZANDO SUJETO...", w * 0.28, h * 0.16);
  ctx.fillText(`CONF: ${(70 + Math.sin(Date.now() / 400) * 20).toFixed(1)}%`, w * 0.28, h * 0.85);
}

// Filtro 2: cyberpunk (glitch de barras + tinte)
function drawCyberpunkFilter() {
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
  ctx.strokeStyle = "rgba(0,255,255,0.4)";
  ctx.strokeRect(4, 4, w - 8, h - 8);
}

// Filtro 3: alerta roja (mensaje de concientización superpuesto)
function drawAlertFilter() {
  const w = overlay.width, h = overlay.height;
  ctx.fillStyle = "rgba(255,59,48,0.12)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,59,48,0.7)";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, w, h);
  ctx.font = "bold 14px IBM Plex Mono, monospace";
  ctx.fillStyle = "#ff3b30";
  ctx.textAlign = "center";
  ctx.fillText("ESTA IMAGEN PODRÍA ESTAR SALIENDO DE TU DISPOSITIVO", w / 2, h - 18);
  ctx.textAlign = "left";
}

// Filtro 4: "face swap" ligero — máscara dibujada sobre el rostro detectado
function drawMaskFilter(box) {
  const w = overlay.width, h = overlay.height;
  let cx, cy, size;
  if (box) {
    const scaleX = w / video.videoWidth;
    const scaleY = h / video.videoHeight;
    // el video está espejado (scaleX(-1)) así que invertimos X
    cx = w - (box.x + box.width / 2) * scaleX;
    cy = (box.y + box.height / 2) * scaleY;
    size = Math.max(box.width * scaleX, box.height * scaleY);
  } else {
    cx = w / 2; cy = h / 2.3; size = Math.min(w, h) * 0.5;
  }

  const r = size / 2;
  // cara base
  ctx.fillStyle = "#ffd58a";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.95, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  // ojos
  ctx.fillStyle = "#161200";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.15, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + r * 0.35, cy - r * 0.15, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // cejas
  ctx.strokeStyle = "#161200";
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy - r * 0.4); ctx.lineTo(cx - r * 0.2, cy - r * 0.45);
  ctx.moveTo(cx + r * 0.5, cy - r * 0.4); ctx.lineTo(cx + r * 0.2, cy - r * 0.45);
  ctx.stroke();
  // sonrisa
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.2, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // etiqueta
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.fillStyle = "rgba(255,176,0,0.9)";
  ctx.fillText(box ? "rostro rastreado" : "sin detección — máscara centrada", cx - r, cy + r * 1.35);
}

// ---------- Captura + registro ----------
$("#capture-btn").addEventListener("click", async () => {
  captureCount += 1;
  hud.count.textContent = String(captureCount);

  const wantsImage = consentSnapshot.checked;
  let imageBase64 = null;

  if (wantsImage) {
    const off = document.createElement("canvas");
    off.width = video.videoWidth;
    off.height = video.videoHeight;
    const octx = off.getContext("2d");
    octx.translate(off.width, 0);
    octx.scale(-1, 1);
    octx.drawImage(video, 0, 0, off.width, off.height);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.drawImage(overlay, 0, 0, off.width, off.height);
    imageBase64 = off.toDataURL("image/jpeg", 0.8);
  }

  await logEvent("captura", { filtro: currentFilter, con_imagen: wantsImage, imageBase64 });
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
    navegador: shortAgent(navigator.userAgent),
    idioma: navigator.language,
    zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    resolucion_pantalla: `${screen.width}x${screen.height}`,
    creado_en: new Date().toISOString(),
  };

  if (!client) {
    statusEl.textContent =
      "Supabase no está configurado (config.js). Registro solo local: " + JSON.stringify({ ...payload, imagen_base64: payload.imagen_base64 ? "(imagen omitida en consola)" : null });
    console.log("[demo local, sin Supabase]", payload);
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
