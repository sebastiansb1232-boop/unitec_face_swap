# IA local en Another Face 1.10.0

Esta entrega refina el tono entre fotos, los gestos neuronales y el contorno de perfil. Conserva **Avatar fotográfico en el navegador**, tres referencias y **LivePortrait opcional con salida de 512 píxeles**. HyperSwap e InSwapper siguen disponibles. El protocolo 5 exige actualizar tanto Render como la PC: las texturas se muestran solo tras verificar su registro facial. Lee [MEJORAS-RETRATO.md](MEJORAS-RETRATO.md) para las diferencias, los límites y la actualización de PC y Render.

## Primera instalación en Windows

Necesitas Node.js 22 y Python 3.12 de 64 bits. Abre PowerShell en la carpeta que contiene `package.json`:

```powershell
.\instalar-ia-local.bat
npm.cmd run start:ai
```

El instalador crea `.venv-ai`, instala las dependencias y descarga unos 452 MB de pesos básicos. Verifica su tamaño y SHA-256 y reutiliza los completos. No necesitas activar el entorno manualmente. Deja la terminal abierta y visita `http://localhost:3000`. Si falta Python, consulta [INICIO-RAPIDO.md](INICIO-RAPIDO.md).

Avatar fotográfico y los filtros del navegador funcionan sin Python con `npm.cmd start`. Para generar con IA local, selecciona **Neuronal · Generador de la PC**. El arranque calienta el modelo antes de anunciar que está listo.

## Actualizar en la misma PC

Detén el motor con Ctrl + C, reemplaza el código y conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`. Ejecuta `npm.cmd ci`. No hace falta reinstalar los paquetes de GPU por una actualización de código.

HyperSwap opcional:

```powershell
.\mejorar-ia-local.bat
npm.cmd run start:ai
```

LivePortrait opcional:

```powershell
.\instalar-avatar-local.bat
$env:ANOTHERFACE_SWAPPER="avatar"
npm.cmd run start:ai
```

Añade 338 MB. El comando con la variable sirve la web y Avatar en esa PC. Para volver a la selección automática en esa terminal, detén el proceso, ejecuta `Remove-Item Env:ANOTHERFACE_SWAPPER` e inicia de nuevo. La selección automática prefiere HyperSwap completo y después InSwapper; instalar Avatar no la cambia.

## Página en Render, motor en tu PC

Sigue [MIGRAR-RENDER.md](MIGRAR-RENDER.md). Después de preparar `.env.ai`, la terminal del motor utiliza `npm.cmd run start:worker` o, para exigir LivePortrait, `.\iniciar-avatar-ia.bat`. La segunda terminal mantiene el túnel.

Actualiza también Render para el protocolo 5. Mantén el mismo token; cambia la URL solo cuando reinicies el túnel. En Render se ejecuta `npm start`, sin instalar Python ni los pesos. No inicies `start:ai` y `start:worker` simultáneamente.

## Proveedores y aceleración

El instalador habitual prepara DirectML en Windows. Si una GPU compatible no puede inicializar o ejecutar la sesión, se intenta CPU y se informa del proveedor realmente cargado. Algunas operaciones pueden caer en CPU aunque la sesión anuncie GPU.

Para cambiar de runtime, con los procesos detenidos:

```powershell
.\optimizar-ia-local.bat --cpu
```

O con una NVIDIA y controlador compatibles:

```powershell
.\optimizar-ia-local.bat --cuda
```

Sin argumentos, el optimizador prepara DirectML. El cambio afecta al entorno aislado, no a la clave. CUDA requiere espacio y bibliotecas adicionales. No se han probado aquí CUDA o DirectML en una GPU física. LivePortrait tiene operaciones y memoria muy distintas a InSwapper: que funcione un modelo no garantiza la misma velocidad en otro.

Configuración avanzada de la sesión:

```powershell
$env:ANOTHERFACE_PROVIDER="auto"
$env:ANOTHERFACE_GPU_DEVICE="0"
$env:ANOTHERFACE_THREADS="4"
npm.cmd run start:worker
```

El proveedor admite auto, cuda, dml y cpu; los hilos, de 1 a 8. No se detecta automáticamente cuál GPU física es más rápida. Más hilos compiten con el navegador y no siempre mejoran los FPS.

## Flujo de procesamiento

1. La foto frontal y hasta dos perfiles se analizan en el navegador. La cámara utiliza Face Landmarker en un Worker, modo VIDEO; el registro de imágenes usa modo IMAGE.
2. Avatar rápido selecciona la fotografía adecuada y la reproyecta mediante geometría facial de profundidad estimada. No llama al generador ni transmite video a la PC.
3. En Neuronal, el cliente envía un recorte sin espejo y los puntos de ese mismo fotograma. ArcFace combina las referencias una vez. LivePortrait precalcula además las características de apariencia por vista.
4. El motor devuelve una textura alineada y la transformación. El navegador registra su malla en paralelo, ajusta las proporciones y la proyecta sobre el seguimiento actual. El rostro no espera a una respuesta nueva para moverse.
5. Se limita la corrección de luz y se evita volver a introducir la textura de la piel original. Avatar y Neuronal conservan cabello y cuerpo de cámara.
6. Hay una petición neuronal en vuelo. Las muestras intermedias se descartan; las de otra referencia no reaparecen después de cambiarla o apagar.

LivePortrait produce una imagen de 512 con una pasada. HyperSwap produce 256 e InSwapper 128; su opción Más detalle utiliza cuatro fases. Aumentar el tamaño mostrado no inventa detalle entrenado.

## Medir sin confundir los contadores

```powershell
.\medir-ia-local.bat
```

Para LivePortrait: `.\medir-ia-local.bat --avatar`. Detén antes el motor; el medidor se niega a cargar otra copia si el puerto está ocupado. Usa tensores sintéticos, descarta el calentamiento y mide solo una pasada del generador.

**Vista** cuenta composiciones, **Seguimiento** detecciones y **IA** resultados nuevos recibidos. No se cuentan predicciones como detecciones ni reproyecciones como generaciones. Para 30 generaciones por segundo no basta una vista fluida: el cómputo y el recorrido deben sostenerlo. En CPU, LivePortrait puede tardar varios segundos. Consulta las mediciones y límites en [MEJORAS-RETRATO.md](MEJORAS-RETRATO.md).

## Linux y macOS

```bash
python3.12 -m venv .venv-ai
.venv-ai/bin/python -m pip install -r local-ai/requirements.txt
.venv-ai/bin/python local-ai/download_models.py
npm ci
npm run start:ai
```

Opcionalmente descarga Avatar con `.venv-ai/bin/python local-ai/download_models.py --avatar` y selecciona `ANOTHERFACE_SWAPPER=avatar`. Otra instalación puede indicarse con `ANOTHERFACE_PYTHON`; los pesos con `ANOTHERFACE_MODELS`. No se incluye aceleración Metal en este proyecto.

## Datos y pruebas

En modo neuronal remoto, las referencias y los recortes pasan por Render y Cloudflare hacia la PC, según el aviso visible. No se envían a los distribuidores de pesos. El motor no escribe fotos en disco; conserva vectores y, en Avatar, características de apariencia en RAM. Máximo tres referencias Avatar u ocho de intercambio, vencimiento tras 15 minutos sin uso y limpieza periódica. Solo se guarda una captura al pulsar Tomar foto.

Pruebas:

```powershell
npm.cmd test
.\.venv-ai\Scripts\python.exe -m unittest discover -s local-ai -p "test_*.py" -v
```

La entrega pasa 83 pruebas JavaScript y 34 Python. Los ensayos completos de navegador utilizaron cámara simulada, modelos reales en CPU y Supabase simulado. No verifican tu GPU, tus credenciales ni un despliegue público.

Los pesos se descargan explícitamente con revisión, tamaño y SHA-256 en `local-ai/models.json`; no se incluyen en el ZIP. ArcFace/InSwapper son de investigación no comercial; HyperSwap indica ResearchRAIL-MS. El código original LivePortrait es MIT, con condiciones separadas para componentes de terceros. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
