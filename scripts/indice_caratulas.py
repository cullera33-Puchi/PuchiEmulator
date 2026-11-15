#!/usr/bin/env python3
"""Genera el índice de carátulas (public/caratulas/<consola>.json).

Lista los nombres de las carátulas del archivo público de libretro (libretro-thumbnails, carpeta
Named_Boxarts) sin descargar las imágenes. La app busca en este índice dentro del iPhone y solo
descarga la imagen que elige el usuario. Requiere git y acceso a github.com.
"""
import json
import pathlib
import subprocess
import tempfile

REPOS = {
    'gb': 'Nintendo_-_Game_Boy',
    'gbc': 'Nintendo_-_Game_Boy_Color',
    'gba': 'Nintendo_-_Game_Boy_Advance',
    'snes': 'Nintendo_-_Super_Nintendo_Entertainment_System',
    'nds': 'Nintendo_-_Nintendo_DS',
}
SALIDA = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'caratulas'


def nombres(repo: str) -> list[str]:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout',
             f'https://github.com/libretro-thumbnails/{repo}.git', tmp],
            check=True,
        )
        salida = subprocess.run(
            ['git', '-C', tmp, 'ls-tree', '-r', '--name-only', 'HEAD', 'Named_Boxarts/'],
            check=True, capture_output=True, text=True,
        ).stdout
    lista = []
    for linea in salida.splitlines():
        nombre = linea.removeprefix('Named_Boxarts/')
        if nombre.endswith('.png'):
            lista.append(nombre[:-4])
    return sorted(set(lista))


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    for sistema, repo in REPOS.items():
        lista = nombres(repo)
        (SALIDA / f'{sistema}.json').write_text(json.dumps({'repo': repo, 'nombres': lista}, ensure_ascii=False, separators=(',', ':')))
        print(sistema, len(lista))


if __name__ == '__main__':
    main()
