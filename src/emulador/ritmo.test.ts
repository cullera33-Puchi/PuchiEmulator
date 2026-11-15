import { describe, expect, it } from 'vitest'
import { planRitmo, Refresco } from './ritmo'

describe('planRitmo', () => {
  it('GBA (59,73 Hz) y Super Nintendo (60,10 Hz) en una pantalla de 60 Hz: un fotograma por refresco', () => {
    expect(planRitmo(59.7275, 1000 / 60)).toEqual({ modo: 'sincronizado', cadaRefrescos: 1, porRefresco: 1 })
    expect(planRitmo(60.0988, 1000 / 60)).toEqual({ modo: 'sincronizado', cadaRefrescos: 1, porRefresco: 1 })
  })

  it('en una pantalla de 120 Hz, uno cada dos refrescos; a 30 Hz (bajo consumo), dos por refresco', () => {
    expect(planRitmo(60.0988, 1000 / 120)).toEqual({ modo: 'sincronizado', cadaRefrescos: 2, porRefresco: 1 })
    expect(planRitmo(59.7275, 1000 / 30)).toEqual({ modo: 'sincronizado', cadaRefrescos: 1, porRefresco: 2 })
  })

  it('un juego europeo (50 Hz) en una pantalla de 60 Hz va por tiempo', () => {
    expect(planRitmo(50.007, 1000 / 60)).toEqual({ modo: 'tiempo' })
  })

  it('sin medidas de la pantalla, por tiempo', () => {
    expect(planRitmo(60, 0)).toEqual({ modo: 'tiempo' })
  })
})

describe('Refresco', () => {
  it('necesita unas cuantas medidas y descarta los saltos', () => {
    const r = new Refresco()
    for (let i = 0; i < 29; i++) r.medir(16.7)
    expect(r.ms).toBe(0)
    r.medir(16.6)
    r.medir(250) // la app vuelve de segundo plano
    r.medir(33.4) // un refresco perdido
    expect(r.ms).toBeCloseTo(16.7, 1)
  })
})
