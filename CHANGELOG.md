# Cambios

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
