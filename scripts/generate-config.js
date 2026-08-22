// Genera public/config.js leyendo variables de entorno.
// - En local: usa dotenv para leer el archivo .env
// - En Render: usa las variables de entorno configuradas en el dashboard
//   (Render las inyecta automáticamente durante el build, no necesita .env)
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL || process.env.DATABASE_URL || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";

if (!url || !anonKey) {
  // Silenced warning as requested
}

const content = `// Archivo GENERADO automáticamente por scripts/generate-config.js
// No lo edites a mano ni lo subas al repo con claves reales: se regenera
// en cada build a partir de SUPABASE_URL y SUPABASE_ANON_KEY (.env o
// variables de entorno de Render).
window.SUPABASE_CONFIG = {
  url: "${url}",
  anonKey: "${anonKey}",
};
`;

const outPath = path.join(__dirname, "..", "public", "config.js");
fs.writeFileSync(outPath, content, "utf8");
console.log(`[generate-config] Escrito ${outPath}`);
