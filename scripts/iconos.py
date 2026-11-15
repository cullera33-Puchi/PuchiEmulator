#!/usr/bin/env python3
"""Genera los iconos de la app (public/icono-192.png, icono-512.png y apple-touch-icon.png).

Dibujo propio: una consola portátil genérica (pantalla, cruceta y dos botones) sobre un degradado.
"""
import pathlib

from PIL import Image, ImageDraw

PUBLICO = pathlib.Path(__file__).resolve().parent.parent / 'public'
T = 1024


def dibujar() -> Image.Image:
    img = Image.new('RGB', (T, T))
    d = ImageDraw.Draw(img)
    arriba, abajo = (94, 92, 230), (52, 48, 170)
    for y in range(T):
        f = y / (T - 1)
        d.line([(0, y), (T, y)], fill=tuple(round(a + (b - a) * f) for a, b in zip(arriba, abajo)))
    # Cuerpo
    d.rounded_rectangle([262, 150, 762, 874], radius=70, fill=(236, 236, 242))
    # Pantalla
    d.rounded_rectangle([322, 216, 702, 512], radius=28, fill=(40, 40, 52))
    d.rectangle([362, 252, 662, 476], fill=(120, 200, 120))
    # Cruceta
    cx, cy, b = 400, 660, 36
    d.rounded_rectangle([cx - b, cy - 3 * b, cx + b, cy + 3 * b], radius=10, fill=(40, 40, 52))
    d.rounded_rectangle([cx - 3 * b, cy - b, cx + 3 * b, cy + b], radius=10, fill=(40, 40, 52))
    # Botones
    for x, y in ((610, 690), (680, 620)):
        d.ellipse([x - 40, y - 40, x + 40, y + 40], fill=(214, 64, 96))
    # Start y Select
    for x in (452, 552):
        d.rounded_rectangle([x - 34, 790, x + 34, 810], radius=10, fill=(150, 150, 160))
    return img


def main() -> None:
    img = dibujar()
    for nombre, tam in (('icono-512.png', 512), ('icono-192.png', 192), ('apple-touch-icon.png', 180)):
        img.resize((tam, tam), Image.LANCZOS).save(PUBLICO / nombre, optimize=True)
    print('Iconos en', PUBLICO)


if __name__ == '__main__':
    main()
