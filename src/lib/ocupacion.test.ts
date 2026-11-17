import { describe, expect, it } from 'vitest'
import type { Juego } from './almacen'
import { guardadoSinJuego, ocupacionPorJuego } from './ocupacion'

const juego = (id: string, nombre: string, tam: number): Juego => ({ id, nombre, sistema: 'snes', titulo: '', nombreFichero: `${nombre}.sfc`, tam, anadido: 0 })

describe('ocupación por juego', () => {
  const juegos = [juego('a', 'Pequeño', 1_000), juego('b', 'Disco', 600_000_000), juego('c', 'Con estados', 2_000_000)]
  const guardado = new Map([
    ['c', { estados: 3, bytesEstados: 48_000_000, partida: 8_192 }],
    ['b', { estados: 0, bytesEstados: 0, partida: 131_072 }],
    ['z', { estados: 2, bytesEstados: 1_000, partida: 512 }],
  ])

  it('suma juego, estados y partida y ordena de más a menos', () => {
    const r = ocupacionPorJuego(juegos, guardado)
    expect(r.map((o) => o.juego.id)).toEqual(['b', 'c', 'a'])
    expect(r[1]).toMatchObject({ bytesJuego: 2_000_000, estados: 3, bytesEstados: 48_000_000, bytesPartida: 8_192, total: 50_008_192 })
    expect(r[2]).toMatchObject({ estados: 0, bytesEstados: 0, bytesPartida: 0, total: 1_000 })
  })

  it('cuenta lo guardado de juegos que ya no están en la biblioteca', () => {
    expect(guardadoSinJuego(juegos, guardado)).toEqual({ juegos: 1, bytes: 1_512 })
  })
})
