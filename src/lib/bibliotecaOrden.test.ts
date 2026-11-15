import { describe, expect, it } from 'vitest'
import type { Juego } from './almacen'
import { prepararBiblioteca } from './biblioteca'

const juego = (id: string, nombre: string, extra: Partial<Juego> = {}): Juego => ({ id, nombre, sistema: 'gba', titulo: '', nombreFichero: '', tam: 0, anadido: 0, ...extra })

describe('biblioteca: búsqueda, orden y favoritos', () => {
  const juegos = [
    juego('1', 'Pokémon Esmeralda', { ultimaVez: 30, titulo: 'POKEMON EMER' }),
    juego('2', 'Golden Sun', { ultimaVez: 10, favorito: true }),
    juego('3', 'Final Fantasy VI Advance', { ultimaVez: 20 }),
    juego('4', 'Final Fantasy IV Advance'),
  ]
  const nombres = (l: Juego[]) => l.map((j) => j.nombre)

  it('favoritos aparte y primero; el resto, el último jugado antes', () => {
    const r = prepararBiblioteca(juegos)
    expect(nombres(r.favoritos)).toEqual(['Golden Sun'])
    expect(nombres(r.resto)).toEqual(['Pokémon Esmeralda', 'Final Fantasy VI Advance', 'Final Fantasy IV Advance'])
  })

  it('busca sin acentos ni mayúsculas, por palabras y también en el título de la ROM', () => {
    expect(nombres(prepararBiblioteca(juegos, { texto: 'pokemon' }).resto)).toEqual(['Pokémon Esmeralda'])
    expect(nombres(prepararBiblioteca(juegos, { texto: 'emer' }).resto)).toEqual(['Pokémon Esmeralda'])
    expect(nombres(prepararBiblioteca(juegos, { texto: 'fantasy iv' }).resto)).toEqual(['Final Fantasy IV Advance'])
    expect(prepararBiblioteca(juegos, { texto: 'zelda' })).toEqual({ favoritos: [], resto: [] })
  })

  it('ordena por nombre o por tiempo jugado', () => {
    expect(nombres(prepararBiblioteca(juegos, { orden: 'nombre' }).resto)).toEqual(['Final Fantasy IV Advance', 'Final Fantasy VI Advance', 'Pokémon Esmeralda'])
    const tiempos = new Map([
      ['4', 5000],
      ['1', 100],
    ])
    expect(nombres(prepararBiblioteca(juegos, { orden: 'tiempo', tiempos }).resto)).toEqual(['Final Fantasy IV Advance', 'Pokémon Esmeralda', 'Final Fantasy VI Advance'])
  })
})
