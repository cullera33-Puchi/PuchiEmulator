import { readFileSync } from 'node:fs'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { detectarSistema, leerRom, nombreDesdeFichero, tituloInterno } from './sistemas'

const fixture = (n: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/${n}`, import.meta.url)))

describe('detectarSistema', () => {
  it('reconoce la GBA por la cabecera aunque el fichero no tenga extensión', () => {
    expect(detectarSistema(fixture('prueba.gba'), 'juego')).toBe('gba')
  })

  it('reconoce la Game Boy por la cabecera', () => {
    expect(detectarSistema(fixture('prueba.gb'), 'juego.bin')).toBe('gb')
  })

  it('distingue la Game Boy Color por el indicador de la cabecera', () => {
    const rom = fixture('prueba.gb').slice()
    rom[0x143] = 0x80
    expect(detectarSistema(rom, 'x.gb')).toBe('gbc')
  })

  it('usa la extensión si la cabecera no es concluyente', () => {
    expect(detectarSistema(new Uint8Array(16), 'algo.gbc')).toBe('gbc')
    expect(detectarSistema(new Uint8Array(16), 'algo.GBA')).toBe('gba')
  })

  it('reconoce la Super Nintendo por la extensión', () => {
    expect(detectarSistema(fixture('prueba.sfc'), 'Juego (Europe).sfc')).toBe('snes')
    expect(detectarSistema(fixture('prueba.sfc'), 'juego.SMC')).toBe('snes')
  })

  it('reconoce la Nintendo DS por la extensión y lee su título', () => {
    expect(detectarSistema(fixture('prueba.nds'), 'Juego (Europe).nds')).toBe('nds')
    expect(tituloInterno(fixture('prueba.nds'), 'nds')).toBe('PUCHIPRUEBA')
  })

  it('reconoce la NES por la cabecera iNES, aunque el fichero se llame de otra forma', () => {
    expect(detectarSistema(fixture('prueba.nes'), 'Juego (Spain).nes')).toBe('nes')
    expect(detectarSistema(fixture('prueba.nes'), 'juego.bin')).toBe('nes')
    expect(tituloInterno(fixture('prueba.nes'), 'nes')).toBe('')
  })

  it('reconoce la Mega Drive por «SEGA» en la cabecera y lee su título', () => {
    expect(detectarSistema(fixture('prueba.md'), 'juego.bin')).toBe('md')
    expect(tituloInterno(fixture('prueba.md'), 'md')).toBe('PUCHIPRUEBA')
    expect(detectarSistema(new Uint8Array(16), 'algo.gen')).toBe('md')
  })

  it('distingue Master System y Game Gear por la región de «TMR SEGA», salvo que la extensión diga otra cosa', () => {
    expect(detectarSistema(fixture('prueba.sms'), 'juego.bin')).toBe('sms')
    expect(detectarSistema(fixture('prueba.gg'), 'juego.bin')).toBe('gg')
    expect(detectarSistema(fixture('prueba.sms'), 'juego.gg')).toBe('gg')
  })

  it('no reconoce otros ficheros', () => {
    expect(detectarSistema(new Uint8Array(512), 'foto.jpg')).toBeNull()
  })
})

describe('Nintendo 64', () => {
  const z64 = fixture('prueba.z64')
  // Los otros dos órdenes de bytes de los volcados: por parejas (.v64) y de cuatro en cuatro (.n64)
  const v64 = z64.map((_, i) => z64[i ^ 1])
  const n64 = z64.map((_, i) => z64[i ^ 3])

  it('se reconoce por la cabecera en los tres órdenes de bytes, con cualquier nombre', () => {
    for (const b of [z64, v64, n64]) expect(detectarSistema(b, 'juego.bin')).toBe('n64')
  })

  it('lee el título interno en cualquier orden de bytes', () => {
    for (const b of [z64, v64, n64]) expect(tituloInterno(b, 'n64')).toBe('PUCHIPRUEBA')
  })

  it('las extensiones .z64, .n64 y .v64 bastan si la cabecera no dice nada', () => {
    for (const e of ['z64', 'n64', 'V64']) expect(detectarSistema(new Uint8Array(16), `juego.${e}`)).toBe('n64')
  })

  it('dentro de un zip, se encuentra por la cabecera', () => {
    const zip = zipSync({ 'leeme.txt': new Uint8Array(10), 'juego.rom': v64 })
    expect(leerRom(zip, 'juego.zip')?.sistema).toBe('n64')
  })
})

describe('leerRom', () => {
  it('saca la ROM de un zip, saltándose el resto de ficheros', () => {
    const r = leerRom(fixture('prueba.zip'), 'Prueba.zip')
    expect(r?.sistema).toBe('gba')
    expect(r?.nombreFichero).toBe('Prueba comprimida.gba')
    expect(r?.bytes.length).toBe(32768)
  })

  it('en un zip, la ROM reconocida por la cabecera gana a un texto con extensión de ROM (v0.30.0)', () => {
    const zip = zipSync({ 'README.md': new TextEncoder().encode('# Juego homebrew\nInstrucciones'), 'juego.nes': fixture('prueba.nes') })
    const r = leerRom(zip, 'homebrew.zip')
    expect(r?.sistema).toBe('nes')
    expect(r?.nombreFichero).toBe('juego.nes')
    // Un zip con solo un texto no da ningún juego
    expect(leerRom(zipSync({ 'README.md': new TextEncoder().encode('hola') }), 'texto.zip')).toBeNull()
  })

  it('reconoce la Mega Drive con la cabecera de 512 bytes de las copiadoras (v0.30.0)', () => {
    const md = fixture('prueba.md')
    const conCabecera = new Uint8Array(512 + md.length)
    conCabecera.set(md, 512)
    expect(detectarSistema(conCabecera, 'juego.bin')).toBe('md')
  })

  it('devuelve null con un zip dañado', () => {
    expect(leerRom(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'roto.zip')).toBeNull()
  })
})

describe('nombres', () => {
  it('limpia el nombre del fichero', () => {
    expect(nombreDesdeFichero('Mi_Juego (S) [!].gba')).toBe('Mi Juego (S)')
    expect(nombreDesdeFichero('carpeta/Otro.gb')).toBe('Otro')
  })

  it('lee el título interno', () => {
    expect(tituloInterno(fixture('prueba.gba'), 'gba')).toBe('PUCHIPRUEBA')
    expect(tituloInterno(fixture('prueba.gb'), 'gb')).toBe('PUCHIPRUEBA')
    expect(tituloInterno(fixture('prueba.sfc'), 'snes')).toBe('PUCHIPRUEBA')
    // Con la cabecera de 512 bytes de las copiadoras antiguas
    const conCabecera = new Uint8Array(512 + 32768)
    conCabecera.set(fixture('prueba.sfc'), 512)
    expect(tituloInterno(conCabecera, 'snes')).toBe('PUCHIPRUEBA')
  })
})
