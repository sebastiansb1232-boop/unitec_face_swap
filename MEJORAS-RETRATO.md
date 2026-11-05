# Another Face 1.9.0 · Alineación verificada y perfiles

Esta actualización corrige causas concretas de los ojos duplicados, la boca desplazada y los recortes que muestran otra cara por debajo. Conserva Avatar fotográfico, LivePortrait 512 opcional, HyperSwap y la conexión protegida con Render.

## Lo encontrado en tu caso

Al consultar la web publicada se recibieron archivos con caché `v=8`. Ese cliente dibujaba la salida con el UV de la cámara, sin detectar los rasgos del rostro generado, y reponía siempre los interiores de ojos y boca originales. La entrega 1.8 usaba `v=11`. Cambiar la URL del túnel en Environment no actualiza los archivos de la página.

Las pruebas con las fotografías adjuntas revelaron además un problema en el ajuste de forma de 1.8: fusionar la geometría frontal con perfiles estimados podía desplazar los labios del perfil. Esta entrega utiliza la geometría de la vista correspondiente y transfiere cambios acotados de párpados, labios, mandíbula y cejas, en lugar del residuo de todos los vértices.

Los mensajes `Incoming request ended abruptly: context canceled` indican solicitudes canceladas. El cliente cancela trabajos al cambiar referencia, modo o cámara; el proxy también aborta si se cierra la conexión. Un aviso aislado no demuestra que el túnel haya caído. Si se repite sin interacción, comprueba el estado y el tiempo del motor. No explica por sí solo la posición incorrecta de ojos y boca.

## Actualizar PC y Render

1. Detén el worker con **Ctrl + C**. Conserva el túnel si sigue abierto.
2. Reemplaza el código con el ZIP actualizado y conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models` en la misma PC.
3. En PowerShell, dentro de la carpeta de `package.json`:

```powershell
npm.cmd ci
```

Para el generador que conserva la apariencia de la fotografía:

```powershell
.\instalar-avatar-local.bat
.\iniciar-avatar-ia.bat
```

El instalador añade **338 MB** de LivePortrait si faltan; reutiliza entorno, DirectML y modelos completos. El motor debe mostrar **Avatar LivePortrait**, salida de **512** y el proveedor real. Este modelo es más exigente; no promete más FPS que HyperSwap.

4. Copia el código también en la carpeta del repositorio ya conectado a Render. No basta con guardar el ZIP en GitHub. Desde ese repositorio:

```powershell
git status
git add public local-ai scripts *.js *.json *.md *.bat .gitignore .env.example
git commit -m "Corrige alineacion facial y perfiles en Another Face 1.9.0"
git push
```

Si Git dice que no hay un repositorio, entra en el clon que ya utilizas; no crees otro sobre una carpeta instalada. Los modelos, entornos y archivos privados quedan excluidos mediante `.gitignore`. No subas secretos manualmente.

5. En tu **servicio existente** de Render, despliega el último commit de la rama conectada. Build: `npm ci`. Start: `npm start`.
6. Recarga con **Ctrl + F5**. En móvil, vuelve a cargar la página; si sigue antigua, cierra esa pestaña y abre de nuevo la URL.
7. La cabecera debe mostrar **v1.9.0**. En `/healthz`, `version` debe ser `1.9.0`. En `/api/neural/status`, comprueba `web_version: "1.9.0"`, `engine_version: "1.9.0"`, `proxy_protocol: 5`, `render_protocol: 5`, `patch_output: true` y `ready: true`.

El modo Neuronal se bloquea con instrucciones claras si Render o el motor son incompatibles. El servidor rechaza los fotogramas del cliente antiguo antes de ejecutar el modelo. El protocolo 5 requiere transporte alineado; se deja de aceptar la antigua ruta HTTP de composición sin registro.

Si mantienes abierto el túnel hacia `127.0.0.1:8766`, conserva su URL y el token. Si lo cerraste, abre otra terminal:

```powershell
.\iniciar-tunel-ia.bat
```

Copia la nueva URL HTTPS en `ANOTHERFACE_AI_URL` de Render y aplica el cambio. No cambies `ANOTHERFACE_AI_TOKEN` si conservaste `.env.ai`.

## Qué elegir en la página

| Modo | Resultado y carga |
| --- | --- |
| **Avatar · 3 fotos en vivo** | Anima las fotografías en el navegador. Prioriza respuesta sin esperar a la PC; no genera una cara neuronal nueva por cada fotograma. |
| **Neuronal**, con **Avatar LivePortrait 512** | Genera desde la apariencia de la referencia y toma del conductor pose y cambios de expresión. Es la opción de generación para comparar el parecido con estas fotos. |
| **Neuronal**, con HyperSwap o InSwapper | Intercambia una representación facial. Puede conservar textura, edad aparente u otros rasgos del conductor; más pasadas no garantizan el parecido de LivePortrait. |
| **Ligero** | Mantiene el filtro clásico anterior, incluida la opción de cabello. |

La selección automática de `start:worker` continúa prefiriendo HyperSwap si está completo, después InSwapper. Para exigir LivePortrait usa `iniciar-avatar-ia.bat`. Instalarlo no cambia silenciosamente el motor de otro comando.

La salida de LivePortrait es 512. HyperSwap es 256 nativos e InSwapper 128; sus cuatro fases opcionales componen texturas mayores sin convertirlos en modelos nativos de 512. **Más parecido** no fuerza cuatro pasadas.

Para ejecutar web y LivePortrait juntos, en lugar del worker:

```powershell
$env:ANOTHERFACE_SWAPPER="avatar"
npm.cmd run start:ai
```

Abre `http://localhost:3000`. No ejecutes `start:ai` y `start:worker` simultáneamente.

## Usar las fotografías

Carga primero la **frontal neutra** que enviaste, después los dos perfiles opuestos. La frontal sonriente también se detectó, pero la neutra facilita calibrar los gestos. Las fotos no se añaden a los recursos públicos del ZIP.

Empieza con **Más parecido**, intensidad 100 y los controles de **Mezcla del rostro original en 0**. Los gestos ya siguen a la cámara: subir esos controles devuelve ojos, boca o piel de la cámara y puede reducir el parecido. Antes se llamaban “Gestos en vivo”, una etiqueta confusa que se ha cambiado.

Mira de frente, abre los ojos y relaja la boca al recalibrar. El cambio de persona borra los perfiles anteriores. Las vistas más fáciles de usar son tres cuartos, aproximadamente 25–70°, con iluminación parecida. Una malla completa estimada en una foto muy lateral no demuestra que su ojo oculto haya sido observado.

## Cambios de composición

- **Ninguna textura neuronal sin alinear:** se detectan sus propios ojos, nariz y labios. Se rechazan espejo, geometría dañada y desplazamientos excesivos. Mientras se valida, se conserva una textura válida compatible o se muestra la referencia fotográfica.
- **Sin interpolación desde el registro incorrecto:** la primera imagen mostrada ya usa los puntos aceptados; no se dibuja un UV provisional que coloque ojos en la frente.
- **Máscara en destino:** la textura alineada se transmite opaca y se limita con la malla verificada en el navegador. No se corta antes usando el contorno de otra anatomía. El borde queda hacia dentro de la superficie facial.
- **Perfiles propios:** se utiliza la geometría de la fotografía correspondiente al giro. Los cambios de expresión se limitan a aperturas y regiones concretas; no arrastran nariz y labios con errores de profundidad de todo el rostro.
- **Boca lateral:** se desactiva la reposición automática de dientes de cámara en perfiles pronunciados, que podía crear parches fuera de los labios. La mezcla manual sigue siendo opcional.
- **Detalle de referencia:** la foto se recorta alrededor de la cara antes de reducirse y comprimirse. Una foto amplia ya no pierde resolución facial por incluir tanto fondo.
- **Una generación en vuelo:** el registro sigue en paralelo. Una detección lenta puede conservarse como textura válida sin reemplazar una generación posterior. La cámara sigue avanzando.
- **Captura:** espera brevemente seguimiento válido, sin guardar una imagen sin efecto; se cancela si cambias de cámara o retrato.

Avatar y Neuronal aplican el efecto al rostro; cabello, orejas, cuello, ropa y fondo conservan la cámara. No reconstruyen el fondo oculto al cambiar la silueta.

## Pruebas y límites

La entrega pasa **73 pruebas JavaScript y 33 Python**. Se cubren versiones incompatibles, bloqueo antes de inferencia, UV incorrecto, registro retrasado, geometría de cada perfil, gestos, transporte y conservación de detalle.

Se analizaron las cuatro fotografías adjuntas. La frontal neutra y ambos perfiles se aceptaron juntos en los modelos ONNX reales HyperSwap y LivePortrait en CPU; se comprobaron las texturas generadas y su registro. En las pruebas estáticas de los perfiles se corrigió el desplazamiento involuntario de la boca: al usar una vista como su propia referencia, la geometría ya no la deforma.

También se probó la página con las tres fotos cargadas, cámara simulada, seguimiento real, WebGL, captura y guardado con Supabase simulado. Se comprobaron escritorio y ancho de 390 píxeles. Los ensayos completos del motor usaron autenticación y proxy local adaptado como origen HTTPS de prueba. No se desplegó en tu cuenta ni se midió la conexión pública o tu GPU.

**No se garantizan 30 FPS neuronales ni un parecido perfecto en cada pose.** La vista, el seguimiento y la generación tienen contadores separados. En este entorno de CPU y gráficos por software la vista puede ser fluida mientras LivePortrait tarda varios segundos. No se cuentan reproyecciones como generaciones. Las pruebas estáticas con fotos no sustituyen un video real de tu cámara moviéndose.

Para medir el generador con tensores sintéticos, detén primero el worker:

```powershell
.\medir-ia-local.bat --avatar
```

Se descarta el calentamiento. Esta medición excluye extracción de movimiento, cámara, seguimiento, compresión, red y dibujo. Para 30 caras nuevas/s debe sostenerse el recorrido completo, no solo una pasada de menos de 33,3 ms.

## Datos y modelos

Avatar fotográfico procesa referencias y cámara en el dispositivo. Neuronal envía referencias y recortes al motor; con Render pasan por Render y Cloudflare. Python conserva representaciones en RAM, sin escribir las fotos: hasta tres referencias LivePortrait con sus volúmenes de apariencia, u ocho de intercambio; vencimiento tras 15 minutos sin uso y limpieza periódica. Guardar una foto continúa siendo una acción explícita.

Las fotos adjuntas se usaron en pruebas locales y no se incorporan a la distribución. Los pesos tampoco van en el ZIP. Las descargas tienen revisión, tamaño y SHA-256 fijados en `local-ai/models.json`. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para las fuentes y condiciones de LivePortrait, MediaPipe, HyperSwap, InSwapper y ArcFace.
