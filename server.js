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
console.log(`DATABASE_URL:      ${process.env.DATABASE_URL ? "✓ configurada" : "✗ no configurada (opcional para el frontend)"}`);
console.log("==========================");

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
