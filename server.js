require("dotenv").config(); // Lee .env localmente; en Render lo inyecta el panel automáticamente
const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ANOTHERFACE corriendo en el puerto ${PORT}`);
});
