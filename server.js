// Servidor estático mínimo. Solo es necesario si despliegas esto en Render
// como "Web Service" en vez de "Static Site". Para "Static Site" no
// necesitas este archivo en absoluto: Render sirve /public directamente.
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`PANÓPTICO corriendo en el puerto ${PORT}`);
});
