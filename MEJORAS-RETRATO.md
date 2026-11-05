# Another Face 1.12.0 · Boca natural, estabilidad y tono de cámara

## Qué cambia

- **Lengua y labios:** se limita la geometría interior a un contorno labial robusto, calculado con varios puntos. Un punto que salta hacia la lengua ya no arrastra el borde inferior. «Boca natural», activada por defecto, conserva labios, dientes y lengua de la cámara y los adapta al retrato mediante una sola transformación afín. El interior deja de depender de deformaciones triangulares independientes y se evita que la profundidad de otros triángulos lo corte. Se mantiene incluso con los labios cerrados en poses compatibles, para que una apertura pequeña no vuelva a pegar los labios de la referencia. Se puede desactivar para conservar la boca generada.
- **Vibración:** el filtro temporal estabiliza posición, escala y orientación, además de la forma local. El iris comparte ese marco estabilizado. La imagen de cámara se muestrea con sus coordenadas originales, separadas de las coordenadas suavizadas de la malla; así no se cambia su origen de textura al estabilizarla.
- **Color de piel:** el selector permite «Mi tono · Cámara», «Intermedio · Cámara y referencia» o «Referencia · Fotografías». Intermedio tiene una mezcla ajustable. Cámara es el valor inicial y utiliza el tono mediano de mejillas y frente; conserva la textura y tiene límites de corrección. El objetivo de cámara se suaviza en el tiempo. La unificación entre fotos sigue siendo independiente y evita que cada perfil introduzca otro matiz. El modo ligero también utiliza la decisión de tono.
- **Perfiles:** las referencias fotográficas reciben una máscara de segmentación preparada una sola vez con el modelo MediaPipe ya incluido. Se evita llevar el fondo de la foto sobre la nariz o el ojo oculto. La imagen original se conserva para el generador. La geometría mantiene los controles de inversión de triángulos y las proporciones propias de cada vista.
- **Contorno y fondo:** «Retirar contorno original» permite capturar un fondo limpio o prepararlo con LaMa. El fondo queda bajo la nueva capa facial, limitado al contorno original, y cubre también los espacios transparentes y el borde suave. Así se retira el espacio que deja una nariz o mentón más pequeño sin conservar debajo rasgos de la cámara. Con un fondo preparado se amplía el margen de cambio geométrico. Sin fondo se mantiene la reproyección anterior.
- **Composición:** se elimina la antigua ganancia global de luz y sus lecturas redundantes, se reutilizan las texturas y se mantiene una sola generación facial en vuelo. La etiqueta de la vista distingue IA neuronal, apoyo fotográfico y Avatar fotográfico según la textura que se está mostrando.

LivePortrait conserva su salida nativa de 512. LaMa es una incorporación real para el fondo; no sustituye al generador facial ni se ejecuta por fotograma. No se ha entrenado un modelo nuevo de segmentación de lengua: la corrección conserva el interior oral de la cámara y hace más robustos sus límites. Una lengua muy extendida fuera del contorno, las oclusiones y los giros extremos todavía pueden superar la estimación facial.

## Actualizar en tu misma carpeta

Detén el motor con **Ctrl + C**. Copia el contenido de la carpeta Another-Face del ZIP sobre tu carpeta existente. Conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`; evita crear una carpeta Another-Face dentro de otra.

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
npm.cmd ci
.\iniciar-avatar-ia.bat
```

Si ya instalaste LivePortrait, no repitas su instalador. Si falta, ejecuta una vez `.\instalar-avatar-local.bat`; descarga 338 MB adicionales. Para servir la web y el motor juntos en localhost, utiliza `$env:ANOTHERFACE_SWAPPER="avatar"` seguido de `npm.cmd run start:ai` en lugar del worker.

Puedes mantener el túnel abierto mientras reinicias el motor en el mismo puerto. Si lo cerraste, abre otra terminal en la misma carpeta y ejecuta `.\iniciar-tunel-ia.bat`. Una dirección nueva exige actualizar `ANOTHERFACE_AI_URL` en Render; el token debe seguir coincidiendo con `.env.ai`.

Publica el código en **main del repositorio existente**, desde esa misma carpeta:

```powershell
git rev-parse --show-toplevel
git status
git add public local-ai scripts tests supabase *.js *.json *.md *.bat render.yaml .gitignore .env.example
git diff --cached --stat
git commit -m "Estabiliza malla, boca, lengua y tono de Another Face 1.12.0"
git push origin main
```

Comprueba que la raíz y la lista de archivos corresponden a Another-Face antes del commit. El ZIP excluye modelos locales, entornos, claves y archivos personales. En tu servicio existente de Render despliega el último commit de main: Build `npm ci`, Start `npm start`. Recarga con **Ctrl + F5**. La cabecera y `/api/neural/status` deben mostrar **1.12.0** para web y motor, con `ready: true` y protocolo 5. Cambiar solamente la URL del túnel no actualiza el código.

## Ajustes y fondo

1. Selecciona **Neuronal · Generador de la PC**, perfil Natural, y deja **Boca natural** activada. Mira de frente con la boca relajada para calibrar. Carga una frontal y perfiles opuestos de la misma persona, con ojos visibles y sin sombras intensas.
2. En **Color de piel**, prueba **Mi tono · Cámara**. Elige **Intermedio** para conservar parte del tono de la referencia; su porcentaje indica cuánto de la referencia se conserva. Con Referencia se mantiene su color preparado, aunque puede contrastar con el cuello de cámara.
3. Para retirar una nariz o mandíbula que sobresalga, fija la cámara y abre **Retirar contorno original**. **Capturar fondo** espera tres segundos para que salgas por completo del encuadre; vuelve después de que se confirme la captura. Es la opción que conserva el fondo real.
4. Como alternativa opcional, con el motor detenido ejecuta:

```powershell
.\instalar-relleno-ia.bat
.\iniciar-avatar-ia.bat
```

Esto descarga **LaMa, 208 MB**, con revisión, tamaño y SHA-256 fijados; utiliza el entorno existente y no reinstala DirectML/CUDA. En la página pulsa **Generar fondo con IA · LaMa**. Se envía una imagen al motor de tu PC mediante la conexión configurada; la generación facial se pausa mientras se prepara. LaMa puede inventar detalles detrás de la cabeza.

Mantén la cámara fija mientras se use cualquiera de los fondos. Si la mueves o cambia el escenario, quita el fondo y prepáralo de nuevo. Cambiar de cámara, resolución o apagarla invalida el fondo. La imagen se conserva en memoria, no se guarda en disco ni se genera continuamente.

## Verificación y rendimiento

Pasan **95 pruebas JavaScript y 41 Python**. Incluyen geometría y seguimiento, estabilización rígida con ruido, tono de cámara/intermedio/referencia, límites de labios, apertura robusta ante un punto desviado hacia la lengua, autenticación, exclusión mutua del motor y estados de LaMa ausente/ocupado.

En Chromium se comprobaron la página con tres referencias, LivePortrait real en CPU, registro facial, selección de tono, captura y guardado simulado y presentación a 390 píxeles, sin errores JavaScript ni WebGL. Otra prueba ejecutó el botón de LaMa con el modelo real a través del proxy protegido, captura manual de fondo y posterior guardado. Las comprobaciones de píxeles verifican los tres tonos, la conservación de un interior oral de cámara ante un punto dañado y el reemplazo del antiguo contorno de nariz por un fondo preparado. Ambos perfiles reales se dibujaron sin desplazamiento espurio usando la misma imagen como fuente y destino.

En esos ensayos con cámara simulada y gráficos por software, la vista rondó **10–28 FPS**, el seguimiento **6–14 FPS**, LivePortrait tardó **14,9–16,5 segundos de inferencia en CPU** y LaMa unos **15,2 segundos** en la prueba aislada. No son mediciones de tu GPU ni una comparación controlada con 1.11. Una composición reutilizada no cuenta como una generación neuronal nueva. No se prometen 30 FPS neuronales ni ausencia total de artefactos: las capturas filtradas aportadas no sustituyen un video original para evaluar todos los movimientos.

Para medir el generador en tu PC, detén el worker y ejecuta `.\medir-ia-local.bat --avatar`. El medidor excluye seguimiento, extracción de movimiento, compresión, red y dibujo. Más hilos o un modelo mayor no garantizan más FPS; no se han medido CUDA ni DirectML en una GPU física en este entorno.
