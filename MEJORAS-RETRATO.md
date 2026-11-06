# Another Face 1.16.0 · Perfiles, color común y respuesta al giro

Esta entrega parte de 1.15.0 y aborda el desfase, los cambios de tono entre perfiles y las proporciones de nariz y mandíbula señaladas en las nuevas capturas.

## Cambios

- **Seguimiento temporal con recorte estable.** El recorte permanece fijo mientras la cara cabe en su margen. Face Landmarker utiliza VIDEO para reutilizar el seguimiento. Se reinicia el grafo al cambiar realmente de marco, al perder el rostro o al cambiar de modo. Se eliminan la detección independiente de cada recorte y la búsqueda global obligatoria cada doce fotogramas. Una foto guardada sigue detectándose por separado en IMAGE, sobre su propio fotograma congelado. Se comprueban coordenadas y tamaño antes de aceptar la malla.
- **Estabilidad con respuesta rápida.** El filtro externo limita la separación respecto a la pose actual a unos 12 ms de velocidad observada, más un margen de ruido. Ojos y labios tienen límites más estrechos. La predicción rígida tiene un horizonte adaptativo y acotado. Estabilidad al 100 % ya no permite que ese filtro acumule un giro antiguo.
- **Proporciones de referencia en 3D.** El intercambio añade una corrección calibrada de profundidad y anchura nasal, mentón, mandíbula y mejillas. Las medidas se fijan para esa identidad y se proyectan con la pose actual. Los anclajes del marco, los ojos y los labios se preservan; permanecen las restricciones contra inversión de triángulos. Los cambios de profundidad son acotados para evitar invertir o aplanar excesivamente la nariz. Es una estimación a partir de landmarks, no reconstrucción fotogramétrica ni entrenamiento de otra red.
- **Forma común en fotografía animada.** Las tres fotos contribuyen a una forma compartida; cambiar de textura lateral ya no cambia también la anatomía de toda la cara. Se reduce la histéresis de selección. La transición programada entre vistas compatibles dura 35 ms. Su duración visible también depende de la frecuencia de dibujo del dispositivo.
- **Matiz compartido.** La iluminación y el color se estiman por separado. La cámara frontal actualiza el matiz común; un perfil en sombra o con reflejos de pared no establece otro color de identidad. La muestra conserva la pose que tenía al capturarse, aunque la segmentación termine después de girar. Rostro y cuerpo utilizan el mismo destino de color. Si una vista pierde su muestra facial, se conserva la anterior en lugar de sustituirla por el brillo del cuello. Cada textura se corrige antes de fundirla con la siguiente, evitando un destello durante la transición. Se mantienen Natural, Cámara, Intermedio y Referencia y la protección contra blanquear el cuello.
- **Contorno y fondo.** Con fondo preparado se retira la porción de la cara original que queda desocupada al cambiar nariz o mandíbula. Se reduce la zona de protección que antes podía dejar parte de la nariz original visible. El fondo sigue limitado al contorno facial; se conserva la cámara bajo el borde suave. Sin fondo preparado se protege la silueta original.
- **Menor carga.** La armonización de piel descarta los píxeles fuera del cuerpo antes de las lecturas costosas y dibuja únicamente su región de máscara. Sus solicitudes ya no calculan cabello ni estadísticas de fondo y usan medianas YUV coherentes con las referencias. Se conservan las comprobaciones contra máscaras desplazadas o antiguas.
- **Respuesta automática.** «Priorizar respuesta al girar» está activado inicialmente: utiliza superficie Estándar y una pasada neuronal durante el giro y recupera el detalle elegido al estabilizarse. La foto guardada utiliza el detalle seleccionado. Se conservan hasta once poses neuronales durante 45 segundos para reutilizarlas al volver a un lado; cambiar identidad o cámara las invalida. La fuerza neuronal inicial pasa a 75 %.

## Qué significa el objetivo de 50 ms

La página muestra **Detección** —tiempo desde que se prepara una muestra hasta recibir sus puntos— y **Malla** —edad de la última muestra en el momento del indicador—. Estos valores se solapan y no se suman para obtener una latencia de cámara a pantalla. Excluyen parte de la exposición, captura y presentación física del dispositivo.

**50 ms es un objetivo, no un resultado garantizado.** Las dos últimas pruebas completas en CPU y gráficos por software registraron unos 111–118 ms de detección, 15,5–18,5 composiciones/s y 6,8–7,1 detecciones/s. El cambio de una pose ya almacenada es local; una pose neuronal nueva necesita generarse y recorrer el servidor y el túnel. En tus capturas las cuatro pasadas indicaban 1171 ms de motor y aproximadamente 0,4 generaciones/s. Esa operación no cabe en 50 ms.

LaMa se usa al preparar el fondo, fuera del bucle de video, con cámara fija. El fondo reconstruido puede inventar contenido y queda inválido si se mueve la cámara.

## Puntos y resolución

| Elemento | Cantidad / significado |
| --- | --- |
| Detector | 478 puntos medidos y señales de expresión. |
| Superficie Refinada | 1790 vértices de dibujo, incluidos puntos interpolados. |
| Superficie Estándar | 468 vértices de superficie; se siguen midiendo los iris. |
| HyperSwap | 256 píxeles nativos; cuatro pasadas producen una salida de 512. |

Esta actualización reutiliza HyperSwap/InSwapper y sus pesos. No requiere nuevos modelos ni reinstalar DirectML. La cantidad de vértices de dibujo no aumenta la cantidad de mediciones del detector ni la resolución nativa de la red.

## Actualizar tu misma carpeta

Detén el motor con Ctrl + C. Copia el contenido de Another-Face del ZIP sobre tu carpeta actual, sin anidar otra carpeta. Conserva `.env`, `.env.ai`, `.venv-ai` y `local-ai/models`.

```powershell
cd "C:\Users\sebastian estevan\Desktop\FIEE-unitec\Another-Face"
npm.cmd ci
.\iniciar-intercambio-ia.bat
```

Inicia un solo motor. El túnel actual puede seguir abierto al puerto 8766. Si lo cerraste, abre otra terminal en la misma carpeta y ejecuta `.\iniciar-tunel-ia.bat`. Si cambia su URL, actualiza `ANOTHERFACE_AI_URL` en Render y conserva el token que coincide con `.env.ai`.

Para publicar desde tu misma carpeta, comprueba la raíz y main antes de preparar los archivos:

```powershell
$raizEsperada = (Get-Location).Path.Replace('\', '/')
if ((git rev-parse --show-toplevel).Trim() -ne $raizEsperada) { throw "Esta carpeta no es la raíz del repositorio de Another-Face." }
if ((git branch --show-current).Trim() -ne 'main') { throw "Revisa la rama: debe ser main." }
git status
git add public local-ai scripts tests supabase *.js *.json *.md *.bat render.yaml .gitignore .env.example
git diff --cached --stat
git commit -m "Refina perfiles, color y respuesta de Another Face 1.16.0"
git push origin main
```

Actualiza el Web Service de Render con ese commit y recarga la página. La cabecera y `engine_version` deben mostrar **1.16.0**. El protocolo sigue siendo 5; la caché del cliente es v19. Esta entrega no publica automáticamente en GitHub o Render.

## Ajustes iniciales y comprobación

Empieza con Intercambio neuronal · Cámara, perfil Natural, color Natural, Proporciones 65 %, Estabilidad 55 %, Bordes 65 % y Priorizar respuesta al girar activado. Carga frontal y perfiles opuestos de la misma persona. Las tres fotografías permanecen en la memoria de la pestaña; vuelve a cargarlas tras recargar. Comprueba primero el seguimiento sin fondo preparado; prepara el fondo después si necesitas modificar la silueta exterior.

Pasan **136 pruebas JavaScript y 50 Python**, con 0 vulnerabilidades en la auditoría de dependencias. Se verifican filtros, marco estable, reinicio al reencuadrar, captura independiente, cache de perfiles, color común, corrección 3D y límites de silueta. Las pruebas WebGL comprueban la ausencia de destello durante el cambio de textura, conservación de sombras, separación de piel/ropa/fondo y relleno del espacio desocupado. Una prueba controlada con una malla detectada y girada artificialmente verifica reducción nasal y relleno en ambos perfiles. La prueba completa utiliza HyperSwap real en CPU y cámara simulada; guarda la foto y reanuda el video.

Las capturas aportadas muestran los defectos, pero no contienen el video original necesario para medir todos los giros, oclusiones o la latencia física. No se ha probado tu GPU ni tu cámara. LaMa conserva su ejecución aislada en CPU, con liberación y reconstrucción del motor facial, evitando el nodo FFT incompatible con DirectML.

Consulta [RENDIMIENTO.md](RENDIMIENTO.md) para las condiciones de medida.

## Fuentes técnicas

- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
