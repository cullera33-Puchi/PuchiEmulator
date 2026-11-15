import { describe, expect, it } from 'vitest'
import { diasSinCopia, necesitaCopia } from './copias'

describe('aviso de la copia de partidas', () => {
  const dia = 86_400_000
  const ahora = 100 * dia

  it('sin partidas no avisa; con partidas y sin copia, sí', () => {
    expect(necesitaCopia(false, undefined, undefined, ahora)).toBe(false)
    expect(necesitaCopia(true, undefined, undefined, ahora)).toBe(true)
  })

  it('avisa a los 14 días de la última copia', () => {
    expect(necesitaCopia(true, ahora - 13 * dia, undefined, ahora)).toBe(false)
    expect(necesitaCopia(true, ahora - 14 * dia, undefined, ahora)).toBe(true)
    expect(diasSinCopia(ahora - 20 * dia, ahora)).toBe(20)
    expect(diasSinCopia(undefined, ahora)).toBeNull()
  })

  it('«Más tarde» lo calla hasta la fecha elegida', () => {
    expect(necesitaCopia(true, undefined, ahora + dia, ahora)).toBe(false)
    expect(necesitaCopia(true, undefined, ahora - 1, ahora)).toBe(true)
  })
})
