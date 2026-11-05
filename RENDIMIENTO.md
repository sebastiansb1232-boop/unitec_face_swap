# Rendimiento · Another Face 1.12.0

## Qué hace cada motor

Avatar fotográfico reproyecta las fotos con seguimiento local y WebGL. Neuronal utiliza LivePortrait 512, HyperSwap 256 o InSwapper 128 en la PC. LaMa prepara un fondo opcional una vez y libera su sesión al terminar; no se ejecuta durante cada dibujo. Consulta [MEJORAS-RETRATO.md](MEJORAS-RETRATO.md) para los cambios y la instalación.

La cámara solicita 30 FPS, hasta 60 si están disponibles. El seguimiento trabaja con entrada de 384 píxeles (256 en Fluido), sin añadir una espera artificial después de cada detección. La vista utiliza hasta 960 píxeles, 720 en móvil. La malla filtra pose y forma; entre detecciones se aplica una predicción rígida breve. Estos pasos mejoran la continuidad del movimiento sin generar detalle neuronal nuevo.

Se mantiene una solicitud facial en vuelo, se descartan muestras antiguas y se respeta la espera del motor ocupado. El resultado se transporta como una textura JPEG de calidad 95 con registro facial. Se reutilizan texturas y buffers; el color se calcula desde una copia pequeña aproximadamente cuatro veces por segundo y su objetivo se suaviza. La segmentación de referencia se prepara al cargar cada foto. Se elimina la antigua ganancia global de luz y sus lecturas redundantes.

LaMa comparte el bloqueo de inferencia: preparar un fondo pausa los envíos faciales hasta terminar. Después se reutilizan la imagen preparada y una máscara gráfica del contorno. Sin fondo preparado se conserva la reproyección anterior; con él se permiten cambios geométricos algo mayores sin dejar la silueta original visible.

## Contadores y mediciones

| Contador | Qué mide |
| --- | --- |
| Vista | Composiciones completadas por segundo. |
| Seguimiento | Detecciones nuevas por segundo; no cuenta predicciones. |
| Generación IA | Resultados nuevos recibidos del generador facial, incluido el recorrido de solicitud. |

Avatar fotográfico no incrementa Generación IA. Reutilizar una textura o predecir una pose no cuenta como una generación. El video nativo puede refrescarse por separado de la textura facial.

En las pruebas actuales de página completa con cámara simulada, gráficos por software y modelos reales en CPU, la vista rondó **10–28 FPS** y el seguimiento **6–14 FPS**. LivePortrait necesitó **14,9–16,5 segundos** de inferencia para una salida de 512; la primera solicitud observada, con preparación, tardó entre 18,5 y 21,1 segundos. La prueba aislada de LaMa tardó **15,2 segundos** para preparar un fondo de 512 × 600, procesado internamente a 512 con márgenes que conservan la proporción.

No son medidas de la GPU del usuario ni una comparación controlada con la versión anterior. Se comprobaron los botones de ambos fondos, las tres referencias, los tonos, el registro, los píxeles de boca y contorno, la captura y el guardado simulado, sin errores WebGL. Las pruebas sintéticas de boca no sustituyen una secuencia original con la lengua en movimiento. No se han probado dispositivos móviles físicos ni CUDA/DirectML en una GPU física.

## Medir en tu PC

Detén el motor y ejecuta:

```powershell
.\medir-ia-local.bat --avatar
```

Para el modelo de intercambio seleccionado automáticamente, utiliza `.\medir-ia-local.bat`. El medidor se niega a cargar otra copia si el puerto está ocupado. Utiliza tensores sintéticos, descarta el calentamiento y mide solo una pasada del generador: excluye extracción de movimiento, seguimiento, compresión, red y dibujo. Para 30 generaciones por segundo, todo el recorrido necesita sostener aproximadamente 33,3 ms por resultado.

El arranque ejecuta una inferencia de calentamiento y muestra el proveedor realmente inicializado. Algunas operaciones pueden caer en CPU aunque la sesión anuncie GPU. LivePortrait tiene una carga muy distinta de InSwapper; más hilos o más pasadas no garantizan más FPS.

## Proveedor e hilos

El instalador normal utiliza DirectML. `optimizar-ia-local.bat --cuda` prepara explícitamente ONNX Runtime GPU y bibliotecas NVIDIA; `--cpu` prepara CPU. Detén el motor antes de cambiar el runtime. LaMa reutiliza el instalado.

Configuración opcional antes de arrancar:

```powershell
$env:ANOTHERFACE_PROVIDER="auto"
$env:ANOTHERFACE_GPU_DEVICE="0"
$env:ANOTHERFACE_THREADS="4"
npm.cmd run start:worker
```

Proveedor admite auto, cuda, dml y cpu; hilos, de 1 a 8. LaMa limita su preparación a cuatro hilos. El índice de GPU se pasa al proveedor; no se descubre automáticamente la más rápida. Un número mayor de hilos puede competir con el navegador.

## Fuentes

- https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/performance/tune-performance/threading.html
- https://huggingface.co/Carve/LaMa-ONNX
