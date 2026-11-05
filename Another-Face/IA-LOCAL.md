# Intercambio neuronal local en Another Face

**Actualización 1.5.0:** el motor también puede conectarse a una página servida desde Render mediante HTTPS y clave privada. La configuración está en [MIGRAR-RENDER.md](MIGRAR-RENDER.md). Los comandos de instalación local de este documento siguen disponibles.

**Entrega actual: Retrato 7.** La cámara neuronal utiliza video nativo y una capa WebGL con vértices compartidos; la composición 2D completa se reserva para la foto. Se añade adaptación de luz en vivo, seguimiento reducido en el perfil Fluido y soporte opcional CUDA. Consulta [INICIO-RAPIDO.md](INICIO-RAPIDO.md) y [RENDIMIENTO.md](RENDIMIENTO.md). Las mediciones de Retrato 5/6 de este documento corresponden a la entrega anterior.

La arquitectura introducida en Retrato 6 separa la cámara, el seguimiento de gestos y la generación neuronal. La cámara sigue mostrándose mientras InSwapper calcula el siguiente rostro; la última textura neuronal se adapta a la posición y los gestos actuales mediante WebGL. ArcFace calcula la representación facial una vez por referencia. El motor ONNX se ejecuta en tu PC; la página puede servirse en esa misma PC o en Render con la conexión remota configurada.

La referencia de diseño es la experiencia de Deep Live Cam: elegir una foto, elegir cámara e iniciar, con mezcla por zonas y selección de resolución. Another Face tiene una implementación propia de integración, composición y controles. No incluye su interfaz, código de Deep Live Cam ni componentes de sus ediciones de pago.

## Actualizar una instalación existente en Windows

Detén Another Face con Ctrl + C. Extrae el ZIP y copia su contenido sobre la carpeta de tu proyecto, reemplazando los archivos de código. Conserva tu `.env`, `.venv-ai` y `local-ai/models`; no hace falta borrarlos. En PowerShell, dentro de esa carpeta:

```powershell
.\optimizar-ia-local.bat
npm.cmd run start:ai
```

El optimizador actualiza las dependencias del entorno aislado, instala el proveedor DirectML y verifica los modelos existentes. Reutiliza los pesos que coinciden con su SHA-256: no vuelve a descargar los 452 MB si ya están completos. Abre http://localhost:3000 y recarga con Ctrl + F5. Debe aparecer **Another Face**. Elige el modo neuronal como antes.

Si tu controlador no funciona bien con DirectML, detén los procesos y utiliza la alternativa CPU:

```powershell
.\optimizar-ia-local.bat --cpu
npm.cmd run start:ai
```

## Windows Primera instalación

Necesitas Node.js y Python 3.12 de 64 bits. Descomprime esta entrega en una carpeta nueva y copia allí tu .env si utilizas el guardado de fotos. Abre PowerShell en esa carpeta y ejecuta:

```powershell
.\instalar-ia-local.bat
```

El instalador crea .venv-ai dentro de esta carpeta, instala las dependencias y descarga aproximadamente **452 MB de modelos**, además de las bibliotecas. La descarga puede tardar y requiere conexión. Los modelos están fijados a revisiones concretas y se verifican tanto por tamaño como por SHA-256. No se ejecutan instaladores descargados de Deep Live Cam. La primera instalación requiere espacio adicional para el entorno y la caché de pip.

Para iniciar después:

```powershell
npm.cmd run start:ai
```

También puedes abrir iniciar-ia-local.bat. Este comando inicia el servidor web y el servicio de inferencia. Abre http://localhost:3000 y espera a que los modelos terminen de cargar. Selecciona **Retrato**, carga tu referencia y elige **Neuronal · Motor IA**. Para finalizar ambos procesos utiliza Ctrl + C en la terminal que los inició.

Si eliges el modo neuronal antes de que esté disponible, la página conserva el modo ligero y muestra las instrucciones. No hace falta instalar Python para utilizar el modo ligero con npm.cmd start.

## Aceleración en Windows

El instalador selecciona DirectML por defecto para aprovechar una GPU compatible, incluida una GPU integrada cuando el controlador lo permita. Para volver a esa configuración después de utilizar CPU:

```powershell
.\optimizar-ia-local.bat
npm.cmd run start:ai
```

El cambio de paquetes se realiza dentro de .venv-ai. Si repites la instalación, detén primero los procesos de Another Face. El modo CPU está probado en esta entrega; DirectML está preparado y no se ha probado en una GPU física. Si el proveedor no está disponible o no puede inicializarse, se selecciona CPU. La interfaz informa de CPU o DirectML y del tiempo real de procesamiento. El proveedor mostrado identifica la sesión; ONNX puede ejecutar operaciones no compatibles en CPU.

## Linux y macOS

En la carpeta del proyecto:

```bash
python3.12 -m venv .venv-ai
.venv-ai/bin/python -m pip install -r local-ai/requirements.txt
.venv-ai/bin/python local-ai/download_models.py
npm ci
npm run start:ai
```

Si utilizas otro entorno ya preparado, puedes indicar su ejecutable mediante ANOTHERFACE_PYTHON. Los pesos se buscan en local-ai/models o en la ruta indicada por ANOTHERFACE_MODELS.

## Cómo trabaja

1. La web obtiene los puntos faciales de la referencia y de las capturas mediante MediaPipe. En modo neuronal, el seguimiento se ejecuta en un Worker con OffscreenCanvas cuando el navegador lo permite; si no, utiliza el seguimiento habitual con una cadencia limitada. La cámara se dibuja por su propio ciclo y no espera a Python.
2. La web envía solamente el recorte del rostro, de hasta 320 píxeles por lado, junto con sus puntos. ArcFace calcula la identidad una sola vez por cambio de referencia. InSwapper genera el rostro manteniendo la pose y expresión de esa captura.
3. La salida se recompone con máscaras suaves. Se conservan regiones de ojos y boca según los controles. Al detectar un párpado cerrado o una boca muy abierta se incrementa su conservación para evitar que el modelo congele el gesto.
4. Se aplica una corrección de color limitada, textura fina de la captura y una unión de gradientes con OpenCV cuando el recorte permite hacerlo. No se activa un restaurador generativo de belleza que pueda borrar textura o cambiar rasgos.
5. Al llegar el resultado, se extrae su textura facial y se reproyecta sobre el seguimiento actual; el cuerpo y el fondo proceden siempre de la cámara actual. Una predicción de movimiento breve y acotada acompaña la traslación entre detecciones. Ojos y boca incorporan la captura actual para conservar los gestos. La textura nueva se mezcla durante 120 ms para reducir saltos.
6. Solo hay una solicitud neuronal en vuelo por cliente; las capturas intermedias se descartan. Las respuestas de una referencia anterior no reaparecen después de un cambio o apagado. Al perder el seguimiento se retira el rostro almacenado; también se atenúa cuando la pose actual difiere mucho de la procesada.

El motor neuronal intercambia **el rostro** y conserva el cabello de la captura. La transferencia de color y peinado de Retrato 4 continúa disponible en el modo ligero. En modo neuronal se utilizan Intensidad, Tono, Textura, Estabilidad, Bordes suaves y Composición por zonas; el control geométrico Rasgos de referencia corresponde al modo ligero.

## Calidad y rendimiento

El contador distingue tres trabajos reales:

| Indicador | Qué mide |
| --- | --- |
| IA | Rostros nuevos recibidos del motor por segundo; incluye el recorrido de la solicitud. |
| Vista | Fotogramas actuales de cámara dibujados por segundo, con la última textura neuronal disponible. |
| Seguimiento | Detecciones faciales completadas por segundo; la predicción no cuenta como una detección nueva. |

Una vista de 30 FPS con IA a 1 FPS significa que el movimiento y la composición se actualizan con más frecuencia que la textura neuronal. No significa que se generen 30 rostros nuevos por segundo. Si la IA tarda varios segundos, los cambios grandes de pose o iluminación siguen teniendo demora; se atenúa el efecto ante una pose incompatible. El seguimiento muy lento puede dejar desfase en movimientos rápidos.

ONNX utiliza optimización completa del grafo, memoria reutilizable en CPU y hasta cuatro hilos por defecto, ajustados al número de procesadores. ArcFace usa un hilo y OpenCV uno para reservar recursos a la cámara. Los hilos de ONNX no quedan ocupados girando durante las esperas. DirectML utiliza ejecución secuencial y desactiva los patrones de memoria como requiere ese proveedor. Se mantienen los mismos pesos y el posprocesamiento de textura, color y bordes; no se añadió un restaurador de belleza.

En CPU puedes comparar dos o cuatro hilos antes de iniciar. Por ejemplo, en PowerShell:

```powershell
$env:ANOTHERFACE_THREADS="2"
npm.cmd run start:ai
```

Para recuperar la selección automática: `Remove-Item Env:ANOTHERFACE_THREADS`. Más hilos no garantizan más rendimiento: comparten recursos con el navegador. El perfil **Menor carga** utiliza una vista de 480 píxeles; puede reducir trabajo de composición y transferencia, aunque el tamaño de entrada de InSwapper sigue siendo 128 píxeles.

### Medición histórica de la entrega 6

Comparación en el mismo entorno de pruebas, con ONNX Runtime CPU 1.21.1. No es una medición de tu Ryzen ni una garantía de FPS:

| Prueba | Retrato 5 | Retrato 6 |
| --- | ---: | ---: |
| Inferencia InSwapper, mediana de tres ejecuciones después de calentar, mismo tensor | 2065 ms | 1585 ms |
| Cambios visibles del fondo en 7 segundos de cámara simulada, muestreo cada 40 ms | 3 | 45–55 |

La inferencia de esa prueba redujo su tiempo un **23 %**, sin diferencias numéricas de salida en el tensor comparado. La cámara de la prueba cambiaba el color de una franja fuera del rostro: esos cambios verifican que la vista avanza mientras la IA sigue trabajando. Se observaron 45 cambios utilizando el seguimiento habitual con cadencia limitada y 55 con el Worker activo, en ejecuciones separadas del mismo escenario. Chromium utilizaba gráficos por software; su contador de Vista oscilaba y no representa una GPU física. Los modelos ONNX también se ejecutaron de verdad durante esa comparación. La aceleración DirectML no se ha medido aquí.

El modelo de intercambio utiliza un recorte de 128 píxeles. Ampliarlo no recupera detalles que el modelo no genera. Puede haber suavidad, pequeños artefactos y diferencias en perfiles, gafas, oclusiones o rostros muy pequeños. No equivale a las ediciones comerciales con modelos de mayor resolución. Una foto frontal nítida y luz uniforme ofrecen mejores condiciones para comparar resultados.

## Desde un celular

El modo ligero sigue funcionando en el navegador del celular con HTTPS. Para el modo neuronal puedes abrir la página HTTPS de Render, configurar allí la URL del túnel y la clave, y mantener activo el motor protegido de tu PC como explica MIGRAR-RENDER.md. Sin esa configuración, localhost en Render apunta al propio servidor de Render, no a tu laptop.

La cámara se activa por acción del usuario. El modo neuronal envía la referencia y los recortes faciales a tu motor. Cuando utilizas la conexión remota, pasan por Render y Cloudflare antes de llegar a tu PC. No se envían a los distribuidores de los modelos ni a un servicio externo de inferencia. El motor no escribe imágenes en disco. Mantiene un vector de referencia en memoria, con limpieza periódica tras 15 minutos sin uso y un máximo de ocho referencias. Al tomar una foto se utiliza el guardado explícito que ya existe en el proyecto.

## Pruebas

```powershell
npm.cmd test
.venv-ai\Scripts\python.exe -m unittest discover -s local-ai -p "test_*.py" -v
```

En la validación histórica de Retrato 6 pasaron 27 pruebas de JavaScript y cuatro de Python. Se verificó carga y ejecución real de los dos modelos con ONNX Runtime CPU, una referencia distinta a la persona de la captura, integración web, Worker activo, renderizado WebGL, comparación, captura JPEG con 478 puntos, cambio entre los motores, alternativa tras fallo del Worker, pérdida y recuperación del rostro, ausencia de desbordamiento a 390 píxeles y apagado sin nuevos envíos. Las pruebas automatizadas cubren alineación, máscaras, entradas inválidas, descarte de respuestas atrasadas, una solicitud en vuelo, reutilización de referencia, recorte y coordenadas de textura, predicción acotada, liberación de imágenes del Worker, alternativa sin OffscreenCanvas y rutas del proxy. La cámara de las pruebas de navegador era simulada con imágenes; no es una prueba en tu teléfono ni una medición de precisión biométrica.

La entrega 1.5.0 pasa 40 pruebas de JavaScript y 13 de Python, incluidas las nuevas comprobaciones de conexión y autenticación remotas. La prueba adicional Node → FastAPI utiliza inferencia simulada y transporte local. No se ha medido la conexión pública desde Render ni una GPU física en esta actualización.

## Procedencia y términos de los modelos

InSwapper se descarga del repositorio de modelos enlazado por el proyecto oficial de Deep Live Cam. ArcFace se obtiene de la distribución de modelos de FaceFusion. local-ai/models.json conserva las URL de revisión, tamaño y SHA-256 verificados de ambos archivos.

InsightFace distingue su código MIT de sus pesos preentrenados, que publica para investigación no comercial. Revisa los términos del proveedor antes de utilizar estos pesos fuera de ese ámbito. Los pesos no se incluyen en este ZIP.

Fuentes técnicas:

- https://deeplivecam.net/index.php/quickstart
- https://github.com/hacksider/Deep-Live-Cam
- https://github.com/deepinsight/insightface
- https://github.com/deepinsight/insightface/blob/master/python-package/insightface/model_zoo/inswapper.py
- https://huggingface.co/hacksider/deep-live-cam
- https://huggingface.co/facefusion/models-3.0.0
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
