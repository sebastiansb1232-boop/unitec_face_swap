# Another Face 1.11.0 · Integración con la cámara y labios de perfil

## Cambios actuales

- Las referencias conservan su corrección entre vistas y ahora se integran con el color de la cámara. Se muestrea una copia de 160 píxeles aproximadamente cuatro veces por segundo, con corrección de espejo. La luz objetivo se suaviza en el tiempo; al cambiar de foto se recalcula la corrección desde esa foto, para evitar aplicar durante unos instantes la corrección de la anterior.
- La adaptación de luminancia y matiz es acotada y uniforme; conserva textura sin aplicar desenfoque a la piel. La región de los ojos recibe una corrección menor. El borde facial utiliza una transición más amplia para reducir el corte de frente y mandíbula.
- La asistencia oral incluye labios e interior también en perfiles de hasta aproximadamente 70 grados. Avatar fotográfico adapta su apertura a la boca actual; el generador neuronal conserva su boca cuando ya coincide. Se evita estirar los labios cerrados de una foto sobre una boca abierta.
- Se envían a WebGL solo los vértices usados. La reposición del contorno dibuja únicamente el anillo exterior, evitando repintar toda la superficie facial en una pasada adicional.
- Continúa LivePortrait de 512 píxeles nativos; esta entrega reutiliza los modelos instalados. Los cambios corrigen la composición y no convierten una referencia borrosa en detalle HD ni añaden entrenamiento a los pesos.

En las capturas nuevas está seleccionado Avatar fotográfico en una de las vistas. Ese modo anima fotos localmente; para generar una imagen con LivePortrait selecciona Neuronal e inicia `iniciar-avatar-ia.bat`. Se corrigen ambos caminos de composición.

## Actualizar desde 1.10

Copia el código en la misma carpeta Another-Face conservando `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`. Ejecuta `npm.cmd ci`, reinicia el worker con `iniciar-avatar-ia.bat` y actualiza main y Render. Mantén el túnel abierto para reutilizar su URL. Si creas otro, actualiza `ANOTHERFACE_AI_URL`. La cabecera y el motor deben indicar 1.11.0; los archivos del cliente usan caché v14. No hace falta repetir el instalador si LivePortrait ya está completo.

## Verificación de esta entrega

Pasan **88 pruebas JavaScript y 34 Python**. La página completa se comprobó con Avatar fotográfico y LivePortrait real en CPU, con captura guardada en un servidor simulado, sin errores de JavaScript ni WebGL. La vista osciló entre 26–29 FPS en esos ensayos; una generación LivePortrait tardó unos 13 segundos en CPU. No es una comparación controlada con la versión anterior ni una medida de tu GPU. Las pruebas incluyen adaptación temporal de tono, cambio entre referencias con distinta exposición, asistencia oral lateral y apertura de boca en perfil. Se realizan comprobaciones de píxeles, WebGL y captura con cámara simulada. Las capturas aportadas muestran el resultado filtrado; no sustituyen el video original para evaluar todos los gestos. La frecuencia neuronal depende del hardware; el contador de vista no es el de generaciones.

---

## Guía y comprobaciones de la entrega anterior (1.10)

# Another Face 1.10.0 · Color coherente y gestos más estables

Esta entrega refina Neuronal, Avatar fotográfico y el tono del filtro ligero. Mantiene LivePortrait 512, HyperSwap e InSwapper y el puente protegido entre Render y tu PC. No añade modelos ni dependencias a la instalación existente.

## Cambios del retrato

- **Color entre vistas:** «Unificar tono entre vistas» utiliza el matiz de la frontal para preparar las referencias laterales y cada resultado neuronal. Muestrea mejillas y frente con estadísticas robustas, sin reglas RGB que excluyan tonos de piel. Acerca la exposición con límites y conserva variaciones de luz, textura, ojos y labios; no intenta igualar a la fuerza una foto oscura con una frontal sobreexpuesta. La corrección tiene un borde amplio y suave dentro de la piel.
- **Boca:** la geometría neuronal parte de los rasgos realmente detectados en la imagen generada. Se añade únicamente el cambio desde el gesto de cámara que produjo esa imagen. Así se evita volver a abrir una boca que el modelo ya había abierto. Se limitan de forma continua la apertura, la sonrisa y el movimiento de mandíbula, con límites menores de perfil.
- **Interior oral:** cuando una textura antigua no contiene la apertura actual, se integra solo el interior oral de la cámara en poses compatibles. Se trata igual el borde interior y el centro, para evitar un abanico de triángulos entre lengua y labios. Esta asistencia no es una nueva generación neuronal.
- **Ojos:** movimiento de mirada acotado y suavizado. Si una generación conserva un párpado cerrado cuando ya abriste el ojo, se asiste esa región con el ojo de la referencia correspondiente. Se evita dibujar el abanico del ojo lejano cuando su proyección es demasiado estrecha.
- **Perfil y contorno:** la silueta incluye nariz y labios que sobresalen del óvalo al girar. La reposición del fondo tiene una cobertura propia: ya no depende del borde transparente del rostro. Esto corrige una causa del antiguo contorno de nariz o mentón visible detrás. Se comprueba también que las deformaciones no inviertan triángulos en pantalla.
- **Movimiento:** predicción rígida 3D breve entre detecciones, sin estirar el ancho facial. Los gestos conservan límites propios; la predicción no cuenta como detección ni generación.
- **LivePortrait:** transferencia relativa de expresión con un límite suave por punto y amortiguación mayor en giros fuertes. La primera generación espera tres muestras neutrales distintas; mira de frente, abre los ojos y relaja la boca. Cambiar un ajuste conserva la calibración del conductor.
- **Ligero:** conserva el tono de referencia al activar la unificación y evita muestrear el color de la cámara continuamente. Sigue siendo un filtro clásico pensado para vistas frontales; las mejoras de geometría de perfil corresponden a Avatar y Neuronal.

## Menos trabajo y menos saturación

El motor envía una sola textura JPEG de calidad 95 con la malla alineada, en lugar de enviar además una segunda copia PNG opaca. La opción interna `texture_codec: "png"` se conserva para comparaciones. Se reduce codificación y tráfico sin modificar la resolución nativa del generador.

Se mantiene una inferencia en vuelo. Ajustar parecido o calidad invalida resultados antiguos sin cancelar innecesariamente el trabajo que aún ocupa la GPU. Una pérdida breve del seguimiento retira la capa; se recalibra solo después de una ausencia sostenida. Las respuestas «ocupado» respetan `Retry-After` y aumentan la espera hasta un máximo de ocho segundos, manteniendo activa la vista local. La referencia se reutiliza mientras no cambie la identidad.

La corrección de color se prepara una vez por imagen. El renderizador reutiliza texturas y los contornos de la misma muestra. Los nuevos controles de perfil añaden trabajo gráfico: la mejora de transporte no implica por sí sola más generaciones por segundo.

## Actualizar tu instalación existente

1. Detén el worker con **Ctrl + C**. Puedes conservar el túnel abierto si sigue apuntando a `127.0.0.1:8766`.
2. Copia el contenido de `Another-Face` de este ZIP dentro de **tu misma carpeta Another-Face**, reemplazando el código. Conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`. No coloques una segunda carpeta Another-Face dentro de la primera.
3. En PowerShell:

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
npm.cmd ci
.\iniciar-avatar-ia.bat
```

Esto inicia LivePortrait con autenticación obligatoria. Si ya descargaste sus cuatro modelos en la entrega anterior, **no repitas el instalador**. Si nunca lo instalaste, ejecuta una sola vez `.\instalar-avatar-local.bat` antes de iniciarlo; añade 338 MB y reutiliza los modelos completos. Para conservar HyperSwap o la selección automática, utiliza `npm.cmd run start:worker`.

4. Si el túnel se cerró, abre otra terminal:

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
.\iniciar-tunel-ia.bat
```

Conserva ambas terminales abiertas. Si se creó otra dirección, actualiza `ANOTHERFACE_AI_URL` en Render con la nueva URL HTTPS. Mantén `ANOTHERFACE_AI_TOKEN` igual al de `.env.ai`.

5. Actualiza **main del mismo repositorio** que usa Render, desde tu carpeta Another-Face:

```powershell
git rev-parse --show-toplevel
git status
git add public local-ai scripts tests supabase *.js *.json *.md *.bat render.yaml .gitignore .env.example
git commit -m "Refina color, gestos y rendimiento de Another Face 1.10.0"
git push origin main
```

El primer comando debe mostrar la carpeta Another-Face. Revisa que la lista de cambios pertenezca al proyecto antes del commit. Los modelos, entornos y archivos privados quedan excluidos. No se requiere otra rama ni otro clon para publicar una instalación que ya tiene el repositorio configurado.

6. En el servicio existente de Render, despliega el último commit de **main**. Build: `npm ci`. Start: `npm start`. Cambiar únicamente la URL del túnel no actualiza la página.
7. Recarga con **Ctrl + F5**. Comprueba **v1.10.0** en la cabecera. `/healthz` debe mostrar `version: "1.10.0"`. `/api/neural/status` debe indicar `web_version: "1.10.0"`, `engine_version: "1.10.0"`, `proxy_protocol: 5`, `render_protocol: 5` y `ready: true`.

## Ajustes para comparar

Carga una frontal nítida y dos perfiles opuestos de la misma persona, preferiblemente con expresión neutral y ojos visibles. Deja «Unificar tono entre vistas» activado. Prueba primero Natural, con parecido neuronal entre 65–75 % y mezcla de ojos, boca, frente y mentón originales en cero. «Proporciones de referencia» controla cuánto cambia la geometría: bájalo si un gesto extremo todavía deforma el rostro. La mezcla oral automática conserva solo el interior necesario.

Al cambiar de cámara o persona, utiliza «Recalibrar mi rostro» mirando de frente. Las fotografías con boca abierta, sombras muy fuertes, cabello sobre los ojos o perfil totalmente lateral limitan el detalle que puede recuperarse. El cuello, las orejas, el cabello y el cuerpo siguen siendo de la cámara cuando se intercambia solo el rostro.

## Comprobación y límites

Pasan **83 pruebas JavaScript y 34 Python**. Comprueban color, cambios relativos de expresión, perfil, inversión de triángulos, predicción rígida, calibración, una inferencia en vuelo, reintentos, autenticación y guardado simulado.

La página completa pasó una prueba con las tres referencias, LivePortrait real en CPU, registro del rostro generado y captura con malla guardada en un Supabase simulado. No hubo errores de JavaScript ni WebGL ni desbordamiento a 390 píxeles. Las pruebas de píxeles comprobaron el ojo de referencia como asistencia, la mezcla opcional del ojo original y la retirada del contorno anterior al reducir el mentón, también con texturas rectangulares. Ambos perfiles reales se dibujaron sin desplazamiento espurio en una prueba con la misma foto como fuente y destino.

En ese ensayo, la vista rondó **27 FPS** y el seguimiento entre **12–16 FPS**. LivePortrait tardó unos **14 segundos** en generar en CPU; recibir un resultado tardó unos 17,4 segundos con preparación de referencias. Son métricas distintas, sin comparación directa con 1.9. Los ensayos utilizan cámara simulada y gráficos por software; no equivalen a medir tu GPU ni al video original de las capturas adjuntas.

Vista, Seguimiento e IA conservan contadores separados. Una vista fluida puede reutilizar una textura mientras LivePortrait genera otra. **No se garantizan 30 FPS neuronales ni la desaparición de todos los artefactos en giros extremos.** El generador mantiene sus 512 píxeles nativos; subir la resolución mostrada o añadir pasadas no convierte automáticamente la salida en detalle nuevo.

Para medir el generador de tu PC, detén el worker y ejecuta `.\medir-ia-local.bat --avatar`. La medición descarta el calentamiento y excluye seguimiento, extracción de movimiento, compresión, red y dibujo; no debe confundirse con los FPS del recorrido completo.
