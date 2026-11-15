import { describe, expect, it } from 'vitest'
import { combinar } from './zonaSegura'

describe('combinar', () => {
  it('un 0 pasajero de iOS tras girar no borra la zona segura conocida', () => {
    const conocida = { arriba: 62, abajo: 34, izquierda: 0, derecha: 0 }
    expect(combinar(conocida, { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 })).toEqual(conocida)
  })

  it('una medida mayor se queda', () => {
    expect(combinar({ arriba: 47, abajo: 34, izquierda: 0, derecha: 0 }, { arriba: 62, abajo: 34, izquierda: 0, derecha: 0 }).arriba).toBe(62)
  })
})
