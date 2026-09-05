# Anotherface · UNITEC

Estudio de fotos con filtros faciales. Mantiene Express, los cuatro efectos originales, la descarga de capturas y Supabase. Preparado para desplegar en Render; no se ha desplegado ni modificado la base de datos desde este trabajo.

## Puesta en marcha en Render

1. Guarda una copia de seguridad de tu base de datos. Ejecuta `supabase/schema.sql` en el SQL Editor de TU proyecto de Supabase. La migración no elimina tablas ni fotos: añade campos faltantes, restringe el acceso directo y vuelve privado el bucket histórico `capturas`.
2. Actualiza el código del repositorio que usa tu servicio de Render. No subas `.env`, `node_modules` ni claves.
3. En Environment configura:
   - `SUPABASE_URL`: URL del mismo proyecto donde ejecutaste la migración.
   - `SUPABASE_SECRET_KEY`: clave secreta de servidor de ese proyecto. Alternativamente se admite `SUPABASE_SERVICE_ROLE_KEY` heredada.
   - `ADMIN_EMAIL`: correo que quieras utilizar para entrar.
   - `ADMIN_PASSWORD`: contraseña única de al menos 16 caracteres.
   - `NODE_ENV=production` y `NODE_VERSION=22`.
4. Tipo de servicio: **Web Service**, no Static Site. Build: `npm ci`. Start: `npm start`. Health check: `/healthz`. Se incluye `render.yaml`.
5. Abre la URL HTTPS de Render. Toma una foto, espera «Foto guardada» y accede a `/admin.html` con las credenciales configuradas. Pulsa Actualizar.

No se necesita `DATABASE_URL` ni `SUPABASE_ANON_KEY`. Las claves secretas nunca se entregan al navegador. Guardado y consulta usan el mismo backend y el mismo proyecto de Supabase.

## Qué se corrigió

- Acceso público directo al estudio, sin formulario que capture contraseñas ni pantalla de términos.
- Aviso visible del envío de fotos al administrador. Guardar puntos faciales es opcional, desmarcado por defecto.
- Solo se generan registros al tomar una foto; no hay temporizadores de seguimiento, historial de filtros ni registros de acceso.
- Guardado confirmado únicamente tras una respuesta satisfactoria. Ante fallo, la imagen se puede descargar o reenviar con el mismo identificador, sin duplicar el registro.
- Panel con galería paginada, vista ampliada, descarga y puntos faciales opcionales. Recupera imágenes base64 y archivos históricos de Storage mediante enlaces firmados.
- Administrador con contraseña configurable, cookies HttpOnly/SameSite, expiración de 4 horas y límites de intentos. Desaparecen la contraseña y el token fijos de la demo.
- Seguimiento MediaPipe Face Mesh con refinamiento de ojos, labios e iris (478 puntos). No se presenta interpolación de 68 puntos como si fueran detecciones nuevas.
- Perrito: orejas y nariz del PNG original ancladas por separado; escala e inclinación ligadas a la geometría facial.
- Malla completa y deformaciones triangulares limitadas por el contorno real estimado.
- Fondo reactivo al puntero, alternativa con movimiento reducido y diseño adaptable a PC/Android.
- Cámara solo mediante acción del usuario. Se detiene al apagar, salir o poner la pestaña en segundo plano.

## Privacidad y límites

El video y el seguimiento se procesan localmente. Al pulsar Tomar foto se envía la imagen; solo se adjuntan coordenadas x/y/z si la persona marca la opción. No se infiere género, identidad, edad ni otros atributos personales.

Los puntos son estimaciones geométricas del modelo, no medidas físicas, huellas biométricas fiables ni un reconocimiento de identidad. La topología es común, pero las coordenadas se calculan para cada rostro. Ningún filtro puede garantizar ausencia de errores: poca luz, oclusiones, perfiles extremos y movimientos rápidos reducen la precisión. Se sigue un rostro a la vez.

Se usa el PNG original; contiene una marca visible en una oreja. Verifica sus derechos de uso antes de publicar.

Las fotos nuevas se guardan como JPEG base64 en la tabla existente para que imagen y registro se escriban juntos. Adecuado para esta demo de corta duración, no para una fototeca grande: base64 aumenta aproximadamente un tercio el tamaño. Máximo 2,5 MB por foto y 20 solicitudes por minuto/IP. Para alto tráfico conviene Storage privado con persistencia transaccional, cuotas y límites compartidos.

El panel consulta solo las últimas 4 horas. El servidor activo elimina capturas base64 vencidas cada 15 minutos. Si Render duerme o se detiene, la eliminación queda pendiente hasta reanudarse; para una retención estricta configura una tarea programada en la base de datos. Las fotos históricas de Storage quedan privadas pero NO se borran automáticamente, para evitar eliminar archivos ajenos o perder datos. Gestionar su limpieza por separado.

La migración no elimina credenciales históricas que almacenó la demo anterior. Esos campos no se vuelven a usar ni se muestran. Revísalos y gestiona su eliminación con autorización. El ZIP original incluía un archivo .env: rota sus credenciales si se compartió fuera de un entorno de confianza.

Las sesiones y límites viven en memoria: un reinicio cierra la sesión, y varios servidores necesitan un almacén compartido. La app carga MediaPipe y fuentes desde CDN; necesita conexión para la primera carga. El navegador puede recordar el permiso de cámara: no es posible forzar el diálogo nativo en cada visita.

## Desarrollo y pruebas

Node 22. Copia `.env.example` a `.env`, rellena las variables, ejecuta `npm ci` y `npm start`. Para pruebas sin Supabase real: `npm test`.

Las pruebas automatizadas usan un Supabase simulado y cubren autenticación, permisos, captura, errores y consulta del panel. No prueban credenciales reales, cámaras físicas, precisión facial ni un despliegue real.

Validación realizada en esta entrega: cuatro pruebas en memoria aprobadas (`node --test tests/unit.test.js`), comprobación de sintaxis de JavaScript y revisión de diferencias sin errores. La ejecución HTTP completa quedó bloqueada por las restricciones de red del entorno; se incluye `tests/api.test.js` para ejecutarla localmente. No se ha realizado una comprobación visual en navegador.

Antes de publicar, comprobar en Chrome Android y Chrome/Edge de PC:
- Permitir y denegar cámara; encender, apagar y cambiar cámara.
- Orientación vertical/horizontal y giro del rostro; filtros sin rostro.
- Captura idéntica a la vista previa y descarga JPEG.
- Foto visible en admin; malla solo cuando se autoriza; sin registros por esperar.
- Fallo de red, reintento y sesión caducada.
- Confirmar que usuarios anónimos no pueden leer la tabla ni el bucket.

## Referencias oficiales

- [MediaPipe Face Mesh](https://chuoling.github.io/mediapipe/solutions/face_mesh.html)
- [Supabase Data API](https://supabase.com/docs/guides/api)
- [Claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [Express en Render](https://render.com/docs/deploy-node-express-app)
