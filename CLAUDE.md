# PuchiEmulator: instrucciones y especificación para Claude Code

Versión del 15 de noviembre de 2026.

## Qué es

App web privada (PWA) para jugar en el iPhone a juegos de Game Boy, Game Boy Color y Game Boy Advance, y más adelante de Super Nintendo. Un único usuario. Los juegos están en una carpeta de Archivos; las partidas se guardan en el propio iPhone. Se juega en vertical y en horizontal.

## Stack

- React, TypeScript y Vite, con Tailwind CSS. PWA instalable, diseñada para el iPhone (en un ordenador se ve igual, a pantalla completa).
- Núcleos de emulación existentes compilados a WebAssembly con Emscripten, en un solo hilo (sin SharedArrayBuffer, que GitHub Pages no permite):
  - mGBA (MPL 2.0) para Game Boy, Game Boy Color y Game Boy Advance.
  - Snes9x para Super Nintendo (fase 2). Su licencia solo permite uso no comercial: la app es y seguirá siendo gratuita.
- Puente propio entre el núcleo y la app: `nucleos/puente.c` implementa la parte de libretro que necesitamos y expone funciones `pf_*`. Es el mismo para todos los núcleos.
- Datos: solo en el iPhone (IndexedDB). Sin servidor, cuentas ni bases de datos externas.
- Despliegue: GitHub Pages, publicado por `.github/workflows/publicar.yml` en cada envío a `main` (tests, build, pruebas de navegador y publicación).
- Todo gratuito.

## Reglas que no se pueden saltar

1. Ningún juego (ROM) ni BIOS va al repositorio ni a la app publicada. Solo las ROMs de prueba propias de `tests/fixtures`, generadas por `scripts/roms_prueba.py`, sin código ni gráficos de Nintendo. El `.gitignore` bloquea las extensiones de ROM.
2. La app no descarga juegos de ningún sitio: el usuario elige los suyos en Archivos.
3. Los datos no salen del iPhone salvo en la copia de partidas que exporta el usuario. La copia nunca lleva ROMs.
4. Una partida guardada nunca se pierde por una acción de la app: quitar un juego conserva su partida; borrarla pide confirmación; cargar un estado no sobrescribe la partida guardada del juego.
5. Interfaz en español y al estilo iOS (listas agrupadas, interruptores, controles segmentados, hojas que suben desde abajo, sin emojis como iconos).

## Cómo funciona

- **Biblioteca** (`src/pantallas/Biblioteca.tsx`): «+» abre Archivos (varios ficheros a la vez, `.gb`, `.gbc`, `.gba` o `.zip`). Sin filtro de tipo en el selector, porque Archivos no deja elegir extensiones que no conoce. La consola se reconoce por la cabecera y, si no, por la extensión (`src/lib/sistemas.ts`). La ROM se copia en IndexedDB; el identificador del juego es el SHA-1 de la ROM, así que una partida encuentra su juego aunque se quite y se vuelva a añadir.
- **Almacenamiento** (`src/lib/almacen.ts`): colecciones `juegos`, `roms`, `partidas` y `estados`. Las partidas van por juego; los estados, por juego y ranura (`auto`, `1`, `2` y `3`).
- **Guardado**: la partida del juego (SRAM, Flash o EEPROM y el reloj del cartucho) se guarda en cuanto cambia (se comprueba cada segundo), al abrir el menú, al pasar a segundo plano y al salir. Al pasar a segundo plano y al salir se guarda además el estado `auto`, que permite seguir donde se dejó.
- **Juego** (`src/pantallas/Juego.tsx`, `src/emulador/sesion.ts`): ritmo por tiempo (el iPhone puede ir a 60, 120 o 30 Hz), como mucho 4 fotogramas seguidos para recuperar. La distribución en vertical y en horizontal la decide el CSS (`.juego` en `src/index.css`) con la orientación.
- **Mando táctil** (`src/componentes/Mando.tsx`): varios dedos, deslizar entre botones, la cruceta es del dedo que empieza en ella y da ocho direcciones por ángulo (`direccionCruceta`). También teclado y mandos físicos (Gamepad API, distribución de Nintendo).
- **Sonido** (`src/emulador/audio.ts`, `public/procesador-audio.js`): AudioWorklet con cola de unos 70 ms y remuestreo lineal con ajuste de ritmo de hasta un 0,5 % según la cola (`src/emulador/remuestreo.ts`). El altavoz es único y se activa en el toque que abre el juego (Safari lo exige). «Sonar con el iPhone en silencio» usa `navigator.audioSession`.
- **Copia de partidas** (`src/lib/copias.ts`): archivo JSON con partidas y, opcionalmente, estados; se comparte con la hoja del iPhone (Guardar en Archivos). Recuperarla sustituye la partida de esos juegos y no toca el resto.
- **Actualizaciones**: el service worker espera a que se toque «Actualizar» (nunca corta una partida) y enseña las novedades de `public/novedades.json`.

## Núcleos

- Se compilan con `nucleos/compilar.sh` (Emscripten 4.0.10) y el resultado (`public/nucleos/*.js` y `*.wasm`) se sube al repositorio, para que la publicación no dependa de compilarlos. Las versiones de cada núcleo están fijadas en el script por commit.
- Al cambiar un núcleo o el puente, recompilar, pasar las pruebas y anotarlo en `CHANGELOG.md` y en `nucleos/README.md`.
- Las opciones fijas de cada núcleo van en `OPCIONES` de `src/emulador/nucleo.ts` (en mGBA: sin bordes de Super Game Boy, sin BIOS oficial).

## Cómo trabajar

- Una fase cada vez. Al terminar, resumir qué se ha hecho, qué queda y cómo probarlo, y esperar la validación del usuario.
- Si una decisión no está en esta especificación, preguntar antes de asumir.
- Tests unitarios (`npm test`) para lo que no se ve en pantalla: reconocimiento de ROMs, remuestreo, cruceta, biblioteca y copias. Pruebas de navegador (`npm run build` y después `npm run e2e`) en un iPhone simulado, en vertical y en horizontal, con las ROMs de prueba: imagen, botones, estados, partida guardada tras cerrar la app. Toda pantalla o gesto nuevo importante se añade a `tests/e2e/app.e2e.ts`.
- Cada versión publicada sube `version` en `package.json`, añade su entrada a `CHANGELOG.md` y de 3 a 5 líneas para el usuario en `public/novedades.json` (la más reciente arriba).
- Si cambia el modelo de IndexedDB, subir `VERSION` en `src/lib/almacen.ts` con su paso en `onupgradeneeded`, sin perder partidas. Si cambia el formato de la copia, subir `VERSION_FORMATO` en `src/lib/copias.ts` y seguir leyendo las anteriores.
- Mantener actualizado el apartado Estado.
- Rama: se trabaja en `main` (decisión del usuario del 15/11/2026).

## Fases

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | PWA, biblioteca desde Archivos, Game Boy, Game Boy Color y GBA con mGBA, controles táctiles en vertical y horizontal, partidas guardadas en el iPhone | Construida, pendiente de validar |
| 2 | Super Nintendo con Snes9x y su disposición de botones (X, Y, L y R) | Pendiente |
| 3 | Avance rápido, filtros de imagen, configuración de los mandos físicos, más ranuras de estado, vibración donde se pueda | Pendiente |

Ya en la fase 1, por ser poco trabajo: tres ranuras de estado con captura, el estado `auto` para seguir, copia de partidas en Archivos, teclado y mandos físicos con la distribución estándar.

## Estado

- v0.1.0 (15/11/2026): fase 1 construida, pendiente de validar en el iPhone del usuario.
  - mGBA compilado a WebAssembly (908 KB) con el puente propio. Probado con ROMs propias de GBA y Game Boy: imagen, botones, partida guardada y estados.
  - 30 pruebas unitarias y 7 de navegador en verde.
  - Requisito, una vez: en GitHub, Settings, Pages, Source: GitHub Actions.

## Pendiente de confirmar

- Licencia del propio repositorio (hoy sin licencia declarada).
- Si el sonido debe sonar por defecto con el interruptor de silencio (hoy no, como el resto de juegos del iPhone).
