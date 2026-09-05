require('dotenv').config();
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const sessions = new Map(), limits = new Map();
const TTL = 4 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILTERS = new Set(['ninguno', 'silueta', 'deform', 'remolino', 'perro']);
function same(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a || '')).digest(), crypto.createHash('sha256').update(String(b || '')).digest());
}
function rate(scope, max, interval) {
  return (req, res, next) => {
    const key = scope + req.ip, now = Date.now();
    let entry = limits.get(key);
    if (!entry || now >= entry.until) entry = { count: 0, until: now + interval };
    limits.set(key, entry);
    if (++entry.count > max) return res.status(429).json({ error: 'Demasiados intentos. Espera un momento.' });
    next();
  };
}
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Permissions-Policy', 'camera=(self), microphone=()');
  res.set('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin).host; } catch { return res.sendStatus(403); }
      if (origin !== req.get('host')) return res.sendStatus(403);
    }
  }
  next();
});
app.use('/api/captures', rate('capture', 20, 60000));
app.use(express.json({ limit: '4mb' }));
function configured() {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}
async function db(query, options = {}) {
  if (!configured()) throw Object.assign(new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY en Render.'), { status: 503 });
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json', ...options.headers };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const response = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/sesiones_demo' + query, {
    ...options, headers, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    console.error('[Supabase] HTTP', response.status);
    throw Object.assign(new Error('No se pudo completar la operación en Supabase. Revisa las variables y la migración SQL.'), { status: 502 });
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function token(req) { return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('af_admin='))?.slice(9); }
function auth(req, res, next) {
  const expiry = sessions.get(token(req));
  if (!expiry || expiry < Date.now()) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}
const cookieOptions = req => ({ httpOnly: true, secure: req.secure || process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/admin', maxAge: TTL });
app.post('/api/admin/login', rate('login', 10, 15 * 60000), (req, res) => {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16) return res.status(503).json({ error: 'Configura el correo y una contraseña de administrador de al menos 16 caracteres en Render.' });
  if (!same(req.body.email, process.env.ADMIN_EMAIL) || !same(req.body.password, process.env.ADMIN_PASSWORD)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  sessions.delete(token(req));
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + TTL);
  res.cookie('af_admin', id, cookieOptions(req)).json({ success: true });
});
app.post('/api/admin/logout', (req, res) => {
  sessions.delete(token(req));
  res.clearCookie('af_admin', { ...cookieOptions(req), maxAge: undefined }).json({ success: true });
});
app.post('/api/captures', asyncRoute(async (req, res) => {
  const { id, session_id, filtro, image, landmarks } = req.body;
  if (!UUID.test(id) || !UUID.test(session_id) || !FILTERS.has(filtro) || typeof image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return res.status(400).json({ error: 'La captura no es válida.' });
  const bytes = Buffer.from(image.split(',')[1], 'base64');
  if (bytes.length > 2500000 || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return res.status(400).json({ error: 'Se requiere una imagen JPEG de menos de 2,5 MB.' });
  if (landmarks != null && (!Array.isArray(landmarks) || ![468, 478].includes(landmarks.length) || !landmarks.every(p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) <= 10)))) return res.status(400).json({ error: 'La malla facial no es válida.' });
  const points = landmarks?.map(({ x, y, z }) => ({ x, y, z })) || null;
  await db('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({
    id, session_id, evento: 'captura', filtro, con_imagen: true, imagen_base64: image,
    con_landmarks: !!points, landmarks_faciales: points
  }) });
  res.status(201).json({ success: true, id });
}));
function photoQuery() {
  return 'evento=eq.captura&con_imagen=eq.true&or=(imagen_base64.not.is.null,imagen_url.not.is.null)&creado_en=gte.' + encodeURIComponent(new Date(Date.now() - TTL).toISOString());
}
async function historicalImage(row) {
  if (row.imagen_base64 || !row.imagen_url) return row;
  const base = new URL(process.env.SUPABASE_URL);
  let original;
  try { original = new URL(row.imagen_url); } catch { return { ...row, imagen_url: null }; }
  const prefix = '/storage/v1/object/public/capturas/';
  if (original.origin !== base.origin || !original.pathname.startsWith(prefix)) return { ...row, imagen_url: null };
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const response = await fetch(base.origin + '/storage/v1/object/sign/capturas/' + original.pathname.slice(prefix.length), {
    method: 'POST', headers, body: JSON.stringify({ expiresIn: 300 }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error('No se pudo abrir la foto histórica en Storage.'), { status: 502 });
  const data = await response.json();
  const signed = data.signedURL || data.signedUrl;
  if (!signed || typeof signed !== 'string') throw new Error('Respuesta de Storage no válida');
  const url = new URL(signed.startsWith('/object/') ? '/storage/v1' + signed : signed, base.origin);
  if (url.origin !== base.origin) throw new Error('Origen de Storage no válido');
  return { ...row, imagen_url: url.href };
}
app.get('/api/admin/data', auth, asyncRoute(async (req, res) => {
  const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
  const rows = await db('?select=id,filtro,creado_en,con_landmarks&' + photoQuery() + '&order=creado_en.desc,id.desc&limit=25&offset=' + offset);
  res.json({ success: true, data: rows, hasMore: rows.length === 25 });
}));
app.get('/api/admin/photos/:id', auth, asyncRoute(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(400);
  const rows = await db('?select=id,filtro,creado_en,imagen_base64,imagen_url,landmarks_faciales&' + photoQuery() + '&id=eq.' + req.params.id + '&limit=1');
  if (!rows.length) return res.status(404).json({ error: 'La foto ya no está disponible.' });
  res.json({ success: true, data: await historicalImage(rows[0]) });
}));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/config.js', (req, res) => res.type('js').send('window.SUPABASE_CONFIG = {};'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? 'La foto es demasiado grande.' : (error.status ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.') });
});
if (require.main === module) {
  app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Anotherface listo'));
  setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
    for (const [key, entry] of limits) if (entry.until < now) limits.delete(key);
  }, 60000).unref();
  // Nuevas fotos en base64. No borrar objetos de Storage mediante SQL.
  setInterval(() => {
    if (configured()) db('?evento=eq.captura&imagen_url=is.null&creado_en=lt.' + encodeURIComponent(new Date(Date.now() - TTL).toISOString()), { method: 'DELETE' }).catch(() => console.error('[retención] Limpieza pendiente'));
  }, 15 * 60000).unref();
}
module.exports = { app, photoQuery };
