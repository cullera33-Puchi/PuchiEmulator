# Cambios

## 0.43.2 (18/11/2026)

Revisión de la aplicación pedida por el usuario, con prioridad para las últimas versiones: el motor y las v0.43.0 y v0.43.1 (que nadie había revisado) y dos revisiones independientes de lo que nunca se había repasado, los discos de PlayStation y el almacenamiento (v0.37.0 a v0.39.0) y la pantalla de juego con el mando. Cada hallazgo, comprobado en el código antes de corregirlo.

Pantalla de juego:
- Al salir, la pantalla seguía tocable mientras se guardaba: un toque en «Seguir» en ese rato dejaba el bucle del juego cerrado en marcha, mandando pulsos al juego siguiente (doble velocidad) y sumando tiempo jugado. Ahora no se reanuda una partida que se está cerrando, sale «Guardando…» y, si el hilo no contesta en 8 segundos, se sale igual.
- La lista de ranuras guardaba los estados enteros mientras durase el juego (hasta 11 de 16 MB en Nintendo 64) cuando solo usa nombre, fecha y captura; y para saber si había guardado rápido se leía el estado entero. Ahora, `resumenEstados` y `hayEstado`.
- Un fallo al guardar o cargar un estado (sin sitio, hilo caído) no avisaba de nada: ahora sale el aviso y queda en el registro.
- Si la app pasaba a segundo plano mientras cargaba el juego, arrancaba sola sin que se viera: se queda en pausa.
- Nintendo DS: el lápiz y «Soplar» se sueltan al pasar a segundo plano.
- El temporizador de sueño, al cerrar el menú con una hoja de dentro abierta (temas, mando, discos), la dejaba marcada y el siguiente toque en Menú la abría a ella.
- Si el juego falla en marcha, el aviso dice «El juego se ha parado» (decía «No se ha podido abrir el juego»).
- Los avisos dentro del juego, sin desenfoque: quedan encima de la imagen, que cambia 60 veces por segundo. Y un aviso que sale o se va ya no redibuja todo el juego (el contexto de la interfaz es siempre el mismo objeto).
- «Deshacer» una carga después de salir del juego ya no llama a un motor cerrado.

Ritmo:
- Al subir la pantalla de frecuencia (de 60 a 120 Hz), la medida del refresco tardaba medio segundo en enterarse y, mientras, se hacía un fotograma por refresco: el juego iba al doble de velocidad ese rato. `Refresco.atrasado` lo detecta a los seis refrescos cortos seguidos y se va por tiempo hasta que la medida se pone al día.

Botones movidos:
- Los de la mitad de arriba guardados antes de la v0.42.4 (sin el alto del recuadro) siguen a su fracción del alto, como se veían; la v0.43.0 les suponía el alto de la pantalla y los bajaba hasta 30 puntos en la ventana corta.

Discos de PlayStation y almacenamiento:
- Con una hoja CUE a la que le faltaba una pista, las pistas que sí estaban entraban como otro juego (la pista 1 sola, sin música y con otra tarjeta de memoria). Una pista suelta sin su hoja («Juego (Track 1).bin») tampoco es ya un juego: se dice que falta el .cue.
- El BIN se encuentra aunque las tildes vengan en otra forma (Archivos da «é» en dos caracteres; la hoja, en uno).
- Las imágenes que la app no abre (.iso, .img) y los .bin de más de 64 MB no se leen enteros a la memoria solo para decir «no reconocido» (`seLeeEntero`).
- Si un fichero elegido no se dejaba leer, el velo de «Añadiendo…» se quedaba para siempre.
- Quitar un juego de disco libera su espacio a los 30 segundos (cuando ya no hay «Deshacer»), no al volver a abrir la app.
- Cambiar de disco guardaba la ficha del juego tal como estaba al abrirlo y deshacía «jugado hoy» y el paso de pendiente a jugando.
- Importar una partida: si hay una partida que se va a sustituir y la copia de seguridad previa falla, no se importa.

Revisado y sin cambios:
- La memoria del núcleo se libera al cerrar cada juego (comprobado con Super Nintendo, Nintendo 64 y DS: cinco aperturas y cierres, ninguna memoria de WebAssembly viva después).
- PlayStation «acelerada»: sin causa en el código. La región se detecta por el disco y el reloj del hilo no depende del ahorro de batería; en el registro de aquel día hubo 9 segundos de avance rápido.
- Congelación de la Super Nintendo: sin reproducir y sin causa encontrada. El registro de la v0.43.1 dirá si se para el juego, la imagen o los botones.

Pendiente, anotado: cualquier CHD se acepta como PlayStation (no se puede saber sin descomprimirlo); los discos de un juego añadidos en días distintos son juegos distintos; el disco puesto se guarda por juego y no por estado; fallo latente del núcleo de N64 al cargar estados según la disposición de la memoria.

194 pruebas unitarias (nuevas: refresco atrasado, pistas sueltas, tildes, ficheros que no se leen enteros, botones de arriba sin alto) y 77 de navegador.

## 0.43.1 (18/11/2026)

A partir del registro del usuario con la v0.43.0: «cuando cargo partidas se queda congelado a los 2 o 3 segundos» (Super Nintendo, abierta donde se dejó). En el registro, el hilo hace los 60 fotogramas por segundo, manda las 60 imágenes y la página las recibe todas (si no, el freno de la v0.43.0 las habría bajado a una por segundo). El juego seguía en marcha: lo que no se sabe es si lo que se para es la imagen del juego, lo que se ve o los botones. Con las ROMs de prueba no se reproduce (cargar rápido y seguir donde se dejó, con los botones respondiendo a los 1, 3 y 6 segundos, en GBA y Super Nintendo).

Para saberlo, el registro lleva ahora en «Rendimiento»:
- `distintasSeg`: tandas por segundo en las que la imagen del núcleo ha cambiado (64 puntos repartidos, en el hilo). Si el juego se para de verdad, baja a 0 aunque se hagan fotogramas.
- `sonidoSeg`: tandas por segundo con sonido.
- `mostradasSeg`: imágenes que la página enseña por segundo.
- `entradas`: cambios de botones que la página ha mandado al hilo.
- `cambiosTamano` y `tamano`: cuántas veces ha cambiado de resolución la imagen y la de ahora.

Además, «Estado cargado» (ranura y tamaño) al cargar un estado y la primera medida a los 10 segundos de abrir el juego o de cargar un estado, no a los 30: si se congela, suele cerrarse antes, a veces a la fuerza y sin la medida del cierre.

190 pruebas unitarias y 77 de navegador.

## 0.43.0 (18/11/2026)

Revisión independiente y a fondo de la v0.40.0 a la v0.42.5, pedida por el usuario («has perdido la finura») tras una Super Nintendo congelada: tres revisiones en paralelo (motor y ritmo de los fotogramas; pantalla e interfaz; núcleos, almacenamiento y pruebas), cada hallazgo comprobado antes de corregirlo.

Lo que dice el registro del usuario: la Super Nintendo, abierta a las 22:37:35, se giró a horizontal y otra vez a vertical, y 4 segundos después la app arrancó de cero (sin «Juego cerrado»). La vez anterior, lo mismo poco después de volver a vertical. No se reproduce en el navegador de pruebas (doce giros con el juego en marcha, memoria estable).

Congelación y cierres de la app:
- Imágenes sin freno (desde la v0.41.0): con el ritmo propio, el hilo mandaba cada imagen aunque la página no hubiera recibido las anteriores. Si la página se atasca (al girar el iPhone, por ejemplo), se amontonaban en la cola de mensajes, a 60 por segundo, hasta que iOS cerraba la app por memoria. Es la causa más probable. Ahora como mucho dos sin recibir (`MAX_IMAGENES_EN_VUELO`; la página confirma cada una, `ritmoImagenVista`); mientras, el juego sigue y no se pinta. La imagen que no se pinta queda pendiente para la siguiente vez (`imagenPendiente` en `Motor`): antes, con el ahorro de batería, si el juego no cambiaba después se seguía viendo la anterior.
- Pulsos amontonados: si el hilo iba atrasado, los pulsos de la pantalla se hacían todos seguidos al ponerse al día, y los botones y la pausa llegaban cada vez más tarde. Cada pulso lleva ahora su hora (`horaComun`); los que llegan con más de 100 ms de retraso sobre el menor visto se descartan y sigue el reloj del hilo.
- Hilo del motor caído: se quedaba vivo haciendo fotogramas sin recibir los botones (el juego parecía colgado) y el siguiente juego abría otro hilo con otro núcleo en memoria. Ahora se cierra, queda en el registro («El hilo del motor se ha caído») y la partida lo trata como un fallo.
- El cierre tardío de un juego (más de 8 s guardando) podía descargar el siguiente, que se quedaba con la imagen parada: cada apertura lleva su número y «descargar» solo vale para la suya.
- La ROM va al hilo sin copiarse y la página la suelta al abrir: con una DS de 256 MB eran dos copias más de la ROM en memoria todo el rato. Si hay que volver a abrir (sin el punto donde se dejó, o sin hilo), se lee otra vez.

Nintendo DS («Out of bounds memory access» al seguir donde se dejó, dos veces en el registro del usuario):
- Sin memoria, `malloc` devuelve 0, y al guardar o cargar un estado o al abrir el juego no se comprobaba: el estado se escribía encima del propio núcleo y el siguiente fotograma fallaba. Ahora se comprueba (`nucleo.ts`) y también en el búfer de la imagen del puente (`asegurarVideo` en `puente.c`; núcleos recompilados).
- Un punto donde se dejó que el núcleo no acepta ya no se usa a medias (melonDS carga por partes): se abre otra vez con la partida guardada. Un estado de una ranura que no carga devuelve el juego a como estaba, con su aviso. Si el juego falla después de seguir desde un punto y no se ha guardado otro, la siguiente vez se abre sin él (antes se repetía el fallo cada vez).
- Un núcleo que falla al abrir el juego se descarga: la página lo intentaba con otro enseguida y se juntaban dos en memoria.

Pantalla y mando:
- Botones movidos con «Girar la pantalla»: los guardados antes de la v0.42.4 se colocaban con el alto del iPhone en vertical en un recuadro horizontal (la cruceta, 118 puntos más arriba). Ahora con el de la orientación del recuadro (`altoSinDato`).
- Las piezas de la mitad de arriba guardan también su distancia al borde de arriba (la imagen va pegada arriba): L y R sobre la pantalla táctil de la DS se movían respecto a ella según el alto con que abre iOS.
- En el editor, la pieza ya no salta al empezar a moverla (`aAltoActual`).
- El alto de la ventana se vuelve a mirar a los 150, 400 y 1000 ms de un giro y cuando cambia el visualViewport, por si iOS lo da tarde.
- Las hojas (el menú del juego) llegan hasta abajo de la ventana en la app instalada; antes podía asomar el juego por debajo.

Otros:
- Nintendo 64 con lista de sombreadores: 60 s para abrir antes de dar el hilo por perdido (los prepara todos al abrir; con una lista larga podía pasar de 20 s y se volvía a empezar en el hilo principal, con la app parada).
- La partida ya no se reescribía siempre en la primera comprobación tras abrir (el original se quedaba vacío al viajar a la página).
- Si la consola cambia de ritmo en marcha, la página lo sabe (evento `tiempos`) y cuenta los pulsos con él.
- Ahorro de batería al pulso de la pantalla sin saltos de imagen de 66 ms por unos milisegundos de retraso de un mensaje.
- Cargar rápido, si el núcleo no acepta el estado: «No se ha podido cargar el guardado rápido» (decía «Aún no hay guardado rápido»).
- La prueba de la fila de herramientas admite un punto de diferencia por redondeo.

Probado y sin cambiar:
- Pasar las opciones de mGBA solo a mGBA (ocupan dos de las 64 opciones del puente en los demás) hace fallar la carga de estados de la Nintendo 64 en la prueba. No depende del número de opciones ni de cuáles: con dos opciones de relleno con otro nombre también falla. Es un fallo latente del núcleo de N64 que depende de cómo queda la memoria (el mismo que en la v0.40.0 con 256 opciones). Se dejan como estaban; pendiente de estudiar en el núcleo.
- Sin causa encontrada: la PlayStation acelerada tras el ahorro de batería (el registro muestra el juego a 60 fotogramas por segundo; en ese rato se usó el avance rápido 9 segundos).
- Pendiente, poco probable: al pasar de 60 a 120 Hz, medio segundo a doble velocidad hasta que se mide el refresco nuevo; melonDS reserva 16 MB sin comprobar al calcular el tamaño de un estado (dentro del núcleo).

190 pruebas unitarias (nuevas: pulsos viejos, imágenes sin confirmar, piezas al alto de ahora) y 77 de navegador.

## 0.42.5 (17/11/2026)

A partir del registro del usuario («la Super Nintendo se ha colgado»): guardado rápido a las 22:36:30 y, 20 segundos después, el juego cerrado. El registro muestra el juego a 60 fotogramas y 60 imágenes por segundo hasta el final, sin fallos: el núcleo seguía en marcha y lo que se paraba era la imagen.

- Causa probable: la captura de cada estado (la miniatura de la ranura) se dibujaba en el mismo lienzo que la imagen del juego y se codificaba en PNG mientras, con el ritmo propio (v0.41.0, en todas las consolas), el hilo seguía pintando y transfiriendo fotogramas desde ese lienzo. Ahora la captura va en su propio lienzo 2D (`captura` en `Pintor`), con la misma colocación de las pantallas de DS. Afectaba también al punto de control (cada 5 minutos) y a los estados de las ranuras.
- No se reproduce en el navegador de pruebas (Chromium), así que el arreglo no se puede comprobar aquí: pendiente de que el usuario confirme que no se repite. La prueba de guardar y cargar rápido comprueba ahora que la imagen sigue al juego después de varios guardados seguidos.
- 187 pruebas unitarias y 77 de navegador.

## 0.42.4 (17/11/2026)

A partir de una captura del usuario con un juego de DS en vertical (modo para juegos de rol y botones movidos con el editor): la cruceta y los botones pisaban la fila de herramientas.

- Los botones movidos se guardaban como fracción del alto del recuadro. Como iOS 26 abre la app unas veces con 874 de alto y otras con 812, una cruceta colocada abajo cambiaba de distancia al borde, mientras la fila de herramientas va siempre pegada abajo. Ahora las piezas de la mitad de abajo se colocan a la misma distancia del borde de abajo que cuando se movieron (`alto` en `Colocacion`, `estiloPieza`); las de la mitad de arriba, como antes. Las movidas antes de esta versión, sin alto guardado, toman el de la pantalla.
- En el juego de la captura, la cruceta y los botones se movieron a la franja de abajo cuando la fila de herramientas no se veía (se cortaba, v0.35.0 a v0.42.0): ahí siguen pisándose. Se arregla con «Restablecer» en el editor de botones de ese juego.
- 187 pruebas unitarias (nueva: distancia al borde de abajo) y 77 de navegador.

## 0.42.3 (17/11/2026)

A partir del registro del usuario con un juego real de PlayStation («arranca bien, pero la pantalla se ha quedado más pequeña») y con la DS.

- PlayStation, siempre a 4:3: la imagen tomaba la proporción de la resolución del momento, y los juegos de PlayStation la cambian en marcha (320 x 240, 512 x 240, 368 x 480…); con 368 x 480 se quedaba estrecha y pequeña. En la tele, la PlayStation se veía siempre a 4:3, sea cual sea su resolución.
- Ahorro automático con margen: se activa con la pantalla a 32 refrescos o menos (el modo de bajo consumo la deja a 30) y se quita al volver a 45 o más. Con el límite de 40 de la v0.42.0, en la DS se encendía y apagaba cada segundo, con la pantalla del iPhone entre 40 y 80.
- Visto en el registro y sin cambios: en la PlayStation, el juego va a 60 fotogramas por segundo y enseña de 12 a 22 imágenes nuevas, las que dibuja el propio juego (muchos dibujan a 30 o a 20). En la DS, un fallo del núcleo («Out of bounds memory access») al seguir donde se dejó, 5 segundos después de haber abierto el juego; la protección de la v0.13.1 lo abrió con la partida guardada y no se perdió nada. No se reproduce aquí: pendiente de ver si se repite.
- 186 pruebas unitarias y 77 de navegador.

## 0.42.2 (17/11/2026)

A partir de otra captura del usuario (GBA con el menú abierto, en la ventana corta de iOS 26): debajo de la hoja del menú asomaba el color del tema.

- Por debajo de la ventana corta solo llega el fondo de la página, que en el juego es el color de abajo del tema. Con una hoja abierta en el juego (el menú y sus apartados), ese fondo toma el color de la hoja (`body.en-juego:has(.hoja)`), en claro o en oscuro según la hoja: la hoja parece llegar hasta abajo.
- 186 pruebas unitarias y 77 de navegador.

## 0.42.1 (17/11/2026)

A partir de otra captura del usuario con la DS en vertical (v0.42.0): la fila de abajo seguía cortada a unos 62 puntos del borde. El arreglo de la v0.41.2 no era el bueno.

- Causa, en el registro del usuario («Zona segura», `alto`): en la app instalada, iOS 26 abre la ventana unas veces con todo el alto de la pantalla (`ventana` 874 en el iPhone 17) y otras con 62 puntos menos (812). Lo que queda por debajo de la ventana no es de la app. Desde la v0.35.0, el juego usaba el alto grande de la pantalla (`100lvh`, 874): con la ventana corta sobresalía y se cortaba la fila de abajo.
- Arreglo: el juego mide la ventana de verdad (`--alto-ventana`, que pone `zonaSegura.ts` con `innerHeight` al abrir, al girar, al cambiar de tamaño y al volver de segundo plano). Con la ventana entera, llega hasta abajo; con la corta, todo cabe y queda la franja que iOS deja fuera de la app. Sustituye al `100lvh` de la v0.35.0 y al alto de la capa de la v0.41.2.
- Sin poder reproducirlo aquí (el navegador de pruebas no imita la app instalada): pendiente de que el usuario lo confirme. 186 pruebas unitarias y 77 de navegador.

## 0.42.0 (17/11/2026)

Mejora 28 de la hoja de ruta, pedida por el usuario por el calor del iPhone jugando a Super Nintendo. Su registro de la v0.41.1 enseña la Super Nintendo a 60 imágenes por segundo justas, con 1 ms de trabajo por fotograma y ninguno perdido: el emulador apenas trabaja; lo que más calienta es la pantalla a 60 imágenes y el avance rápido (ratos a x2 y x4).

- «Ahorrar batería en todos los juegos» (Ajustes, Pantalla; `ahorroTodos`): 30 imágenes por segundo en todos los juegos, aunque tengan su propio ajuste. Dentro de un juego, su interruptor se ve activado y no se puede quitar, con una nota. El ajuste por juego sigue como estaba.
- Ahorro automático (`pantallaLenta` en `Sesion`): si el iPhone deja la pantalla a 40 refrescos por segundo o menos (modo de bajo consumo, o caliente; en el registro del usuario la DS iba a 37), el juego deja de dibujar las imágenes que no se pueden ver. Se anota «Ahorro automático» al entrar y al salir.
- Registro: «Rendimiento» lleva `ahorro` (juego, todos, auto o no) y `avanceSeg` (segundos con avance rápido en esos 30 s); «Juego cerrado», `avanceSeg` de toda la partida.
- `Interruptor` admite `desactivado`.
- Pruebas: 186 unitarias y 77 de navegador (nueva: el ahorro para todos manda sobre el del juego, el juego va a menos de 36 imágenes por segundo y el avance rápido queda en el registro).

## 0.41.3 (17/11/2026)

A partir de una captura del usuario con Super Nintendo en vertical: la fila de guardar, cargar, el menú y el avance rápido había quedado descentrada desde que se quitó el botón de rebobinar (v0.37.3).

- La fila se colocaba alrededor del centro contando con dos botones a cada lado del menú. Sin rebobinar, a la derecha queda solo el avance rápido: cuando el grupo de la derecha tiene un botón, toda la fila se corre media pieza (`--corre-fila`, con `:has`) y vuelve a quedar centrada. Si algún día se vuelve a activar rebobinar, o en la DS (que lleva «Soplar»), queda como estaba.
- Una mano en vertical con la mano derecha: el menú y guardar y cargar se acercan, sin el hueco donde iba rebobinar. Revisadas el resto de disposiciones (horizontal, una mano en horizontal y las de la DS): no dependían del número de botones.
- Prueba de navegador nueva: la fila centrada y con los mismos huecos en Game Boy, GBA, NES, Super Nintendo, Mega Drive, Master System y N64, y sin hueco con una mano (con el CSS anterior falla: 27 puntos descentrada). 186 pruebas unitarias y 76 de navegador.

## 0.41.2 (17/11/2026)

A partir de una captura del usuario con la DS en vertical en la app instalada: la fila de abajo (guardar y cargar, Select, Start, avance rápido y menú) salía cortada por la mitad, con una franja negra debajo.

- Causa: desde la v0.35.0, en la app instalada el recuadro del juego usa el alto grande de la pantalla (`100lvh`), porque en iOS 26 lo fijado a la pantalla se quedaba unos 62 puntos corto. Pero la capa que lo contiene seguía con el alto corto y, con la animación de entrada del juego (relleno «both»), iOS la usaba como contenedor del recuadro y recortaba lo que sobresalía. En la DS en vertical, la fila de abajo va pegada al borde y es lo que se cortaba; en el resto de consolas, el corte caía en el margen de abajo y no se notaba.
- Arreglo: la capa del juego, con el mismo alto que el recuadro en la app instalada (`.capa.capa-juego`), y la animación de abrir un juego sin relleno al acabar (`backwards`), para que la capa deje de contener al recuadro.
- Sin poder reproducirlo aquí (el navegador de pruebas no imita la app instalada ni el alto corto de iOS 26): pendiente de que el usuario lo confirme. Pruebas: 186 unitarias y 75 de navegador.

## 0.41.1 (17/11/2026)

Lo que ha enseñado la primera pasada con WebKit (21): 60 de 74 pruebas bien a la primera.

- Estadísticas: con ratón, tocar una columna del gráfico la dejaba sin elegir (al pasar por encima ya se elegía y el clic la quitaba). Con el dedo no pasaba; ahora tampoco con ratón.
- Pruebas con WebKit: se saltan, con su motivo, las que el WebKit de Linux de las pruebas no puede hacer y el Safari del iPhone sí: los toques de varios dedos (se simulan con CDP, solo en Chromium), la N64 (WebGL 2 en el hilo) y la PlayStation (copiar el disco a los ficheros privados con acceso síncrono). El pulso de la pantalla y la medida de los dos pintores solo se comprueban donde hay pantalla regular y WebGL 2 en el hilo.
- Prueba nueva, «capacidades del navegador»: deja en el informe qué tiene cada navegador (OffscreenCanvas, WebGL 2 y WebGL en el hilo, OPFS con acceso síncrono, SIMD), para saber por qué se salta cada prueba.

## 0.41.0 (17/11/2026)

Mejoras 25 y 21 de la hoja de ruta, marcadas por el usuario.

- 25, ritmo propio en todas las consolas: el hilo del motor hace los fotogramas, recibe los botones en cuanto cambian y manda el sonido directo al procesador de audio, como ya hacían la N64 y la PlayStation. Antes, en el resto, la página pedía cada tanda en cada refresco de la pantalla y esperaba la respuesta; si la página iba cargada, el juego lo notaba.
- Pulso de la pantalla (`pulso` en `RitmoPropio`): en las consolas que van casi al ritmo de la pantalla (GBA a 59,73 en una de 60 o 120 Hz, NES, Super Nintendo, Mega Drive, DS…), la página manda en cada refresco cuántos fotogramas tocan, contados como antes (`planRitmo`). Así cada imagen cae en su refresco y no se repite una cada pocos segundos, que es lo que pasaría con solo el reloj del hilo. El trabajo sigue en el hilo y el pulso es un aviso sin respuesta. Si los pulsos dejan de llegar 100 ms, el hilo sigue con su reloj desde el último. «Ahorrar batería» junta los pulsos cada unos 33 ms. El sonido se ajusta a lo que va de más el juego en sincronía (por ejemplo, 60 frente a 59,73).
- La N64 y la PlayStation siguen con el reloj del hilo (`relojHilo` en `SISTEMAS`; sustituye a `ritmoPropio`): pueden cargar tanto el iPhone que la pantalla no refresca a tiempo.
- Con rebobinar activado (ajuste interno, desactivado desde la v0.37.3) y sin el hilo, todo sigue como antes: rebobinar necesita que la página pida cada tanda.
- Registro: «Juego abierto» dice `propio-pulso`, `propio` o `pantalla`; «Rendimiento» lleva `pulsos` y `tandas`.
- 21, pruebas de navegador también con WebKit, el motor de Safari: proyecto `webkit` en `playwright.config.ts` (`npm run e2e:webkit`) y flujo propio en GitHub (`webkit.yml`), en cada envío y aparte de la publicación (un fallo avisa pero no la para). Es el WebKit de Linux, no el Safari del iPhone. `npm run e2e` sigue siendo solo Chromium.
- Pruebas: 186 unitarias (nuevas: reloj, pulso, vuelta al reloj y recorte del ritmo del hilo) y 74 de navegador (la de «Ahorrar batería» comprueba que GBA va al pulso de la pantalla).

## 0.40.0 (17/11/2026)

Última de las mejoras marcadas por el usuario: 29, los parones de la Nintendo 64 al preparar gráficos nuevos (en los registros, fotogramas sueltos de 83 a 90 ms).

- Lista de sombreadores por juego: GLideN64 prepara un sombreador cada vez que el juego pide una combinación de colores nueva, y eso se nota como un parón. Ahora el núcleo apunta cada combinación en una lista (`EnableShadersStorage` y parche en `CombinerInfo::setCombine`, porque el núcleo solo la escribía al descargar el juego y en el iPhone la app se cierra sin avisar). La app la recoge cada 10 segundos de juego y al salir (`sombreadoresSiCambian` en el motor, `guardarSombreadores` en el almacén, con la clave `sombreadores:<juego>` junto a las ROM) y, al volver a abrir el juego, la deja en `/sistema/Mupen64plus/shaders` antes de cargar: el núcleo prepara todos esos sombreadores al arrancar y no en mitad de la partida. La primera vez que se ve cada zona sigue habiendo parones; las siguientes, no. Se borra al quitar el juego y no va en las copias (se rehace sola).
- Opciones de los núcleos: la app las fija ahora antes de iniciar el núcleo. El puente guarda 64 y, al iniciarse, el núcleo apunta las suyas por defecto; la N64 declara 85 y la PlayStation 76, así que una opción de la app que no estuviera ya en la lista se perdía sin aviso. En la N64 era justo la de los sombreadores (el resto de las nuestras ya estaban). Se probó a subir el límite a 256, pero cambiaba cómo se ve en la N64 una imagen dibujada por el procesador después de cargar un estado (la ROM de prueba lo detecta): se deja en 64 y el puente no cambia.
- Las opciones de mGBA (paleta de Game Boy y colores como en la consola) solo se mandan a mGBA. Antes iban a todos los núcleos y, en los que tienen pocas opciones, hacían que el núcleo releyera todas en mitad de la partida.
- Registro: «Rendimiento» lleva `parones` (tandas de más de 50 ms) y «Juego abierto», en la N64, `sombreadores` (si había lista de la vez anterior).
- Solo se ha recompilado el núcleo de N64 (parche de GLideN64). La prueba de rendimiento fija las opciones antes de iniciar, como la app.
- Pruebas: 181 unitarias y 74 de navegador (nueva: la lista se guarda tras dibujar con el RDP y está al volver a abrir el juego).

## 0.39.0 (17/11/2026)

Segunda entrega de las mejoras marcadas por el usuario: PlayStation (23 y 24). Decisiones del usuario: discos juntos por el nombre y palancas por juego, opcionales.

- 23, varios discos por juego: al elegir los discos de un juego a la vez («Juego (Disc 1)», «(Disc 2)», «(Disco 2 de 3)», «[CD2]»…), la app los junta en un solo juego, con una sola tarjeta de memoria (`numeroDeDisco` y `montarGrupo` en `src/lib/discos.ts`). Se guardan como «disco1.chd», «disco2-pista1.bin» y «disco2.cue»… con una lista «discos.m3u», que es lo que abre el núcleo; el SHA-1 es el de todos los discos en orden. Con uno solo, todo como antes. En el menú del juego, «Disco: 1 de 3» para cambiarlo cuando el juego lo pide; se recuerda en el juego (`Disco.actual`) y, al volver a abrirlo, el núcleo arranca con ese disco (lo elige antes de cargar).
- PBP (el formato de PlayStation de la PSP, también de varios discos): se reconoce por su cabecera y lo abre el núcleo. Sin PBP de prueba propio: comprobado solo el reconocimiento.
- Puente (`nucleos/puente.c`): control de discos de libretro, en sus dos versiones (`pf_discos`, `pf_disco_actual`, `pf_disco_inicial` y `pf_cambiar_disco`) y el tipo de mando del puerto 1 (`pf_mando`). Solo se ha recompilado el núcleo de PlayStation: el resto no usa nada de esto.
- 24, palancas analógicas (apartado Mando de cada juego de PlayStation, desactivadas por defecto): el mando pasa a DualShock (también en marcha, sin cerrar el juego). La palanca izquierda va en el sitio de la cruceta, flotante como la de la N64; la derecha, en la esquina de abajo a la derecha en vertical y encima de los botones en horizontal, y se mueve con el editor (pieza «palanca»). Un toque corto en una palanca la pulsa (L3 y R3). El núcleo activa el modo analógico cuando el juego lo pide; L1, R1 y Select a la vez hacen de botón ANALOG. Con un mando físico, las dos palancas y L3 y R3. `Mando` generaliza la palanca de la N64 a dos (un dedo por palanca).
- Mando para juegos de rol en PlayStation: los botones salían con A, B, X e Y; ahora con ○, ✕, △ y □ (`etiquetas`).
- Programa de prueba de PlayStation: pone el mando en modo analógico (a las 40 imágenes: al cambiar de mando, la consola lo ve medio segundo después) y lee las dos palancas (blanco, negro y rojo con L3); segundo disco de prueba que arranca en amarillo (`prueba-psx-2.bin`).
- Pruebas: 181 unitarias y 73 de navegador (nuevas: número de disco, PBP, juntar discos con su lista; juego de dos discos con cambio de disco que se recuerda al volver a abrirlo, y palancas con L3).

## 0.38.0 (17/11/2026)

Primera entrega de las mejoras que ha marcado el usuario (22, 23, 24, 26, 27 y 29 de la hoja de ruta): las de la interfaz.

- 27, en vertical, L y R ya no pisan guardar, cargar, el menú ni el avance rápido: los hombros nunca suben por encima de la fila de herramientas y, en pantallas bajas, la cruceta y los botones bajan lo justo (hasta 26 puntos) para dejarles sitio. En un iPhone 17 no cambia nada (ya cabían); pasaba en pantallas más bajas, como la del navegador de pruebas. Prueba de navegador que mide que ningún hombro pisa otra pieza, en Super Nintendo y PlayStation (con el CSS anterior, falla).
- 22, almacenamiento por juego (Ajustes, Almacenamiento): cada juego con lo que ocupa (el juego o el disco, sus estados y su partida), de más a menos, y lo guardado de juegos quitados. Desde cada uno, borrar sus estados (la partida no) o quitarlo de la biblioteca, las dos con «Deshacer». Los estados se recorren de uno en uno (`ocupacionGuardada`), sin cargarlos todos. `quitarDeLaBiblioteca` es ahora una sola función para la biblioteca y Ajustes.
- 26, la partida como fichero (opciones de cada juego, «Partida en un fichero»): exportarla (.sav en Game Boy, GBA y DS; .srm en el resto, el formato de RetroArch y de la mayoría de emuladores) e importar una desde Archivos. Antes de importar se hace una copia de seguridad; si el tamaño no coincide con la partida actual, se avisa. El estado de seguir donde se dejó se aparta, porque lleva dentro la partida anterior y, al cargarlo, el juego la guardaría encima de la importada. Todo con «Deshacer».
- Pruebas: 178 unitarias y 71 de navegador (nuevas: ocupación por juego, nombre y validación de la partida; solape en vertical, importar y exportar una partida de GBA que la ROM de prueba reconoce, y borrar estados con «Deshacer»).

## 0.37.3 (17/11/2026)

Dos peticiones del usuario: el parpadeo al volver deslizando sigue («se ven las carátulas de fondo y desaparecen») y desactivar el rebobinado, que no usa, sin quitarlo del código.

- Parpadeo: durante el gesto, el inicio de debajo va en su propia capa de pantalla (lleva transform); al soltar la perdía, iOS lo repintaba y decodificaba las carátulas en segundo plano, así que salían un momento en blanco. Ahora el inicio y la lista de Ajustes van siempre en su propia capa (`will-change: transform`, `.capa-inicio` y `.lista-ajustes`), y las imágenes del inicio, la biblioteca y las estadísticas se decodifican al pintarlas (`decoding="sync"`). El velo de «Añadiendo…» se pinta en el body (con la capa propia, lo fijo de dentro quedaría atado a la pantalla). Pendiente de que el usuario lo confirme: no se puede reproducir en Chromium.
- Rebobinar desactivado (ajuste interno `rebobinado`, false por defecto y sin opción en pantalla): sin botón, sin guardar un estado cada 10 fotogramas y sin arrancar su hilo (`Historial` lo crea al guardar el primer estado). El código sigue; la prueba de navegador lo activa en los ajustes para seguir probándolo.
- Pruebas: 173 unitarias y 68 de navegador.

## 0.37.2 (17/11/2026)

El usuario sigue viendo parpadear la pantalla al volver atrás con la v0.37.1. Revisado fotograma a fotograma lo que pasa al volver:

- Al volver deslizando, al soltar se pedía a React el cambio de pantalla y, en el mismo fotograma, se quitaban los estilos del gesto. React aplica el cambio un momento después (en Safari, después del fotograma): durante ese fotograma, la pantalla de la que se sale volvía a verse entera y el inicio, desplazado. Ahora el cambio se aplica antes (`flushSync` en `useVolverDeslizando`) y los estilos se quitan en el mismo fotograma.
- Al volver con el botón, el inicio esperaba debajo desplazado un 30 % y la animación empezaba en el 33 %: un salto pequeño al arrancar. Las dos coinciden ahora (30 %).
- Sin oscurecer con `filter: brightness` al entrar y volver (animaciones y gesto): en iOS, un filtro sobre una pantalla entera obliga a repintarla al empezar y al acabar.
- Prueba de navegador fotograma a fotograma: una vez que el inicio llega a su sitio al volver deslizando, no se mueve ni asoma la pantalla de antes. En Chromium el fallo no llegaba a verse (aplica el cambio antes del fotograma), así que la prueba no lo reproduce: pendiente de que el usuario lo confirme en el iPhone.
- Medido, por el calor del iPhone que comenta el usuario con EarthBound: con la Super Nintendo, el hilo principal trabaja un 3 % del tiempo y el del juego, un 6 % (1 ms por fotograma, según su registro); con la PlayStation, parecido. Sin cambios por ahora: opciones propuestas al usuario.
- Pruebas: 173 unitarias y 68 de navegador.

## 0.37.1 (16/11/2026)

Parpadeo al volver atrás, informado otra vez por el usuario con la v0.36.0 (el arreglo de la v0.35.1, que conservaba las direcciones de las imágenes, no bastó).

- La pantalla de debajo de una apilada (el inicio bajo una biblioteca, Estadísticas o Ajustes, y la lista de Ajustes bajo un apartado) estaba oculta con `visibility: hidden`. Oculta, iOS deja de tenerla pintada y suelta las imágenes ya decodificadas; al volver, la repintaba entera en el primer fotograma de la animación, y eso era el parpadeo. Ahora se queda pintada debajo, tapada por la de arriba y sin recoger toques (`.capa.fondo` y `.oculto-detras` en `src/index.css`). No se puede reproducir aquí (Chromium no suelta lo oculto): pendiente de que el usuario lo confirme.
- Pruebas: 173 unitarias y 68 de navegador (las de volver deslizando comprueban ahora que el inicio de debajo se mueve con el dedo y queda sin estilos sueltos).

## 0.37.0 (16/11/2026)

PlayStation en pruebas, pedida por el usuario (fila 6 de la hoja de ruta y 16 del análisis), revisando lo aprendido con la N64 para no repetirlo. Decisiones del usuario: CHD y BIN con CUE, BIOS propia opcional, una tarjeta de memoria por juego y primera entrega jugable (sin varios discos por juego ni palancas analógicas, que van después).

- Núcleo PCSX ReARMed (GPLv2, `7b0e8f8f`) con su receta para Emscripten: sin hilos, intérprete (en WebAssembly no hay recompilador), GPU psx_gpu con SIMD y CHD con libchdr. `-O3 -flto` con SIMD, un 17 % más rápido que solo con SIMD; 64 MB de memoria (la mitad que la N64). 3,7 ms por fotograma con el CD de prueba en el navegador de pruebas (la N64, 5,6; la DS, 6,1). Script: `compilar_psx` y `compilar_zlib` (sin el puerto de zlib de Emscripten, que se descarga aparte).
- Lo que se aprendió con la N64, aplicado desde el principio: ritmo propio (el hilo del motor lleva los fotogramas, los botones y el sonido: `ritmoPropio` en `SISTEMAS`), sin corrutinas ni Asyncify, sin WebGL en el núcleo (la imagen la pinta el pintor de la app), sin rebobinado (estados de 4,3 MB), estado «auto» sin captura y medida en la prueba de rendimiento de GitHub.
- Discos sin cargarlos en memoria: se copian por trozos de 8 MB a los ficheros privados de la app (OPFS) en un hilo aparte (`discos.worker.ts`), con su SHA-1 calculado a la vez (`Sha1`, por trozos, porque `crypto.subtle` no los admite); el núcleo los lee sector a sector desde el hilo del motor (WORKERFS y `pf_cargar_ruta` en el puente). Al elegir ficheros, cada CUE se junta con sus BIN por el nombre; un BIN sin CUE vale si es de una sola pista de datos (y un .bin que no empieza como un sector de CD sigue siendo de Mega Drive). La hoja CUE se guarda con los nombres de la copia (`pista1.bin`…). Progreso de la copia en pantalla y aviso si no cabe.
- Al quitar un juego de PlayStation, su disco se queda hasta la siguiente apertura de la app, para que «Deshacer» lo recupere (`limpiarDiscosQuitados`; no toca las carpetas de menos de una hora).
- BIOS propia opcional (Ajustes, «BIOS de PlayStation»): solo ficheros de 512 KB, guardada en el iPhone (nunca en las copias de partidas) y dejada en `/sistema` con un nombre que busca el núcleo. Sin ella, la BIOS libre del núcleo.
- Tarjeta de memoria por juego: la partida del juego, como la memoria de los cartuchos (128 KB).
- Mando: rombo con triángulo, círculo, X y cuadrado (formas de trazo en un solo color, sin los colores de la consola), L2 y L1 a la izquierda y R1 y R2 a la derecha, Select y Start. Con un mando físico, L1, L2, R1 y R2 por separado. Tema «Plata», dibujo propio de la consola en el inicio e índice de carátulas de PlayStation (9.301 nombres).
- Disco de prueba propio, sin código de Sony (`scripts/psx_prueba.s`, ensamblado con llvm-mc; `prueba-psx.bin` y `.cue`, y `prueba-psx.chd` con chdman): un ejecutable en un CD ISO 9660 que lee el mando y la tarjeta de memoria por el puerto serie y pinta la pantalla de un color.
- Pruebas: 173 unitarias y 68 de navegador (nuevas: SHA-1 por trozos, CUE y agrupación de discos, BIOS, mando físico; disco en BIN y CUE con botones, estados y tarjeta de memoria, CHD, BIN suelto, CUE sin su BIN y BIOS en Ajustes).

## 0.36.0 (16/11/2026)

Revisión de código de lo hecho desde que entró la Nintendo 64 (v0.32.0 a v0.35.1), pedida por el usuario: tres revisiones independientes (motor, ritmo propio y sonido; interfaz; núcleo y puente de N64). Se comprobó cada hallazgo antes de corregirlo.

Motor y sonido
- Abrir un juego mientras se cierra el anterior: guardar el estado de una N64 lleva un rato y, si se abría otro juego mientras, el cierre del anterior quitaba al nuevo su receptor de imágenes y su canal de sonido. La apertura espera al cierre anterior (como mucho 8 s), el receptor solo lo quita quien lo puso (`miEvento` en `ConexionHilo`) y cada canal de sonido lleva su número (`soltarCanalHilo(id)`, `idExterno` en `procesador-audio.js`). `cerrar()` es una sola vez aunque se pida varias.
- Ritmo propio: las medidas del registro ya no cuentan el tiempo en pausa; si cambia el ritmo de la consola, el reloj empieza de nuevo; «Ahorrar batería» deja de pintar las imágenes que luego se tiraban (`sinImagen`); un fallo en un aviso al hilo llega a la página como fallo del juego en lugar de perderse.
- Cargar un estado con el juego en pausa enseña la imagen cargada en N64 (`imagenTrasCargar`, un fotograma tras cargar).
- Estado «auto» sin captura (no se enseña) y sin copiar los 16 MB del estado de N64: al pasar a segundo plano, iOS da poco tiempo.
- La palanca de un mando físico cuenta como actividad (antes, la pausa por no tocar podía saltar jugando solo con ella); soltar la palanca táctil no cuenta.
- Sonido: tras vaciar la cola (pausa, carga de estado), el ajuste de ritmo va neutro hasta el primer aviso del procesador; antes calculaba con el aviso anterior.

Interfaz
- Palanca de N64: un segundo dedo en su zona ya no se la quita al primero ni la suelta al levantarse; la zona tiene límite a la izquierda y abajo y no toma toques de otras piezas; el pomo llega al borde del aro a tope.
- Editor de botones: en N64 la pieza «l» se llama Z y «select», L (nombre del botón que se ve); las herramientas también salen recuadradas al editar.
- Inicio: suelta las direcciones de las imágenes al desmontarse.

Núcleo de N64
- Puente (`nucleos/puente.c`, solo con la tarjeta gráfica): libera la copia de la ROM al cargar (el núcleo tiene la suya; hasta 64 MB de memoria menos), destruye el contexto de WebGL al descargar (Safari limita cuántos puede haber) y, si no hubo contexto al cargar, no llama a `retro_deinit`, que arrancaba el emulador sin la parte gráfica y fallaba. Núcleo de N64 recompilado; el resto no cambia.
- Sin WebGL 2 en el hilo del juego, la N64 avisa al abrir en lugar de fallar sin explicación.
- Si el iPhone retira la tarjeta gráfica al juego, se para con su explicación en lugar de quedarse en negro.
- Las funciones de un fallo del núcleo salen ahora también de la pila del propio error: con las fibras, el error original casi nunca se guardaba.
- Revisado sin fallos: la lista de Asyncify (ninguna función sin instrumentar llama a una instrumentada), el parche de WebGL, las fibras, la palanca, los botones C y el reconocimiento de las ROM.
- Pendiente, sin urgencia: cada estado guardado de N64 avanza un fotograma y pierde su sonido (comportamiento del núcleo); comprobar la lista de Asyncify en GitHub si se actualiza el núcleo.
- Pruebas: 163 unitarias y 65 de navegador (nuevas: ritmo del sonido tras vaciar y segundo dedo en la palanca).

## 0.35.1 (16/11/2026)

Parpadeo al volver al inicio, informado por el usuario (por ejemplo, desde Estadísticas).

- El inicio vuelve a leer los juegos y las imágenes al volver de otra pantalla (v0.26.1). Creaba una dirección nueva para cada carátula y cada foto de consola y tiraba las anteriores, y las imágenes se quedaban un instante en blanco. Ahora se reutiliza la dirección de las que no han cambiado (`actualizarUrls` en `src/lib/urlsCaratulas.ts`, por fecha y tamaño), y solo se crean y se sueltan las nuevas, cambiadas o quitadas.
- Pruebas: 162 unitarias y 65 de navegador (la del inicio comprueba que la foto de una consola conserva su dirección al ir a Ajustes y volver; con el código anterior fallaba).

## 0.35.0 (16/11/2026)

A partir de dos capturas del usuario con Nintendo DS en vertical: los mandos tapaban la parte de abajo de la pantalla táctil mientras quedaba una franja negra sin usar debajo, y al mover los botones, las herramientas no se podían mover.

- Alto completo en la app instalada (`@media (display-mode: standalone)` en `src/index.css`): en iOS 26, lo que va fijado a la pantalla se quedaba unos 62 puntos por encima del borde de abajo (lo que mide la franja de la hora). El recuadro del juego usa ahora el alto grande de la pantalla (`100lvh`), también girado. Todo baja hasta el borde, y en DS los mandos tapan menos la táctil. No se puede comprobar aquí (el navegador de pruebas no es una app instalada): el registro («Zona segura») lleva ahora `alto` con el alto de la ventana, el grande, el de la pantalla y si va instalada.
- Las herramientas se mueven con el editor de botones: guardar y cargar (`guardar`), las de la derecha, rebobinar, soplar y avance rápido (`herramientas`), y el menú (`menu`), por juego y por orientación como el resto de piezas. El editor busca las piezas en todo el recuadro del juego, no solo en el mando.
- Pruebas: 161 unitarias y 65 de navegador (la del editor mueve también guardar y cargar, y comprueba que sigue funcionando).

## 0.34.0 (16/11/2026)

Nintendo 64, a partir del tercer registro del usuario («ha mejorado mucho, pero aún va con un poco de lag y la palanca se siente brusca»). Con el ritmo propio el juego ya va a su velocidad (49,6 fotogramas por segundo de 50, unos 5,5 ms cada uno), pero solo se veían unas 14 imágenes por segundo, en tandas de 3 o 4 fotogramas, y la pantalla de la app seguía a unos 20 refrescos por segundo: la tarjeta gráfica no daba abasto.

- Dibujo de GLideN64 en WebGL (`nucleos/n64_webgl.patch`, `opengl_UnbufferedDrawer`): WebGL no tiene vértices en la memoria del programa y Emscripten los imita subiendo cada atributo por separado (posición, color, textura…) en cada dibujo, unas cinco veces los mismos vértices y unas 15 llamadas. Ahora los vértices y los índices se suben una vez por dibujo a un búfer propio y los atributos apuntan dentro. Los punteros se ponen en cada dibujo: el gestor de estado de libretro (glsm) los vuelve a poner entre fotogramas sin búfer, y con la caché de GLideN64 la imagen salía negra.
- ROM de prueba: con B, una lista de órdenes del RDP (rectángulo rojo y triángulo cian) que dibuja GLideN64 con la tarjeta gráfica. Con ella se comprueba el parche: misma imagen y la mitad de bytes subidos en los fotogramas con dibujo (con dos atributos; los triángulos de los juegos llevan cuatro o cinco).
- Resolución de Nintendo 64 por juego (Pantalla): alta (640 x 480, como hasta ahora) o normal (320 x 240, la de la consola; la tarjeta gráfica trabaja la cuarta parte). Se aplica al volver a abrir el juego; el lienzo del núcleo se crea a esa medida.
- Palanca sin saltos (`vectorPalanca`): la inclinación empieza en 0 al salir de la zona muerta (antes saltaba al 8 %) y el imán de rectas y diagonales (8 grados) reparte el ángulo de alrededor en lugar de saltar al salir de él.
- Pruebas: 161 unitarias y 65 de navegador (nuevas: el dibujo con el RDP y la resolución normal).

## 0.33.0 (16/11/2026)

Nintendo 64, a partir del segundo registro del usuario («va un poco mejor, pero rasca, el audio se corta y hay retraso en el mando»). El núcleo ya va rápido (unos 3,5 ms por fotograma en escenas sencillas), pero la pantalla de la app se refrescaba unas 25 veces por segundo, con parones de hasta medio segundo, y era ese refresco el que pedía los fotogramas, mandaba los botones y llenaba el sonido. Decisiones del usuario: ritmo propio primero solo en N64, y palanca que siga al pulgar y más precisa en rectas y diagonales.

- Ritmo propio (`src/emulador/ritmoPropio.ts`), solo Nintendo 64 con el motor en el hilo aparte:
  - El hilo hace los fotogramas con su reloj (`RitmoPropio`): lo que toca sale del tiempo desde el arranque, hasta 4 seguidos para recuperar y, si va atrasado, se salta ese tiempo (`perdidos`) en lugar de ir a trompicones.
  - Los botones y la palanca llegan al hilo en cuanto cambian, sin respuesta (`avisar`, id 0), y valen desde el fotograma siguiente.
  - El sonido va directo del hilo al procesador de audio por su propio canal (`SonidoHilo`, `canalParaHilo` en el altavoz; el procesador acepta un `puerto` y le manda allí sus avisos).
  - Cada imagen nueva llega a la página como evento y se enseña al momento. «Ahorrar batería» deja como mucho unas 30 por segundo.
  - La página solo lleva lo de alrededor en su refresco: mandos físicos, punto de control, tiempo jugado, pausa por no tocar y medidas.
  - Registro: «Juego abierto» dice `ritmo` (`propio` o `pantalla`); «Rendimiento» con ritmo propio lleva `msFotograma`, `perdidos` y `refrescosSeg`.
- Palanca de N64:
  - Flotante: el pulgar se apoya en cualquier punto de una zona amplia alrededor de la palanca (hasta 1,5 radios a la derecha y 1,8 por encima, sin límite a la izquierda ni abajo); ese punto hace de centro y el aro va allí mientras dura el toque. Los botones que caen en la zona mandan sobre ella.
  - Imán: a menos de 9 grados de una recta o de una diagonal, se queda exactamente en ella (`vectorPalanca`, con pruebas).
  - Sin la zona muerta del núcleo (15 %), que se sumaba a la de la app (8 %).
- Pruebas: 160 unitarias y 64 de navegador (la de N64 comprueba el ritmo propio y la palanca flotante).

## 0.32.1 (16/11/2026)

Nintendo 64, a partir del registro del usuario con un juego real: iba a unas 15 imágenes por segundo (la consola pide 50) con parones de hasta 0,7 s, y el núcleo falló a los dos minutos («Unreachable code»).

- GLideN64 leía la imagen de la tarjeta gráfica con `glMapBufferRange` de lectura, que WebGL no tiene: Emscripten devolvía un puntero nulo y se copiaba a la memoria de la consola lo que hubiera al principio de la memoria del núcleo, en cada fotograma. Ahora:
  - Parche para WebGL 2 (`nucleos/n64_webgl.patch`, aplicado por `compilar.sh`): lee con `glReadPixels` y `glGetBufferSubData`.
  - La copia de la imagen y de la profundidad a la memoria de la consola van desactivadas (`EnableCopyColorToRDRAM` y `EnableCopyDepthToRDRAM`). La de profundidad dibujaba cada triángulo otra vez en el procesador. Se pierden algunos efectos (fotos hechas dentro del juego, destellos que deberían quedar detrás de las paredes).
- Asyncify solo en la ruta que cambia de corrutina (`-sASYNCIFY_ONLY`, `nucleos/n64_asyncify.txt`): antes Emscripten instrumentaba todo, GLideN64 incluido, por las llamadas indirectas. El núcleo pasa de 3,3 a 2,7 MB (con los nombres de las funciones). Con la ROM de prueba no se nota (casi no usa GLideN64); en los juegos, se verá en el registro.
- Si el núcleo falla, el registro dice en qué funciones (`funcionesDelFallo`; núcleo con `--profiling-funcs` y el error original guardado en el módulo).
- Pruebas: 158 unitarias y 64 de navegador.
- Publicación: la prueba de rendimiento de los núcleos se pasaba de los 5 minutos en GitHub (seis núcleos y su versión anterior, Nintendo 64 con WebGL por software) y paraba la publicación. Ahora tiene 14 minutos, suelta el contexto de WebGL tras cada ronda y, como solo informa, no para la publicación si falla.

## 0.32.0 (16/11/2026)

Nintendo 64 en pruebas, pedida por el usuario (fila 7 de la hoja de ruta y 17 del análisis).

- Núcleo: Mupen64Plus-Next (GPLv2) con GLideN64, compilado a WebAssembly con OpenGL ES 3, que en el navegador es WebGL 2; RSP de alto nivel e intérprete con caché.
  - Corrutinas del núcleo con las fibras de Emscripten (`nucleos/libco_emscripten.c`, `-sASYNCIFY`). Al cerrar el juego, la corrutina del núcleo vuelve al hilo principal en lugar de abortar.
  - Con las fibras, el valor que devuelve una función que cambia de corrutina no es fiable: el puente guarda el resultado de `pf_cargar`, `pf_fotograma` y los estados, y la app lo lee con `pf_resultado`.
  - Ajustes de compilación necesarios: `GLES3=1` en la línea de `make`, `-fno-common`, xxHash sin `arm_neon.h`, zlib propia y memoria inicial de 128 MB. Detalle en `nucleos/README.md`.
- Puente (`PF_GL`): contexto WebGL 2 en el `OffscreenCanvas` que deja la app (`specialHTMLTargets['!lienzo']`), imágenes que el núcleo deja en ese lienzo (`pf_imagen_gl`) y palancas analógicas (`pf_analogico`). Todos los núcleos recompilados con el puente nuevo.
- Motor: en Nintendo 64 no hay pintor; la imagen del lienzo del núcleo se entrega con `transferToImageBitmap`, una vez por fotograma. La captura de los estados sale de la pantalla. Sin rebobinado (cada estado pesa 16 MB).
- Reconocimiento por la cabecera en los tres órdenes de bytes (.z64, .v64 y .n64), también dentro de un zip, y título interno.
- Mando táctil: palanca analógica que sigue al dedo en el sitio de la cruceta, A azul, B verde, cuatro botones C amarillos, Z en el hombro izquierdo, R en el derecho y L pequeño en el sitio de Select. Los botones C van al núcleo como la palanca derecha. Mando físico: palanca izquierda, botones C con la derecha y Z con el gatillo izquierdo. Turbo en A, B, Z, L y R; sin mando para juegos de rol.
- Tema «Carbón», dibujo propio de la consola en el inicio e índice de carátulas de libretro (1.115 nombres).
- ROM de prueba propia en MIPS (`scripts/n64_prueba.s`, `tests/fixtures/prueba.z64`): azul, verde con A y marca en la EEPROM, rojo si ya había marca, amarillo con la palanca y magenta con un botón C.
- Pruebas: 157 unitarias y 64 de navegador (nueva la de Nintendo 64: palanca, A, botones C, estados y partida). Las de navegador y la de rendimiento usan WebGL por software (`--enable-unsafe-swiftshader`). Rendimiento con la ROM de prueba en el navegador de pruebas, sin tarjeta gráfica: 5,9 ms por fotograma.

## 0.31.0 (16/11/2026)

Mejoras 5 y 6 del análisis de rendimiento, pedidas por el usuario: la emulación en un hilo aparte y el dibujo con la tarjeta gráfica.

- Hilo aparte (5):
  - El núcleo, los fotogramas (con turbo y correr fijo), los estados para rebobinar y el dibujo van en el motor (`src/emulador/motor.ts`), dentro de un hilo propio (`motor.worker.ts`), uno solo para toda la app.
  - `Sesion` se queda en el hilo principal con el ritmo de la pantalla, los botones, el tiempo jugado, el sonido, el rebobinado y el guardado, y habla con el motor por `conexion.ts`. Si el motor aún no ha terminado lo anterior, los fotogramas que tocan se suman al siguiente envío.
  - Cada imagen vuelve pintada y se enseña sin copiarla (`ImageBitmap` y `bitmaprenderer`, con respaldo en 2D).
  - El núcleo que se prepara al abrir la app (v0.28.0) se compila ya en el hilo.
  - Si el hilo no arranca o no contesta en 20 s, el mismo motor va en el hilo principal (respaldo, anotado en el registro). Ajustes, Acerca de, «Emulación en un hilo aparte» lo desactiva para descartar problemas.
  - Medido en el navegador de pruebas con la ROM de DS: el hilo principal pasa de estar ocupado un 50 % del tiempo a un 4 %, con el juego a 60 fotogramas por segundo; con Super Nintendo, del 6 % al 4 %.
- Tarjeta gráfica (6):
  - Pintor con WebGL 2 (`src/emulador/pintor.ts`): el fotograma como textura y cada pantalla como un rectángulo en su sitio (`cuadrosDS`, con prueba frente a `aNucleo`), también las disposiciones de DS. Respaldo en 2D, como antes.
  - Al abrir cada juego se miden los dos y se usa el más rápido en ese aparato. En el navegador de pruebas, que imita la tarjeta por software, gana el 2D (0,3 ms frente a 1,4 ms por imagen). En el iPhone lo dirá el registro («Juego abierto», `pintor` y `pintorMs`).
  - Prueba de navegador que compara las cinco disposiciones de DS píxel a píxel con los dos pintores.
- Registro: «Juego abierto» lleva `hilo`, `pintor` y `pintorMs`; «Rendimiento», `hilo`, `pintor` y `pintarMs`.
- Correr fijo y turbo pasan a `src/emulador/mascaras.ts` (el hilo no puede cargar los ajustes); `mandoJuego.ts` los reexporta.
- Pruebas: 151 unitarias y 63 de navegador. Las que leen píxeles copian el lienzo a uno 2D.

## 0.30.0 (16/11/2026)

Revisión de código de las versiones 0.19 a 0.29 (número 14 del análisis), pedida por el usuario: tres revisiones independientes (bucle del juego, pantallas y gestos, y datos y ajustes), cada hallazgo comprobado antes de corregirlo.

Corregido:

- Ahorrar batería (v0.28.0) contaba llamadas de la pantalla, no tiempo: a 120 Hz, o cuando un fotograma tardaba más de un refresco, el juego podía ir a un 80 % de su velocidad y el sonido cortarse. Ahora se trabaja cuando han pasado unos 33 ms y los refrescos se cuentan en todas las llamadas (`debidos` en `Sesion`).
- Gesto de volver:
  - Un segundo dedo a mitad del gesto dejaba la pantalla movida y el inicio torcido. Ahora cancela el gesto y lo deja todo en su sitio.
  - Un redibujado a mitad del gesto (por ejemplo, al acabar la animación de entrada) quitaba los oyentes. Ahora la función de volver y las opciones van en referencias.
  - La navegación se hace al acabar la animación, sin el salto final.
  - El «volver» deslizando ya no se descarta mientras dura otra animación.
- Apartados de Ajustes: con las animaciones activadas, el gesto de volver no movía el apartado, porque la animación de entrada se quedaba puesta. Ahora usa `backwards`. Prueba de navegador nueva con las animaciones activadas, que fallaba con el código de antes.
- Recuperar una copia de partidas: «Deshacer» devuelve también los estados (con su nombre) y las notas de antes, y borra los estados que trajo la copia y no estaban (`restaurarEstados`, `deshacerEstadosYNotas`). Antes solo devolvía las partidas.
- Zips: un README.md (u otro fichero pequeño con extensión de ROM) dentro de un zip se añadía como juego de Mega Drive. Ahora gana la ROM reconocida por la cabecera y, por extensión, solo valen ficheros de 8 KB o más.
- Mega Drive: se reconoce también con la cabecera de 512 bytes de las copiadoras (`.bin` incluidos).
- Copias: se rechazan las sesiones de una consola desconocida (rompían Estadísticas) y las colecciones que no son listas, con un mensaje claro.
- La pausa por no tocar ya no ejecuta los fotogramas de ese refresco después de pausar.
- Si la apertura de un juego falla, se cierran el hilo del rebobinado, el núcleo y el temporizador.
- Como mucho, dos núcleos compilados en memoria; antes, todos los usados en la sesión.
- Registro: `imagenesSeg` cuenta imágenes dibujadas, no refrescos (a 120 Hz anotaba el doble).
- Inicio: dos recargas cruzadas ya no dejan carátulas rotas en «Seguir jugando».
- Juego:
  - Con el temporizador de sueño puesto, el juego ya no se redibuja cada 5 s mientras se juega.
  - Mientras se colocan los botones, el juego no se reanuda.
  - Si se gira el iPhone durante la edición, se guarda lo hecho en la orientación de antes.
  - En el editor de botones, un segundo dedo no le quita la pieza al primero.
  - El temporizador de sueño marca la opción elegida para VoiceOver.

Revisado y sin cambiar, por diseño o por poco riesgo:

- Guardar en una ranura con nombre conserva el nombre (decisión de la v0.19.0, con prueba).
- La extensión `.gg` o `.sms` manda sobre la región de la cabecera.
- Fuera de un zip, un fichero diminuto con extensión de ROM se sigue aceptando.
- La pausa por no tocar cuenta los cambios de botones, no un botón mantenido, para que un pulgar apoyado no la impida.
- El inicio que asoma debajo al deslizar puede enseñar un recuento de antes durante el gesto; se pone al día al llegar.

Pruebas: 147 unitarias y 61 de navegador.

## 0.29.0 (16/11/2026)

Bloque 3 de las mejoras marcadas por el usuario tras el análisis (7). Terminadas las cinco marcadas (1, 2, 3, 4 y 7).

- Buscador de juegos en el inicio (7): lupa en la cabecera (solo con juegos), campo «Buscar en todas las consolas» con «Cancelar» y resultados de todas las consolas (sin acentos ni mayúsculas, favoritos primero y después el último jugado), con carátula, consola y cuándo se jugó. Un toque abre el juego, donde se dejó si hay estado `auto`. El campo está siempre en la página, plegado, para enfocarlo en el mismo toque y que el iPhone saque el teclado. Mientras se busca, el resto del inicio se oculta.
- Hoja de ruta: el análisis de rendimiento y usabilidad, numerado, en `CLAUDE.md` (hechas 1, 2, 3, 4 y 7; descartada la 8).
- Pruebas: 142 unitarias y 59 de navegador.

## 0.28.0 (16/11/2026)

Bloque 2 de las mejoras marcadas por el usuario tras el análisis (3 y 4).

- Apertura de los juegos (3): el registro anota en «Juego abierto» lo que tarda cada paso, en ms (`leer` la ROM, `nucleo`, `juego` con su partida y primer fotograma, `estado` donde se dejó y `total`), y si el núcleo ya estaba preparado (`nucleoPreparado`). Los núcleos compilados se guardan durante la sesión y se reutilizan (`prepararNucleo` en `src/emulador/nucleo.ts`, con `WebAssembly.compileStreaming` y el `instantiateWasm` de Emscripten); al abrir la app se dejan preparados, con un respiro de 1,2 s, el del último juego y el de la consola más jugada («Núcleo preparado» en el registro, con lo que ha tardado).
- Ahorrar batería (4): ajuste de pantalla por juego (y general), «Ahorrar batería (30 imágenes por segundo)» (`limite30`): el bucle trabaja en uno de cada dos refrescos (uno de cada cuatro a 120 Hz) y hace los fotogramas de los dos, así que el juego va a su velocidad y se dibuja la mitad de veces. La emulación cuesta lo mismo. «Rendimiento» en el registro anota `limite30`.
- Pruebas: 142 unitarias y 58 de navegador (nuevas: apertura con el núcleo preparado y 30 imágenes por segundo con el juego a 60 fotogramas por segundo).

## 0.27.0 (16/11/2026)

Bloque 1 de las mejoras marcadas por el usuario tras el análisis de rendimiento y usabilidad (1 y 2).

- Prueba de rendimiento de los núcleos (1): `npm run rendimiento` (`tests/rendimiento/rendimiento.e2e.ts`, `playwright.rendimiento.config.ts`) carga cada núcleo con su ROM de prueba, sin la app alrededor, y mide los milisegundos por fotograma (mediana de 7 rondas de 1,5 s). Si están los núcleos de la versión anterior en `dist/referencia/nucleos`, los mide en la misma máquina, alternando, y da la diferencia. El flujo de publicación los saca del commit anterior y deja la tabla en el resumen de GitHub, con un aviso (sin fallar) si alguno va más de un 15 % más lento. Ruido medido con los mismos núcleos a los dos lados: un 6 % como mucho.
- Núcleos recompilados con SIMD y optimización entre ficheros (2): `OPTIMIZACION` en `nucleos/compilar.sh` (por defecto `-msimd128 -flto`, que se pasa con `EMCC_CFLAGS`; FCEUmm sin `-flto`) y compilación siempre desde limpio. Frente a la v0.26.2: NES un 43 % menos de tiempo por fotograma, Mega Drive un 14 %, GBA y Super Nintendo entre un 4 y un 10 %, Nintendo DS igual. Mismas versiones de cada núcleo.
- `OPCIONES` de `src/emulador/nucleo.ts` se exporta para la prueba de rendimiento.
- Pruebas: 142 unitarias, 56 de navegador y la de rendimiento.

## 0.26.2 (16/11/2026)

- Cabeceras: el texto baja 20 puntos bajo la franja de la hora (antes 8), porque el usuario aún lo veía algo difuminado. Es el efecto de borde de iOS 26 en las apps de la pantalla de inicio, que difumina una franja bajo la barra de estado y no se puede quitar desde la web; la medida va en `--aire-arriba` (`.cabecera-fija`).
- Pruebas: 142 unitarias y 56 de navegador.

## 0.26.1 (16/11/2026)

Dos cosas informadas por el usuario con captura y registro.

- Volver deslizando: antes, detrás de la pantalla solo había fondo negro y, al soltar, quedaba un instante en negro antes de que entrara Consolas. Ahora el inicio se queda montado debajo de las pantallas apiladas (capa `fondo` en `App.tsx`, oculta en reposo) y el gesto mueve toda la capa: debajo se ve Consolas, desplazada y algo más oscura como en iOS, y al soltar pasa a ser la de arriba sin animación ni recarga (`Inicio` se pone al día con `activa`). Lo mismo en los apartados de Ajustes: la lista se queda debajo y el apartado va encima, con su propio desplazamiento (`useVolverDeslizando` con `mover` y `fondo`).
- Cabecera: su fondo cubre ahora también la franja de la hora y el texto baja 8 puntos (`.cabecera-fija`), fuera de la zona que el iPhone difumina bajo la barra de estado. En el inicio, la biblioteca, las estadísticas y Ajustes.
- Pruebas: 142 unitarias y 56 de navegador (nueva: volver deslizando con toques reales, a medias y del todo, en una biblioteca y en un apartado de Ajustes).

## 0.26.0 (16/11/2026)

Inicio sin tanto desplazamiento: propuesta A, elegida por el usuario entre dos maquetas.

- «Seguir jugando» pasa a una fila deslizable de carátulas: el último juego en grande (150 px) con el botón de jugar, su consola, cuándo y el tiempo jugado; los demás recientes a su lado.
- Consolas en dos columnas, con su dibujo o foto, nombre corto y número de juegos. Las que tienen juegos van de la más jugada a la menos (decisión del usuario; `ordenarConsolas` en `src/lib/biblioteca.ts`: tiempo de todas las sesiones, después número de juegos y después el orden de siempre). Las que no tienen juegos, juntas en una tarjeta «Sin juegos» al final (decisión del usuario). Sin ningún juego, todas como tarjeta.
- Estadísticas pasa a un icono en la cabecera, junto a «+» y Ajustes.
- Con cinco consolas con juegos, todo entra en una pantalla del iPhone; antes ocupaba casi dos.
- Pruebas: 142 unitarias y 55 de navegador.

## 0.25.0 (16/11/2026)

Ajustes por apartados, pedido por el usuario porque la pantalla quedaba muy larga.

- Ajustes pasa a una lista corta al estilo del iPhone: cada apartado con su icono en una baldosa de color, el valor actual a la derecha y chevrón. Cuatro grupos: juego (Sonido, Pantalla, Mando, Para jugar en la cama, Temas del juego y Carátulas), partidas (Guardar y recuperar partidas, Copias de seguridad y Almacenamiento), Aspecto, y Registro con Acerca de.
- Cada apartado abre su propia pantalla con «‹ Ajustes» (`PaginaApartado`), que entra desde la derecha y se cierra también deslizando desde el borde izquierdo; al volver, la lista queda donde estaba. Con «Reducir movimiento», sin animación.
- Acerca de: versión, novedades y los cinco núcleos con sus consolas y licencias (antes solo salían mGBA y Snes9x).
- Pruebas: 139 unitarias y 55 de navegador.

## 0.24.1 (16/11/2026)

A partir de una captura y del registro del usuario (Dragon Quest V en DS).

- Menú del juego: el porcentaje del volumen ya no salta de línea al 100 %.
- Ritmo: tras un refresco perdido, la recuperación de fotogramas se limita a lo que cabe en un refresco si los fotogramas normales caben (`limitarRecuperacion` en `src/emulador/ritmo.ts`, con el coste medio de un fotograma). El registro mostró la DS con la pantalla a 30 Hz: 2 fotogramas de unos 9,5 ms por refresco cabían, pero tras un tropiezo el bucle recuperaba 4 de golpe (38 ms), perdía el siguiente refresco y se quedaba en 15 imágenes por segundo. Ahora vuelve a 30. Si ni los fotogramas normales caben, se mantiene la recuperación completa, para no frenar el juego.
- Registro: la línea «Rendimiento» añade las imágenes por segundo que se ven (`imagenesSeg`) y los fotogramas por segundo que avanza el juego (`juegoSeg`).
- Pruebas: 139 unitarias y 55 de navegador.

## 0.24.0 (16/11/2026)

Bloque C de las mejoras marcadas por el usuario: Mega Drive, Master System y Game Gear (2).

- Genesis Plus GX (libretro, commit `b9c23164`, licencia no comercial), compilado a WebAssembly (2,9 MB). Un solo núcleo para las tres consolas.
- Dos tarjetas nuevas en el inicio (decisión del usuario): Mega Drive aparte (también Genesis) y Master System y Game Gear juntas. Dibujos propios y tema «Negra» (negro, botones gris oscuro y Start rojo; diseño propio, sin marcas).
- Reconocimiento: Mega Drive por «SEGA» en la cabecera (`.md`, `.gen`, `.bin`, `.smd`); Master System y Game Gear por «TMR SEGA» y su región, salvo que la extensión (`.sms` o `.gg`) diga otra cosa. Título interno en Mega Drive.
- Mando: en Mega Drive, A, B y C en fila diagonal (`tresBotones`, `.botones-accion.tres`); en Master System y Game Gear, 1 y 2. Sin Select en las tres; Start, centrado (Pausa en Master System). El mando para juegos de rol y el turbo usan los nombres de cada consola.
- Carátulas: índices de libretro de Mega Drive (2.352), Master System (559) y Game Gear (1.056).
- ROMs de prueba propias de las tres (68000 y Z80, con memoria de partida): azul al arrancar, verde con A o 1 y rojo al volver a abrir si se guardó la partida.
- Pruebas: 135 unitarias y 55 de navegador.

## 0.23.0 (16/11/2026)

Bloque B de las mejoras marcadas por el usuario: la NES (1).

- NES (Famicom) con FCEUmm (libretro, commit `8997c2bf`, GPLv2), compilado a WebAssembly (1,1 MB). Consola propia en el inicio, entre Game Boy Advance y Super Nintendo, con su dibujo y el tema «Ocho bits» (gris claro, franja oscura y A y B rojos; diseño propio, sin marcas). Se reconoce por la cabecera iNES (`.nes`, también en `.zip`). Mando con A, B, Start y Select; rebobinado, estados, turbo y el mando para juegos de rol (menú en Start o Select) funcionan como en el resto. Carátulas: índice de libretro con 13.896 nombres.
- Puente: si el núcleo lee el juego desde su ruta (`need_fullpath`, como FCEUmm), la ROM se deja también como fichero en el sistema de ficheros del módulo. Los cuatro núcleos, recompilados.
- ROM de prueba propia de NES (6502 a mano, mapper 0 con memoria de partida): azul al arrancar, verde con A y rojo al volver a abrir si se guardó la partida.
- Pruebas: 133 unitarias y 52 de navegador.

## 0.22.0 (16/11/2026)

Bloque A de las mejoras marcadas por el usuario (10 y 13).

- Volumen del juego (10): deslizador en el menú del juego, uno para todos los juegos (decisión del usuario), sin tocar el volumen del iPhone (`ajustes.volumen`, `Altavoz.ponerVolumen`).
- Girar la pantalla (13), para jugar tumbado de lado con el bloqueo de orientación del iPhone puesto: en el menú del juego, «No», «A la izquierda» o «A la derecha» (`ajustes.girarPantalla`). Con el iPhone en vertical, el juego se gira un cuarto de vuelta y se coloca como en horizontal.
  - La colocación ya no depende de la orientación del iPhone sino de la del recuadro del juego: el CSS del juego pasa de `@media (orientation)` a consultas de contenedor (`.giro`, `container: juego / size`) y de `vw` y `dvh` a `cqw` y `cqh`.
  - Las zonas seguras se giran con el juego (la Dynamic Island queda a un lado) y los toques se pasan a las coordenadas del juego girado (`src/lib/giro.ts`: cruceta, lápiz de DS, miniatura y editor de botones).
  - Limitación: el menú y los avisos no se giran.
- Pruebas: 132 unitarias y 51 de navegador; las 49 anteriores siguen en verde con el cambio a contenedor.

## 0.21.0 (15/11/2026)

Bloque 3 de las mejoras marcadas por el usuario (11).

- Mover y cambiar de tamaño los botones, por juego: en Menú, Mando, «Mover y cambiar de tamaño los botones». Con el juego en pausa, se arrastra cada pieza (cruceta, botones de acción, L, R, Select y Start) y se cambia su tamaño con − y + (del 60 % al 180 %, en pasos del 10 %); «Restablecer» las devuelve a su sitio y «Listo» guarda. Se guarda por juego y por separado en vertical y en horizontal (`disposicion` en `ajustes.mandos`), con el centro de cada pieza como fracción de la pantalla (`src/lib/disposicionMando.ts`, `EditorMando`). Las piezas movidas mandan sobre cualquier disposición (una mano, juegos de rol, DS).
- Pruebas: 129 unitarias y 49 de navegador.

## 0.20.0 (15/11/2026)

Bloque 2 de las mejoras marcadas por el usuario: Nintendo DS (6, 8, 9 y 10).

- Lado a lado (6): las dos pantallas una junto a otra, sin girar (512 x 192), con la táctil a la derecha (`lado` en `pantallasDS.ts`, con pruebas de los toques). En horizontal, la imagen arriba a todo lo ancho y, debajo, la cruceta, los botones, L y R, las herramientas y Select y Start.
- Tamaño de la miniatura (8): pequeña, mediana o grande en «Grande y pequeña» (`tamanoMiniDS`, por juego). El selector de pantallas de DS pasa a una lista con una línea que explica cada disposición.
- Una mano en DS (9): en vertical, las pantallas igual de grandes que apiladas y el grupo de botones del modo una mano, translúcido y oscuro con borde claro, encima de la parte de abajo de la táctil; en horizontal, la columna del modo una mano de siempre.
- Micrófono y tapa (10): botón «Soplar» en la fila de herramientas (en DS no hay rebobinado), que mientras se mantiene hace que el juego oiga un soplido (L2 en melonDS; el núcleo no admite voz, decisión del usuario). «Cerrar la tapa» en el menú del juego (L3), para los puzles que lo piden; con la tapa cerrada, la imagen se tapa y un toque la abre. En DS en vertical, las herramientas pasan a 40 puntos y Select y Start se centran en el hueco libre.
- Pruebas: 126 unitarias y 48 de navegador.

## 0.19.0 (15/11/2026)

Bloque 1 de las mejoras marcadas por el usuario (20, 22, 15 y 14).

- Temporizador de sueño (20): en el menú del juego, 15, 30, 45 o 60 minutos. Cinco minutos antes avisa («busca dónde guardar»); al acabar, pausa, guarda la partida y el punto donde se dejó y enseña «Hora de dormir», con «Seguir 10 minutos más» o «Salir del juego» (`src/lib/sueno.ts`).
- Pausa si se deja de tocar (22): tras 3, 5 o 10 minutos sin tocar nada (10 por defecto; también «Nunca»), el juego se pausa y se guarda (`pausaSinTocar`, `tocaPausar`). El lápiz de DS cuenta como actividad. En Ajustes, nuevo grupo «Para jugar en la cama» con esto y la intensidad del modo noche.
- Ranuras de estado (15): nueve por juego (antes, tres) y con nombre («Antes del jefe»), que se pone con el lápiz de la ranura y se conserva al volver a guardar en ella (`RANURAS_USUARIO`, `renombrarEstado`, `Estado.nombre`). Van en la copia de partidas (formato 4).
- Turbo (14): por juego, en Menú, Mando, «Turbo», con los botones de cada consola (A y B; X e Y en Super Nintendo y DS; L y R donde los hay). Mientras se mantiene un botón con turbo, el juego lo ve pulsarse y soltarse cada 3 fotogramas, unas diez veces por segundo (`mascaraConTurbo`). En pantalla, el botón lleva una «T».
- Pruebas: 125 unitarias y 44 de navegador; el final del temporizador y la pausa por no tocar se prueban adelantando el reloj del navegador.

## 0.18.0 (15/11/2026)

- Apartado «Pantalla» separado de «Mando» (petición del usuario), en el menú del juego y en Ajustes (`AjustesPantalla`). Pantalla: lo más grande posible, píxeles nítidos, colores como en la consola, imagen de Super Nintendo, pantallas de DS y filtro de imagen. Mando: tamaño de los botones, una o dos manos, mano, opacidad en horizontal y el modo para juegos de rol. En Ajustes, el modo noche va con Pantalla y «Vibrar al pulsar», con Mando.
- Píxeles nítidos y colores como en la consola pasan a guardarse por juego, como el resto de la pantalla (`CLAVES_PANTALLA`); los de Ajustes son los de por defecto. Dentro de un juego solo salen las opciones de su consola (colores en Game Boy, Color y GBA; imagen de Super Nintendo en Super Nintendo; pantallas en DS).
- «Usar los ajustes generales» en cada apartado devuelve a los de por defecto solo lo de ese apartado (`usarControlesGenerales` con `CLAVES_PANTALLA` o `CLAVES_MANDO`).
- Pruebas: 118 unitarias y 39 de navegador.

## 0.17.0 (15/11/2026)

Pantallas de Nintendo DS (paso 3 del plan), pedidas por el usuario para jugar a Hotel Dusk. Por juego, en Menú, Mando, «Pantallas» (`pantallasDS` en `CLAVES_CONTROL`; por defecto en Ajustes, Mando).

- Libro (Hotel Dusk, Last Window, Brain Training): cada pantalla girada un cuarto de vuelta y las dos lado a lado (384 x 256), con la táctil a la derecha o a la izquierda, como se elija en el juego. En horizontal, la imagen pegada al lado de la táctil a casi toda la altura y una columna en el lado libre con guardar y cargar, menú, avance rápido, cruceta, A, B y Start (decisión del usuario: pocos botones); L, R, X, Y y Select no se ven. Reutiliza la columna del modo una mano (`data-mano` contrario a la táctil).
- Grande y pequeña: una pantalla a todo tamaño, con la colocación normal de la consola, y la otra en una miniatura flotante (`MiniaturaDS`) que se arrastra para moverla y se toca para intercambiarlas. Cuál va grande y dónde está la miniatura se guardan por juego (`principalDS`, `miniDS`). Solo es táctil la grande cuando es la de abajo.
- `src/emulador/pantallasDS.ts`: `componer` recoloca y gira las pantallas que da el núcleo (siempre apiladas) y `aNucleo` lleva cada toque de la imagen que se ve a la pantalla táctil real, con pruebas de las cuatro esquinas en cada giro. Comprobado en el navegador que el giro dibujado y la traducción de toques coinciden.
- La colocación de DS en vertical a todo lo ancho (v0.12.0) queda solo para «Apiladas».
- Pruebas: 117 unitarias y 38 de navegador.

## 0.16.0 (15/11/2026)

- Modo noche, para jugar en la cama (petición del usuario): interruptor en el menú del juego que se recuerda entre partidas. Una capa encima de la pantalla del juego la multiplica por un color oscuro y cálido (`COLOR_NOCHE`): oscurece más que el brillo mínimo del iPhone y quita luz azul, con imagen, botones y herramientas a la vez. No recoge toques y el menú no se oscurece. Intensidad suave, media o muy oscura en Ajustes, Imagen. Sin vibración mientras está encendido (`vibracionActiva`).
- Hoja de ruta: el resto de propuestas de usabilidad y para jugar en la cama, anotadas en las filas «Mejoras» de `CLAUDE.md`.
- Pruebas: 112 unitarias y 36 de navegador.

## 0.15.0 (15/11/2026)

Tres mejoras de usabilidad aprobadas por el usuario (8, 9 y 11 de la lista).

- Estado de cada juego: pendiente, jugando, terminado o abandonado (`Juego.estado`, `Juego.terminado`). Sin elegir, «jugando» si ya se ha jugado y «pendiente» si no (`estadoDe`); abrir un pendiente lo pasa a «jugando» (`alAbrir`). Se cambia en las opciones del juego, con la fecha al terminarlo. En la biblioteca, filtro por estado con su recuento y distintivo «Terminado» en la carátula. En Estadísticas, «Tu colección»: cuántos hay de cada estado y los terminados con su fecha. Favorito y estado viajan en la copia de partidas (formato 3, `fichas`) y se recuperan en los juegos que están en la biblioteca.
- «Seguir jugando» en el inicio: el último juego en grande y hasta cuatro más debajo, sin los terminados ni los abandonados (`seguirJugando`).
- Filtros de imagen, por juego (Menú, Mando) o por defecto (Ajustes, Mando): ninguno, según la consola (rejilla de LCD en las portátiles y líneas de tele en Super Nintendo), rejilla LCD o líneas de tele. Es una capa encima de la imagen con el tamaño exacto de cada píxel del juego (`--px` y `--py`), que no recoge toques. Por defecto, ninguno.
- Pruebas: 110 unitarias y 35 de navegador.

## 0.14.0 (15/11/2026)

Las cinco primeras mejoras de la revisión de la app, aprobadas por el usuario.

- Punto de control: el estado «auto» se guarda también cada 5 minutos de juego (`MS_PUNTO_CONTROL` en `Sesion`), no solo al salir o pasar a segundo plano. Si algo falla, se pierden 5 minutos como mucho.
- Aviso para guardar la copia de partidas en el inicio, si hay partidas y nunca se ha guardado una copia o la última tiene 14 días o más (`necesitaCopia`). «Guardar copia» la comparte (solo partidas y notas, sin estados, para que pese poco) y «Más tarde» lo calla tres días. La fecha se anota en cualquier exportación que llegue a guardarse (`exportarCopia`, `ajustes.ultimaCopia`).
- Colores como en la consola (Ajustes, Imagen, activado por defecto): corrección de color de mGBA en modo «Auto» (`mgba_color_correction`): la de GBA en los juegos de GBA y la de Game Boy Color en los de Color; la Game Boy clásica conserva su paleta. Se aplica en marcha.
- Biblioteca: búsqueda sin acentos ni mayúsculas (en el nombre y en el título de la ROM), orden por recientes, nombre o más jugados (`ajustes.ordenBiblioteca`) y favoritos en su propio grupo, arriba, con una estrella en la carátula (`Juego.favorito`, `prepararBiblioteca`).
- Notas por juego, desde la biblioteca y desde el menú del juego, que se guardan solas (`EditorNotas`). Van en un almacén aparte (IndexedDB versión 4, `notas`): se conservan si se quita el juego y viajan en la copia de partidas (formato 2; las copias del formato 1 se siguen leyendo). Escribiendo una nota, el teclado ya no pulsa botones del juego.
- Pruebas: 104 unitarias y 32 de navegador. Las pruebas de navegador que comparan colores exactos van sin la corrección de color.

## 0.13.3 (15/11/2026)

- Ajustes de pantalla y botones por juego (petición del usuario): pantalla grande, imagen de Super Nintendo, tamaño de los botones, una o dos manos, la mano y la opacidad en horizontal. Dentro de un juego, Menú, Mando, se cambian solo para ese juego («Pantalla y botones de este juego»); los de Ajustes, Mando, son los de por defecto para los juegos que no tienen los suyos. «Usar los ajustes generales» quita los propios y conserva el modo JRPG (`controlesDe`, `cambiarMandoJuego`, `usarControlesGenerales` en `src/lib/mandoJuego.ts`; se guardan en `ajustes.mandos`).
- La imagen de Super Nintendo solo aparece en los juegos de Super Nintendo.
- Pruebas: 96 unitarias y 29 de navegador.

## 0.13.2 (15/11/2026)

- Cruceta pensada para el pulgar (el usuario no terminaba de controlarla): las rectas ocupan 60 grados y las diagonales 30 (antes, 45 cada una), lo pulsado se mantiene hasta 10 grados más allá de su sector y la zona muerta del centro tiene margen (pulsar al 22 % del radio, soltar al 12 %), para que no salte entre direcciones en las fronteras ni parpadee al pasar por el medio (`direccionCruceta` con `anterior`). La cruceta recoge los toques hasta un 25 % más allá de su dibujo.
- Modo JRPG: opción por juego «Sin diagonales» (cuatro direcciones, 90 grados cada una), para los juegos que se mueven por casillas.
- Modo JRPG: «Correr» pasa de la fila de herramientas a un botón debajo de la A, dentro del mando (`data-accion`), a petición del usuario. Con correr activo enseña «B fijo» o «Y fijo».
- Pruebas: 93 unitarias y 28 de navegador.

## 0.13.1 (15/11/2026)

- Reiniciar un juego de DS lo rompía y después no se podía abrir (informado por el usuario). Causa: el puente liberaba la ROM nada más cargarla, suponiendo que el núcleo tenía su copia; melonDS guarda el puntero y la vuelve a leer al reiniciar, así que leía memoria liberada («Out of bounds memory access»). Al cerrar se guardaba el estado «auto» de ese núcleo roto y, al abrir, ese estado tumbaba el módulo («Aborted()») o la página entera. Ahora la ROM se conserva hasta descargar el juego. Los tres núcleos, recompilados.
- Si el núcleo falla durante el juego o al reiniciar, la sesión se para, lo anota en el registro y ya no guarda ni la partida ni el estado «auto» (`Sesion.fallar`, `alFallar`). Lo guardado antes del fallo queda a salvo.
- Si no se puede cargar el punto donde se dejó, el juego se abre con su partida guardada y avisa. Si la vez anterior ese punto tumbó la página (no hay error que recoger), una marca en el dispositivo (`puchiemulator-cargando-auto`) hace que la siguiente apertura se lo salte.
- Pruebas: 90 unitarias y 28 de navegador (reiniciar DS tres veces y volver a abrir; apertura tras una caída).

## 0.13.0 (15/11/2026)

- Mando para juegos de rol, por juego (petición del usuario; elegida la disposición «A grande» y «correr fijo con B o con Y»). Interruptor en Menú, Mando, «Este juego» (`ajustes.mandos`, por identificador del juego; `src/lib/mandoJuego.ts`).
  - A al 50 % del área de botones, donde descansa el pulgar; B abajo a su izquierda; el botón de menú del juego encima, con la leyenda «Menú» y su letra; X e Y que no hacen de menú, más pequeños a la izquierda (`.botones-accion.jrpg`). Las posiciones son proporcionales: valen en vertical, en horizontal, con una mano y en DS.
  - Botón de menú: X, Y, Start o Select en Super Nintendo y DS (X por defecto, como en Final Fantasy y Chrono Trigger); Start o Select en GBA y Game Boy (Start por defecto).
  - Correr fijo: herramienta con huellas que deja pulsado B o Y (Y solo en Super Nintendo y DS) y otro toque lo suelta. Si se toca el botón fijo, se suelta tres fotogramas para que el juego vea una pulsación nueva (`mascaraConCorrer`). En DS va con guardar y cargar; en horizontal, en una segunda fila.
- Pruebas: 90 unitarias y 26 de navegador.

## 0.12.1 (15/11/2026)

- Nintendo DS en español, pedido por el usuario: sin firmware, melonDS crea uno con el idioma de `melonds_language`, que ahora es `Spanish`. Los juegos multilingües (casi todos los europeos) arrancan en español; los que solo traen inglés siguen igual.
- GBA, Super Nintendo y Game Boy no tienen idioma de consola: el idioma va en la propia ROM (versión española o europea multilingüe).
- La ROM de prueba de DS lee el idioma de la consola y pinta la pantalla de rojo si no es el español; la prueba de navegador lo comprueba.

## 0.12.0 (15/11/2026)

- Sonido metálico (informado con Nintendo DS, también en GBA y Super Nintendo): la interpolación lineal de `Remuestreador` dejaba pasar imágenes del sonido por encima de la mitad de la frecuencia del núcleo (16 kHz en DS y Super Nintendo), que a 48 kHz se oyen como un brillo metálico. Ahora es un filtro sinc con ventana de Kaiser (16 coeficientes, 256 fases interpoladas, corte al 92 % y más bajo en avance rápido). Error frente al tono ideal: menos de -60 dB a 1 kHz y de -50 dB a 8 kHz. Retraso añadido: 8 muestras de entrada (0,25 ms).
- melonDS: interpolación cúbica y salida a 16 bits (`melonds_audio_interpolation`, `melonds_audio_bitrate`); por defecto iba sin interpolar y a 10 bits. Son opciones del núcleo: no hace falta recompilarlo.
- Pantallas de 120 Hz: en el iPhone 17 el refresco se medía entre 121 y 138 Hz (la media móvil se quedaba con los intervalos cortos) y el juego salía de la sincronía con la pantalla. `Refresco` usa ahora la mediana de los últimos 90 intervalos, con los de varios refrescos divididos antes, y la ajusta a la frecuencia habitual más cercana (`estimarRefresco`). En sincronía se cuentan los refrescos perdidos (`refrescosPasados`) para que el juego no se frene.
- Registro: la medida de rendimiento ya no se reinicia al abrir el menú (por eso no salían líneas de DS); se acumula el tiempo de juego, se anota cada 30 s y al salir si hay al menos 5 s. Incluye los segundos medidos.
- Nintendo DS en vertical: las dos pantallas a todo lo ancho y lo alto posible (en el iPhone 17, de 291 a 402 puntos de ancho), con la cruceta, los botones y L y R translúcidos encima de la pantalla táctil (relleno oscuro con borde claro) y una fila abajo con guardar y cargar, Select y Start, avance rápido y el menú (`data-sistema` en `.juego`). El modo una mano no cambia.
- Pruebas: 85 unitarias y 25 de navegador.

## 0.11.2 (15/11/2026)

- Dynamic Island en vertical (informado con Nintendo DS): tras girar el iPhone, iOS puede dejar `env(safe-area-inset-top)` a 0 en vertical y la imagen sube bajo la isla. `src/lib/zonaSegura.ts` mide la zona segura en cada cambio de orientación, recuerda la mayor de cada orientación y la pone en `--zona-*`; el juego usa el máximo entre lo que dice iOS y lo recordado. Las medidas van al registro («Zona segura»).
- Pruebas: 80 unitarias y 25 de navegador.

## 0.11.1 (15/11/2026)

- Sonido metálico en GBA y Super Nintendo (desde la 0.10.0): la cola del altavoz solo se conocía cada 50 ms y entre medias solo se sumaba lo enviado, así que el ajuste de ritmo bajaba y subía el tono unas 20 veces por segundo (0,47 %, unos 8 cents, en la simulación). Ahora `ControlRitmo` estima la cola de forma continua (restando lo que ya ha sonado) y suaviza el ajuste (en torno a un segundo); en sincronía con la pantalla, el altavoz recibe la velocidad real del juego desde el principio. Variación del tono en la simulación: menos del 0,02 %.
- GBA: filtro de agudos de mGBA activado (60 %), como el altavoz de la consola.

## 0.11.0 (15/11/2026)

- Nintendo DS en pruebas (paso 1 del plan: viabilidad). melonDS (libretro, commit `4081e835`, GPLv3) compilado a WebAssembly en un solo hilo, sin OpenGL y con su BIOS libre (1,4 MB). Medido en este servidor: 10,3 ms por fotograma en Node y 7,6 ms de media en el navegador, a 60 Hz sincronizados, con una ROM de prueba propia que mantiene el procesador al 100 %.
- Puente: puntero de libretro (`pf_puntero`) para la pantalla táctil; el módulo exporta `FS`. Los tres núcleos recompilados.
- melonDS guarda la partida en un fichero (`/sistema/juego.sav`): `Nucleo` lo deja antes de cargar y lo lee para guardarlo en el iPhone como las demás (`PARTIDA_EN_FICHERO`).
- Sistema y consola `nds` («En pruebas»): `.nds` (también en `.zip`, hasta 512 MB), dos pantallas apiladas (256 x 384), mando con A, B, X, Y, L, R, Start y Select, táctil en la imagen (`Tactil` en `Mando`), sin rebobinado (`rebobinado: false`, decisión del usuario), dibujo propio en el inicio y carátulas (7.335 nombres).
- Licencia GPLv3 para el repositorio (decisión del usuario; necesaria para incluir melonDS). Cada núcleo mantiene la suya.
- ROM de prueba propia de DS (ARM9 ensamblado con llvm-mc).
- Pruebas: 76 unitarias y 25 de navegador.

## 0.10.0 (15/11/2026)

- Rendimiento (lag en Super Mario World): el rebobinado compara y comprime los estados en un hilo aparte (`rebobinado.worker.ts`, `Historial`); en el principal solo queda copiar el estado (unos 8 ms menos cada 10 fotogramas en Super Nintendo). Ritmo sincronizado con la pantalla (`ritmo.ts`: un número fijo de fotogramas por refresco si la consola va a menos de un 1,2 % de la pantalla, o de la mitad o el doble); el sonido absorbe la diferencia con un ajuste de hasta el 1 % (antes, 0,5 %). Medidas de rendimiento cada 30 s en el registro (pantalla, consola, ritmo, media, máximo y refrescos largos).
- Transiciones al estilo iOS (guía 4.2 y 5): cada pantalla en su capa (`.capa`), entrar desde la derecha con la anterior desplazada un tercio, volver al revés, sin repetir la animación al volver deslizando, juego con fundido; 0,5 s con `cubic-bezier(.32,.72,0,1)`; toques ignorados durante la animación; sin animación con «Reducir movimiento».
- Game Boy Advance vuelve a ser una consola aparte; Game Boy y Game Boy Color siguen juntas (decisión del usuario).
- Pruebas: las de navegador van con «Reducir movimiento» salvo la de transiciones. 75 unitarias y 24 de navegador.

## 0.9.0 (15/11/2026)

- Tamaño de la imagen calculado en `Juego.tsx` (ResizeObserver sobre la zona de la pantalla) con la proporción de la consola, en lugar de `object-fit`: permite estirar a otra proporción. Super Nintendo a 4:3 por defecto (`snesAspecto`), con la opción de píxel exacto (8:7) en Mando. En horizontal, 520 px de ancho a toda la altura frente a 445; en vertical, 4:3 es algo más baja. El modo una mano alinea la imagen con `justify-content` en lugar de `object-position`.
- En horizontal, el menú va junto a guardar y cargar (fila bajo L) y las herramientas pasan a 40 px; nada en el centro de la imagen.
- Game Boy Advance se une a Game Boy y Game Boy Color: la consola de la app «Game Boy» (`CONSOLAS_APP.gb`) incluye los tres sistemas, con un dibujo de las tres portátiles. Cada juego conserva su tema y sus opciones. La foto de consola de Game Boy Advance, si la había, deja de usarse.
- Pruebas: 70 unitarias y 23 de navegador.

## 0.8.0 (15/11/2026)

- Game Boy y Game Boy Color juntas en la app (`Consola` y `CONSOLAS_APP` en `src/lib/sistemas.ts`, `consolaDe`): una tarjeta en el inicio con las dos consolas dibujadas, una biblioteca conjunta («Game Boy y Color»), avisos al añadir y estadísticas por consola agrupadas. Por dentro siguen siendo dos sistemas: cada juego conserva su tema, su paleta y sus opciones del núcleo. La foto de consola de Game Boy se mantiene; la que hubiera de Game Boy Color deja de usarse.
- Pruebas: 70 unitarias y 22 de navegador.

## 0.7.0 (15/11/2026)

- Super Nintendo con Snes9x (libretro, commit `fae2fea0`), compilado a WebAssembly en un solo hilo (2,9 MB) con el mismo puente. Es C++: se enlaza con `em++` y el puente se compila aparte como C. En modo estático, el script añade zlib 1.3.1 y las piezas de ficheros de libretro-common. Opciones: región automática y recorte del sobrebarrido.
- Sistema `snes` (`.sfc`, `.smc`, `.swc` y `.fig`, también dentro de un `.zip`), título interno leído de la cabecera LoROM o HiROM, con o sin la cabecera de 512 bytes de las copiadoras. Lista común `CONSOLAS`.
- Mando con X e Y (`cuatroBotones`): rombo con X arriba, A a la derecha, B abajo e Y a la izquierda, en dos manos y en una mano, en vertical y en horizontal.
- Tema Super (por defecto en Super Nintendo) con los cuatro botones de colores (`--boton-a`, `--boton-b`, `--boton-x`, `--boton-y`); en el resto de temas, X e Y van como A y B. Dibujo propio de la consola y su mando en el inicio.
- Carátulas de Super Nintendo (índice de libretro, 3.778 nombres); la elección automática evita también muestras y reediciones de Switch Online.
- ROM de prueba propia de Super Nintendo (65816 ensamblado a mano en `scripts/roms_prueba.py`): azul, verde con A, y rojo si la SRAM tiene la marca.
- Pruebas: 70 unitarias y 21 de navegador.

## 0.6.0 (15/11/2026)

- Tiempo jugado: cada partida es una sesión (almacén `sesiones`, IndexedDB versión 3) con juego, nombre, consola, inicio, fin y tiempo jugado. `Sesion` cuenta el tiempo con el juego en marcha, se para tras 10 minutos sin cambios en los botones (`INACTIVIDAD_MS`) y lo guarda cada 30 s, al pausar, al pasar a segundo plano y al salir.
- Estadísticas (`src/lib/estadisticas.ts`, funciones puras, y `src/pantallas/Estadisticas.tsx`): periodo (semana, mes, año, siempre), total y media al día, partidas, media por partida, racha y mejor racha, juegos distintos, tiempo por día o por mes, tus juegos, por consola, cuándo juegas (por hora) y récords. El tiempo de una sesión se reparte en proporción entre los días y horas que abarca. Gráficos de un solo tono, con el detalle al tocar cada barra.
- Tiempo en la ficha de cada juego, en su detalle, en «Seguir jugando», en el menú del juego y entrada a Estadísticas en el inicio.
- La copia de partidas lleva las sesiones (campo opcional `sesiones`); al recuperarla no se duplican.
- Pruebas: 67 unitarias y 20 de navegador.

## 0.5.0 (15/11/2026)

- Pantalla lo más grande posible (`pantallaGrande`, activada por defecto, `.juego.grande`): sin margen ni marco; en vertical de borde a borde (en GBA, en torno a un 15 % más) y en horizontal a toda la altura, con los controles translúcidos encima de los bordes.
- Modo una mano también en horizontal (`.juego.una-mano` en la media horizontal): pantalla a toda la altura pegada al lado contrario a la mano (`object-position`) y columna de controles con L y R, A y B, la cruceta y Select y Start; herramientas en columna junto a ella. Tamaño de la columna limitado por el alto (`--col`).
- Franja negra abajo en la app instalada: durante el juego, `html` y `body` toman el color de abajo del tema (`Tema.abajo`).
- Pruebas: 55 unitarias y 19 de navegador.

## 0.4.0 (15/11/2026)

- Carátulas automáticas (`src/lib/caratulasAuto.ts`), activadas por defecto en Ajustes (`caratulasAuto`): al añadir un juego, y al abrir la app para los que quedaron pendientes sin conexión, se busca su carátula y se pone solo si la coincidencia es segura (`elegirAutomatica`: mismo nombre de fichero que la carátula o mismo título, con la región del fichero o, si no la dice, la europea o española; nunca demos, prototipos ni reediciones si hay otra). Una búsqueda por juego (`Juego.caratulaBuscada`); lo que elige o quita el usuario manda. «Buscar ahora las que faltan» en Ajustes. Las búsquedas van en fila y no pisan una carátula puesta a mano ni recrean un juego quitado.
- «Edición» cuenta como palabra vacía al comparar títulos.
- Pruebas: 55 unitarias y 16 de navegador.

## 0.3.0 (15/11/2026)

- Inicio con las consolas (`src/pantallas/Inicio.tsx`): tarjeta por consola con su dibujo propio (`src/componentes/Consolas.tsx`, sin logotipos) o una foto del usuario (almacén `caratulas`, clave `consola-<sistema>`), recuento de juegos y «Seguir jugando» con el último juego.
- Biblioteca por consola como pantalla apilada («‹ Consolas» y volver deslizando desde el borde). Añadir juegos (`useAnadirJuegos`) desde el inicio o desde cualquier biblioteca: cada juego va a su consola y el aviso dice a cuál. Al salir de un juego se vuelve a la biblioteca de su consola.
- Mando: tamaño de los botones (0,8, 1, 1,15 y 1,3, variable `--escala`) y modo una mano en vertical para la mano derecha o la izquierda (`.juego.una-mano[data-mano]`): cruceta, A, B, L, R, Select, Start y la fila de herramientas agrupados abajo, al alcance del pulgar, con límites para que nada se salga en un iPhone pequeño. Hoja «Mando» en el menú del juego y sección en Ajustes (`AjustesMando`).
- Pruebas: 50 unitarias y 15 de navegador.

## 0.2.0 (15/11/2026)

- Guardar y cargar rápido: botones fijos en la pantalla de juego (ranura `rapida`), con «Deshacer» al cargar (`Sesion.deshacerCarga`).
- Rebobinar manteniendo pulsado: un estado cada 10 fotogramas, guardado como diferencia XOR comprimida con el siguiente (`src/emulador/rebobinado.ts`), hasta 180 estados (unos 30 s) o 48 MB; cada estado guarda los botones de ese momento para rehacer su imagen. Avance rápido x2 y x4 con el sonido acelerado.
- Carátulas: índice de nombres de libretro-thumbnails para GB, GBC y GBA (`public/caratulas`, `scripts/indice_caratulas.py`), búsqueda local por parecido con preferencia por la edición europea (`src/lib/caratulas.ts`), descarga de la elegida reducida a JPEG de 400 px, foto propia y quitar con «Deshacer». IndexedDB versión 2 con el almacén `caratulas`. Biblioteca en cuadrícula de tres columnas con pulsación larga para las opciones.
- Temas de la pantalla de juego (`src/lib/temas.ts`, `SelectorTema`): Oscuro, Clásica, Advance, Baya, Kiwi, Turquesa, Amarilla y Uva, diseños propios sin logotipos; por consola y desde el menú del juego. Paleta de Game Boy (`mgba_gb_colors`): verde original con la Clásica, o elegida a mano, también en mitad de la partida.
- Guía de usabilidad (`docs/guia-usabilidad-iphone.md`): registro de 400 entradas con captura de errores (`src/lib/registro.ts`), copias de seguridad diarias de las partidas (7) y previa antes de recuperar o restaurar (`src/lib/seguridad.ts`), «Deshacer» al quitar un juego, borrar una partida, cambiar el nombre y recuperar una copia, confirmaciones como hoja de acciones, hojas que se cierran arrastrando, volver deslizando desde el borde en Ajustes, vibración con el interruptor oculto, título de 22 px, «Reducir movimiento», `theme-color` según el tema, bienvenida, vuelta a la biblioteca tras dos horas fuera y novedades en Ajustes.
- Pruebas: 50 unitarias y 13 de navegador.

## 0.1.0 (15/11/2026)

Fase 1.

- Núcleo mGBA (libretro, commit 7a12d6d4) compilado a WebAssembly en un solo hilo con Emscripten 4.0.10, enlazado con un puente propio (`nucleos/puente.c`): imagen en RGBA, sonido, botones, partida guardada, reloj del cartucho y estados.
- Biblioteca: añadir desde Archivos (varios a la vez, también `.zip`), reconocimiento por cabecera o extensión, identificador por SHA-1, cambiar el nombre, quitar (conserva la partida) y borrar la partida.
- Juego a pantalla completa en vertical y horizontal, mando táctil multitáctil con cruceta de ocho direcciones, teclado y mandos físicos.
- Guardado automático de la partida en IndexedDB, estado `auto` para seguir donde se dejó, tres ranuras de estado con captura.
- Sonido con AudioWorklet, remuestreo y ajuste de ritmo; opción de sonar con el iPhone en silencio.
- Copia de partidas en un archivo JSON (Guardar en Archivos) y recuperación.
- PWA sin conexión con aviso de versión nueva y novedades.
- Pruebas: 30 unitarias y 7 de navegador con ROMs de prueba propias.
