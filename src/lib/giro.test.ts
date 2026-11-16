import { describe, expect, it } from 'vitest'
import { vectorJuego } from './giro'

describe('pantalla girada', () => {
  it('sin girar, el toque va tal cual', () => {
    expect(vectorJuego(3, 4, 0)).toEqual([3, 4])
  })

  it('girada a la derecha: hacia abajo en el iPhone es hacia la derecha en el juego', () => {
    expect(vectorJuego(0, 10, 90)).toEqual([10, -0])
    // Hacia la izquierda en el iPhone es hacia abajo en el juego
    expect(vectorJuego(-10, 0, 90)).toEqual([0, 10])
  })

  it('girada a la izquierda: hacia arriba en el iPhone es hacia la derecha en el juego', () => {
    expect(vectorJuego(0, -10, -90)).toEqual([10, 0])
    expect(vectorJuego(10, 0, -90)).toEqual([-0, 10])
  })
})
