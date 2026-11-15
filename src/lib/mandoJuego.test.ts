import { describe, expect, it } from 'vitest'
import { bit } from '../emulador/botones'
import { cambiarAjustes, leerAjustes, POR_DEFECTO } from './ajustes'
import {
  CLAVES_MANDO,
  CLAVES_PANTALLA,
  cambiarMandoJuego,
  controlesDe,
  correrDe,
  extrasJrpg,
  mandoDe,
  mascaraConCorrer,
  menusDe,
  tieneControlesPropios,
  usarControlesGenerales,
} from './mandoJuego'

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

describe('pantalla y botones por juego', () => {
  const generales = { ...POR_DEFECTO, escalaMando: 1.15, modoMando: 'una-mano' as const }

  it('sin ajustes propios, el juego usa los generales', () => {
    expect(controlesDe(generales, 'j')).toMatchObject({ escalaMando: 1.15, modoMando: 'una-mano', pantallaGrande: true })
    expect(tieneControlesPropios(generales, 'j')).toBe(false)
  })

  it('lo propio del juego manda y no toca a los demás', () => {
    const a = { ...generales, mandos: { j: { escalaMando: 0.8, jrpg: true } } }
    expect(controlesDe(a, 'j').escalaMando).toBe(0.8)
    expect(controlesDe(a, 'j').modoMando).toBe('una-mano')
    expect(controlesDe(a, 'otro').escalaMando).toBe(1.15)
    expect(tieneControlesPropios(a, 'j')).toBe(true)
  })

  it('volver a los generales quita lo propio y conserva el modo JRPG', () => {
    cambiarAjustes({ mandos: {} })
    cambiarMandoJuego('j', { jrpg: true })
    cambiarMandoJuego('j', { escalaMando: 1.3, mano: 'izquierda' })
    expect(leerAjustes().mandos.j).toEqual({ jrpg: true, escalaMando: 1.3, mano: 'izquierda' })
    usarControlesGenerales('j')
    expect(leerAjustes().mandos.j).toEqual({ jrpg: true })
  })
})

describe('pantalla y mando, cada uno por su lado', () => {
  it('volver a los ajustes generales de pantalla no toca los botones, y al revés', () => {
    cambiarAjustes({ mandos: {} })
    cambiarMandoJuego('j', { filtro: 'lcd', nitido: false, escalaMando: 1.3 })
    expect(tieneControlesPropios(leerAjustes(), 'j', CLAVES_PANTALLA)).toBe(true)
    usarControlesGenerales('j', CLAVES_PANTALLA)
    expect(leerAjustes().mandos.j).toEqual({ escalaMando: 1.3 })
    expect(tieneControlesPropios(leerAjustes(), 'j', CLAVES_PANTALLA)).toBe(false)
    usarControlesGenerales('j', CLAVES_MANDO)
    expect(leerAjustes().mandos.j).toEqual({})
  })
})
