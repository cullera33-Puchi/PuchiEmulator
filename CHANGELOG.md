# Cambios

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
