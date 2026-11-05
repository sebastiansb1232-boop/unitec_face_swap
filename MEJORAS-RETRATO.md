# Another Face 1.14.0 · Intercambio sobre cámara y piel unificada

## Qué cambia

- **Intercambio neuronal es el motor inicial.** HyperSwap modifica el recorte de cámara con la identidad de las fotos; InSwapper es la alternativa cuando HyperSwap no está instalado. LivePortrait anima una fotografía y queda como una opción distinta, no como el motor recomendado para moldear tu cara. Si el worker es LivePortrait y eliges intercambio, la página avisa y pide iniciar el motor correcto.
- **Sin fotografía de sustitución.** En intercambio, una textura sin registro válido o de una pose demasiado diferente se retira mientras llega otra. No se sustituye silenciosamente por la foto frontal ni se añaden ojos fotográficos. La cámara y el seguimiento continúan.
- **Piel de rostro y cuerpo.** El valor inicial es «Referencia · Rostro y piel visible», con «Unificar toda la piel visible» activado. El modelo local distingue piel facial y corporal de ropa, cabello y fondo. Se ajustan por separado sus medianas al mismo objetivo de la frontal, manteniendo gradientes y sombras. Incluye cuello, orejas, brazos y manos cuando la segmentación los reconoce. Cámara conserva el cuerpo original; Intermedio comparte un objetivo mezclado. Desactivar la casilla permite limitar la corrección al rostro. No convierte toda la imagen en un color plano.
- **Máscara que acompaña al movimiento.** La segmentación se calcula sobre una copia de hasta 256 píxeles en un Worker. Un control de antigüedad y diferencias de imagen retira zonas atrasadas para evitar pintar ropa o fondo al moverse. La comparación se realiza a la escala de la máscara para no dejar huecos sobre detalles finos. La vigencia tolera el costo de arranque y procesamiento sin devolver enseguida el tono original; la captura espera una muestra vigente. Los lienzos y los buffers se reutilizan.
- **Boca generada completa por defecto.** «Interior de cámara · Opcional» está desactivado. No se recortan los labios de cámara para pegarlos sobre el retrato. Se corrige el saneamiento que podía separar los puntos interiores con la boca cerrada; el cierre sella todas las parejas interiores. El movimiento conserva el espesor del labio y utiliza señales de mandíbula/cierre para limitar puntos que siguen la lengua. El contorno responde más rápido que el resto de las proporciones.
- **Registro coherente.** Cuando se corrige un punto de la boca generada, se corrigen tanto sus coordenadas de textura como su geometría. No se aplica una corrección a una sola mitad de la correspondencia. Se conservan la estabilización de pose, la predicción breve y una única solicitud neuronal en vuelo.

No se ha entrenado un modelo nuevo para tu persona ni un segmentador específico de lengua. La segmentación de piel y el intercambio siguen siendo estimaciones: oclusiones, perfiles extremos y gestos rápidos pueden fallar. La salida de HyperSwap es de 256 píxeles nativos; cuatro pasadas aumentan el tamaño a costa de tiempo, no garantizan detalle HD real.

## Actualizar tu misma carpeta

Detén el motor anterior con Ctrl + C. Reemplaza el código de la carpeta existente con el contenido de Another-Face del ZIP. Conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`. No anides otra carpeta Another-Face.

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
npm.cmd ci
.\mejorar-ia-local.bat
.\iniciar-intercambio-ia.bat
```

`mejorar-ia-local.bat` añade HyperSwap 1C 256, unos 403 MB. Si ya está completo, lo verifica y reutiliza. Usa el entorno existente y no cambia DirectML. Si no tienes espacio, puedes iniciar el intercambio con los modelos básicos de InSwapper ya instalados. No es necesario volver a descargar LivePortrait.

El nuevo iniciador fuerza la selección automática de intercambio: HyperSwap completo, después InSwapper. No hereda una selección `avatar` de otra terminal. No inicies dos workers simultáneamente. La animación fotográfica opcional mantiene su propio iniciador `iniciar-avatar-ia.bat` y su opción explícita en la página.

En otra terminal, si el puente no sigue abierto:

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
.\iniciar-tunel-ia.bat
```

Si cambia la URL del túnel, actualiza `ANOTHERFACE_AI_URL` en Render y conserva el token que coincide con `.env.ai`. Un túnel todavía activo al puerto 8766 se puede reutilizar.

## Actualizar main y Render

Desde esa misma carpeta, después de comprobar que es la raíz correcta:

```powershell
git rev-parse --show-toplevel
git status
git add public local-ai scripts tests supabase *.js *.json *.md *.bat render.yaml .gitignore .env.example
git diff --cached --stat
git commit -m "Corrige intercambio, boca y piel de Another Face 1.14.0"
git push origin main
```

Despliega el último commit de main en tu Web Service existente: Build `npm ci`, Start `npm start`. No se instala Python ni se suben los modelos a Render. Recarga con Ctrl + F5. La cabecera debe mostrar **1.14.0** y `/api/neural/status` debe indicar esa versión en `engine_version`, con `engine_kind: "face_swap"` y `model: "hyperswap_1c_256"` o `inswapper_128_fp16`. El protocolo sigue siendo 5 y la caché del cliente es v17. Esta entrega no se ha publicado en tu GitHub ni Render automáticamente.

## Uso recomendado

Elige **Intercambio neuronal · Cámara**, detalle **256 nativo · 1 pasada** si está instalado HyperSwap, perfil Natural, intensidad 100 %, color Referencia y unificación de piel activada. Mantén las mezclas del rostro original en cero y el interior de cámara desactivado. Mira de frente, con ojos abiertos y boca relajada, para calibrar. Carga una frontal y dos perfiles opuestos de la misma persona, preferiblemente entre 25 y 70 grados; el contador debe indicar tres vistas. Las fotos se conservan en memoria de la pestaña y debes volver a cargarlas tras recargar.

Sin fondo preparado se conserva la silueta original para no dejar recortes del cuerpo. Para reducir también el contorno de nariz o mandíbula, fija la cámara y prepara el fondo en «Retirar contorno original». La captura manual pide salir del encuadre durante tres segundos; el relleno opcional LaMa requiere `instalar-relleno-ia.bat`. No se estira la ropa o el cuello para cubrir el hueco. El fondo preparado no sirve si mueves la cámara o cambia el escenario.

Se mantiene la corrección del error LaMa/DirectML de 1.13: LaMa se ejecuta en un hijo de CPU después de liberar las sesiones faciales; al terminar se reconstruye el motor y se preparan nuevos tokens. No hace falta cambiar el motor facial completo a CPU. `background_safe: true` identifica esa ruta. La generación facial se pausa durante la preparación del fondo.

## Verificación y límites de rendimiento

Pasan **107 pruebas JavaScript y 50 Python**; `npm audit` informa **0 vulnerabilidades** con el bloqueo de dependencias incluido. Las pruebas cubren cierre de labios sin abertura artificial, espesor del labio al hablar, puntos que siguen la lengua, propagación de señales faciales, separación entre intercambio y animación, resultados atrasados, tono común de cara/cuerpo y máscaras que pierden validez con movimiento. Las pruebas de píxeles WebGL comprueban tono común, espejo, captura y conservación de ropa/fondo en casos controlados.

La página completa se verifica con Chromium, cámara simulada, tres referencias reales, HyperSwap 256 en CPU, segmentación real y captura guardada en un servidor simulado. Esto no equivale a probar conversación, lengua extendida ni perfiles dinámicos de tu cámara física. No se garantizan 30 generaciones/s, ausencia total de artefactos ni resultado fotorrealista en todos los gestos. Consulta [RENDIMIENTO.md](RENDIMIENTO.md) para las mediciones y sus condiciones.
