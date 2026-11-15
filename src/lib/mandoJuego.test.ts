import { describe, expect, it } from 'vitest'
import { bit } from '../emulador/botones'
import { correrDe, extrasJrpg, mandoDe, mascaraConCorrer, menusDe } from './mandoJuego'

describe('mando para JRPG', () => {
  it('menú por defecto: X en Super Nintendo y DS, Start en GBA y Game Boy', () => {
    expect(mandoDe({}, 'j', 'snes')).toEqual({ jrpg: false, menu: 'X', correr: 'B', direcciones: 8 })
    expect(mandoDe({}, 'j', 'nds').menu).toBe('X')
    expect(mandoDe({}, 'j', 'gba').menu).toBe('START')
    expect(mandoDe({}, 'j', 'gb').menu).toBe('START')
  })

  it('cada consola ofrece solo sus botones', () => {
    expect(menusDe('gba')).toEqual(['START', 'SELECT'])
    expect(menusDe('snes')).toEqual(['X', 'Y', 'START', 'SELECT'])
    expect(correrDe('gba')).toEqual(['B'])
    expect(correrDe('snes')).toEqual(['B', 'Y'])
  })

  it('lo guardado manda, salvo lo que no existe en esa consola', () => {
    expect(mandoDe({ j: { jrpg: true, menu: 'Y', correr: 'Y' } }, 'j', 'snes')).toEqual({ jrpg: true, menu: 'Y', correr: 'Y', direcciones: 8 })
    expect(mandoDe({ j: { jrpg: true, menu: 'X', correr: 'Y', direcciones: 4 } }, 'j', 'gba')).toEqual({ jrpg: true, menu: 'START', correr: 'B', direcciones: 4 })
    expect(mandoDe({ otro: { jrpg: true } }, 'j', 'gba').jrpg).toBe(false)
  })

  it('X e Y que no hacen de menú siguen a la vista', () => {
    expect(extrasJrpg('snes', 'X')).toEqual(['Y'])
    expect(extrasJrpg('snes', 'START')).toEqual(['X', 'Y'])
    expect(extrasJrpg('gba', 'START')).toEqual([])
  })

  it('correr fijo deja el botón pulsado y lo suelta en el hueco para una pulsación nueva', () => {
    const b = bit('B')
    const a = bit('A')
    expect(mascaraConCorrer(a, 0, false)).toBe(a)
    expect(mascaraConCorrer(a, b, false)).toBe(a | b)
    expect(mascaraConCorrer(a | b, b, true)).toBe(a)
  })
})
