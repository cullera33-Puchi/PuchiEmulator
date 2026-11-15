# Núcleos de emulación

La app usa núcleos libretro existentes compilados a WebAssembly. El resultado está en `public/nucleos/` y se sube al repositorio.

| Núcleo | Consolas | Licencia | Código fuente | Versión |
| --- | --- | --- | --- | --- |
| mGBA | Game Boy, Game Boy Color, Game Boy Advance | MPL 2.0 | https://github.com/libretro/mgba | `7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6` |

El código fuente de cada núcleo está en el repositorio y el commit indicados; el binario se ha compilado de él sin cambios, con `nucleos/compilar.sh`.

## Compilar

```bash
git clone https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install 4.0.10 && ./emsdk/emsdk activate 4.0.10
source ./emsdk/emsdk_env.sh
npm run nucleos            # o: bash nucleos/compilar.sh mgba
```

El script descarga el núcleo en `.nucleos/` (ignorado por git), lo compila como biblioteca estática y lo enlaza con `puente.c`.

## Puente

`puente.c` hace de «frontend» libretro mínimo: entorno (opciones, formato de píxel, registro), imagen convertida a RGBA, sonido por fotograma, botones como máscara de bits, partida guardada, reloj del cartucho y estados. Exporta funciones `pf_*` que usa `src/emulador/nucleo.ts`. Es el mismo para todos los núcleos.

`libretro.h` es la cabecera pública de la API de libretro (licencia MIT).
