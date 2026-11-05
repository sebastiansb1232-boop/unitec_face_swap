# Rendimiento · Another Face 1.15.0

## Procesamiento actual

Se reutilizan HyperSwap 256 e InSwapper 128; no se añaden pesos. Una pasada es el valor inicial. Más detalle utiliza cuatro pasadas y tarda más. LivePortrait se mantiene como animación fotográfica explícita y no es el intercambio recomendado sobre cámara.

El seguimiento toma un recorte de la cámara original antes de reducirlo. La entrada llega a 512 píxeles, o 320 en Fluido. Se vuelve al plano completo cada 12 detecciones o al perder la cara. Cada recorte se procesa como IMAGE para no reutilizar una ROI temporal en otro sistema de coordenadas. Se mantienen estabilización y predicción breve. La alternativa Face Mesh utiliza refinamiento de ojos y labios.

Se elimina la copia 2D intermedia de toda la cámara a 384 píxeles para el seguimiento. La copia grande para el generador solo se prepara cuando puede enviarse una petición. Hay una petición neuronal en vuelo y no se acumulan fotogramas antiguos. También se retira el blanqueamiento previo de la salida de intercambio y se reutiliza su muestra de tono.

La superficie Refinada utiliza 1790 vértices de dibujo y comparte 1322 aristas nuevas. Su buffer dinámico ocupa unos 101 KB, frente a unos 27 KB con los atributos actuales en Estándar. La curvatura y los valores del borde se reutilizan entre detecciones. Los 478 puntos medidos no se presentan como 1790 mediciones.

Gestos locales suaves utiliza una textura adicional del recorte de entrada y diferencias de cámara alineadas en ojos y boca. Reduce el aspecto congelado entre resultados; necesita píxeles actuales de cámara y trabajo gráfico adicional. No es un nuevo generador ni aumenta su frecuencia real.

La armonización corporal usa el segmentador ya incluido, en un Worker y con entrada de hasta 256 píxeles. No pinta toda la clase facial ni sube el cuello al brillo de la frontal. La máscara envejecida o desplazada pierde validez. Desactivarla permite comprobar su costo en un dispositivo concreto.

La captura de una foto pausa el video, vuelve a detectar sobre su fotograma congelado y lo compone con su propia malla. Se usa una entrada de hasta 768 píxeles para esa detección puntual. Si no existe un resultado neuronal compatible con la pose, espera al motor dentro de un plazo limitado. Esta espera no forma parte del contador de seguimiento en vivo; después se reanuda la cámara.

## Contadores y prueba de CPU

| Contador | Qué mide |
| --- | --- |
| Vista | Composiciones completadas por segundo. |
| Seguimiento | Detecciones nuevas, sin contar predicciones. |
| Generación IA | Texturas nuevas recibidas del generador, incluido el recorrido de solicitud. |

En pasadas completas con cámara simulada de 512 × 600, HyperSwap real en CPU, dos hilos y gráficos por software, se observaron peticiones de **1,16–2,33 s**, con **1,10–2,11 s** de procesamiento del motor, unas **7–13 composiciones/s** y **1,2–2,6 detecciones/s** en esas muestras. La última pasada terminó la captura y reanudó el video con 2,33 s por petición, 2,11 s de motor, 7,3 composiciones/s y 1,2 detecciones/s. Se comprobaron ambas superficies, 478 puntos, recorte activo y captura. Son mediciones puntuales de un entorno de carga variable, no un benchmark controlado, ni resultados de tu GPU, cámara física o túnel real. No prueban un aumento de FPS frente a otra arquitectura o configuración.

La mayor precisión del recorte, la superficie refinada y la compensación tienen costo. El perfil Fluido cambia a superficie Estándar y entrada de 320 píxeles. Puedes desactivar Gestos locales suaves o Armonizar piel visible para medir sus efectos por separado. Aumentar memoria, resolución, hilos o pasadas no garantiza mayor velocidad.

## Medir en tu PC

Con el motor detenido, ejecuta:

```powershell
.\medir-ia-local.bat
```

Mide una pasada del generador seleccionado automáticamente, con tensores sintéticos y sin calentamiento. Excluye reconocimiento, seguimiento, red, registro y composición. `--avatar` mide LivePortrait, una arquitectura distinta. Compara también los tres contadores de la página durante movimientos reales.

El instalador habitual prepara DirectML; esta entrega lo reutiliza. Solo para cambiar explícitamente el runtime, con el motor detenido, existen `optimizar-ia-local.bat --cuda` para NVIDIA compatible y `--cpu` para CPU. No es necesario ejecutarlos por esta actualización.

El proveedor real se muestra después de calentar el modelo. Algunas operaciones pueden ejecutarse en CPU aunque la sesión anuncie GPU. No se ha medido CUDA ni DirectML físicos en este entorno. LaMa prepara el fondo en un hijo de CPU después de liberar el motor facial, y lo reconstruye al terminar. Su cálculo no se realiza por fotograma.

## Fuentes

- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/performance/tune-performance/threading.html
