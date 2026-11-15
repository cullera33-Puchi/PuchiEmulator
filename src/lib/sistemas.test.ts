import { readFileSync } from 'node:fs'
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

  it('no reconoce otros ficheros', () => {
    expect(detectarSistema(new Uint8Array(512), 'foto.jpg')).toBeNull()
  })
})

describe('leerRom', () => {
  it('saca la ROM de un zip, saltándose el resto de ficheros', () => {
    const r = leerRom(fixture('prueba.zip'), 'Prueba.zip')
    expect(r?.sistema).toBe('gba')
    expect(r?.nombreFichero).toBe('Prueba comprimida.gba')
    expect(r?.bytes.length).toBe(32768)
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
