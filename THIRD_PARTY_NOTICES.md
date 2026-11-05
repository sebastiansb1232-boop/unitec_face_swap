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

Desde 1.12 también se prepara una máscara por fotografía de referencia, reutilizando este mismo modelo. No se ejecuta segmentación adicional por cada fotograma ni se incorpora un detector semántico de lengua.

## Fotografías y recursos previos

Las cuatro fotografías de referencia, el filtro Perrito y el favicon proceden del ZIP original del proyecto. No se añaden fotografías de otras personas. Las fotografías cargadas no se incorporan al ZIP: Avatar fotográfico y Ligero las procesan en el dispositivo; Neuronal las envía al motor según el aviso de procesamiento de la página.

## Integridad

public/models/assets-sha256.json registra tamaños y huellas SHA-256 de los modelos y archivos WASM incluidos, para detectar copias incompletas. Las huellas corresponden a esta distribución y no constituyen una certificación de desempeño del modelo.

## Motor neuronal opcional y referencia de diseño

La página Quickstart de Deep Live Cam y su repositorio oficial se consultaron para entender el flujo de selección de foto y cámara, las máscaras regionales, la resolución y la separación entre intercambio y restauración. No se incorporó código de Deep Live Cam ni de sus ediciones comerciales.

local-ai/engine.py implementa alineación por similitud, la convención de normalización de ArcFace y la proyección de identidad documentada por InsightFace. El código de InsightFace se publica bajo MIT; los modelos tienen términos distintos del código. Esta implementación utiliza NumPy, OpenCV, ONNX y ONNX Runtime. La integración HTTP opcional utiliza FastAPI y Uvicorn, que se instalan en un entorno aparte y no se distribuyen dentro del ZIP.

Las URL de revisión y huellas de los pesos opcionales están en local-ai/models.json. Su descarga es explícita y los pesos no se incluyen en esta entrega. Consulta IA-LOCAL.md y los términos de los distribuidores para su ámbito de uso.

Fuentes: https://deeplivecam.net/index.php/quickstart, https://github.com/hacksider/Deep-Live-Cam, https://github.com/deepinsight/insightface, https://huggingface.co/hacksider/deep-live-cam, https://huggingface.co/facefusion/models-3.0.0.
# Topología de la máscara facial

`local-ai/face_triangles.json` contiene la teselación de MediaPipe Face Mesh distribuida también en el componente local de MediaPipe. Se utiliza para rasterizar la superficie facial proyectada. Conserva la procedencia y licencia de MediaPipe indicadas en este documento.



## HyperSwap 1C 256 (opcional desde 1.7.0)

Pesos de FaceFusion Labs, copyright (c) 2025 Henry Ruhs. El autor indica ResearchRAIL-MS: https://github.com/facefusion/facefusion-labs/blob/master/hyperswap/LICENSE.md. Configuración de entrenamiento y código: https://github.com/facefusion/facefusion-labs/tree/master/hyperswap. Distribución oficial fijada: https://huggingface.co/facefusion/models-3.3.0/blob/6271ab1c4619ceb2e534d65e0ec973f22a9aec38/hyperswap_1c_256.onnx. No se distribuye el peso en este ZIP; se descarga explícitamente con tamaño y SHA-256 en local-ai/models.json. La integración de Another Face implementa el contrato de entrada/salida, conserva la máscara del modelo y no incorpora la aplicación FaceFusion. ArcFace e InSwapper mantienen las condiciones descritas arriba.

## Face Landmarker (desde 1.8.0)

Modelo oficial MediaPipe Tasks Vision, float16, revisión 1, conservado sin modificación en `public/assets/models/face_landmarker.task`:

https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Tamaño: 3758596 bytes. SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
Guía oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js. Se utiliza con Tasks Vision 0.10.21 incluido en el proyecto. La cámara y el registro se ejecutan localmente; no se envían imágenes a Google. Conserva los avisos Apache 2.0 de MediaPipe indicados arriba.

## LivePortrait ONNX (opcional desde 1.8.0)

Fuente original: https://github.com/KlingAIResearch/LivePortrait. MIT License, copyright (c) 2024 Kuaishou Visual Generation and Interaction Center. Licencia original: https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE. Su aviso distingue también los modelos de InsightFace, de investigación no comercial; esta integración mantiene ArcFace y sus condiciones.

Las ecuaciones de rotación, movimiento relativo y el contrato de extracción/generación se implementan con NumPy y ONNX Runtime. La aplicación FaceFusion no se incorpora. El contrato de sus exportaciones ONNX se consultó en https://github.com/facefusion/facefusion/blob/master/facefusion/processors/modules/face_editor/core.py.

Se descargan explícitamente cuatro modelos exportados por FaceFusion (feature_extractor, motion_extractor, generator y stitcher), revisión `728b9659bd9691bf32cbf7f61af478d94b7ba81e`: https://huggingface.co/facefusion/models-3.0.0/tree/728b9659bd9691bf32cbf7f61af478d94b7ba81e. Tamaños y SHA-256 exactos en `local-ai/models.json`. No se redistribuyen sus pesos en el ZIP. La licencia del código original no sustituye las condiciones del distribuidor o de componentes de terceros; consulta ambas antes de otros usos.

## LaMa ONNX (relleno opcional desde 1.12.0)

Fuente original de LaMa: https://github.com/advimman/lama. Exportación de Carve: https://huggingface.co/Carve/LaMa-ONNX y https://github.com/Carve-Photos/lama. Sus avisos indican Apache-2.0. Se utiliza el contrato de entrada fija de 512 píxeles, imagen RGB CHW en 0–1 y máscara con 1 para retirar; la salida es RGB CHW en 0–255. La aplicación de Carve no se incorpora.

Descarga explícita de `lama_fp32.onnx`, revisión `c3c0c9e468934d62e79c329e35d82dd09ff8c444`, 208044816 bytes, SHA-256 `1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6`. Las URL y la huella se conservan en `local-ai/models.json`. No se incluyen los pesos en este ZIP. El texto Apache 2.0 está en `public/vendor/LICENSE-APACHE-2.0.txt`.

Solo se solicita al pulsar Generar fondo con IA. Las imágenes se procesan en el motor configurado de Another Face; no se envían a Carve ni a Hugging Face. Capturar un fondo limpio manualmente no requiere este modelo.

## Ajustes de ojos y labios de LivePortrait (opcionales desde 1.13)

Se agregan las exportaciones `live_portrait_eye_retargeter.onnx` (581421 bytes, SHA-256 `13cf8b06f0a314e6e65b4a47fea5ce270edb79cd54359c4d273f2c139820276b`) y `live_portrait_lip_retargeter.onnx` (151022 bytes, SHA-256 `0f5b76344d0bfbb44c8a0b1ec57a4a7c36fd38db530338777a48c4a33a02d71f`). Pertenecen a la misma distribución fijada de FaceFusion models-3.0.0, revisión `728b9659bd9691bf32cbf7f61af478d94b7ba81e`, y no se incluyen en el ZIP. Se conservan en `local-ai/models.json` sus URL y huellas.

El contrato de entrada es un vector de 66 valores para ojos y 65 para labios, con salida 1 × 21 × 3. Se consultaron las funciones de ajuste de la implementación original de LivePortrait: https://github.com/KlingAIResearch/LivePortrait/blob/main/src/live_portrait_wrapper.py y el contrato ONNX en https://github.com/facefusion/facefusion/blob/master/facefusion/processors/modules/face_editor/core.py. La integración calcula residuos relativos y acotados con NumPy y ONNX Runtime; no incorpora la aplicación FaceFusion. Las condiciones del código original y de sus componentes de terceros se mantienen según la sección LivePortrait anterior.
