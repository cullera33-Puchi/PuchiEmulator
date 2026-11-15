import { describe, expect, it } from 'vitest'
import { estadoSueno, textoRestante, tocaPausar } from './sueno'

const min = 60_000

describe('temporizador de sueño', () => {
  it('avisa una vez cuando quedan 5 minutos y termina a su hora', () => {
    const fin = 30 * min
    expect(estadoSueno(fin, 10 * min, false)).toEqual({ restanteMs: 20 * min, avisar: false, terminado: false })
    expect(estadoSueno(fin, 25 * min, false).avisar).toBe(true)
    expect(estadoSueno(fin, 26 * min, true).avisar).toBe(false)
    expect(estadoSueno(fin, 31 * min, true)).toEqual({ restanteMs: 0, avisar: false, terminado: true })
  })

  it('cuenta los minutos que quedan hacia arriba', () => {
    expect(textoRestante(22.2 * min)).toBe('Quedan 23 min')
    expect(textoRestante(10_000)).toBe('Quedan 1 min')
  })
})

describe('pausa si se deja de tocar', () => {
  it('pausa a los minutos elegidos y nunca con 0', () => {
    expect(tocaPausar(5, 0, 4.9 * min)).toBe(false)
    expect(tocaPausar(5, 0, 5 * min)).toBe(true)
    expect(tocaPausar(0, 0, 999 * min)).toBe(false)
  })
})
