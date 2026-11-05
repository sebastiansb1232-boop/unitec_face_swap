# Another Face: página en Render e IA en tu PC

**Actualización 1.9.0:** consulta [MEJORAS-RETRATO.md](MEJORAS-RETRATO.md) para las tres fotografías, las proporciones con profundidad estimada y LivePortrait opcional. Actualiza el código de Render y de tu PC, conservando claves y modelos. El estado actual utiliza `render_protocol: 5`, `reference_views: 3` y `patch_output: true`. El modo Avatar fotográfico del navegador funciona sin worker ni túnel; esta guía corresponde a la opción Neuronal.

La conexión introducida en 1.5.0 permite separar la página del motor neuronal. Render sirve la web y transmite las solicitudes al motor de tu PC mediante un túnel HTTPS. La PC ejecuta ArcFace y el modelo de intercambio instalado con el proveedor disponible; el navegador conserva el seguimiento y la composición en vivo. Puedes abrir la web desde un celular con cámara y HTTPS.

**La PC que ejecuta la IA debe permanecer encendida, conectada y con las dos terminales abiertas.** Trasladar la web a Render no aumenta por sí solo los FPS. El resultado depende de la GPU real, sus controladores, la conexión de subida y la latencia entre el navegador, Render y tu PC. Si el motor muestra CPU, todavía no está utilizando una GPU para esa sesión.

## 1. Actualiza los archivos y completa la instalación

Detén los procesos anteriores con Ctrl + C. Extrae el ZIP actualizado y copia su contenido sobre la carpeta del proyecto, reemplazando el código. En la misma PC conserva `.env`, `.env.ai` si existe, `.venv-ai` y `local-ai/models`. En otra PC crea allí un entorno nuevo; no copies el entorno virtual de Windows desde otra instalación. Los modelos completos sí se pueden reutilizar.

Necesitas Node.js 22 o superior y Python 3.12 de 64 bits. Abre PowerShell dentro de la carpeta que contiene `package.json`:

```powershell
node --version
py -3.12 --version
```

Si faltan programas o el runtime de Python, sigue primero [INICIO-RAPIDO.md](INICIO-RAPIDO.md). Para instalar el entorno, las dependencias y los modelos:

```powershell
.\instalar-ia-local.bat
```

El instalador crea `.venv-ai`; no necesitas activarlo ni crearlo manualmente. Espera a que termine correctamente. Si ya tienes la instalación completa y solo actualizaste el código, basta con `npm.cmd ci`.

**Si antes apareció “No space left on device”, la instalación no terminó.** Libera varios GB para los modelos, las bibliotecas y la caché del instalador antes de repetirlo. La descarga verifica y reutiliza los modelos completos. No borres el InSwapper que ya terminó; el descargador sustituye el archivo parcial de ArcFace cuando dispone del archivo completo. Si las dependencias ya están instaladas y solo falta el modelo:

```powershell
.\.venv-ai\Scripts\python.exe local-ai\download_models.py
```

## 2. Crea la clave privada del motor

En esa misma carpeta:

```powershell
npm.cmd run setup:remote
notepad .env.ai
```

Se genera una clave aleatoria en `.env.ai`. Si repites el comando, conserva la clave válida existente. Copia únicamente el valor que aparece después de `ANOTHERFACE_AI_TOKEN=`: lo necesitarás en Environment de Render. **No pegues esa clave en el chat, en GitHub, en el HTML ni en código del navegador.** Cierra el bloc de notas cuando termines de copiarla.

## 3. Terminal 1: inicia solo la IA

```powershell
npm.cmd run start:worker
```

También puedes abrir `iniciar-worker-ia.bat`. Para el generador opcional LivePortrait, instala primero `instalar-avatar-local.bat` y utiliza `iniciar-avatar-ia.bat` en lugar de `start:worker`. No ejecutes dos motores a la vez. Espera este mensaje:

```text
Motor protegido disponible en 127.0.0.1:8766 · proveedor
```

El proveedor real puede ser `DmlExecutionProvider`, `CUDAExecutionProvider` o `CPUExecutionProvider`. El instalador habitual prepara DirectML en Windows. Para una NVIDIA compatible puedes detener el motor, ejecutar `.\optimizar-ia-local.bat --cuda` y volver a iniciarlo. Consulta [IA-LOCAL.md](IA-LOCAL.md) para las variantes y sus requisitos. Que el proveedor sea GPU no implica que todas las operaciones se ejecuten en ella.

No inicies `start:ai` a la vez: ese comando también intenta ocupar el puerto del motor. Si ya lo usabas, detén primero su terminal. El worker exige la clave antes de leer imágenes y sigue escuchando solo en la interfaz local.

## 4. Terminal 2: instala y abre el túnel

Instala `cloudflared` una vez. En PowerShell:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Si `winget` no existe o falla, utiliza el instalador **Windows, 64-bit, MSI** enlazado en las [descargas oficiales de Cloudflare](https://developers.cloudflare.com/tunnel/downloads/). Cierra y vuelve a abrir esta segunda terminal para que detecte el programa; deja abierta la primera terminal de IA. Abre la segunda terminal en la carpeta del proyecto y ejecuta:

```powershell
.\iniciar-tunel-ia.bat
```

El archivo comprueba primero que el motor rechaza conexiones sin clave y acepta la clave privada. Solo después abre el túnel. No continúes si esa comprobación falla.

Cloudflare imprimirá una dirección similar a esta, con un nombre distinto en tu caso:

```text
https://nombre-temporal.trycloudflare.com
```

Copia la dirección HTTPS completa. No agregues `/healthz`, `/frame` ni otras rutas. No es necesario abrir el puerto 8766 del router. Una visita directa al motor sin la clave debe devolver 401; comprueba la conexión desde Render en el paso 6.

Este Quick Tunnel no requiere cuenta ni dominio, pero es temporal y está destinado a pruebas. Se detiene al cerrar su proceso y obtiene otra URL al crearse de nuevo. Para una instalación permanente hace falta configurar un túnel con nombre y un dominio; esta entrega no lo configura automáticamente. No añadas autenticación interactiva por correo al túnel, porque Render accede como cliente de una API.

## 5. Actualiza o crea el servicio de Render

Si ya tienes un servicio de Another Face en Render, actualiza su repositorio y sus variables; conserva ese servicio y su URL. Si todavía no existe, sube el código a un repositorio de GitHub y, en el [panel de Render](https://dashboard.render.com/), elige **New → Web Service** y conecta ese repositorio.

El repositorio debe contener los archivos de código extraídos, no solo el ZIP. `package.json` debe quedar en la raíz del servicio. Para una subida manual a GitHub utiliza una extracción limpia del ZIP: no subas la carpeta instalada de tu PC. `.gitignore` protege las operaciones normales de Git, pero no filtra una selección manual de archivos en una página de subida. Excluye `.env`, `.env.ai`, `.venv-ai`, `local-ai/models`, `node_modules` y ejecutables de `cloudflared`.

Configura el servicio:

| Opción | Valor |
| --- | --- |
| Tipo | Web Service |
| Lenguaje | Node |
| Root Directory | Vacío si `package.json` está en la raíz del repositorio; de lo contrario, su subcarpeta |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |

En **Environment**, añade o actualiza:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `ANOTHERFACE_AI_URL` | La URL HTTPS real del túnel, sin rutas |
| `ANOTHERFACE_AI_TOKEN` | Solo el valor de la clave de `.env.ai`, sin el nombre de la variable |

Conserva las variables de Supabase y administrador que ya utilizas para guardar y consultar fotos. Esta migración de IA no requiere volver a ejecutar la migración de la base de datos. Si configuras el guardado por primera vez, sigue el apartado de Supabase de [README.md](README.md).

Guarda las variables y despliega la versión actualizada. En Render se ejecuta **`npm start`**: no ejecutes allí el instalador de IA ni `start:ai` ni `start:worker`. Los modelos y el entorno Python permanecen en tu PC. También se incluye `render.yaml` como configuración de referencia; no crees otro servicio mediante Blueprint si ya tienes uno activo.

## 6. Comprueba y utiliza la web

Abre esta ruta en la URL de tu servicio, sustituyendo el ejemplo por tu dominio real:

```text
https://TU-SERVICIO.onrender.com/api/neural/status
```

Debes ver `"ready": true`, `"mode": "remote"` y el proveedor real. La respuesta no incluye la clave ni la dirección privada del motor. Si el estado dice `ready: false`, revisa el mensaje antes de abrir la cámara.

Después abre la portada de Render desde PC o celular, permite la cámara, selecciona **Retrato**, carga una referencia y elige **Neuronal · Motor IA**. Utiliza **Fluido** para reducir la carga del navegador. El contador IA mide rostros nuevos recibidos por segundo; Vista mide la fluidez de cámara y composición. Una vista fluida no garantiza la misma frecuencia de generación neuronal.

Cada cliente mantiene una sola petición neuronal en vuelo. La PC procesa una inferencia a la vez: varios visitantes comparten su capacidad y pueden recibir 429 cuando está ocupada. Esta configuración sirve para probar y presentar la demo; no añade capacidad para muchos usuarios simultáneos.

## 7. Cómo iniciarlo las próximas veces

Terminal 1, en la carpeta del proyecto:

```powershell
npm.cmd run start:worker
```

Espera el mensaje de motor protegido. Terminal 2, en esa misma carpeta:

```powershell
.\iniciar-tunel-ia.bat
```

Como la URL temporal cambia, actualiza **solo `ANOTHERFACE_AI_URL`** en Environment de Render y aplica el cambio. La clave se mantiene mientras conserves `.env.ai`. Abre la web y confirma el estado. Evita que Windows suspenda la PC durante la presentación; al terminar, Ctrl + C en ambas terminales detiene la IA y el túnel.

En un servicio gratuito de Render puede haber una espera de arranque tras un período sin tráfico. Ni el túnel temporal ni una instancia gratuita ofrecen la continuidad de un servicio permanente. Para una presentación, abre y prueba la página con anticipación.

## Problemas frecuentes

| Mensaje o síntoma | Qué revisar |
| --- | --- |
| No hay espacio / falta ArcFace | Libera espacio y completa `download_models.py`. El worker no puede arrancar con un modelo parcial. |
| Falta el entorno de IA | Ejecuta el instalador en esa PC y carpeta. `.venv-ai` no se incluye en el ZIP. |
| El puerto 8766 está ocupado | Detén la terminal de la sesión anterior de Another Face antes de iniciar el worker. |
| La clave no coincide / 401 desde Render | Copia el mismo valor de `.env.ai` al Environment de ese servicio y aplica el cambio. Una visita sin clave al motor sí debe responder 401. |
| El motor no está protegido | Detén `start:ai` o el Python anterior y utiliza `start:worker`. No abras el túnel de una sesión sin protección. |
| No se encuentra `cloudflared` | Reabre la terminal después de instalarlo. Revisa la instalación y PATH. |
| Motor remoto no disponible | Comprueba las dos terminales, Internet, la URL temporal vigente y las variables del servicio de Render correcto. |
| La URL no es válida | Utiliza solo `https://nombre.trycloudflare.com`, sin ruta, credenciales ni parámetros. |
| El estado muestra CPU | El proveedor de GPU no se pudo inicializar o instalaste la variante CPU. Consulta IA-LOCAL.md y el aviso del proveedor. |
| Va lento aunque la vista sea fluida | Compara el contador IA, la latencia, el proveedor y la conexión. Un túnel añade recorrido de red; una GPU más capaz ayuda únicamente si se está utilizando. |

## Datos y validación de esta entrega

En modo neuronal remoto, la referencia y los recortes faciales con sus puntos pasan del navegador a Render, por Cloudflare y al motor de tu PC. La clave viaja solo entre servidores; no se entrega al navegador. El motor no escribe las imágenes en disco. Conserva referencias calculadas en memoria, con vencimiento tras 15 minutos sin uso y limpieza periódica: un máximo de ocho para HyperSwap/InSwapper o tres para LivePortrait, que también conserva volúmenes de apariencia de las fotografías en RAM. El guardado de fotos en Supabase continúa siendo una acción explícita al pulsar Tomar foto.

En la validación de la conexión de la entrega 1.5.0 pasaron **40 pruebas de JavaScript y 13 de Python**. Se comprobó también la comunicación del proxy Node con la aplicación FastAPI real, autenticación, preparación de referencia y ruta de fotograma, utilizando un motor simulado y transporte local. No se ha realizado desde aquí un despliegue en tu cuenta de Render, una conexión pública a tu PC ni una medición de tu GPU. Los ensayos anteriores de los modelos y del renderizado están documentados en IA-LOCAL.md y RENDIMIENTO.md.

Referencias oficiales consultadas para esta configuración:

- [Express en Render](https://render.com/docs/deploy-node-express-app)
- [Servicios gratuitos de Render](https://render.com/docs/free)
- [Quick Tunnels y sus límites](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Descargas de cloudflared](https://developers.cloudflare.com/tunnel/downloads/)
- [Identificador del paquete en el catálogo de WinGet de Microsoft](https://github.com/microsoft/winget-pkgs/tree/master/manifests/c/Cloudflare/cloudflared)
