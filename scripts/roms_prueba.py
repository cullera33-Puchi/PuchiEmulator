#!/usr/bin/env python3
"""Genera las ROMs de prueba de tests/fixtures (prueba.gba, prueba.gb y prueba.zip).

Son programas propios y mínimos, sin código ni gráficos de Nintendo: pintan la pantalla de un
color y cambian de color mientras se pulsa A. Sirven para comprobar imagen, botones y partida guardada
de punta a punta. El código máquina se ensambló con llvm-mc (armv4t) y a mano (Game Boy); va comentado.
"""
import pathlib
import zipfile

SALIDA = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'

# GBA (ARM). Modo 3 con el fondo 2. Pinta la pantalla de azul, o de rojo si la partida guardada
# (SRAM) ya tiene la marca 0x5A; con A pulsado pinta de verde y escribe la marca en la SRAM.
GBA_CODIGO = bytes.fromhex(
    '0103a0e3'  # mov   r0, #0x04000000      registros de E/S
    '011ba0e3'  # mov   r1, #0x400
    '031081e3'  # orr   r1, r1, #3           DISPCNT = modo 3 con BG2
    'b010c0e1'  # strh  r1, [r0]
    '133e80e2'  # add   r3, r0, #0x130       KEYINPUT
    '0e84a0e3'  # mov   r8, #0x0E000000      SRAM
    '0090d8e5'  # ldrb  r9, [r8]
    '5a0059e3'  # cmp   r9, #0x5A            ¿partida con la marca?
    '1fa0a003'  # moveq r10, #0x1F           rojo
    '1faba013'  # movne r10, #0x7C00         azul
    'b040d3e1'  # bucle: ldrh r4, [r3]
    '010014e3'  # tst   r4, #1               bit 0 = A (0 si está pulsado)
    '3e5ea003'  # moveq r5, #0x3E0           verde
    '0a50a011'  # movne r5, r10
    '5a90a003'  # moveq r9, #0x5A
    '0090c805'  # strbeq r9, [r8]            con A, marca en la SRAM
    '055885e1'  # orr   r5, r5, r5, lsl #16  dos píxeles por palabra
    '0664a0e3'  # mov   r6, #0x06000000      VRAM
    '4b7ca0e3'  # mov   r7, #0x4B00          240 x 160 / 2 palabras
    '045086e4'  # relleno: str r5, [r6], #4
    '017057e2'  # subs  r7, r7, #1
    'fcffff1a'  # bne   relleno
    'f2ffffea'  # b     bucle
)


def gba() -> bytes:
    rom = bytearray(0x8000)
    rom[0:4] = bytes.fromhex('2e0000ea')  # b 0x080000C0 (el byte 3, 0xEA, identifica la ROM)
    rom[0xA0:0xAC] = b'PUCHIPRUEBA '
    rom[0xAC:0xB0] = b'PPRU'
    rom[0xB0:0xB2] = b'00'
    rom[0xB2] = 0x96
    rom[0xBD] = (-(sum(rom[0xA0:0xBD]) + 0x19)) & 0xFF
    rom[0xC0:0xC0 + len(GBA_CODIGO)] = GBA_CODIGO
    return bytes(rom)


# Game Boy (SM83). Paleta de fondo blanca, o negra con A pulsado.
GB_CODIGO = bytes([
    0x3E, 0x10,  # 0150 bucle: ld a, $10    selecciona los botones de acción
    0xE0, 0x00,  # 0152 ldh ($00), a
    0xF0, 0x00,  # 0154 ldh a, ($00)
    0xF0, 0x00,  # 0156 ldh a, ($00)       segunda lectura, ya estable
    0xE6, 0x01,  # 0158 and $01            bit 0 = A (0 si está pulsado)
    0x28, 0x05,  # 015A jr z, pulsado
    0xAF,        # 015C xor a              BGP = $00, todo blanco
    0xE0, 0x47,  # 015D ldh ($47), a
    0x18, 0xEF,  # 015F jr bucle
    0x3E, 0xFF,  # 0161 pulsado: ld a, $FF  BGP = $FF, todo negro
    0xE0, 0x47,  # 0163 ldh ($47), a
    0x18, 0xE9,  # 0165 jr bucle
])


def gb() -> bytes:
    rom = bytearray(0x8000)
    rom[0x100:0x104] = bytes([0x00, 0xC3, 0x50, 0x01])  # nop; jp $0150
    # Solo los 4 primeros bytes de la cabecera, que es lo que mira el núcleo para reconocer la ROM
    rom[0x104:0x108] = bytes([0xCE, 0xED, 0x66, 0x66])
    rom[0x134:0x13F] = b'PUCHIPRUEBA'
    rom[0x147] = 0x00  # solo ROM
    rom[0x148] = 0x00  # 32 KB
    rom[0x149] = 0x00  # sin RAM
    suma = 0
    for i in range(0x134, 0x14D):
        suma = (suma - rom[i] - 1) & 0xFF
    rom[0x14D] = suma
    rom[0x150:0x150 + len(GB_CODIGO)] = GB_CODIGO
    return bytes(rom)


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / 'prueba.gba').write_bytes(gba())
    (SALIDA / 'prueba.gb').write_bytes(gb())
    with zipfile.ZipFile(SALIDA / 'prueba.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('LEEME.txt', 'ROM de prueba comprimida')
        z.writestr('Prueba comprimida.gba', gba())
    print('ROMs de prueba en', SALIDA)


if __name__ == '__main__':
    main()
