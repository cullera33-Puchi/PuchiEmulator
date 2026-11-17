import { describe, expect, it } from 'vitest'
import { avisoTamano, extensionPartida, nombreFicheroPartida, problemaPartida } from './partidaFichero'

describe('partida como fichero', () => {
  it('.sav en las portátiles de Nintendo y .srm en el resto', () => {
    expect(extensionPartida('gba')).toBe('sav')
    expect(extensionPartida('gb')).toBe('sav')
    expect(extensionPartida('nds')).toBe('sav')
    expect(extensionPartida('snes')).toBe('srm')
    expect(extensionPartida('psx')).toBe('srm')
    expect(extensionPartida('n64')).toBe('srm')
  })

  it('nombre del fichero sin caracteres prohibidos', () => {
    expect(nombreFicheroPartida({ nombre: 'Zelda: A Link / Past?', sistema: 'snes' })).toBe('Zelda A Link Past.srm')
    expect(nombreFicheroPartida({ nombre: '   ', sistema: 'gba' })).toBe('partida.sav')
  })

  it('rechaza vacíos y enormes; avisa si el tamaño no coincide', () => {
    expect(problemaPartida(0)).toMatch(/vacío/)
    expect(problemaPartida(32 * 1024 * 1024)).toMatch(/grande/)
    expect(problemaPartida(8192)).toBeNull()
    expect(avisoTamano(8192, 8192)).toBeNull()
    expect(avisoTamano(8192)).toBeNull()
    expect(avisoTamano(32768, 8192)).toMatch(/otro juego/)
  })
})
