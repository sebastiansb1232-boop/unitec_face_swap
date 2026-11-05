# Rendimiento · Another Face 1.13.0

## Qué hace cada motor

Avatar fotográfico reproyecta las fotos con seguimiento local y WebGL. Neuronal utiliza LivePortrait 512, HyperSwap 256 o InSwapper 128 en la PC. LaMa prepara un fondo opcional una vez y libera su sesión al terminar; no se ejecuta durante cada dibujo. Consulta [MEJORAS-RETRATO.md](MEJORAS-RETRATO.md) para los cambios y la instalación.

La cámara solicita 30 FPS, hasta 60 si están disponibles. El seguimiento trabaja con entrada de 384 píxeles (256 en Fluido), sin añadir una espera artificial después de cada detección. La vista utiliza hasta 960 píxeles, 720 en móvil. La malla filtra pose y forma; entre detecciones se aplica una predicción rígida breve. Estos pasos mejoran la continuidad del movimiento sin generar detalle neuronal nuevo.

Se mantiene una solicitud facial en vuelo, se descartan muestras antiguas y se respeta la espera del motor ocupado. El resultado se transporta como una textura JPEG de calidad 95 con registro facial. Se reutilizan texturas y buffers; el color se calcula desde una copia pequeña aproximadamente cuatro veces por segundo y su objetivo se suaviza. La segmentación de referencia se prepara al cargar cada foto. Se elimina la antigua ganancia global de luz y sus lecturas redundantes.

LaMa comparte el bloqueo de inferencia. Primero se liberan las sesiones faciales, el relleno se ejecuta en un hijo de CPU y se reconstruye el motor cuando ese hijo termina. No se intenta LaMa en DirectML ni una sesión adicional tras su error de MatMul. Esta operación es de preparación, no una generación por fotograma.

La geometría se actualiza con una detección nueva y se reproyecta entre muestras. El buffer gráfico baja de 45264 a 22800 bytes. Cuando la boca está cerrada y no se mezclan rasgos originales, se evita subir otra textura completa de cámara. El seguimiento conserva una entrada pequeña de video; la copia grande para el generador solo se prepara cuando puede enviarse una inferencia. No se acumulan copias mientras el motor está ocupado.

## Contadores y mediciones

| Contador | Qué mide |
| --- | --- |
| Vista | Composiciones completadas por segundo. |
| Seguimiento | Detecciones nuevas por segundo; no cuenta predicciones. |
| Generación IA | Resultados nuevos recibidos del generador facial, incluido el recorrido de solicitud. |

Avatar fotográfico no incrementa Generación IA. Reutilizar una textura o predecir una pose no cuenta como una generación. El video nativo puede refrescarse por separado de la textura facial.

En la página completa con cámara simulada, gráficos por software y modelos reales en CPU, se observaron aproximadamente **12–30 composiciones/s**, **7–17 detecciones/s** y unos **15–17 segundos** de inferencia LivePortrait. Se ejecutaron además el relleno aislado, la reconstrucción del motor y una nueva generación con un token actualizado. Estas medidas no corresponden a DirectML físico ni garantizan una frecuencia en tu PC.

Comparación local del compositor, con el mismo tamaño de 512 × 600, referencias, ajustes, fondo preparado y una muestra de seguimiento por cada tres dibujos. Se descartan 30 dibujos y se miden 90, sincronizando WebGL:

| Medición | 1.12 | 1.13 |
| --- | ---: | ---: |
| Mediana por composición | 1,4 ms | 0,7 ms |
| Percentil 90 | 8,3 ms | 4,2 ms |
| Buffer dinámico | 45264 bytes | 22800 bytes |

Es una prueba del compositor en software, sin cámara física, red ni generación durante las muestras. Las correcciones también modifican el contorno y la mezcla, por lo que no es una comparación del mismo resultado píxel a píxel. No convierte esos tiempos en FPS de generación neuronal ni prueba una duplicación de FPS en hardware real. La eliminación de copias redundantes se comprobó por separado.

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

Proveedor admite auto, cuda, dml y cpu; hilos, de 1 a 8. LaMa limita su preparación a cuatro hilos. Los dos ajustes opcionales de ojos y labios utilizan un hilo CPU y suman 0,74 MB de pesos. El índice de GPU se pasa al proveedor; no se descubre automáticamente la más rápida. Un número mayor de hilos puede competir con el navegador.

## Fuentes

- https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/performance/tune-performance/threading.html
- https://huggingface.co/Carve/LaMa-ONNX
