#!/usr/bin/env python3
"""Genera el índice de trucos (public/trucos/<consola>.json), v0.48.0.

Lista los nombres de los ficheros de trucos del archivo público de libretro (libretro-database,
carpeta cht, licencia CC BY-SA 4.0) sin descargarlos. La app busca el juego en este índice dentro
del iPhone y solo descarga el fichero que toca. Requiere git y acceso a github.com.
"""
import json
import pathlib
import subprocess
import tempfile

CARPETAS = {
    'gb': 'Nintendo - Game Boy',
    'gbc': 'Nintendo - Game Boy Color',
    'gba': 'Nintendo - Game Boy Advance',
    'nes': 'Nintendo - Nintendo Entertainment System',
    'snes': 'Nintendo - Super Nintendo Entertainment System',
    'md': 'Sega - Mega Drive - Genesis',
    'sms': 'Sega - Master System - Mark III',
    'gg': 'Sega - Game Gear',
}
SALIDA = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'trucos'


def main() -> None:
    import sys
    SALIDA.mkdir(parents=True, exist_ok=True)
    elegidos = sys.argv[1:] or list(CARPETAS)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout',
             'https://github.com/libretro/libretro-database.git', tmp],
            check=True,
        )
        for sistema in elegidos:
            carpeta = CARPETAS[sistema]
            salida = subprocess.run(
                ['git', '-C', tmp, 'ls-tree', '--name-only', 'HEAD', f'cht/{carpeta}/'],
                check=True, capture_output=True, text=True,
            ).stdout
            nombres = sorted({pathlib.PurePosixPath(l).name[:-4] for l in salida.splitlines() if l.endswith('.cht')})
            (SALIDA / f'{sistema}.json').write_text(json.dumps({'carpeta': carpeta, 'nombres': nombres}, ensure_ascii=False, separators=(',', ':')))
            print(sistema, len(nombres))


if __name__ == '__main__':
    main()
