# Núcleos de emulación

La app usa núcleos libretro existentes compilados a WebAssembly. El resultado está en `public/nucleos/` y se sube al repositorio.

| Núcleo | Consolas | Licencia | Código fuente | Versión |
| --- | --- | --- | --- | --- |
| mGBA | Game Boy, Game Boy Color, Game Boy Advance | MPL 2.0 | https://github.com/libretro/mgba | `7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6` |
| melonDS | Nintendo DS | GPLv3 | https://github.com/libretro/melonDS | `4081e8358e66f1ea11879560be6b813dfeaab75a` |
| Snes9x | Super Nintendo | Propia, solo uso no comercial | https://github.com/libretro/snes9x | `fae2fea08f74180759ef540ee94259213f503480` |

Snes9x es C++ y se enlaza con `em++`. En su modo estático espera que la aplicación aporte zlib y las funciones de ficheros de libretro-common; el script las compila aparte (zlib 1.3.1, `51b7f2ab`, licencia zlib; libretro-common, licencia MIT) y las añade al enlace. El puente se compila siempre como C.

melonDS se compila sin hilos ni OpenGL (`HAVE_THREADS=0 HAVE_OPENGL=0`): renderizador por software en el hilo del juego. Usa su BIOS libre. Guarda la partida en un fichero (`/sistema/juego.sav` en el sistema de ficheros del módulo), que la app gestiona.

El código fuente de cada núcleo está en el repositorio y el commit indicados; el binario se ha compilado de él sin cambios, con `nucleos/compilar.sh`.

## Compilar

```bash
git clone https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install 4.0.10 && ./emsdk/emsdk activate 4.0.10
source ./emsdk/emsdk_env.sh
npm run nucleos            # o: bash nucleos/compilar.sh mgba snes9x melonds
```

El script descarga el núcleo en `.nucleos/` (ignorado por git), lo compila como biblioteca estática y lo enlaza con `puente.c`.

## Puente

`puente.c` hace de «frontend» libretro mínimo: entorno (opciones, formato de píxel, registro), imagen convertida a RGBA, sonido por fotograma, botones como máscara de bits, partida guardada, reloj del cartucho y estados. Exporta funciones `pf_*` que usa `src/emulador/nucleo.ts`. Es el mismo para todos los núcleos. La ROM se conserva en memoria hasta `pf_descargar`: melonDS no hace copia y la vuelve a leer al reiniciar (v0.13.1).

`libretro.h` es la cabecera pública de la API de libretro (licencia MIT).
