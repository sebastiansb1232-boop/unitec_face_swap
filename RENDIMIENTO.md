# Rendimiento · Another Face 1.16.0

## Cambios de esta entrega

El seguimiento mantiene un recorte mientras la cara cabe en él. VIDEO reutiliza el seguimiento dentro de ese marco; al cambiar el recorte se reinicia el grafo para evitar reutilizar coordenadas de otro marco. La captura de fotos utiliza IMAGE independiente. Una detección dañada se descarta y se vuelve a buscar la cara.

El filtro externo de pose acota el desfase según la velocidad observada. La predicción rígida es breve; no genera expresiones ni convierte una detección antigua en una medición nueva.

«Priorizar respuesta al girar» reduce la superficie a Estándar y utiliza una pasada neuronal durante el movimiento. El detalle elegido se recupera al estabilizarse. Las fotos guardadas conservan el detalle elegido. La superficie sigue midiendo los mismos 478 puntos; cambiar entre 468 y 1790 vértices afecta el dibujo y su carga, no la cantidad de detecciones.

La armonización corporal limita su dibujo a la región de piel y descarta enseguida píxeles sin cobertura. Sus solicitudes omiten cabello y estadísticas de fondo. Se conservan las restricciones de exposición y las sombras del cuello.

Las texturas de hasta once poses se conservan durante 45 segundos para el intercambio. Se elige la pose compatible sin llamar al motor para esa selección. Generar una pose nueva continúa requiriendo inferencia, transporte y registro. La cámara y las referencias siguen tratándose con los controles de autenticación existentes.

## Medidas y límite de 50 ms

| Indicador | Qué mide |
| --- | --- |
| Vista | Composiciones completadas por segundo. |
| Seguimiento | Nuevas mediciones de puntos, sin contar predicciones. |
| Generación IA | Texturas nuevas recibidas del motor. |
| Detección | Preparación, transferencia e inferencia del seguimiento hasta recibir puntos. |
| Malla | Edad de la última muestra en el momento de actualizar el indicador. |

Detección y Malla se solapan. No son una medición completa de exposición de cámara a presentación física de pantalla.

En dos pruebas completas recientes, con una imagen simulada de 512 × 600, HyperSwap real en CPU, dos hilos y gráficos por software, se observaron aproximadamente **15,5–18,5 composiciones/s, 6,8–7,1 detecciones/s, 111–118 ms de detección y 1,30–1,31 s de petición neuronal** —1,25–1,26 s correspondían al motor—. La última muestra fue de 15,5 composiciones/s, 6,8 detecciones/s y 118 ms de detección. Se comprobaron ambas superficies, segmentación, captura con guardado simulado y reanudación del video.

Una comprobación aislada del detector VIDEO, sin el motor neuronal trabajando a la vez, dio una mediana de unos 41 ms y un percentil 95 de 56 ms en una pasada. Otra pasada con distinta carga dio aproximadamente 68 ms y 581 ms respectivamente. Es un entorno compartido y variable; estos resultados no acreditan un aumento controlado frente a 1.15 ni garantizan el comportamiento de la GPU o cámara del usuario.

**No se ha alcanzado ni garantizado una latencia total de 50 ms.** Una transición programada de 35 ms puede tardar más en pantalla si los fotogramas se dibujan más despacio. Las cuatro pasadas incrementan el tiempo neuronal; el fondo LaMa se prepara por separado y requiere cámara fija.

## Medir en tu PC

Comprueba la versión 1.16.0, utiliza primero una pasada y Priorizar respuesta al girar. Anota los tres FPS y Detección/Malla durante frontal, giro y regreso al mismo perfil. Compara con el detalle de cuatro pasadas, manteniendo iguales cámara y luz. La reutilización de poses solo se comprueba después de haber generado ese lado.

Con el motor detenido puedes ejecutar:

```powershell
.\medir-ia-local.bat
```

El motor realiza calentamiento y este script mide sus corridas posteriores con tensores sintéticos; excluye reconocimiento, seguimiento, red, registro y composición. `--avatar` mide LivePortrait, una arquitectura distinta.

No se añaden pesos ni se necesita reinstalar DirectML. Los scripts de cambio explícito de runtime siguen disponibles para CUDA o CPU; no son necesarios para esta entrega. No se han medido GPU CUDA ni DirectML físicos. LaMa mantiene su hijo aislado de CPU y libera primero el motor facial.

## Fuentes

- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
