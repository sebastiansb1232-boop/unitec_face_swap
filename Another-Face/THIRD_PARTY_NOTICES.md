# Dependencias y modelos de terceros

## MediaPipe Face Mesh

Paquete de Google @mediapipe/face_mesh, versión 0.4.1633559619. Se incluye la distribución publicada en https://registry.npmjs.org/@mediapipe/face_mesh/-/face_mesh-0.4.1633559619.tgz, sin modificar sus archivos. Licencia Apache 2.0, indicada en public/vendor/face-mesh/package.json. Conserva los avisos incluidos en la distribución.

## MediaPipe Tasks Vision

Paquete de Google @mediapipe/tasks-vision, versión 0.10.21. Se incluyen vision_bundle.mjs y los cargadores WASM con y sin SIMD, obtenidos de https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/. Licencia Apache 2.0, indicada en el package.json conservado junto a los archivos.

El texto de Apache 2.0 se incluye en public/vendor/LICENSE-APACHE-2.0.txt, obtenido del repositorio oficial https://github.com/google-ai-edge/mediapipe.

## Modelo de segmentación

Modelo SelfieMulticlass 256x256 distribuido por Google MediaPipe, float32, revisión 1. Se conserva el archivo original sin modificar:

https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite

Guía y categorías del modelo: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter

Guía de implementación web: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js

Las categorías utilizadas son cabello, piel corporal y piel facial. El modelo se ejecuta en el dispositivo; no se envían las imágenes a Google. El código de Another Face no entrena ni modifica estos pesos.

## Fotografías y recursos previos

Las cuatro fotografías de referencia, el filtro Perrito y el favicon proceden del ZIP original del proyecto. No se añaden fotografías de otras personas. La nueva función permite cargar una referencia local sin incorporarla al ZIP ni enviarla al servidor.

## Integridad

public/models/assets-sha256.json registra tamaños y huellas SHA-256 de los modelos y archivos WASM incluidos, para detectar copias incompletas. Las huellas corresponden a esta distribución y no constituyen una certificación de desempeño del modelo.

## Motor neuronal opcional y referencia de diseño

La página Quickstart de Deep Live Cam y su repositorio oficial se consultaron para entender el flujo de selección de foto y cámara, las máscaras regionales, la resolución y la separación entre intercambio y restauración. No se incorporó código de Deep Live Cam ni de sus ediciones comerciales.

local-ai/engine.py implementa alineación por similitud, la convención de normalización de ArcFace y la proyección de identidad documentada por InsightFace. El código de InsightFace se publica bajo MIT; los modelos tienen términos distintos del código. Esta implementación utiliza NumPy, OpenCV, ONNX y ONNX Runtime. La integración HTTP opcional utiliza FastAPI y Uvicorn, que se instalan en un entorno aparte y no se distribuyen dentro del ZIP.

Las URL de revisión y huellas de los pesos opcionales están en local-ai/models.json. Su descarga es explícita y los pesos no se incluyen en esta entrega. Consulta IA-LOCAL.md y los términos de los distribuidores para su ámbito de uso.

Fuentes: https://deeplivecam.net/index.php/quickstart, https://github.com/hacksider/Deep-Live-Cam, https://github.com/deepinsight/insightface, https://huggingface.co/hacksider/deep-live-cam, https://huggingface.co/facefusion/models-3.0.0.
