# PuchiEmulator

Emulador de Game Boy, Game Boy Color, Game Boy Advance y Super Nintendo para jugar en el iPhone desde Safari, como app instalada en la pantalla de inicio.

- Los juegos se eligen en Archivos (`.gb`, `.gbc`, `.gba`, `.sfc`, `.smc` o `.zip`). La app no incluye ni descarga juegos ni BIOS: usa copias de tus propios cartuchos.
- Las partidas se guardan solas en el iPhone. Se pueden copiar a Archivos y recuperar.
- Vertical y horizontal, botones táctiles, teclado o mando.
- Guardar y cargar rápido, rebobinar y avance rápido.
- Carátulas del archivo público de libretro o fotos propias, y temas de consola.

## Instalar en el iPhone

1. Abre la dirección de la app en Safari.
2. Compartir, «Añadir a pantalla de inicio».
3. Ábrela desde el icono. Así funciona sin conexión y Safari no borra las partidas aunque pases semanas sin jugar.

## Desarrollo

```bash
npm install
npm run dev          # servidor local
npm test             # pruebas unitarias
npm run build && npm run e2e   # pruebas en un iPhone simulado
npm run nucleos      # recompilar los núcleos (requiere Emscripten, ver nucleos/README.md)
npm run roms:prueba  # regenerar las ROMs de prueba propias
```

Especificación e instrucciones de trabajo en `CLAUDE.md`. Núcleos y licencias en `nucleos/README.md`.
