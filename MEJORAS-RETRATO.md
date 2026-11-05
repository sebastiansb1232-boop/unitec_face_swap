# Another Face 1.15.0 · Integración natural y seguimiento por recorte

## Problemas corregidos a partir de tus capturas

En 1.14 la capa de piel podía llevar la sombra del cuello al brillo de la foto frontal. También pintaba la clase facial antes de recibir una generación: por eso el blanqueamiento aparecía incluso con «Esperando IA». El fondo preparado borraba la cara original completa y podía verse por debajo de su borde semitransparente. Más puntos de dibujo, por sí solos, no corrigen esos problemas.

- **Color Natural inicial.** El matiz se acerca a la referencia conservando la exposición de cámara. El cambio de luminancia del cuerpo queda limitado a ±0,035 en la escala 0–1; no se iguala el brillo del cuello al de la cara. Se conserva la diferencia real de luz entre ambos. La capa corporal ya no pinta toda la clase facial ni sus ojos y boca. Se mantienen Cámara, Intermedio y Referencia, con protección de exposición. El intercambio recibe una sola corrección de color en el compositor, sin blanquear primero su textura. Ojos y dientes también reciben la exposición del entorno para evitar parches blancos; el matiz de piel se atenúa allí.
- **Rostro ligado a la cámara.** El cambio geométrico neuronal se mide respecto a su propio fotograma de entrada, dentro del mismo marco. Se aplica como una corrección acotada sobre las facciones actuales, conservando su profundidad. Dos resultados de la misma identidad se funden brevemente solo si pose, gesto y exposición son compatibles. Antes, normalizar la salida con otra pose y usarla como una forma rígida podía congelar facciones o desplazar ojos/nariz al girar. Se conservan las comprobaciones contra inversión de triángulos y un límite más estrecho alrededor de ojos y labios.
- **Gestos locales suaves.** Entre resultados del generador se compara la cámara actual con el recorte de cámara que acompañó a esa generación, alineados mediante la malla. La diferencia local se suma a la apariencia neuronal en ojos y boca. En una región sin cambios no se sustituye la textura neuronal; tampoco se pega una boca completa de cámara. Esta compensación usa píxeles de cámara y puede desactivarse. No es una generación nueva de IA y no incrementa su contador. «Interior de cámara» sigue siendo una alternativa explícita, desactivada por defecto.
- **Boca y lengua.** El cierre conserva las parejas interiores selladas y el muestreo utiliza el contorno saneado, coherente con el fotograma de entrada. Una posición interior que sigue la lengua no se usa como nuevo límite del labio. La lengua permanece como contenido visual de la cavidad. No se ha entrenado un segmentador específico de lengua; oclusiones y una lengua muy extendida todavía pueden fallar.
- **Fondo sin anillo bajo la máscara.** LaMa o el fondo capturado solo cubren la porción de la silueta original que queda realmente desocupada. Se conserva cámara bajo el borde suave de la nueva cara. Si los contornos coinciden, no se borra toda la cara por debajo. Se amplía la transición del borde. Las zonas de ojos y boca acompañan también la inclinación de la cabeza. Sin fondo preparado, la silueta continúa protegida; nunca se estiran cuello, ropa ni fondo para ocultar un cambio de forma.

- **Foto sin desfase de malla.** Al pulsar Tomar foto se congela un fotograma y se detecta sobre esa misma imagen. La malla, el muestreo de piel y la composición utilizan esa captura inmutable, sin depender de una predicción antigua del video. Si hace falta otra generación neuronal para esa pose, la cámara permanece pausada hasta completar o cancelar la operación y después continúa. El guardado conserva la imagen compuesta y sus coordenadas correspondientes.

## Precisión: puntos, superficie y resolución son cosas distintas

El detector incluido estima **478 puntos**, con señales de expresión. Esta entrega no cambia ese número a 1000 o 2000 ni presenta puntos interpolados como nuevas mediciones.

La precisión se mejora **recortando la cara antes de reducir la imagen**, en lugar de reducir primero toda la cámara y después ampliar una cara pequeña. El recorte utiliza píxeles de la cámara original y una entrada de hasta 512 píxeles; se busca de nuevo en el plano completo cada 12 detecciones o al perder el rostro. Las coordenadas x/y y la escala z vuelven al marco original. El detector funciona en modo IMAGE porque cada recorte tiene su propio sistema de coordenadas; la estabilización y la predicción temporal continúan fuera del detector. La alternativa Face Mesh activa el refinamiento de ojos, labios e iris.

La superficie Refinada tiene **1790 vértices de dibujo**: los 468 de superficie base más 1322 vértices compartidos de arista. Se estima una curvatura limitada a partir de sus normales; ojos, labios y contorno mantienen sus mediciones. Se calcula una transición de borde más fina y se reutiliza la superficie entre detecciones. La opción Estándar utiliza 468 vértices de superficie. Los puntos de iris forman parte de las 478 mediciones y se usan para la mirada.

**512 píxeles no significa 512 puntos faciales.** HyperSwap conserva sus 256 píxeles nativos; Más detalle utiliza cuatro pasadas para producir una salida de 512. LivePortrait, como opción fotográfica distinta, tiene otra arquitectura y salida de 512. Ninguno se convierte en un generador HD entrenado de 1000 o 2000 píxeles al aumentar el número de vértices.

## Actualizar tu misma instalación

Detén el motor con Ctrl + C. Copia el contenido de Another-Face del ZIP sobre tu carpeta actual, sin anidar otra carpeta. Conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`.

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
npm.cmd ci
.\iniciar-intercambio-ia.bat
```

**Esta actualización no añade pesos ni requiere reinstalar DirectML.** Si ya utilizabas HyperSwap, como indican tus capturas, se reutiliza. No vuelvas a ejecutar los instaladores por este cambio de código. Inicia un solo motor.

Mantén el puente actual si sigue abierto al puerto 8766. Si lo cerraste, abre otra terminal en esa misma carpeta:

```powershell
.\iniciar-tunel-ia.bat
```

Si cambia su URL, actualiza `ANOTHERFACE_AI_URL` en Render y conserva el token que coincide con `.env.ai`.

Actualiza main y Render desde tu carpeta existente:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status
git add public local-ai scripts tests supabase *.js *.json *.md *.bat render.yaml .gitignore .env.example
git diff --cached --stat
git commit -m "Refina integración, gestos y superficie de Another Face 1.15.0"
git push origin main
```

Comprueba que la raíz sea tu carpeta Another-Face y la rama sea main. El Web Service existente conserva Build `npm ci`, Start `npm start` y sus variables. Despliega el último commit y recarga con Ctrl + F5. La cabecera y `engine_version` de `/api/neural/status` deben indicar **1.15.0**; el protocolo sigue siendo 5 y la caché del cliente es v18. Esta entrega no se ha publicado automáticamente en tu GitHub ni Render.

## Ajustes iniciales

Usa **Intercambio neuronal · Cámara**, **Natural · Matiz y luz del entorno**, perfil Natural, forma 65 %, bordes 65 %, una pasada y Gestos locales suaves activado. Las mezclas del rostro original y el Interior de cámara permanecen en cero/desactivados. Empieza **sin preparar LaMa**: comprueba primero la integración y el movimiento. El fondo es opcional para cambiar también la silueta exterior y necesita cámara fija.

Carga frontal y perfiles opuestos de la misma persona, con ojos visibles y sin llegar a 90 grados. Se conservan en memoria de la pestaña; vuelve a cargarlos tras recargar si quieres las tres vistas. El control Parecido neuronal actúa sobre la identidad del modelo; Forma modifica su corrección geométrica. Subir ambos al máximo no garantiza mayor parecido.

Si el navegador está cargado, el perfil Fluido utiliza entrada menor y superficie Estándar. La superficie refinada y la compensación local requieren trabajo adicional; no se oculta ese costo aumentando artificialmente los contadores.

## Verificación y límites

Pasan **122 pruebas JavaScript y 50 Python**. La auditoría de dependencias informa **0 vulnerabilidades**. Se prueban el límite de exposición con una referencia muy clara, la conservación de sombras, piel/ropa/fondo, coordenadas del recorte, pérdida y recuperación del seguimiento, curvatura y caché completa, mímica sobre la cámara y límites alrededor de ojos/labios. Se verifica también el cambio entre las dos superficies y la captura con HyperSwap real en CPU. Las pruebas de captura simulan que el video avanza mientras la detección espera, comprueban que imagen y malla conservan el mismo fotograma, recuperación del recorte y detector alternativo. La prueba completa verifica también que el video se reanuda tras guardar. Las pruebas de píxeles comparan con 1.14 la ausencia de pintura facial antes de IA, la conservación de sombras del cuerpo y la retirada exclusiva de zonas desocupadas del contorno. Comprueban además compensación local sin sustituir una región por cámara, exposición coherente de ojos/dientes, máscara desplazada y caché de los 1322 vértices añadidos.

Las capturas filtradas aportadas sirven para identificar defectos, pero no contienen el video original necesario para medir todos los gestos, oclusiones y perfiles de tu cámara. No se garantiza ausencia total de errores ni fotorrealismo en cualquier situación. Tampoco se ha probado tu GPU física. La compensación mejora la continuidad entre generaciones; no convierte una generación por segundo en treinta generaciones nuevas.

Consulta [RENDIMIENTO.md](RENDIMIENTO.md) para las condiciones y mediciones. Se conserva la corrección de LaMa de 1.13: hijo de CPU, liberación previa del motor facial, reconstrucción posterior y nuevo token, sin intentar el nodo FFT de LaMa en DirectML.

## Fuentes técnicas

- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md
- https://research.google/pubs/attention-mesh-high-fidelity-face-mesh-prediction-in-real-time/
