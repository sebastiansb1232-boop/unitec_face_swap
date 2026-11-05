// Ruta de compatibilidad. Ya no se generan claves en archivos públicos.
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'window.SUPABASE_CONFIG = {};\n');
console.log('Configuración pública sin credenciales generada.');
