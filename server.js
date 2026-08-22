require("dotenv").config(); // Lee .env localmente; en Render usa el panel de Environment

const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL      = process.env.SUPABASE_URL      || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// Diagnóstico en arranque
console.log("=== ANOTHERFACE CONFIG ===");
console.log(`SUPABASE_URL:      ${SUPABASE_URL      ? "✓ configurada" : "✗ FALTA"}`);
console.log(`SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? "✓ configurada" : "✗ FALTA"}`);
console.log(`DATABASE_URL:      ${process.env.DATABASE_URL ? "✓ configurada" : "✗ no configurada"}`);
console.log("==========================");

const { Pool } = require("pg");
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Tarea de limpieza: cada hora, borrar datos con más de 4 horas de antigüedad
  setInterval(async () => {
    try {
      console.log("[cleanup] Ejecutando limpieza de datos > 4 horas...");
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM public.sesiones_demo WHERE creado_en < NOW() - INTERVAL '4 hours'");
        // Intentar borrar de storage.objects si tenemos permiso
        await client.query("DELETE FROM storage.objects WHERE bucket_id = 'capturas' AND created_at < NOW() - INTERVAL '4 hours'");
        console.log("[cleanup] Limpieza completada exitosamente.");
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("[cleanup] Error en limpieza:", e.message);
    }
  }, 1000 * 60 * 60); // 1 hora
}

// Middleware para parsear JSON (necesario para el login de admin)
app.use(express.json());

// ─── ADMIN API ─────────────────────────────────────────
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (email === "admin@admin.com" && password === "admin") {
    res.json({ success: true, token: "admin-token-123" });
  } else {
    res.status(401).json({ success: false, error: "Credenciales inválidas" });
  }
});

app.get("/api/admin/data", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== "Bearer admin-token-123") {
    return res.status(403).json({ error: "No autorizado" });
  }
  if (!pool) {
    return res.status(500).json({ error: "Base de datos no configurada (DATABASE_URL falta)" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, session_id, evento, usuario, contrasena, filtro, con_imagen, imagen_url, navegador, creado_en FROM public.sesiones_demo ORDER BY creado_en DESC"
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("[admin API error]", error);
    res.status(500).json({ error: "Error consultando la base de datos" });
  }
});

// ─── RUTA CRÍTICA: config.js dinámico ─────────────────────────────────────────
// Se sirve ANTES del middleware de archivos estáticos para que tenga prioridad
// sobre el config.js estático que pudiera existir en /public.
// Esto garantiza que las keys de Supabase siempre vengan de process.env,
// tanto en local (vía .env) como en Render (vía el panel de Environment).
app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(
    `// Config generada dinámicamente por el servidor — no editar a mano.\n` +
    `window.SUPABASE_CONFIG = {\n` +
    `  url:     "${SUPABASE_URL}",\n` +
    `  anonKey: "${SUPABASE_ANON_KEY}",\n` +
    `};\n`
  );
});

// ─── Archivos estáticos (public/) ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ANOTHERFACE corriendo en el puerto ${PORT}`);
});
