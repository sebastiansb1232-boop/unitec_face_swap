# Another Face · Inicio en Windows

**Entrega 1.12.0:** para actualizar, consulta [MEJORAS-RETRATO.md](MEJORAS-RETRATO.md). Avatar fotográfico anima una referencia frontal y dos perfiles en el navegador con `npm.cmd start`, sin Python ni túnel. Para generación opcional, `instalar-avatar-local.bat` añade LivePortrait 512 (338 MB); `mejorar-ia-local.bat` añade HyperSwap 1C 256 (403 MB). El relleno opcional LaMa se instala con `instalar-relleno-ia.bat` (208 MB). Conserva el entorno, los modelos anteriores y las claves.

**Para servir la página desde Render y utilizar la IA de tu PC**, sigue [MIGRAR-RENDER.md](MIGRAR-RENDER.md). Los pasos de esta página ejecutan web e IA juntas en la misma computadora.

## Actualizar en la misma computadora

Detén los procesos con Ctrl + C. Copia el contenido de esta entrega en la carpeta de tu instalación, reemplazando el código. Conserva `.env`, `.env.ai` si existe, `.venv-ai` y `local-ai/models` cuando permaneces en la misma computadora y carpeta. Después de iniciar, recarga con Ctrl + F5.

En una PC nueva, crea allí un entorno nuevo. Los entornos virtuales no deben trasladarse entre computadoras; los modelos completos sí pueden reutilizarse.

## Primera instalación

Necesitas **Node.js 22 o superior** y **Python 3.12 de 64 bits**. Abre PowerShell en la carpeta donde están `package.json` e `instalar-ia-local.bat`.

```powershell
node --version
py -3.12 --version
```

Si el administrador de Python informa que falta el runtime:

```powershell
py install 3.12
```

Si `py` rechaza las opciones, comprueba `python --version`. El instalador también admite `python` directamente cuando corresponde a Python 3.12 de 64 bits. Descargas oficiales: https://www.python.org/downloads/release/python-31210/ y https://nodejs.org/en/download. Vuelve a abrir PowerShell después de instalar.

Prepara el proyecto:

```powershell
.\instalar-ia-local.bat
```

Este archivo crea `.venv-ai`, instala las dependencias de Python y Node y descarga unos 452 MB de modelos. Verifica y reutiliza los modelos completos existentes. Espera a que diga **Listo**. No hace falta crear ni activar el entorno manualmente.

Inicia la web y la IA juntas:

```powershell
npm.cmd run start:ai
```

También puedes ejecutar `.\iniciar-ia-local.bat`. Deja la terminal abierta y visita **http://localhost:3000**. Enciende la cámara, carga una referencia y elige **Neuronal · Motor IA**. La primera preparación puede tardar. El perfil **Fluido** reduce la carga de seguimiento y composición. Con Ctrl + C se detienen los procesos.

Las siguientes veces solo necesitas `npm.cmd run start:ai`. Para utilizar únicamente los efectos del navegador: `npm.cmd start`.

## Aceleración

El instalador normal utiliza DirectML en Windows cuando puede inicializarse en una GPU compatible. Se mantiene CPU como alternativa. Para instalar la variante CPU:

```powershell
.\optimizar-ia-local.bat --cpu
npm.cmd run start:ai
```

En una PC con **GPU NVIDIA compatible**, la opción CUDA instala ONNX Runtime GPU y bibliotecas adicionales de NVIDIA. Necesita una descarga y espacio adicionales, además de un controlador compatible:

```powershell
.\optimizar-ia-local.bat --cuda
npm.cmd run start:ai
```

CUDA y DirectML están integrados, pero no se han medido en una GPU física en esta entrega. Consulta RENDIMIENTO.md. La interfaz muestra el proveedor real de la sesión y distingue FPS de vista, generación neuronal y seguimiento.

## Fotos

La configuración de Supabase permanece en `.env`. La cámara, los filtros y la descarga local funcionan aunque no haya guardado configurado; en ese caso el aviso de guardado indicará el fallo. En modo neuronal, las imágenes se procesan en la computadora que sirve la página. Solo se guarda una captura al pulsar Tomar foto.
