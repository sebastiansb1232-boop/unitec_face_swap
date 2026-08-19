# PANÓPTICO — demo educativa (UNITEC)

Página web que pide acceso a la cámara, aplica filtros en vivo (incluyendo un
filtro tipo "face swap" ligero basado en detección facial) y, con
consentimiento explícito, guarda un registro de la sesión en Supabase. El
objetivo del proyecto es **mostrar en vivo** qué tipo de datos puede
recolectar una página con solo pedir permiso de cámara, para concientizar
sobre seguridad y privacidad web.

## Estructura del proyecto

```
unitec-privacidad/
├── public/
│   ├── index.html      # página completa (consentimiento + cámara + HUD)
│   ├── styles.css       # estética "HUD de vigilancia"
│   ├── config.js         # credenciales de Supabase (EDITAR ESTO)
│   └── app.js             # lógica de cámara, filtros y guardado
├── supabase/
│   └── schema.sql          # tabla + Row Level Security para Supabase
├── server.js                # servidor Express opcional (solo si usas "Web Service")
├── package.json
├── render.yaml               # configuración lista para Render (Static Site)
└── .gitignore
```

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`.
   Esto crea la tabla `sesiones_demo` con Row Level Security activado
   (solo permite `insert` desde el navegador, no `select` — así nadie
   puede leer las capturas de otras personas usando la clave pública).
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`
4. Pégalos en `public/config.js`:
   ```js
   window.SUPABASE_CONFIG = {
     url: "https://TU-PROYECTO.supabase.co",
     anonKey: "TU-ANON-KEY-PUBLICA",
   };
   ```

Si no configuras Supabase, la página igual funciona: la cámara y los
filtros corren en el navegador, y el registro se muestra solo en la
consola (`console.log`) en vez de guardarse.

## 2. Probar en local

No necesitas Node para la versión estática. Basta un servidor local
simple, por ejemplo:

```bash
cd public
python3 -m http.server 8000
```

Abre `http://localhost:8000`. **Importante:** `getUserMedia` (acceso a
cámara) solo funciona en `https://` o en `http://localhost`, nunca en
`http://` con IP directa.

## 3. Subir a tu repositorio

```bash
git init
git add .
git commit -m "Demo PANÓPTICO - UNITEC"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

## 4. Desplegar en Render

**Opción recomendada — Static Site:**
1. En Render: **New +** → **Static Site**.
2. Conecta tu repositorio.
3. **Publish directory:** `public`
4. **Build command:** déjalo vacío.
5. Deploy. Render te da HTTPS automáticamente (necesario para la cámara).

El archivo `render.yaml` ya trae esta configuración lista si usas
"Blueprints" en Render (New + → Blueprint).

**Alternativa — Web Service con Express:** si prefieres ese modo, usa
`server.js` (incluido): Build command `npm install`, Start command
`npm start`.

## Cómo está pensado el proyecto (para tu presentación)

- **Consentimiento por capas:** hay tres casillas separadas (cámara,
  metadata, imagen) para que se note que no es lo mismo "usar la cámara"
  que "guardar tu foto" — la mayoría de sitios reales mezclan ambas cosas
  en un solo permiso.
- **Panel HUD lateral:** mientras usas la cámara, un panel muestra en vivo
  los datos "de contexto" (navegador, idioma, resolución, zona horaria)
  que cualquier sitio ya puede leer sin pedir permiso — para mostrar que
  el riesgo no es solo la cámara.
- **Filtro "máscara / face swap":** usa `face-api.js` (modelo
  `tinyFaceDetector`, liviano, cargado desde CDN) para ubicar el rostro y
  dibujar una máscara encima en tiempo real. Si el modelo no carga (por
  ejemplo, sin conexión al CDN), cae automáticamente a una máscara
  centrada en pantalla.
- **Row Level Security en Supabase:** la tabla solo permite `insert` desde
  el navegador, nunca `select` — así el propio proyecto demuestra una
  buena práctica en lugar de dejar una base de datos abierta.

## Privacidad y uso responsable

- Este proyecto es para fines académicos. No lo despliegues para
  recolectar datos de personas fuera del contexto del curso sin su
  consentimiento informado.
- Borra la tabla `sesiones_demo` (o las filas de prueba) cuando termine
  la presentación: `delete from public.sesiones_demo;` en el SQL Editor.
- Si vas a mostrar la demo en clase con voluntarios, avísales antes qué
  se va a capturar y por qué, igual que hace la página.
