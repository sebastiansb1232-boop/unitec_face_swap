# Another Face 1.13.0 · Labios de referencia y fondo con memoria controlada

## Cambios de esta entrega

- **Labios de la referencia:** se retira la mezcla automática que copiaba la boca completa de cámara. Los labios y su piel circundante pertenecen al retrato. «Dientes y lengua en vivo» solo asiste la cavidad al abrir la boca, con un pequeño margen interior y una transición breve. Al cerrar, desaparece. Se mantiene la geometría robusta ante un punto que salta hacia la lengua.
- **Color dominante:** «Referencia · Todo el rostro» es el valor inicial. El objetivo es el tono mediano de la fotografía frontal y se aplica también a los resultados generados y a los perfiles, incluida la frente. El ajuste conserva textura y gradientes; no es un relleno plano de un solo RGB. Cámara e Intermedio siguen disponibles; Intermedio comienza con 85 % de referencia. La cavidad oral mantiene sus colores naturales.
- **Apertura de ojos y labios con IA:** dos redes pequeñas de LivePortrait ajustan las aperturas, conservando la anatomía de referencia y usando cambios relativos desde la calibración. Suman 732443 bytes, unos 0,74 MB. Se ejecutan en CPU con un hilo, sin otra sesión DirectML. Los cuatro modelos anteriores continúan funcionando si estos dos pesos aún no están instalados. También se acota la ampliación geométrica excesiva de los párpados.
- **Perfil y cuerpo:** desaparece la reproyección que estiraba píxeles vecinos de cuello, ropa y fondo. Sin fondo preparado se mantiene la silueta original y se adaptan las facciones interiores. Con fondo preparado se puede retirar el contorno original y adaptar también la silueta. La máscara utiliza puntos del contorno, nariz y labios exteriores; un punto interior mal detectado no amplía el área hacia el cuerpo.
- **Fluidez:** la geometría y sus comprobaciones se reutilizan entre detecciones nuevas; posición y giro siguen la predicción rígida. Se reduce el buffer gráfico de 45264 a 22800 bytes y se evita trabajo de color de cámara cuando domina la referencia. También se omiten subidas de textura de cámara cuando no se usan regiones originales y copias grandes mientras el generador está ocupado. La generación neuronal sigue contando solo resultados nuevos.
- **Dependencias:** se actualizan paquetes compatibles y se fija qs 6.17.1 mediante overrides. La auditoría de esta entrega informa cero vulnerabilidades; el archivo de bloqueo se entrega actualizado.

## Tu registro DirectML / bad allocation

El nodo `/generator/model/model.5/conv1/ffc/convg2g/fu/rttn/MatMul_5` pertenece al archivo LaMa incluido en el manifiesto. Se verificó en el grafo ONNX: no aparece en el generador LivePortrait. La entrega 1.12 intentaba LaMa en DirectML y, al fallar, cargaba otra sesión de CPU mientras conservaba las sesiones faciales.

Ahora LaMa utiliza únicamente CPU en un proceso hijo. Bajo el bloqueo del motor se liberan primero las sesiones faciales, se prepara el fondo, termina el hijo y después se reconstruye LivePortrait con el proveedor configurado. La página vuelve a preparar las referencias porque los tokens anteriores ya no pertenecen a ese motor. Hay un tiempo máximo para el hijo y una alternativa manual si falla. Cancelar una solicitud HTTP mantiene el bloqueo hasta que termine el trabajo nativo, evitando solapar otra carga.

Este cambio evita ese intento DirectML y la carga simultánea de ambos generadores. No se ha probado en tu GPU física ni elimina todas las causas posibles de falta de memoria. **No hace falta cambiar toda tu instalación a CPU:** el motor facial puede seguir usando DirectML. Durante la preparación de fondo, la generación facial se pausa y la vista fotográfica continúa.

## Actualizar en la misma carpeta

Detén el motor con Ctrl + C y copia el contenido de Another-Face del ZIP sobre tu misma carpeta existente. Conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`. No crees una carpeta Another-Face dentro de otra.

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
npm.cmd ci
.\instalar-avatar-local.bat
.\iniciar-avatar-ia.bat
```

El instalador verifica y reutiliza los pesos completos. Si ya tenías LivePortrait, solo añade los dos modelos de gestos, unos 0,74 MB. No reinstala DirectML ni crea otro entorno. Si nunca lo instalaste, el conjunto LivePortrait completo ronda 339 MB; los modelos básicos siguen siendo necesarios.

Mantén el túnel existente abierto si aún apunta al puerto 8766. Si lo cerraste, abre otra terminal en la misma carpeta y ejecuta `.\iniciar-tunel-ia.bat`. Si cambia su dirección, actualiza `ANOTHERFACE_AI_URL` en Render y conserva el token que coincide con `.env.ai`.

Publica el código en main desde esa misma carpeta:

```powershell
git rev-parse --show-toplevel
git status
git add public local-ai scripts tests supabase *.js *.json *.md *.bat render.yaml .gitignore .env.example
git diff --cached --stat
git commit -m "Refina facciones y corrige memoria de Another Face 1.13.0"
git push origin main
```

La raíz y los archivos deben corresponder al proyecto. Los entornos, modelos descargados y claves permanecen excluidos. En tu servicio existente de Render despliega el último commit de main: Build `npm ci`, Start `npm start`. Recarga con Ctrl + F5. La cabecera y `/api/neural/status` deben mostrar **1.13.0** para web y motor, con protocolo 5. `gesture_retargeting: true` indica que se cargaron los ajustes adicionales. `background_safe: true` indica la nueva ruta de CPU aislada. El cliente usa caché v16.

## Ajustes recomendados

Selecciona Neuronal, perfil Natural, intensidad 100 % y **Referencia · Todo el rostro**. Deja «Unificar tono entre vistas» activado y las mezclas opcionales de ojos, boca, frente y mentón originales en cero. «Dientes y lengua en vivo» está activado por defecto y solo utiliza el interior de la boca; puedes desactivarlo para conservar exclusivamente la salida generada. Mira de frente, con ojos abiertos y boca relajada, para calibrar.

En las capturas aportadas el motor indica **1 vista**. Para utilizar ambos perfiles, vuelve a cargarlos después de recargar la página: las fotografías se conservan en memoria de la pestaña, no se guardan de forma permanente. El contador debe indicar tres vistas. Utiliza perfiles opuestos de la misma persona, preferiblemente de tres cuartos y con ojos visibles.

Para cambiar el contorno exterior, fija la cámara y abre **Retirar contorno original**:

- **Capturar fondo · 3 segundos:** sal por completo del encuadre y vuelve tras la confirmación. Conserva el fondo real y no carga otro modelo.
- **Generar fondo con IA · LaMa:** necesita el peso opcional, instalado una vez con `.\instalar-relleno-ia.bat`. LaMa puede inventar detalles detrás de la cabeza. La cámara debe permanecer fija. No repitas la instalación si el archivo de 208 MB ya se verificó.

Cambiar de cámara, resolución o apagarla invalida el fondo. Si cambia el escenario o mueves la cámara, prepara otro. El efecto intercambia el rostro; cuello, orejas, cabello y cuerpo conservan su apariencia de cámara. Al reducir la silueta, el fondo solo ocupa el espacio del contorno original, sin estirar las zonas vecinas.

## Verificación y límites

Pasan **99 pruebas JavaScript y 50 Python**. Incluyen tono frontal dominante, mezcla de color, límites de lengua y apertura oral, estabilización, conservación de silueta, cancelación sin liberar prematuramente el motor, selección CPU para LaMa y recuperación del motor tras un fallo simulado de memoria. `npm audit` informa **0 vulnerabilidades** con este archivo de bloqueo.

La página completa se probó en Chromium con tres referencias, cámara simulada, LivePortrait y sus ajustes reales, LaMa en proceso separado, reconstrucción del motor, nuevo token de referencia, una generación posterior y captura guardada en un servidor simulado. No hubo errores JavaScript ni WebGL ni desbordamiento a 390 píxeles. Las pruebas de píxeles distinguen labios de referencia e interior oral de cámara y comprueban que el antiguo contorno de nariz se sustituye por el fondo preparado. Se dibujaron ambos perfiles reales usando la misma foto como fuente y destino, sin desplazamiento espurio.

El generador continúa produciendo 512 píxeles nativos. En la prueba completa de CPU, la vista osciló aproximadamente entre 12 y 30 composiciones/s, el seguimiento entre 7 y 17 detecciones/s y LivePortrait necesitó unos 15–17 segundos de inferencia. Son contadores diferentes. No se ha medido tu DirectML ni se garantizan 30 generaciones neuronales/s. Las capturas filtradas no sustituyen un video original con todos los gestos para comprobar realismo o lengua muy extendida. Movimientos rápidos, oclusiones y perfiles extremos todavía pueden producir artefactos.

Consulta [RENDIMIENTO.md](RENDIMIENTO.md) para la medición de composición y cómo medir el generador en tu PC.
