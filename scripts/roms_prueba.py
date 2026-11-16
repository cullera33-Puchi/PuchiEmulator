#!/usr/bin/env python3
"""Genera las ROMs de prueba de tests/fixtures (prueba.gba, prueba.gb, prueba.sfc, prueba.nds, prueba.nes y prueba.zip).

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


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / 'prueba.gba').write_bytes(gba())
    (SALIDA / 'prueba.gb').write_bytes(gb())
    (SALIDA / 'prueba.sfc').write_bytes(snes())
    (SALIDA / 'prueba.nds').write_bytes(nds())
    (SALIDA / 'prueba.nes').write_bytes(nes())
    with zipfile.ZipFile(SALIDA / 'prueba.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('LEEME.txt', 'ROM de prueba comprimida')
        z.writestr('Prueba comprimida.gba', gba())
    print('ROMs de prueba en', SALIDA)


if __name__ == '__main__':
    main()
