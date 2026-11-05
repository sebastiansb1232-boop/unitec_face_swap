# Another Face · Retrato 7

## Cambios

La vista neuronal presenta el video nativo del navegador y una capa WebGL transparente para el rostro. Ya no reconstruye toda la cámara en un lienzo 2D ni copia el resultado WebGL a ese lienzo por fotograma. Esa composición completa se realiza al tomar una foto, con las coordenadas del rostro de esa captura.

La malla utiliza vértices compartidos e índices estáticos. Los datos dinámicos pasan de 102240 a 18840 bytes en la topología probada. Las texturas neuronales se actualizan cuando llega una respuesta nueva. La adaptación de luz compara la captura actual con la que originó el resultado y aplica una ganancia acotada; puede desactivarse en Acabado natural. Se conservan textura, mezcla de bordes y regiones de ojos y boca actuales.

Al terminar cada inferencia, el cliente considera la muestra más reciente disponible. Mantiene una solicitud neuronal en vuelo, descarta respuestas de otra referencia y evita procesar dos veces la misma muestra. El límite máximo de envío es de 30 por segundo, condicionado al motor y a las muestras nuevas; no es una promesa de 30 FPS neuronales.

Original presenta directamente la cámara y detiene las inferencias faciales innecesarias. El retrato ligero conserva transferencia de apariencia, cabello y composición.

## Perfil Fluido

En modo neuronal utiliza una composición de 480 píxeles y seguimiento de hasta 320 píxeles de ancho. Omite el refinamiento adicional del iris y conserva ojos, labios, expresión y contorno. La alineación neuronal utiliza los centros de los ojos estimados por la malla. Natural y Más parecido mantienen el seguimiento refinado y hasta 480 píxeles de entrada al seguimiento.

Este perfil prioriza respuesta en equipos con pocos recursos; los movimientos finos de los ojos pueden ser menos precisos. Mantiene los mismos pesos neuronales y su frecuencia de generación sigue dependiendo de InSwapper.

## Proveedores y configuración

El modo automático considera CUDA si está instalado, después DirectML si está disponible y finalmente CPU. Comprueba los proveedores realmente inicializados para evitar mostrar CUDA cuando ONNX terminó utilizando CPU. ArcFace se ejecuta una vez por referencia y permanece en CPU para reservar la GPU al intercambio.

El instalador normal conserva DirectML; `--cuda` instala explícitamente ONNX Runtime GPU 1.21.1 y sus bibliotecas NVIDIA, utilizando la función oficial de precarga en Windows. No se descargan esas bibliotecas por defecto. `--cpu` selecciona la variante CPU.

Variables avanzadas, antes de iniciar en PowerShell:

```powershell
$env:ANOTHERFACE_PROVIDER="auto"
$env:ANOTHERFACE_GPU_DEVICE="0"
$env:ANOTHERFACE_THREADS="4"
npm.cmd run start:ai
```

`ANOTHERFACE_PROVIDER` admite auto, cuda, dml y cpu. El índice GPU se pasa al proveedor; en DirectML corresponde a la enumeración DXGI. No se identifica automáticamente la GPU más rápida. Los hilos CPU se limitan a 1–8 y el valor automático conserva recursos para el navegador. Más hilos no garantizan más FPS.

## Indicadores

| Indicador | Medición |
| --- | --- |
| Vista | Composiciones completadas por segundo. El video nativo puede refrescarse independientemente de la textura facial. |
| Generación IA | Resultados neuronales nuevos recibidos por segundo, incluido el recorrido de la solicitud. |
| Seguimiento | Resultados de seguimiento completados por segundo; las predicciones no cuentan como detecciones nuevas. |

Se muestra un guion mientras faltan muestras. No se multiplica el contador neuronal por los fotogramas de cámara o por la reproyección.

## Validación

Se utiliza Chromium con gráficos por software y cámara simulada, ejecutando realmente ArcFace e InSwapper en ONNX Runtime CPU. Se comprueban referencia propia, captura con malla, comparación, cambio entre motores, pérdida y recuperación del rostro, perfil Fluido, alternativa al fallar el Worker y apagado sin nuevos envíos. Se inspeccionan escritorio y presentación a 390 píxeles; no equivale a una prueba en un teléfono físico.

Una prueba de color del renderizador comprueba espejo, adaptación de luz acotada y retirada del rostro al perder seguimiento. La comparación de las entregas 6 y 7 usa los mismos modelos y tamaño de composición. El tiempo de composición se mide con cinco iteraciones de calentamiento y 60 muestras sincronizadas mediante WebGL, manteniendo fija la muestra facial; no equivale a FPS de una videollamada. Las mediciones concretas se añaden al final de este documento.

CUDA y DirectML no se probaron en una GPU física. El modelo conserva su entrada de 128 píxeles: ampliar la vista no genera detalle nuevo. Poca luz, oclusiones o giros grandes pueden causar artefactos; se atenúa el efecto ante una pose incompatible. No hay garantía de una frecuencia fija ni de precisión biométrica.

## Fuentes técnicas

- https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/performance/tune-performance/threading.html


## Mediciones de esta entrega

| Prueba, mismo entorno de CPU y Chromium por software | Entrega 6 | Entrega 7 |
| --- | ---: | ---: |
| Preparación y composición, mediana de 60 muestras sincronizadas | 0,8 ms | 0,3 ms |
| Datos dinámicos de vértices por composición | 102240 bytes | 18840 bytes |
| Copias de cámara a lienzo 2D durante una muestra de unos 8 segundos | 161 | 20 |
| Copias de la capa WebGL a 2D durante la vista de entrega 7 | — | 0 |

El contador de copias de cámara de la entrega 7 corresponde al seguimiento; no se reconstruye el fondo por cada fotograma. Las medidas dependen del entorno, y la prueba de composición mantiene fija la muestra facial. No deben convertirse en una predicción de FPS en tu PC.

En una comprobación adicional, el seguimiento de Natural rondó 2,4 FPS y el perfil Fluido alcanzó aproximadamente 4,5 FPS. La vista osciló durante las ejecuciones; no se observó un aumento constante de todos los contadores. La IA por CPU permaneció alrededor de 0,3 resultados por segundo en este entorno. El perfil más rápido mejora la respuesta geométrica sin generar más detalle facial. Para elevar sustancialmente la generación neuronal, el rendimiento del proveedor GPU es determinante y no se ha medido aquí en hardware físico.
