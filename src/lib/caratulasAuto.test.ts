import { describe, expect, it } from 'vitest'
import indiceGba from '../../public/caratulas/gba.json'
import indiceSnes from '../../public/caratulas/snes.json'
import { buscarEn, elegirAutomatica, palabras } from './caratulas'

const nombres = (indiceGba as { nombres: string[] }).nombres
const normalizados = nombres.map(palabras)
const auto = (q: string) => elegirAutomatica(q, buscarEn(nombres, normalizados, q))?.nombre ?? null

describe('elegirAutomatica', () => {
  it('con el nombre de fichero habitual (No-Intro) coge exactamente esa carátula', () => {
    expect(auto('Pokemon - Emerald Version (USA, Europe)')).toBe('Pokemon - Emerald Version (USA, Europe)')
    expect(auto('Advance Wars (USA)')).toBe('Advance Wars (USA)')
  })

  it('con el título sin región prefiere la edición europea y no una demo ni una reedición', () => {
    expect(auto('Advance Wars')).toBe('Advance Wars (Europe) (En,Fr,De,Es)')
    expect(auto('Mario Kart Super Circuit')).toMatch(/^Mario Kart - Super Circuit \(Europe\)/)
  })

  it('reconoce el título en español aunque falte «Edición»', () => {
    expect(auto('Pokemon Esmeralda')).toBe('Pokemon - Edicion Esmeralda (Spain)')
  })

  it('si la región del fichero no está, coge otra edición del mismo título', () => {
    expect(auto('Advance Wars (Japan)')).toMatch(/^Advance Wars \(/)
  })

  it('sin coincidencia segura no elige nada', () => {
    expect(auto('Wars')).toBeNull()
    expect(auto('prueba')).toBeNull()
    expect(auto('Advance Wars 3')).toBeNull()
  })
})

describe('elegirAutomatica en Super Nintendo', () => {
  const n = (indiceSnes as { nombres: string[] }).nombres
  const norm = n.map(palabras)
  const auto = (q: string) => elegirAutomatica(q, buscarEn(n, norm, q))?.nombre ?? null

  it('con el artículo delante o detrás y la región del fichero', () => {
    expect(auto('The Legend of Zelda - A Link to the Past (Europe)')).toBe('Legend of Zelda, The - A Link to the Past (Europe)')
  })

  it('sin región prefiere la europea y nunca una muestra ni la reedición de Switch Online', () => {
    expect(auto('Legend of Zelda, The - A Link to the Past')).toBe('Legend of Zelda, The - A Link to the Past (Europe)')
    expect(auto('Chrono Trigger')).toBe('Chrono Trigger (USA)')
  })
})
