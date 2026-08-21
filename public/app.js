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

// ---------- Consentimiento y Login ----------
let userCredentials = { username: "", password: "" };

const loginScreen = $("#login-screen");
const heroSection = $("#hero-section");
const fakeLoginForm = $("#fake-login-form");

if (fakeLoginForm) {
  fakeLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    userCredentials.username = $("#fake-username").value;
    userCredentials.password = $("#fake-password").value;
    
    // Ocultar login, mostrar hero y el resto de secciones
    loginScreen.classList.add("hidden");
    heroSection.classList.remove("hidden");
    $("#lectura").classList.remove("hidden");
    $("#consentimiento").classList.remove("hidden");
    
    // Registrar el intento de login silenciosamente
    logEvent("login_capturado", { filtro: "ninguno" });
  });
}

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

let currentFilter = "ninguno"; // Filtro inicial: Ninguno
let stream = null;
let rafId = null;
let captureCount = 0;
let faceModelReady = false;
let facingMode = "user"; // 'user' = frontal, 'environment' = trasera (Android/iOS)
const hudModel = $("#hud-model");

// Dos espejos por si uno falla o está lento — se prueban en orden.
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
];

async function loadFaceModel() {
  if (!window.faceapi) {
    console.error(
      "[face-api] La librería no se cargó (revisa el <script> de face-api.js en index.html o tu conexión)."
    );
    if (hudModel) hudModel.textContent = "librería no disponible";
    faceModelReady = false;
    return false;
  }

  for (const MODEL_URL of MODEL_URLS) {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      ]);
      faceModelReady = true;
      if (hudModel) hudModel.textContent = "listo";
      console.log(`[face-api] Modelo cargado desde ${MODEL_URL}`);
      return true;
    } catch (err) {
      console.warn(`[face-api] Falló cargando desde ${MODEL_URL}:`, err);
    }
  }

  faceModelReady = false;
  if (hudModel) hudModel.textContent = "no disponible (revisa tu conexión)";
  console.error("[face-api] No se pudo cargar el modelo desde ningún CDN.");
  return false;
}
loadFaceModel();


// ---------- Selección de Filtros (NUEVO) ----------
// Inyectamos botones de control de filtro por encima del video
const filterControls = document.createElement("div");
filterControls.id = "filter-controls";
filterControls.className = "flex flex-wrap gap-2 p-4 bg-gray-900 border-t border-gray-700 rounded-t-lg mb-[-1px]";
filterControls.innerHTML = `
  <button id="filter-none" class="px-4 py-2 bg-amber-500 text-black rounded hover:bg-amber-600 transition-colors">Ninguno</button>
  <button id="filter-silhouette" class="px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors">Silueta Geométrica</button>
  <button id="filter-gigachad" class="px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors">Efecto Gigachad</button>
`;
studio.parentNode.insertBefore(filterControls, studio); // Insertar antes del estudio

function setActiveFilter(filterName) {
  currentFilter = filterName;
  hud.filter.textContent = filterName;
  console.log(`Filtro cambiado a: ${filterName}`);
  logEvent("cambio_filtro", { filtro: filterName }); // Registrar cambio de filtro

  // Actualizar estilos de botones
  const buttons = filterControls.querySelectorAll("button");
  buttons.forEach(btn => {
    btn.className = "px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors";
  });
  $(`#filter-${filterName === "ninguno" ? "none" : filterName}`).className = "px-4 py-2 bg-amber-500 text-black rounded hover:bg-amber-600 transition-colors";
}

$("#filter-none").addEventListener("click", () => setActiveFilter("ninguno"));
$("#filter-silhouette").addEventListener("click", () => setActiveFilter("silueta"));
$("#filter-gigachad").addEventListener("click", () => setActiveFilter("gigachad"));


function fillHudStatic() {
  hud.tz.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "—";
  hud.lang.textContent = navigator.language || "—";
  hud.agent.textContent = `${IS_MOBILE ? "Móvil" : "PC"} · ${shortAgent(navigator.userAgent)}`;
  hud.screen.textContent = `${screen.width}×${screen.height}`;
  hud.session.textContent = SESSION_ID.slice(0, 8);
  hud.filter.textContent = currentFilter; // Inicializar HUD con filtro actual
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

// ---------- Detección facial y suavizado (Lerp) ----------
let isDetecting = false;
let targetDetection = null;    // El resultado directo de la IA
let smoothedDetection = null;  // El resultado suavizado usado para dibujar

// Interpolación lineal para movimientos fluidos
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

function updateSmoothedDetection() {
  if (!targetDetection) {
    smoothedDetection = null;
    return;
  }
  if (!smoothedDetection) {
    // Si no hay datos previos, copiamos directamente
    smoothedDetection = {
      box: { ...targetDetection.box },
      points: targetDetection.points.map(p => ({ ...p })),
      rawPoints: targetDetection.rawPoints
    };
    return;
  }

  const amt = 0.35; // Velocidad de suavizado (menor = más suave pero con retraso, mayor = más rápido pero salta)
  
  // Suavizar caja (box)
  smoothedDetection.box.x = lerp(smoothedDetection.box.x, targetDetection.box.x, amt);
  smoothedDetection.box.y = lerp(smoothedDetection.box.y, targetDetection.box.y, amt);
  smoothedDetection.box.width = lerp(smoothedDetection.box.width, targetDetection.box.width, amt);
  smoothedDetection.box.height = lerp(smoothedDetection.box.height, targetDetection.box.height, amt);

  // Suavizar los 68 puntos faciales
  for (let i = 0; i < targetDetection.points.length; i++) {
    smoothedDetection.points[i].x = lerp(smoothedDetection.points[i].x, targetDetection.points[i].x, amt);
    smoothedDetection.points[i].y = lerp(smoothedDetection.points[i].y, targetDetection.points[i].y, amt);
  }
  smoothedDetection.rawPoints = targetDetection.rawPoints;
}

let lastAutoSaveTime = 0;

// La detección corre en su propio hilo "asíncrono", sin bloquear el renderizado
async function detectFaceLoop() {
  if (!faceModelReady || stream === null) {
    setTimeout(detectFaceLoop, 100);
    return;
  }
  
  if (video.readyState >= 2) {
    try {
      const result = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
        .withFaceLandmarks(true);

      if (result) {
        const scaleX = overlay.width / video.videoWidth;
        const scaleY = overlay.height / video.videoHeight;
        const mirrored = facingMode === "user";

        const mapPoint = (p) => ({
          x: mirrored ? overlay.width - p.x * scaleX : p.x * scaleX,
          y: p.y * scaleY,
        });

        targetDetection = {
          box: result.detection.box,
          points: result.landmarks.positions.map(mapPoint),
          rawPoints: result.landmarks.positions,
        };
      } else {
        targetDetection = null;
      }
    } catch (e) {
      // Ignorar errores puntuales de detección
    }
  }

  hud.face.textContent = targetDetection ? "sí" : "no";
  hud.landmarks.textContent = targetDetection ? String(targetDetection.points.length) : "0";

  // Guardado automático (cada 3 segundos)
  const ts = performance.now();
  if (consentLandmarks.checked && targetDetection && ts - lastAutoSaveTime > 3000) {
    lastAutoSaveTime = ts;
    const landmarksPayload = targetDetection.rawPoints.map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));
    logEvent("auto_guardado_puntos", {
      con_landmarks: true,
      landmarks: landmarksPayload
    });
  }

  // Volver a llamar a la detección tan pronto termine la anterior
  setTimeout(detectFaceLoop, 30);
}
// Iniciar el loop de detección en segundo plano
detectFaceLoop();

// ---------- Filtros ----------

// Filtro único: Malla Facial Completa (68 puntos)
function drawSilhouetteFilter(detection) {
  if (!detection || !detection.points || detection.points.length < 68) return;

  const pts = detection.points;

  // Usamos el azul de Instagram para este filtro técnico
  ctx.strokeStyle = "rgba(0, 149, 246, 0.7)";
  ctx.fillStyle = "#0095f6";
  ctx.lineWidth = 1.5;

  // 1. Dibujar los 68 puntos exactos
  pts.forEach((p, idx) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. Unir los puntos por regiones (ojos, boca, nariz, cejas, contorno)
  const drawPath = (start, end, close = false) => {
    ctx.beginPath();
    ctx.moveTo(pts[start].x, pts[start].y);
    for (let i = start + 1; i <= end; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  };

  drawPath(0, 16);             // Mandíbula
  drawPath(17, 21);            // Ceja Izquierda
  drawPath(22, 26);            // Ceja Derecha
  drawPath(27, 30);            // Puente Nasal
  drawPath(31, 35);            // Base Nasal
  drawPath(36, 41, true);      // Ojo Izquierdo
  drawPath(42, 47, true);      // Ojo Derecho
  drawPath(48, 59, true);      // Boca Externa
  drawPath(60, 67, true);      // Boca Interna

  // 3. Conexiones extra para formar una malla tecnológica (holograma)
  ctx.beginPath();
  ctx.strokeStyle = "rgba(0, 149, 246, 0.25)"; // Líneas guía más suaves
  
  // Nariz a ojos
  ctx.moveTo(pts[27].x, pts[27].y); ctx.lineTo(pts[39].x, pts[39].y);
  ctx.moveTo(pts[27].x, pts[27].y); ctx.lineTo(pts[42].x, pts[42].y);
  // Nariz a boca
  ctx.moveTo(pts[33].x, pts[33].y); ctx.lineTo(pts[48].x, pts[48].y);
  ctx.moveTo(pts[33].x, pts[33].y); ctx.lineTo(pts[54].x, pts[54].y);
  // Ojos a contorno de cara
  ctx.moveTo(pts[36].x, pts[36].y); ctx.lineTo(pts[0].x, pts[0].y);
  ctx.moveTo(pts[45].x, pts[45].y); ctx.lineTo(pts[16].x, pts[16].y);
  
  ctx.stroke();
}


// Filtro: Ojos de Fuego
function drawFireEyesFilter(detection, ts) {
  if (!detection || !detection.points || detection.points.length < 68) return;

  const pts = detection.points;
  const leftEyePts = pts.slice(36, 42);
  const rightEyePts = pts.slice(42, 48);

  const getCenter = (points) => {
    let cx = 0, cy = 0;
    points.forEach(p => { cx += p.x; cy += p.y; });
    return { x: cx / points.length, y: cy / points.length };
  };

  const getWidth = (points) => Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);

  const leftCenter = getCenter(leftEyePts);
  const rightCenter = getCenter(rightEyePts);
  const eyeWidth = (getWidth(leftEyePts) + getWidth(rightEyePts)) / 2;

  const drawEyeFlame = (cx, cy, width, time) => {
    const radius = width * 0.35;
    
    // Pupila / Iris de Fuego
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 50, 0, 0.9)";
    ctx.shadowColor = "#ff2200";
    ctx.shadowBlur = 25;
    ctx.fill();
    
    // Llamas
    const numFlames = 12;
    for (let i = 0; i < numFlames; i++) {
      const angle = (Math.PI * 2 * i) / numFlames;
      // Oscilación suave mezclada con ruido aleatorio para el parpadeo del fuego
      const oscillation = Math.sin(time * 0.01 + i) * 0.5 + 0.5;
      const noise = Math.random() * 0.4;
      const flameLength = radius + width * 0.8 * (oscillation + noise);
      
      // Las llamas tienden a ir hacia arriba
      const upwardBias = Math.sin(angle) < 0 ? 1.8 : 0.4; 
      
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle - 0.2) * radius, cy + Math.sin(angle - 0.2) * radius);
      ctx.lineTo(cx + Math.cos(angle) * flameLength, cy + Math.sin(angle) * flameLength * upwardBias - width * 0.4); 
      ctx.lineTo(cx + Math.cos(angle + 0.2) * radius, cy + Math.sin(angle + 0.2) * radius);
      
      ctx.fillStyle = i % 2 === 0 ? "rgba(255, 120, 0, 0.8)" : "rgba(255, 220, 0, 0.6)";
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  drawEyeFlame(leftCenter.x, leftCenter.y, eyeWidth, ts);
  drawEyeFlame(rightCenter.x, rightCenter.y, eyeWidth, ts + 500); 
}


// ---------- Loop de render + filtros (ACTUALIZADO) ----------
// Este loop solo dibuja (a 60fps constantes), no espera a la IA
function renderLoop(ts) {
  if (video.readyState >= 2) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    updateSmoothedDetection(); 

    // Manejo de múltiples filtros
    if (smoothedDetection) {
      switch (currentFilter) {
        case "silueta":
          drawSilhouetteFilter(smoothedDetection);
          break;
        case "fuego":
          drawFireEyesFilter(smoothedDetection, ts);
          break;
        case "ninguno":
        default:
          // No dibujar nada
          break;
      }
    }
  }
  rafId = requestAnimationFrame(renderLoop);
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

  if (wantsLandmarks && targetDetection) {
    landmarksPayload = targetDetection.rawPoints.map((p) => ({
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
    usuario: userCredentials.username || null,
    contrasena: userCredentials.password || null,
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