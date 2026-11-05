# Another Face · Retrato 7

El modo neuronal utiliza video nativo, seguimiento en un Worker cuando es posible y una capa WebGL que reproyecta el último rostro generado sobre los gestos actuales. La versión 7 añade vértices compartidos, adaptación de luz, seguimiento reducido en Fluido y soporte CUDA opcional. Consulta INICIO-RAPIDO.md y RENDIMIENTO.md. ONNX utiliza optimización completa del grafo y una configuración de hilos que deja recursos al navegador. Los contadores separan Vista, Seguimiento e IA. La textura neuronal no se regenera en cada fotograma de la vista; [IA-LOCAL.md](IA-LOCAL.md) explica el funcionamiento y las mediciones.

El modo ligero de esta versión permite cargar una foto propia como referencia, transferir sus proporciones internas, tono de piel, cejas, nariz, labios y color aproximado del iris, y animarlos con los gestos de la persona ante la cámara. Añade segmentación de cabello, dos modos de transferencia y estabilización adaptativa. Sigue siendo una transferencia de imagen 2D, no una reconstrucción completa de una persona ni un sistema de reconocimiento biométrico.

## Actualizar el proyecto existente

1. Detén el servidor con Ctrl + C.
2. Extrae el ZIP y copia su contenido a la carpeta del proyecto, reemplazando el código. Conserva `.env`, `.venv-ai` y `local-ai/models`. También puedes utilizar una carpeta nueva y copiar allí esos elementos de la instalación anterior.
3. Para el modo neuronal en Windows, ejecuta `.\optimizar-ia-local.bat` y después `npm.cmd run start:ai`. Se reutilizan los modelos completos existentes y DirectML pasa a ser el proveedor predeterminado si está disponible. La alternativa CPU se instala con `.\optimizar-ia-local.bat --cpu`.
4. Para utilizar solo el modo ligero, ejecuta `npm.cmd ci` y `npm.cmd start` en Windows; en macOS/Linux, `npm ci` y `npm start`.
5. Abre http://localhost:3000 y recarga con Ctrl + F5. La cabecera debe decir Another Face.
6. IA-LOCAL.md incluye la instalación desde cero y la variante para Linux/macOS. Python y la descarga de pesos corresponden solo al modo neuronal.

MediaPipe y el modelo de segmentación del modo ligero siguen incluidos en public/models y public/vendor. Los pesos grandes del modo neuronal se descargan mediante el instalador. El guardado de capturas utiliza la configuración existente de Supabase.

## Nuevas mezclas y controles

Natural conserva más de la luz de la captura y parte de los gestos; Más rasgos de referencia aumenta la contribución de la referencia; Menor carga utiliza 480 píxeles y desactiva el cabello. El selector de cámara permite elegir una entrada concreta y cambiar entre cámaras conectadas. Resolución controla el tamaño de procesamiento, hasta 960 píxeles de ancho en el modo ligero y 640 en neuronal.

Composición por zonas regula la conservación de ojos, boca, frente y mentón de la captura. Las zonas se mezclan gradualmente mediante distancias sobre la malla. El cierre de párpados aumenta automáticamente la conservación de la captura para que el gesto siga visible. El modo neuronal utiliza generación facial y las mismas zonas con máscaras en OpenCV; IA-LOCAL.md explica su instalación y sus límites.

## Cargar una referencia y calibrar

Enciende la cámara, elige Retrato y pulsa Cargar foto de referencia. Selecciona un JPG, PNG o WebP con una sola persona, de frente, buena luz y cabello visible. Tamaño máximo de archivo: 12 MB. La imagen se reduce a un máximo de 1280 píxeles por lado para analizarla.

En el modo ligero, la referencia se procesa en el dispositivo y se mantiene solo en la pestaña. Cerrar o recargar la página la descarta. En ese modo, el servidor no recibe la foto de referencia ni la captura de fondo. El modo neuronal informa de su procesamiento en la computadora antes de activarlo; consulta IA-LOCAL.md. Al tomar una foto del resultado se conserva el comportamiento anterior: esa captura sí se envía al administrador.

Para calibrar, mira de frente con los ojos abiertos y la boca cerrada y relajada. Cuando el filtro esté activo, prueba parpadear, abrir la boca, sonreír y mover las cejas. En el modo ligero, recalibra cuando cambie la persona. Usar referencia incluida recupera una de las fotos ya presentes en el proyecto, sin añadir una galería de miniaturas.

La fotografía seleccionada se mantiene estable: mover la cabeza ya no provoca cambios automáticos de foto y de rasgos.

## Cabello

**Copiar color** aplica el tono principal del cabello de referencia sobre tu propio pelo. Conserva su forma, reflejos y variaciones de luminosidad; no dibuja una peluca rectangular. La segmentación también permite extender el tono de piel de forma gradual a la frente, orejas y cuello para mejorar la unión con la malla.

**Copiar peinado con fondo preparado** utiliza la silueta y textura del cabello de la referencia, junto con la cabeza recortada. Coloca el celular en un soporte fijo. Elige ese modo, pulsa Preparar fondo y sal del encuadre durante los tres segundos de cuenta atrás. Vuelve a tu lugar cuando se confirme la captura. La imagen de fondo se utiliza para retirar la silueta anterior antes de colocar la nueva. El fondo debe permanecer igual y la cámara no debe moverse. Cambiar cámara, resolución o apagarla descarta el fondo.

Si no preparaste el fondo, este modo conserva la transferencia de color mientras espera la captura. Los fondos con personas en movimiento y los cambios de perspectiva reducen la calidad. La foto de referencia debe contener el cabello que se desea transferir; el programa no genera zonas ausentes ni la parte posterior de la cabeza.

**Desactivado**, en el modo ligero, deja el cabello original y mantiene el renderizado facial. La primera preparación de cabello puede tardar; el modelo se ejecuta en un Worker para no bloquear los botones ni acumular fotogramas. El intervalo se adapta al tiempo de inferencia. Sus máscaras se anclan a la posición y escala del rostro y se estabilizan entre resultados.

## Controles

| Control | Inicial | Efecto |
| --- | --- | --- |
| Rasgos de referencia | 82% | Acerca proporciones internas a la referencia. Con peinado y fondo, también transfiere el contorno completo. |
| Intensidad | 100% | Mezcla global del resultado. |
| Tono de referencia | 62% | Mantiene el color de la referencia y adapta la iluminación de la escena. |
| Bordes suaves | 65% | Regula la transición hacia las capas que están debajo de la malla. |
| Estabilidad | 72% | Reduce vibración. Párpados, boca y cejas responden más rápido que las mejillas. |
| Textura natural | 100% | Conserva el detalle de la foto. Ajustable entre 60% y 125%. |

Para reducir la apariencia plástica, no se aplica un filtro de belleza ni un difuminado sobre la imagen final. Se separan la iluminación amplia y el detalle, se conserva textura de la referencia y se añade una contribución moderada de la textura de la escena. Aumentar Textura natural puede acentuar también ruido o compresión de una foto mala.

Comparar con original muestra el fotograma sin efectos; mientras se compara, se impide guardar una captura etiquetada como Retrato. La boca interior y el movimiento de los ojos siguen la captura viva para conservar apertura, dientes, reflejos y dirección de mirada. El color del iris se aproxima al de la referencia sin teñir deliberadamente la esclerótica ni la pupila.

## Validación

`npm test` ejecuta pruebas de geometría, color, estabilización, apertura de párpados y boca, transformaciones con espejo y giro, iluminación, protección de triángulos y guardado en una base de datos simulada. Estas pruebas no contactan con tu Supabase.

Además se comprobó en Chromium con una cámara simulada construida con las fotografías incluidas: seguimiento real de 478 puntos, compilación y renderizado WebGL, inferencia real del segmentador, cambio de referencia, comparación con original, transferencia de peinado con fondo, apagado y presentación a 390 píxeles de ancho. Se inspeccionaron las capturas del resultado. Esas comprobaciones no sustituyen una prueba con una persona y un celular físico, ni miden parecido facial o resistencia a suplantación.

## Límites

Las referencias frontales funcionan mejor con movimientos suaves y luz estable. Una sola foto no aporta los perfiles, superficies ocultas ni gestos que nunca muestra. Los giros pronunciados atenúan el efecto. Manos delante de la cara, gafas, cabello muy fino, grandes diferencias de peinado y fondos que cambian pueden dejar recortes o desajustes. La segmentación puede confundirse con accesorios o mechones muy finos.

La transferencia de cabeza se basa en una imagen y una transformación geométrica; no es un modelo generativo de video ni una cabeza 3D. Los rasgos y el tono se aproximan a los de la referencia. No hay garantía de copiar todos los detalles, de realismo perfecto, de una frecuencia de fotogramas fija ni de superar verificadores biométricos.

## Archivos principales

- public/face-appearance.js: identidad, expresiones relativas, estabilización y transformaciones.
- public/reference-face.js: malla facial, textura, ojos y mezcla de iluminación.
- public/head-transfer.js: máscaras, color, recorte de cabeza y fondo limpio.
- public/segmentation-worker.js: inferencia de segmentación fuera del hilo de interfaz.
- public/app.js: cámara, carga de referencia, controles y capturas.
- public/models y public/vendor: modelos y bibliotecas utilizados localmente.
- THIRD_PARTY_NOTICES.md: procedencia de dependencias y modelo.

El modo neuronal añade public/neural-portrait.js, public/neural-view.js, public/neural-motion.js, public/neural-tracker.js, public/tracking-worker.js, neural-proxy.js y local-ai. Las pruebas y la procedencia de los modelos están documentadas en IA-LOCAL.md.
