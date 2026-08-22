// Genera public/config.js leyendo variables de entorno.
// - En local: usa dotenv para leer el archivo .env
// - En Render: usa las variables de entorno configuradas en el dashboard
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const url     = process.env.SUPABASE_URL     || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
// DATABASE_URL es usada por el servidor/Supabase internamente;
// no se expone al cliente pero confirmamos que está configurada.
const dbUrl   = process.env.DATABASE_URL      || "";

if (!url || !anonKey) {
  console.warn(
    "[generate-config] Aviso: SUPABASE_URL o SUPABASE_ANON_KEY no definidas. " +
    "Edita tu archivo .env con los valores reales."
  );
}
if (dbUrl) {
  console.log("[generate-config] DATABASE_URL detectada correctamente.");
}

const content = `// Archivo GENERADO automáticamente — no editar a mano.
window.SUPABASE_CONFIG = {
  url: "${url}",
  anonKey: "${anonKey}",
};
`;

const outPath = path.join(__dirname, "..", "public", "config.js");
fs.writeFileSync(outPath, content, "utf8");
console.log(`[generate-config] Escrito ${outPath}`);
