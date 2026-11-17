# Núcleos de emulación

La app usa núcleos libretro existentes compilados a WebAssembly. El resultado está en `public/nucleos/` y se sube al repositorio.

| Núcleo | Consolas | Licencia | Código fuente | Versión |
| --- | --- | --- | --- | --- |
| mGBA | Game Boy, Game Boy Color, Game Boy Advance | MPL 2.0 | https://github.com/libretro/mgba | `7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6` |
| melonDS | Nintendo DS | GPLv3 | https://github.com/libretro/melonDS | `4081e8358e66f1ea11879560be6b813dfeaab75a` |
| FCEUmm | NES (Famicom) | GPLv2 | https://github.com/libretro/libretro-fceumm | `8997c2bf9503f6d50585b11a1fd7207af53a2426` |
| Genesis Plus GX | Mega Drive, Master System y Game Gear | Propia, solo uso no comercial | https://github.com/libretro/Genesis-Plus-GX | `b9c2316441978d4015ba30e9a95d9b0e6f8ee981` |
| Snes9x | Super Nintendo | Propia, solo uso no comercial | https://github.com/libretro/snes9x | `fae2fea08f74180759ef540ee94259213f503480` |
| Mupen64Plus-Next (con GLideN64) | Nintendo 64 | GPLv2 | https://github.com/libretro/mupen64plus-libretro-nx | `15bada85906593376e8fd697f1b0b3af3a20f512` |
| PCSX ReARMed | PlayStation | GPLv2 | https://github.com/libretro/pcsx_rearmed | `7b0e8f8fadfbce3d170d195b9d9eecaabfa08c8e` |

Snes9x es C++ y se enlaza con `em++`. En su modo estático espera que la aplicación aporte zlib y las funciones de ficheros de libretro-common; el script las compila aparte (zlib 1.3.1, `51b7f2ab`, licencia zlib; libretro-common, licencia MIT) y las añade al enlace. El puente se compila siempre como C.

melonDS se compila sin hilos ni OpenGL (`HAVE_THREADS=0 HAVE_OPENGL=0`): renderizador por software en el hilo del juego. Usa su BIOS libre. Guarda la partida en un fichero (`/sistema/juego.sav` en el sistema de ficheros del módulo), que la app gestiona.

FCEUmm, como Snes9x, espera en modo estático las funciones de ficheros de libretro-common; el script compila las de su propia copia. Además lee el juego desde su ruta (`need_fullpath`): el puente deja la ROM como fichero en el sistema de ficheros del módulo antes de cargarla (v0.23.0).

Genesis Plus GX (v0.24.0) lleva las tres consolas de Sega en un solo núcleo, que reconoce cada una por la ROM. Como FCEUmm, el script compila sus piezas de libretro-common (también `file_stream_transforms.c`). Usa el mapeador de Sega solo con ROMs de más de 48 KB: por eso las ROMs de prueba de Master System y Game Gear ocupan 128 KB.

Opciones del núcleo (v0.40.0): el puente guarda 64 (`MAX_OPCIONES`) y, al iniciarse, el núcleo apunta las suyas por defecto. La N64 declara 85 y la PlayStation 76: por eso la app fija las suyas antes de `pf_iniciar` (si no, la que no estuviera ya en la lista se perdía sin aviso). Subir el límite cambiaba cómo se ve en la N64 una imagen dibujada por el procesador después de cargar un estado; se deja en 64.

Opciones de compilación (v0.27.0): todos con SIMD de WebAssembly (`-msimd128`) y optimización entre ficheros (`-flto`), salvo FCEUmm, solo con SIMD (con `-flto` duplica su tamaño sin ganar velocidad). Van en `OPTIMIZACION` de `compilar.sh`, que las pasa a todas las llamadas a `emcc` con `EMCC_CFLAGS`, y cada núcleo se compila desde limpio. Medido con `npm run rendimiento` frente a la v0.26.2, en milisegundos por fotograma: NES un 43 % menos, Mega Drive un 14 %, GBA y Super Nintendo entre un 4 y un 10 %, y Nintendo DS igual (su Makefile desactiva la vectorización automática; activarla no ganaba nada medible). El SIMD de WebAssembly exige Safari 16.4 o posterior.

Mupen64Plus-Next (v0.32.0, Nintendo 64) dibuja con la tarjeta gráfica: GLideN64 sobre OpenGL ES 3, que en el navegador es WebGL 2. El script lo compila con `GLES3=1` en la línea de `make` (el bloque de Emscripten del Makefile fuerza OpenGL ES 2, y sus sombreadores no compilan con él), el RSP de alto nivel y el intérprete con caché (en WebAssembly no hay recompilador). Otros detalles:

- El núcleo va en dos corrutinas (libco). `nucleos/libco_emscripten.c` las implementa con las fibras de Emscripten, que necesitan `-sASYNCIFY`; sustituye a la libco del núcleo. Una función que cambia de corrutina por el camino (`retro_run`, `retro_serialize`) devuelve a JavaScript un valor que no es el suyo: el puente guarda el resultado y la app lo lee con `pf_resultado`.
- `-fno-common`: con las definiciones provisionales de C, el enlazador de WebAssembly dejaba variables sin definir.
- xxHash con SIMD incluía `arm_neon.h` dentro de un bloque `extern "C"`: se compila con `XXH_HAS_INCLUDE(x)=0`.
- zlib, la misma copia que Snes9x (`-I` en `CPUFLAGS`; el puerto de zlib de Emscripten necesita descargarse).
- Se enlazan los objetos sueltos (el archivo que genera el Makefile tiene nombres repetidos) con `-sINITIAL_MEMORY=128 MB`.
- Asyncify solo en las funciones que pueden estar en la pila al cambiar de corrutina (v0.32.1, `nucleos/n64_asyncify.txt`, con `-sASYNCIFY_ONLY`): el camino de la consola hasta la interrupción de vídeo (`gen_interrupt`, `vi_vertical_interrupt_event`), las instrucciones del intérprete que pueden llegar a ella (saltos, escrituras en memoria, ERET, MTC0 y fin y compilación de bloque), las funciones del puente que la reanudan y `dynCall_*` (las fibras la usan al volver). Con todo instrumentado (lo que hace Emscripten por defecto, por las llamadas indirectas), también lo estaba GLideN64 entero: el núcleo pasa de 3,3 a 2,7 MB. Si falta una función de esa ruta, el núcleo falla al cambiar de corrutina. Para rehacer la lista: enlazar con `-sASYNCIFY_ADVISE -sASYNCIFY_IGNORE_INDIRECT`.
- Dibujo con WebGL 2 (v0.34.0, en el mismo parche): WebGL no tiene vértices en la memoria del programa y Emscripten los imitaba subiendo cada atributo por separado en cada dibujo (los mismos vértices unas cinco veces y unas 15 llamadas). `UnbufferedDrawer` sube los vértices y los índices una vez por dibujo a un búfer propio y apunta los atributos dentro; los punteros se ponen en cada dibujo porque el gestor de estado de libretro (glsm) los vuelve a poner entre fotogramas sin búfer. La ROM de prueba lo comprueba con un rectángulo y un triángulo del RDP (con B).
- Parche para WebGL 2 (v0.32.1, `nucleos/n64_webgl.patch`, el único cambio en su código): GLideN64 lee la imagen de la tarjeta gráfica con `glMapBufferRange` de lectura, que WebGL no tiene (Emscripten devuelve un puntero nulo y se copiaba memoria cualquiera a la de la consola). Con el parche lee con `glReadPixels` y `glGetBufferSubData`. Además, la app desactiva la copia de la imagen y de la profundidad a la memoria de la consola (`OPCIONES` en `src/emulador/nucleo.ts`).
- Lista de sombreadores por juego (v0.40.0, en el mismo parche): GLideN64 compila un sombreador cada vez que el juego pide una combinación de colores nueva (un «combinador»), y en el iPhone eso se nota como un parón. Con `EnableShadersStorage`, al arrancar compila todos los de una lista (`<sistema>/Mupen64plus/shaders/GLideN64.<juego>.GLES.keys`; en WebGL no hay programas compilados que guardar, solo la lista). El núcleo solo la escribía al descargar el juego; el parche la escribe en cuanto sale uno nuevo (`CombinerInfo::setCombine`), porque en el iPhone la app se cierra sin avisar. La app la recoge cada 10 segundos de juego y al salir, la guarda por juego y la deja en `/sistema` antes de cargar.
- Se compila con `--profiling-funcs` (nombres de las funciones, unos 250 KB) y el script marca el error original de un fallo (`Module.errorOriginal`), para que el registro diga en qué funciones del núcleo ha fallado.
- El puente crea un contexto WebGL 2 en un `OffscreenCanvas` que la app deja en `specialHTMLTargets['!lienzo']` (`PF_GL` en `puente.c`): la imagen se queda en ese lienzo y la app la recoge con `transferToImageBitmap`. Los botones C son la palanca derecha (`pf_analogico`).
- Cada estado ocupa 16 MB y la memoria de partida (EEPROM, Controller Pak, SRAM y Flash), 290 KB.

PCSX ReARMed (v0.37.0, PlayStation) se compila con la receta para Emscripten de su propio `Makefile.libretro`: sin hilos, sin recompilador (intérprete), la GPU de psx_gpu con SIMD de WebAssembly y CHD con libchdr. Otros detalles:

- Lo que se aprendió con la N64: sin corrutinas ni Asyncify, sin WebGL (la imagen la pinta el pintor de la app), con `-O3 -flto` y SIMD (un 17 % más rápido que solo con SIMD, medido con `npm run rendimiento`) y en 64 MB de memoria (la que trae Emscripten; no crece con el CD de prueba).
- zlib: el script cambia en su `Makefile.libretro` el puerto de Emscripten (que se descarga aparte) por nuestra copia, y la compila con las mismas opciones (`compilar_zlib`).
- El disco no se copia a la memoria: el puente carga el juego por su ruta (`pf_cargar_ruta`, v0.37.0) y la app monta los ficheros del disco en `/disco` con WORKERFS (`-lworkerfs.js`), que los lee por trozos con `FileReaderSync` cuando el núcleo los pide. Solo funciona en el hilo del motor.
- BIOS: la libre del núcleo (HLE) o, si el usuario ha añadido la suya, la que la app deja en `/sistema` con uno de los nombres que busca el núcleo (`scph5501.bin` y otros).
- La tarjeta de memoria 1 la gestiona la app como partida del juego (`pcsx_rearmed_memcard1` en `libretro`, 128 KB). Cada estado ocupa unos 4,3 MB.

`puente.c` añade `pf_cargar_ruta` (v0.37.0): carga un juego que ya está en el sistema de ficheros del módulo. No cambia nada para el resto, que no se han recompilado.

`puente.c` añade en la v0.39.0 el control de discos de libretro, en sus dos versiones (`pf_discos`, `pf_disco_actual`, `pf_disco_inicial`, que elige el disco con el que se arranca antes de cargar una lista .m3u, y `pf_cambiar_disco`), y el tipo de mando del puerto 1 (`pf_mando`, para el DualShock de PlayStation). Solo se ha recompilado PCSX ReARMed; el resto no lo usa. Al cambiar el tipo de mando, PCSX ReARMed lo «reenchufa»: durante 32 imágenes no contesta.

El código fuente de cada núcleo está en el repositorio y el commit indicados; el binario se ha compilado de él sin cambios, con `nucleos/compilar.sh`.

## Compilar

```bash
git clone https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install 4.0.10 && ./emsdk/emsdk activate 4.0.10
source ./emsdk/emsdk_env.sh
npm run nucleos            # o: bash nucleos/compilar.sh mgba snes9x melonds fceumm genesis n64
```

El script descarga el núcleo en `.nucleos/` (ignorado por git), lo compila como biblioteca estática y lo enlaza con `puente.c`.

## Puente

`puente.c` hace de «frontend» libretro mínimo: entorno (opciones, formato de píxel, registro), imagen convertida a RGBA, sonido por fotograma, botones como máscara de bits, partida guardada, reloj del cartucho y estados. Exporta funciones `pf_*` que usa `src/emulador/nucleo.ts`. Es el mismo para todos los núcleos. La ROM se conserva en memoria hasta `pf_descargar`: melonDS no hace copia y la vuelve a leer al reiniciar (v0.13.1). Con la tarjeta gráfica (`PF_GL`, Nintendo 64, v0.36.0) se libera al cargar, porque el núcleo copia la suya; `pf_descargar` destruye el contexto de WebGL y, si no lo hubo al cargar, no llama a `retro_deinit` (arrancaría el emulador sin la parte gráfica). Solo se recompiló el núcleo de N64: en el resto no cambia nada.

Sin memoria (v0.43.0): si `malloc` no puede agrandar el búfer de la imagen (al subir la resolución, Super Nintendo en alta o PlayStation a 640 x 480), se conserva el de antes y ese fotograma no se convierte; antes se escribía desde la dirección 0, encima de los datos del núcleo. La app comprueba también lo que reserva para la ROM y los estados (`nucleo.ts`). Todos los núcleos recompilados.

`libretro.h` es la cabecera pública de la API de libretro (licencia MIT).
