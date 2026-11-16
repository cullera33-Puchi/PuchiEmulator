#!/usr/bin/env python3
"""Genera las ROMs de prueba de tests/fixtures (prueba.gba, prueba.gb, prueba.sfc, prueba.nds, prueba.nes, prueba.md, prueba.sms, prueba.gg, prueba.z64, prueba.zip y el CD de PlayStation: prueba-psx.bin y .cue, y prueba-psx.chd).

Son programas propios y mínimos, sin código ni gráficos de Nintendo: pintan la pantalla de un
color y cambian de color mientras se pulsa A. Sirven para comprobar imagen, botones y partida guardada
de punta a punta. El código máquina se ensambló con llvm-mc (armv4t) y a mano (Game Boy); va comentado.
"""
import pathlib
import shutil
import subprocess
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


# Super Nintendo (65816, LoROM). Mismo comportamiento que la de GBA: azul, o rojo si la SRAM ya tiene
# la marca 0x5A; con A, verde y la marca en la SRAM. El color va en el fondo (color 0 de la CGRAM),
# que se escribe durante el retrazado vertical. Ensamblado a mano con etiquetas.
def _snes_codigo() -> bytes:
    p: list = [
        0x78,              # sei
        0x18, 0xFB,        # clc; xce          modo nativo
        0xE2, 0x30,        # sep #$30          A, X e Y de 8 bits
        0xA9, 0x8F, 0x8D, 0x00, 0x21,  # lda #$8F; sta $2100   pantalla apagada
        0xA9, 0x01, 0x8D, 0x00, 0x42,  # lda #$01; sta $4200   lectura automática del mando
        0xAF, 0x00, 0x00, 0x70,        # lda $700000           primer byte de la SRAM
        0xC9, 0x5A,        # cmp #$5A
        0xD0, ('rel', 'azul'),
        0xA9, 0x1F, 0x85, 0x00,        # rojo: color 0x001F en $00 y $01
        0xA9, 0x00, 0x85, 0x01,
        0x80, ('rel', 'encender'),
        'azul',
        0xA9, 0x00, 0x85, 0x00,        # azul: color 0x7C00
        0xA9, 0x7C, 0x85, 0x01,
        'encender',
        0xA9, 0x0F, 0x8D, 0x00, 0x21,  # lda #$0F; sta $2100   pantalla encendida
        'bucle',
        0xAD, 0x10, 0x42,  # lda $4210         ¿retrazado vertical?
        0x10, ('rel', 'bucle'),
        0xAD, 0x18, 0x42,  # lda $4218         mando 1: bit 7 = A
        0x29, 0x80,        # and #$80
        0xF0, ('rel', 'sin_a'),
        0xA9, 0x5A, 0x8F, 0x00, 0x00, 0x70,  # lda #$5A; sta $700000   marca en la SRAM
        0xA9, 0xE0, 0xA2, 0x03,        # verde: 0x03E0
        0x80, ('rel', 'escribir'),
        'sin_a',
        0xA5, 0x00, 0xA6, 0x01,        # lda $00; ldx $01
        'escribir',
        0x9C, 0x21, 0x21,  # stz $2121         CGRAM, color 0
        0x8D, 0x22, 0x21,  # sta $2122
        0x8E, 0x22, 0x21,  # stx $2122
        0x80, ('rel', 'bucle'),
    ]
    etiquetas = {}
    pos = 0
    for x in p:
        if isinstance(x, str):
            etiquetas[x] = pos
        else:
            pos += 1
    out = bytearray()
    for x in p:
        if isinstance(x, str):
            continue
        if isinstance(x, tuple):
            destino = etiquetas[x[1]] - (len(out) + 1)
            assert -128 <= destino <= 127
            out.append(destino & 0xFF)
        else:
            out.append(x)
    return bytes(out)


def snes() -> bytes:
    rom = bytearray(0x8000)
    codigo = _snes_codigo()
    rom[0:len(codigo)] = codigo
    rom[0x7FC0:0x7FD5] = b'PUCHIPRUEBA'.ljust(21)
    rom[0x7FD5] = 0x20  # LoROM
    rom[0x7FD6] = 0x02  # ROM, RAM y pila
    rom[0x7FD7] = 0x05  # 32 KB
    rom[0x7FD8] = 0x01  # 2 KB de SRAM
    rom[0x7FD9] = 0x02  # Europa
    rom[0x7FDA] = 0x00
    rom[0x7FDB] = 0x00
    rom[0x7FFC:0x7FFE] = bytes([0x00, 0x80])  # vector de reinicio: $8000
    rom[0x7FDC:0x7FE0] = bytes([0xFF, 0xFF, 0x00, 0x00])
    suma = sum(rom) & 0xFFFF
    rom[0x7FDC:0x7FDE] = (suma ^ 0xFFFF).to_bytes(2, 'little')
    rom[0x7FDE:0x7FE0] = suma.to_bytes(2, 'little')
    return bytes(rom)


# Nintendo DS. ARM9 (ensamblado con llvm-mc, armv5te): pantalla de arriba en modo VRAM (banco A) y,
# sin parar, toda la pantalla de verde con A pulsado; si no, de azul si el idioma de la consola es el
# español (byte 0x64 de los datos del usuario, que melonDS deja en 0x027FFC80) o de rojo si es otro.
# El bucle mantiene el procesador ocupado, como un juego, para medir la velocidad. El ARM7 se queda
# en un bucle vacío.
NDS_ARM9 = bytes.fromhex(
    '60009fe5'  # ldr   r0, =0x04000304      POWCNT1
    '60109fe5'  # ldr   r1, =0x8003          motores encendidos; el A en la pantalla de arriba
    'b010c0e1'  # strh  r1, [r0]
    '5c009fe5'  # ldr   r0, =0x04000240      VRAMCNT_A
    '8010a0e3'  # mov   r1, #0x80            banco A para la pantalla
    '0010c0e5'  # strb  r1, [r0]
    '0103a0e3'  # mov   r0, #0x04000000      DISPCNT del motor A
    '0218a0e3'  # mov   r1, #0x00020000      modo VRAM con el banco A
    '001080e5'  # str   r1, [r0]
    '48309fe5'  # ldr   r3, =0x04000130      KEYINPUT
    '48809fe5'  # ldr   r8, =0x027FFCE4      idioma de la consola
    'b040d3e1'  # bucle: ldrh r4, [r3]
    '010014e3'  # tst   r4, #1               bit 0 = A (0 si está pulsado)
    '40509f05'  # ldreq r5, =0x03E003E0      verde
    '0400000a'  # beq   pintar
    '0090d8e5'  # ldrb  r9, [r8]
    '079009e2'  # and   r9, r9, #7
    '050059e3'  # cmp   r9, #5               5 = español
    '30509f05'  # ldreq r5, =0x7C007C00      azul
    '30509f15'  # ldrne r5, =0x001F001F      rojo
    '1a65a0e3'  # pintar: mov r6, #0x06800000  VRAM del banco A
    '067aa0e3'  # mov   r7, #0x6000          256 x 192 / 2 palabras
    '045086e4'  # relleno: str r5, [r6], #4
    '017057e2'  # subs  r7, r7, #1
    'fcffff1a'  # bne   relleno
    'f0ffffea'  # b     bucle
    '04030004' '03800000' '40020004' '30010004' 'e4fc7f02' 'e003e003' '007c007c' '1f001f00'  # constantes
)
NDS_ARM7 = bytes.fromhex('feffffea')  # b .


def _crc16(datos: bytes) -> int:
    crc = 0xFFFF
    for b in datos:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def nds() -> bytes:
    rom = bytearray(0x20000)  # 128 KB
    rom[0x000:0x00C] = b'PUCHIPRUEBA '
    rom[0x00C:0x010] = b'PPRU'
    rom[0x010:0x012] = b'00'
    rom[0x014] = 0x00  # capacidad: 128 KB
    arm9_off, arm7_off = 0x200, 0x400
    rom[arm9_off:arm9_off + len(NDS_ARM9)] = NDS_ARM9
    rom[arm7_off:arm7_off + len(NDS_ARM7)] = NDS_ARM7
    cabecera = [
        (0x020, arm9_off), (0x024, 0x02000000), (0x028, 0x02000000), (0x02C, 0x200),
        (0x030, arm7_off), (0x034, 0x037F8000), (0x038, 0x037F8000), (0x03C, 0x200),
        (0x080, 0x600), (0x084, 0x200),
    ]
    for o, v in cabecera:
        rom[o:o + 4] = v.to_bytes(4, 'little')
    rom[0x15E:0x160] = _crc16(bytes(rom[0:0x15E])).to_bytes(2, 'little')
    return bytes(rom)


# NES (6502 a mano, mapper 0 con 16 KB de programa, CHR-RAM y memoria de partida con pila).
# Con el dibujo apagado, la NES enseña el color de fondo ($3F00): azul al arrancar, verde mientras
# se pulsa A (y deja una marca en la memoria de partida, $6000) y rojo al arrancar si ya estaba la
# marca. Sin gráficos ni código de nadie.
def _nes_codigo() -> bytes:
    p = [
        0x78, 0xD8, 0xA2, 0xFF, 0x9A,          # sei; cld; ldx #$ff; txs
        'vb1', 0x2C, 0x02, 0x20, 0x10, ('rel', 'vb1'),  # espera al primer retrazado
        'vb2', 0x2C, 0x02, 0x20, 0x10, ('rel', 'vb2'),
        0xA9, 0x00, 0x8D, 0x00, 0x20, 0x8D, 0x01, 0x20,  # PPU apagada
        0xA9, 0x12, 0x85, 0x00,                # color de arranque: azul
        0xAD, 0x00, 0x60, 0xC9, 0x5A,          # lda $6000; cmp #$5a
        0xD0, ('rel', 'bucle'),
        0xA9, 0x16, 0x85, 0x00,                # con la marca, rojo
        'bucle', 0x2C, 0x02, 0x20, 0x10, ('rel', 'bucle'),
        0xA9, 0x01, 0x8D, 0x16, 0x40, 0xA9, 0x00, 0x8D, 0x16, 0x40,  # lee el mando
        0xAD, 0x16, 0x40, 0x29, 0x01,          # primer bit: A
        0xF0, ('rel', 'sin_a'),
        0xA9, 0x5A, 0x8D, 0x00, 0x60,          # marca en la memoria de partida
        0xA2, 0x1A,                            # verde
        0x4C, ('abs', 'poner'),
        'sin_a', 0xA6, 0x00,                   # el color de arranque
        'poner', 0xA9, 0x3F, 0x8D, 0x06, 0x20, 0xA9, 0x00, 0x8D, 0x06, 0x20,
        0x8E, 0x07, 0x20,                      # paleta $3F00
        0xA9, 0x3F, 0x8D, 0x06, 0x20, 0xA9, 0x00, 0x8D, 0x06, 0x20,  # la PPU vuelve a $3F00
        0x4C, ('abs', 'bucle'),
        'nmi', 0x40,                           # rti
    ]
    base = 0xC000
    etiquetas = {}
    pos = 0
    for x in p:
        if isinstance(x, str):
            etiquetas[x] = pos
        elif isinstance(x, tuple):
            pos += 1 if x[0] == 'rel' else 2
        else:
            pos += 1
    out = bytearray()
    for x in p:
        if isinstance(x, str):
            continue
        if isinstance(x, tuple):
            if x[0] == 'rel':
                destino = etiquetas[x[1]] - (len(out) + 1)
                assert -128 <= destino <= 127
                out.append(destino & 0xFF)
            else:
                out += (base + etiquetas[x[1]]).to_bytes(2, 'little')
        else:
            out.append(x)
    return bytes(out), base + etiquetas['nmi']


def nes() -> bytes:
    codigo, nmi = _nes_codigo()
    prg = bytearray(0x4000)
    prg[0:len(codigo)] = codigo
    prg[0x3FFA:0x3FFC] = nmi.to_bytes(2, 'little')       # NMI
    prg[0x3FFC:0x3FFE] = (0xC000).to_bytes(2, 'little')  # arranque
    prg[0x3FFE:0x4000] = nmi.to_bytes(2, 'little')       # IRQ
    cabecera = b'NES\x1a' + bytes([1, 0, 0x02, 0]) + bytes(8)  # 16 KB, CHR-RAM, con pila
    return cabecera + bytes(prg)


# Mega Drive (68000; ensamblado con llvm-mc -triple=m68k y la primera instrucción, «move.w
# #$2700,sr», escrita a mano porque LLVM no la admite). Con la pantalla apagada, el VDP enseña el color
# de fondo (CRAM 0): azul al arrancar, verde mientras se pulsa A del mando de Mega Drive (y deja una
# marca en la memoria de partida, $200001) y rojo al arrancar si ya estaba la marca.
MD_CODIGO = bytes.fromhex(
    '46fc2700'                                  # move.w #$2700,sr
    '207c00c00004' '227c00c00000'               # a0 = control del VDP; a1 = datos del VDP
    '247c00a10003' '267c00200001' '287c00a10009'  # a2 = mando 1; a3 = memoria de partida; a4 = control del mando
    '30bc8004' '30bc8104' '30bc8700'            # registro 0: paleta completa; 1: pantalla apagada; 7: fondo, color 0
    '18bc0040'                                  # TH del mando como salida
    '343c0e00'                                  # color de arranque: azul
    '0c13005a' '6604' '343c000e'                # con la marca, rojo
    '14bc0000' '4e71' '4e71' '1012'             # bucle: TH = 0 y lee A y Start
    '08000004' '660a'                           # bit 4 = A (0 si está pulsado)
    '16bc005a' '323c00e0' '6002'                # marca y verde
    '3202'                                      # sin A: el color de arranque
    '20bcc0000000' '3281' '60da'                # CRAM 0 = color; vuelta al bucle (los saltos son relativos)
)


def md() -> bytes:
    rom = bytearray(0x10000)  # 64 KB
    rom[0:4] = (0x00FFFE00).to_bytes(4, 'big')  # pila
    for v in range(1, 64):
        rom[v * 4:v * 4 + 4] = (0x200).to_bytes(4, 'big')  # arranque y el resto de vectores
    rom[0x100:0x110] = b'SEGA MEGA DRIVE '
    rom[0x120:0x150] = b'PUCHIPRUEBA'.ljust(48)
    rom[0x150:0x180] = b'PUCHIPRUEBA'.ljust(48)
    rom[0x1A0:0x1A8] = (0).to_bytes(4, 'big') + (len(rom) - 1).to_bytes(4, 'big')
    rom[0x1A8:0x1B0] = (0xFF0000).to_bytes(4, 'big') + (0xFFFFFF).to_bytes(4, 'big')
    rom[0x1B0:0x1BC] = b'RA' + bytes([0xF8, 0x20]) + (0x200001).to_bytes(4, 'big') + (0x20FFFF).to_bytes(4, 'big')
    rom[0x1F0:0x1F3] = b'JUE'
    rom[0x200:0x200 + len(MD_CODIGO)] = MD_CODIGO
    return bytes(rom)


def _z80(p: list) -> bytes:
    """Ensambla una lista de bytes y etiquetas; ('rel', etiqueta) es un salto relativo y ('abs', etiqueta), una dirección."""
    etiquetas = {}
    pos = 0
    for x in p:
        if isinstance(x, str):
            etiquetas[x] = pos
        elif isinstance(x, tuple):
            pos += 1 if x[0] == 'rel' else 2
        else:
            pos += 1
    out = bytearray()
    for x in p:
        if isinstance(x, str):
            continue
        if isinstance(x, tuple):
            if x[0] == 'rel':
                destino = etiquetas[x[1]] - (len(out) + 1)
                assert -128 <= destino <= 127
                out.append(destino & 0xFF)
            else:
                out += (0x100 + etiquetas[x[1]]).to_bytes(2, 'little')
        else:
            out.append(x)
    return bytes(out)


# Master System y Game Gear (Z80 a mano). Con la pantalla apagada, el VDP enseña el color del borde
# (entrada 16 de la paleta): azul al arrancar, verde mientras se pulsa el botón 1 (y deja una marca en
# la RAM del cartucho, $8000) y rojo al arrancar si ya estaba la marca. La Game Gear usa colores de
# dos bytes; la Master System, de uno.
def _sega8(gg: bool) -> bytes:
    def color(sms: int, gg_color: int) -> list:
        if gg:
            return [0x3E, 0x20, 0xD3, 0xBF, 0x3E, 0xC0, 0xD3, 0xBF,          # paleta, entrada 16 (byte 32)
                    0x3E, gg_color & 0xFF, 0xD3, 0xBE, 0x3E, gg_color >> 8, 0xD3, 0xBE]
        return [0x3E, 0x10, 0xD3, 0xBF, 0x3E, 0xC0, 0xD3, 0xBF, 0x3E, sms, 0xD3, 0xBE]

    p = [
        0x3E, 0x08, 0x32, 0xFC, 0xFF,          # ld a,$08; ld ($fffc),a: RAM del cartucho en $8000
        0x3E, 0x80, 0xD3, 0xBF, 0x3E, 0x81, 0xD3, 0xBF,  # registro 1: pantalla apagada
        0x3E, 0x00, 0xD3, 0xBF, 0x3E, 0x87, 0xD3, 0xBF,  # registro 7: borde con la entrada 16
        0x3A, 0x00, 0x80, 0xFE, 0x5A,          # ld a,($8000); cp $5a
        0x20, ('rel', 'sin_marca'),
        0x3E, 0x02, 0x32, 0x00, 0xC0,          # color de arranque 2: rojo
        0x18, ('rel', 'bucle'),
        'sin_marca', 0x3E, 0x00, 0x32, 0x00, 0xC0,  # color de arranque 0: azul
        'bucle', 0xDB, 0xDC,                   # in a,($dc)
        0xCB, 0x67,                            # bit 4,a: botón 1 (0 si está pulsado)
        0x20, ('rel', 'sin_boton'),
        0x3E, 0x5A, 0x32, 0x00, 0x80,          # marca
        *color(0x0C, 0x00F0),                  # verde
        0x18, ('rel', 'bucle'),
        'sin_boton', 0x3A, 0x00, 0xC0, 0xB7,   # ld a,($c000); or a
        0x20, ('rel', 'rojo'),
        *color(0x30, 0x0F00),                  # azul
        0x18, ('rel', 'bucle'),
        'rojo', *color(0x03, 0x000F),
        0x18, ('rel', 'bucle'),
    ]
    codigo = _z80(p)
    # 128 KB: con menos de 48 KB, Genesis Plus GX no pone el chip de cartucho que da la RAM de partida
    rom = bytearray(0x20000)
    rom[0:7] = bytes([0xF3, 0x31, 0xF0, 0xDF, 0xC3, 0x00, 0x01])  # di; ld sp,$dff0; jp $0100
    rom[0x66:0x68] = bytes([0xED, 0x45])       # retn (botón de pausa)
    rom[0x100:0x100 + len(codigo)] = codigo
    rom[0x7FF0:0x7FF8] = b'TMR SEGA'
    rom[0x7FFF] = 0x6F if gg else 0x4F        # Game Gear o Master System de exportación, 128 KB
    return bytes(rom)


def sms() -> bytes:
    return _sega8(False)


def gg() -> bytes:
    return _sega8(True)


# Nintendo 64 (MIPS, ensamblado con llvm-mc -triple=mips -mcpu=mips3 desde scripts/n64_prueba.s; solo
# llamadas relativas, así que no hace falta enlazar). Va donde iría el código de arranque de la consola
# (0x40 a 0x1000), que el emulador copia y ejecuta en 0xA4000040 sin comprobarlo: no lleva nada de
# Nintendo. Pantalla de 320 x 240: azul al arrancar, verde al pulsar A (deja 0x5A en la EEPROM) y rojo
# al arrancar si ya estaba la marca; amarillo con la palanca a la derecha y magenta con un botón C; con
# B, un rectángulo rojo y un triángulo cian dibujados por el RDP (por GLideN64, con la tarjeta gráfica).
N64_CODIGO = bytes.fromhex(
    '3c08a4402409320ead0900003c090010ad09000424090140ad09000824090002'
    'ad09000c3c0903e535292239ad0900142409020dad09001824090c15ad09001c'
    '3c090c1535290c15ad0900203c09006c352902ecad0900243c090025352901ff'
    'ad0900283c09000e35290204ad09002c24090200ad09003024090400ad090034'
    '3c04a020ac8000003c09020835290400ac8900042409ffffac890008ac89000c'
    '3c09fe00ac89001004110097000000000411009f000000008c89000800094e02'
    '240a005a2410003f152a0002000000003410f801041100ab0000000000008825'
    '000090253c04a0203c09ff0135290401ac8900002409ffffac8900043c09fe00'
    'ac890008ac80000cac8000100411007e0000000004110086000000008c8f0004'
    '000fc4000018c6032b18002917000004000000003419ffc11000000600000000'
    '3c18000f01f8c02413000007000000003419f83f133000040000000003208025'
    '04110088000000003c18400001f8c02413000006000000001640000400000000'
    '241200010411001b000000003c0a800001ea48241120ffd3000000001620ffd1'
    '0000000024110001241007c104110075000000003c04a020ac8000003c090a01'
    '35290500ac8900043c095a00ac890008ac80000c3c09fffeac8900100411004a'
    '0000000004110052000000001000ffbd000000003c05a02034a501003c09ff10'
    '3529013faca900003c090010aca900043c09ed00aca900083c090050352903c0'
    'aca9000c3c09ef30aca90010aca000143c09f700aca900183c09f8013529f801'
    'aca9001c3c09f64b35290398aca900203c09000235298028aca900243c09ef00'
    'aca90028aca0002c3c09fcff3529ffffaca900303c09fffd3529f6fbaca90034'
    '3c09fa00aca900383c0900ff3529ffffaca9003c3c09c88035290320aca90040'
    '3c090320352900a0aca900443c090104aca90048aca0004c3c0900a0aca90050'
    '3c09ffff35296000aca900543c0900a0aca900583409a000aca9005c3c09e900'
    'aca90060aca000643c0da4103c09002035290100ada9000035290168ada90004'
    '03e0000800000000248b0014248c003cad600000256b0004156cfffd00000000'
    '24090001ac89003c03e00008000000003c0da4803c090020ada900003c091fc0'
    '352907c0ada900108da90018312900031520fffd000000003c090020ada90000'
    '3c091fc0352907c0ada900048da90018312900031520fffd0000000003e00008'
    '0000000000104c00013048253c0ba0103c0ca012358c5800ad690000256b0004'
    '156cfffd0000000003e0000800000000'
)


def n64() -> bytes:
    rom = bytearray(0x100000)  # 1 MB
    rom[0:4] = (0x80371240).to_bytes(4, 'big')  # configuración del bus y orden de bytes (.z64)
    rom[4:8] = (0x0F).to_bytes(4, 'big')
    rom[8:12] = (0x80000400).to_bytes(4, 'big')  # punto de entrada (no se usa: el código va en 0x40)
    rom[0x20:0x34] = b'PUCHIPRUEBA'.ljust(20)
    rom[0x3B:0x40] = b'NPPE\x00'  # cartucho, «PP», NTSC
    rom[0x40:0x40 + len(N64_CODIGO)] = N64_CODIGO
    return bytes(rom)


# PlayStation (MIPS, ensamblado con llvm-mc -triple=mipsel -mcpu=mips2 desde scripts/psx_prueba.s; solo
# llamadas relativas). Va como PSX.EXE en un CD propio (ISO 9660 con SYSTEM.CNF), sin nada de Sony: el
# núcleo lo arranca con su BIOS libre. Azul al arrancar (rojo si la tarjeta de memoria tiene la marca),
# verde con la X (y escribe la marca), amarillo con la derecha, magenta con el triángulo y cian con R2.
PSX_CODIGO = bytes.fromhex(
    '801f103c141800ae0008083c01000835141808aec606083c60020835141808ae'
    '0407083c10000835141808ae0005083c141808ae0003083c141808ae00e1083c'
    '00040835101808ae00e3083c101808ae03e4083c3fbd0835101808ae00e5083c'
    '101808ae0d000824481008a6880008244e1008a67e0011040000000083001104'
    '8100042481001104520004247f001104252000007d001104252000007b001104'
    '25200000790011043f000424050012247600110425200000ffff5226fcff4016'
    '00000000259840006d00110400000000ff00113c5a0008240200681600000000'
    'ff0011247010088e0000000001000831fcff001100000000feff0824701008ae'
    '200011040000000025c820020040493005002011000000003200110400000000'
    '00ff113425c82002200049300200201100000000ffff19340010493003002011'
    '00000000ff00193cff003937000249300300201100000000ff00193c00ff3937'
    '0002083c25401901101808ae101800aef000083c40010835101808aed9ff0010'
    '0000000025b8e00339001104000000003e001104010004243c00110442000424'
    '3a00110425200000380011042520000025a04000350011042520000000120200'
    '2510540027104000ffff423025a040002b00110400000000251080020800e002'
    '0000000025b8e003210011040000000026001104810004242400110457000424'
    '220011042520000020001104252000001e001104252000001c0011043f000424'
    '1a0011045a0004247f0015241700110425200000ffffb526fcffa01600000000'
    '1200110465000424030015240f00110425200000ffffb526fcffa01600000000'
    '07001104000000000800e00200000000030008244a1008a60800e00300000000'
    '4a1000a60800e00300000000401004a2401002920800e00300000000'
)
PSX_DIRECCION = 0x80010000


def psx_exe() -> bytes:
    """Ejecutable de PlayStation: cabecera de 2 KB y el código, en bloques de 2 KB."""
    codigo = PSX_CODIGO.ljust((len(PSX_CODIGO) + 2047) // 2048 * 2048, b'\0')
    cabecera = bytearray(2048)
    cabecera[0:8] = b'PS-X EXE'
    cabecera[0x10:0x14] = PSX_DIRECCION.to_bytes(4, 'little')  # inicio
    cabecera[0x18:0x1C] = PSX_DIRECCION.to_bytes(4, 'little')  # dónde se carga
    cabecera[0x1C:0x20] = len(codigo).to_bytes(4, 'little')
    cabecera[0x30:0x34] = (0x801FFFF0).to_bytes(4, 'little')  # pila
    cabecera[0x4C:0x4C + 21] = b'PuchiEmulator prueba.'
    return bytes(cabecera) + codigo


def _ambos(n: int, bytes_: int) -> bytes:
    """Número en los dos órdenes de bytes, como los pide ISO 9660."""
    return n.to_bytes(bytes_, 'little') + n.to_bytes(bytes_, 'big')


def _registro(nombre: bytes, sector: int, tam: int, carpeta: bool) -> bytes:
    r = bytearray(33 + len(nombre) + (len(nombre) + 1) % 2)
    r[0] = len(r)
    r[2:10] = _ambos(sector, 4)
    r[10:18] = _ambos(tam, 4)
    r[18:25] = bytes([126, 11, 16, 12, 0, 0, 0])  # 16/11/2026
    r[25] = 2 if carpeta else 0
    r[28:32] = _ambos(1, 2)
    r[32] = len(nombre)
    r[33:33 + len(nombre)] = nombre
    return bytes(r)


def psx_iso() -> bytes:
    """CD de datos en ISO 9660 (sectores de 2 KB) con SYSTEM.CNF y PSX.EXE en la raíz."""
    exe = psx_exe()
    cnf = b'BOOT = cdrom:\\PSX.EXE;1\r\nTCB = 4\r\nEVENT = 10\r\nSTACK = 801FFFF0\r\n'
    RAIZ, CNF, EXE = 20, 21, 22
    total = EXE + len(exe) // 2048 + 8
    raiz = b''.join([
        _registro(b'\0', RAIZ, 2048, True),
        _registro(b'\1', RAIZ, 2048, True),
        _registro(b'PSX.EXE;1', EXE, len(exe), False),
        _registro(b'SYSTEM.CNF;1', CNF, len(cnf), False),
    ]).ljust(2048, b'\0')
    tabla = bytes([1, 0]) + RAIZ.to_bytes(4, 'little') + (1).to_bytes(2, 'little') + b'\0\0'
    tabla_m = bytes([1, 0]) + RAIZ.to_bytes(4, 'big') + (1).to_bytes(2, 'big') + b'\0\0'
    pvd = bytearray(2048)
    pvd[0:6] = b'\x01CD001'
    pvd[6] = 1
    pvd[8:40] = b'PLAYSTATION'.ljust(32)
    pvd[40:72] = b'PUCHIPRUEBA'.ljust(32)
    pvd[80:88] = _ambos(total, 4)
    pvd[120:124] = _ambos(1, 2)
    pvd[124:128] = _ambos(1, 2)
    pvd[128:132] = _ambos(2048, 2)
    pvd[132:140] = _ambos(len(tabla), 4)
    pvd[140:144] = (18).to_bytes(4, 'little')
    pvd[148:152] = (19).to_bytes(4, 'big')
    pvd[156:190] = _registro(b'\0', RAIZ, 2048, True)
    pvd[190:318] = b' ' * 128
    pvd[881] = 1
    fin = bytearray(2048)
    fin[0:7] = b'\xffCD001\x01'
    sectores = [bytes(2048)] * 16 + [bytes(pvd), bytes(fin), tabla.ljust(2048, b'\0'), tabla_m.ljust(2048, b'\0'),
                                      raiz, cnf.ljust(2048, b'\0')]
    sectores += [exe[i:i + 2048] for i in range(0, len(exe), 2048)]
    sectores += [bytes(2048)] * (total - len(sectores))
    return b''.join(sectores)


def _bcd(n: int) -> int:
    return (n // 10) << 4 | n % 10


def psx_bin() -> bytes:
    """El CD como imagen de 2352 bytes por sector (modo 2, forma 1), como las copias en BIN y CUE.
    Sin códigos de corrección, que el emulador no comprueba."""
    iso = psx_iso()
    salida = bytearray()
    for lba in range(len(iso) // 2048):
        m, resto = divmod(lba + 150, 75 * 60)
        segundo, sector = divmod(resto, 75)
        salida += b'\0' + b'\xff' * 10 + b'\0'
        salida += bytes([_bcd(m), _bcd(segundo), _bcd(sector), 2])
        salida += bytes([0, 0, 8, 0]) * 2
        salida += iso[lba * 2048:(lba + 1) * 2048]
        salida += bytes(4 + 276)
    return bytes(salida)


PSX_CUE = 'FILE "prueba-psx.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n'


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / 'prueba.gba').write_bytes(gba())
    (SALIDA / 'prueba.gb').write_bytes(gb())
    (SALIDA / 'prueba.sfc').write_bytes(snes())
    (SALIDA / 'prueba.nds').write_bytes(nds())
    (SALIDA / 'prueba.nes').write_bytes(nes())
    (SALIDA / 'prueba.md').write_bytes(md())
    (SALIDA / 'prueba.sms').write_bytes(sms())
    (SALIDA / 'prueba.gg').write_bytes(gg())
    (SALIDA / 'prueba.z64').write_bytes(n64())
    (SALIDA / 'prueba-psx.bin').write_bytes(psx_bin())
    (SALIDA / 'prueba-psx.cue').write_text(PSX_CUE, newline='')
    # El mismo CD en CHD (comprimido), con chdman (de MAME), si está instalado
    if shutil.which('chdman'):
        chd = SALIDA / 'prueba-psx.chd'
        chd.unlink(missing_ok=True)
        subprocess.run(['chdman', 'createcd', '-i', str(SALIDA / 'prueba-psx.cue'), '-o', str(chd)], check=True,
                       stdout=subprocess.DEVNULL)
    else:
        print('Sin chdman: prueba-psx.chd no se ha regenerado')
    with zipfile.ZipFile(SALIDA / 'prueba.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('LEEME.txt', 'ROM de prueba comprimida')
        z.writestr('Prueba comprimida.gba', gba())
    print('ROMs de prueba en', SALIDA)


if __name__ == '__main__':
    main()
