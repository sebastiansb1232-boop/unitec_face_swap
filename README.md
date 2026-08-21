# ANOTHERFACE — demo educativa (UNITEC)

Página web que pide acceso a la cámara (funciona igual en **PC y Android**,
diseño responsive), aplica filtros en vivo que **siguen tu rostro** usando
detección de landmarks faciales, y, con consentimiento explícito por capas,
guarda un registro de la sesión en Supabase — incluyendo, si el usuario lo
acepta, los puntos faciales detectados. El objetivo es **mostrar en vivo**
qué tipo de datos puede recolectar una página con solo pedir permiso de
cámara, para concientizar sobre seguridad y privacidad web.

## Estructura del proyecto

```
unitec-privacidad/
├── public/
│   ├── index.html        # página completa (consentimiento + cámara + HUD)
│   ├── styles.css          # estética "HUD de vigilancia" + fondo animado
│   ├── config.js             # GENERADO por scripts/generate-config.js — no editar a mano
│   └── app.js                 # cámara, detección de rostro, filtros y guardado
├── supabase/
│   └── schema.sql               # tabla + Row Level Security para Supabase
├── scripts/
│   └── generate-config.js         # lee .env / variables de Render y escribe public/config.js
├── server.js                        # servidor Express opcional (solo si usas "Web Service")
├── package.json
├── render.yaml                        # configuración lista para Render (Static Site)
├── .env.example                         # plantilla de variables de entorno
└── .gitignore
```

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`.
   Esto crea la tabla `sesiones_demo` con Row Level Security activado
   (solo permite `insert` desde el navegador, no `select` — así nadie
   puede leer las capturas de otras personas usando la clave pública).
   La tabla incluye una columna `landmarks_faciales` (tipo `jsonb`) para
   guardar los puntos del rostro cuando el usuario da ese consentimiento.
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`

## 2. El archivo `.env` (importante — léelo con calma)

Este proyecto **no guarda las claves de Supabase escritas directamente en
el código**. En vez de eso, usa variables de entorno y un script que
genera `public/config.js` automáticamente. Así puedes subir el repo a
GitHub sin miedo a exponer tus claves, y cambiar de proyecto de Supabase
sin tocar el código.

### Paso a paso en local

1. Copia la plantilla:
   ```bash
   cp .env.example .env
   ```
2. Abre `.env` y completa tus valores reales:
   ```
   SUPABASE_URL=https://tuproyecto.supabase.co
   SUPABASE_ANON_KEY=tu-anon-key-publica
   ```
3. Instala dependencias y genera `public/config.js`:
   ```bash
   npm install
   npm run build
   ```
   Esto ejecuta `scripts/generate-config.js`, que lee tu `.env` (con la
   librería `dotenv`) y escribe `public/config.js` con esos valores.
4. Sirve la carpeta `public`:
   ```bash
   npx http-server public -p 8000
   ```
   (o `npm run dev`, que hace los dos pasos anteriores en uno).

**El archivo `.env` nunca se sube al repo** — está en `.gitignore`, junto
con `public/config.js` (porque ese archivo se regenera solo y podría
contener tus claves reales si lo generaste en local).

### En Render (producción)

Render no lee tu `.env` local — en su lugar, tú defines las mismas
variables en su dashboard y el build las usa automáticamente:

1. En el servicio de Render, ve a la pestaña **Environment**.
2. Agrega:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. En cada build, Render ejecuta `npm run build`, que corre
   `scripts/generate-config.js` y regenera `public/config.js` con los
   valores que pusiste en el dashboard, antes de publicar el sitio.

Si no configuras nada (ni `.env` local ni variables en Render), la página
igual funciona: la cámara y los filtros corren en el navegador, y el
registro se muestra solo en la consola (`console.log`) en vez de
guardarse en Supabase.

## 3. Probar en local

```bash
npm install
npm run dev
```

Abre `http://localhost:8000`. **Importante:** `getUserMedia` (acceso a
cámara) solo funciona en `https://` o en `http://localhost`, nunca en
`http://` con una IP directa — esto aplica también si pruebas desde el
celular apuntando a la IP de tu compu en la misma red.

### Probar en un celular Android durante el desarrollo

Si quieres probarlo en tu Android antes de desplegarlo, la forma más
simple es usar un túnel HTTPS temporal, por ejemplo con `ngrok`:

```bash
npx ngrok http 8000
```

Abre la URL `https://...ngrok...` que te da, desde el navegador de tu
Android. Sin HTTPS, Chrome/Firefox en Android bloquean el acceso a la
cámara igual que en PC.

## 4. Subir a tu repositorio

```bash
git init
git add .
git commit -m "Demo PANÓPTICO - UNITEC"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

Como `.env` y `public/config.js` están en `.gitignore`, no se suben tus
claves — solo la plantilla `.env.example`.

## 5. Desplegar en Render

**Opción recomendada — Static Site:**
1. En Render: **New +** → **Blueprint** (usa el `render.yaml` incluido)
   o **New +** → **Static Site** manualmente.
2. Conecta tu repositorio.
3. Si lo hiciste manual: **Build command:** `npm install && npm run build`
   · **Publish directory:** `public`
4. Ve a **Environment** y agrega `SUPABASE_URL` y `SUPABASE_ANON_KEY`
   (ver sección 2).
5. Deploy. Render te da HTTPS automáticamente — necesario tanto en PC
   como en Android para que el navegador permita usar la cámara.

**Alternativa — Web Service con Express:** usa `server.js` (incluido):
Build command `npm install && npm run build`, Start command `npm start`.

## PC y Android: qué cambia

- El **diseño es el mismo sitio responsive** para ambos — no hay una app
  aparte para Android, es la misma web que se adapta al tamaño de
  pantalla (ver `styles.css`, sección de media queries).
- En Android aparece un botón **"↺ Cambiar cámara"** para alternar entre
  la cámara frontal y la trasera (`facingMode: user` / `environment`);
  en PC ese botón intenta lo mismo pero la mayoría de laptops solo tienen
  una cámara, así que no notarás cambio.
- En pantallas angostas el visor de cámara se ve en formato vertical
  (3:4), como una cámara de celular, en vez del horizontal (4:3) de PC.
- Los botones y casillas tienen un tamaño mínimo de 44px, cómodo para
  usar con el dedo.

## Cómo está pensado el proyecto (para tu presentación)

- **Consentimiento por capas:** hay cuatro casillas separadas —
  usar la cámara, guardar metadata, guardar una foto, y guardar los
  **puntos faciales (landmarks)**. Cada una es un permiso distinto a
  propósito: la mayoría de sitios reales mezclan todo esto en un solo
  "Permitir".
- **Detección de rostro real:** se usa `face-api.js` (modelos
  `tinyFaceDetector` + `faceLandmark68TinyNet`, livianos, cargados desde
  CDN) para ubicar 68 puntos de la cara (ojos, cejas, nariz, boca,
  mandíbula) en cada frame. Todos los filtros usan esos puntos para
  seguir el rostro en tiempo real, no solo el de "máscara".
- **Los landmarks son datos biométricos:** por eso tienen su propia
  casilla de consentimiento, separada de la de guardar una foto normal
  — es justo el punto de la demo: mostrar que estos datos se pueden leer
  y guardar, y que deberían pedirse con la misma seriedad que cualquier
  otro dato sensible.
- **Panel HUD lateral:** mientras usas la cámara, un panel muestra en
  vivo los datos "de contexto" (navegador, idioma, resolución, zona
  horaria, si se detecta rostro, cuántos puntos se leyeron) que
  cualquier sitio ya puede leer sin pedir ningún permiso especial.
- **Row Level Security en Supabase:** la tabla solo permite `insert`
  desde el navegador, nunca `select` — así el propio proyecto demuestra
  una buena práctica en vez de dejar una base de datos abierta.

## Privacidad y uso responsable

- Este proyecto es para fines académicos. No lo despliegues para
  recolectar datos de personas fuera del contexto del curso sin su
  consentimiento informado.
- Los landmarks faciales y las imágenes son datos sensibles: bórralos de
  Supabase cuando termine la presentación:
  ```sql
  delete from public.sesiones_demo;
  ```
- Si vas a mostrar la demo en clase con voluntarios, avísales antes qué
  se va a capturar y por qué, igual que hace la página.
