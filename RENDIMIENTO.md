# Rendimiento · Another Face 1.14.0

## Motores y carga

Intercambio neuronal utiliza HyperSwap 256 si está instalado y, de lo contrario, InSwapper 128. Ambos operan sobre el recorte de cámara. LivePortrait 512 anima la apariencia de una fotografía y se mantiene como opción explícita. La resolución nativa no mide por sí sola parecido ni velocidad.

La configuración inicial usa una pasada. «Más detalle» ejecuta cuatro fases y tarda más. El perfil Fluido reduce el seguimiento a una entrada de 256 píxeles y la vista a 480; el normal usa 384 para seguimiento y hasta 960 para la vista, 720 en móvil. La cámara solicita 30 FPS, hasta 60 si están disponibles. No se añaden esperas artificiales después de cada detección.

Hay una solicitud neuronal en vuelo. Se descartan muestras viejas y no se acumulan copias de cámara mientras el generador está ocupado. Se transporta solo la textura facial JPEG de calidad 95 y se registra su malla en paralelo. Entre detecciones se reutiliza geometría y se predice brevemente la pose, conservando la apertura facial. En intercambio no se presenta una fotografía como resultado alternativo cuando falta un registro válido.

La unificación de piel agrega segmentación local en Worker sobre una entrada de hasta 256 píxeles, con intervalo adaptado a su tiempo de procesamiento. WebGL aplica el color sin recorrer todos los píxeles de cámara en JavaScript. Los buffers y lienzos de máscara se reutilizan. La máscara envejecida o desplazada pierde intensidad. Esta corrección tiene un costo adicional; desactivar «Unificar toda la piel visible» permite comprobar su efecto en un dispositivo concreto.

LaMa es una preparación opcional, no se ejecuta por fotograma. Primero se liberan las sesiones faciales, se ejecuta el hijo de CPU y se reconstruye el motor al terminar. Se conserva el bloqueo hasta que el trabajo nativo acaba incluso si se cancela la conexión HTTP.

## Contadores

| Contador | Medición |
| --- | --- |
| Vista | Composiciones completadas por segundo. |
| Seguimiento | Detecciones nuevas; excluye predicciones. |
| Generación IA | Resultados nuevos recibidos del motor facial. |

Mover una textura o animar una foto no incrementa la generación neuronal. El video nativo puede refrescarse por separado de la cara generada.

En la prueba completa de esta entrega, con tres referencias, cámara simulada y HyperSwap en CPU, las solicitudes observadas tardaron aproximadamente **0,85–1,99 s**, con **0,80–1,59 s** de procesamiento del motor. En esas muestras se midieron aproximadamente **3–19 composiciones/s** y **1–9 detecciones/s** con gráficos por software y segmentación activa. Es un entorno de comprobación, no tu PC ni una cámara física; los valores varían durante la carga y entre muestras; con otras tareas de CPU se observaron también mínimos cercanos a 1 composición/s. No es una comparación controlada con LivePortrait, que además ejecuta otra arquitectura y otro tipo de efecto.

No se ha medido tu GPU DirectML. Para 30 generaciones/s, el cómputo y todo el recorrido tendrían que sostener unos 33,3 ms por resultado. Aumentar hilos, resolución o pasadas no garantiza aumentar FPS.

## Medir en tu PC

Detén el motor para evitar cargarlo dos veces y ejecuta:

```powershell
.\medir-ia-local.bat
```

El medidor utiliza tensores sintéticos, descarta el calentamiento y mide una pasada del generador seleccionado automáticamente; excluye extracción de identidad, seguimiento, compresión, red y dibujo. `--avatar` mide el generador LivePortrait opcional, no el intercambio. Compara también los tres contadores de la página durante el uso real.

## Proveedor e hilos

El instalador normal prepara DirectML en Windows. `optimizar-ia-local.bat --cuda` prepara ONNX Runtime GPU y bibliotecas NVIDIA para una GPU compatible; `--cpu` prepara CPU. Detén el motor antes de cambiar runtime. Esta entrega de código reutiliza tu entorno y no requiere reinstalar DirectML.

Opcional antes de arrancar:

```powershell
$env:ANOTHERFACE_PROVIDER="auto"
$env:ANOTHERFACE_GPU_DEVICE="0"
$env:ANOTHERFACE_THREADS="4"
.\iniciar-intercambio-ia.bat
```

El proveedor admite auto, cuda, dml y cpu; los hilos, de 1 a 8. Se muestra el proveedor realmente inicializado después de calentar el modelo. Algunas operaciones pueden caer en CPU aunque la sesión anuncie GPU. Más hilos pueden competir con el navegador. No se detecta automáticamente la GPU física más rápida ni se han probado CUDA/DirectML físicos en este entorno.

## Fuentes

- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- https://onnxruntime.ai/docs/performance/tune-performance/threading.html
- https://github.com/facefusion/facefusion/tree/master/facefusion/processors/modules/face_swapper
- https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter
