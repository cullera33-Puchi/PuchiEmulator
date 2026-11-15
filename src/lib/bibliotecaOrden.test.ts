import { describe, expect, it } from 'vitest'
import type { Juego } from './almacen'
import { alAbrir, conEstado, estadoDe, prepararBiblioteca, resumenEstados, seguirJugando, terminados } from './biblioteca'

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

describe('estado de cada juego y seguir jugando', () => {
  it('sin estado elegido: pendiente si no se ha jugado y jugando si sí', () => {
    expect(estadoDe(juego('1', 'A'))).toBe('pendiente')
    expect(estadoDe(juego('1', 'A', { ultimaVez: 5 }))).toBe('jugando')
    expect(estadoDe(juego('1', 'A', { ultimaVez: 5, estado: 'abandonado' }))).toBe('abandonado')
  })

  it('al terminarlo anota la fecha, la conserva si se vuelve a marcar y la quita al cambiar', () => {
    const t = conEstado(juego('1', 'A'), 'terminado', 100)
    expect(t).toMatchObject({ estado: 'terminado', terminado: 100 })
    expect(conEstado(t, 'terminado', 200).terminado).toBe(100)
    expect(conEstado(t, 'jugando', 300).terminado).toBeUndefined()
  })

  it('abrir un pendiente lo pasa a jugando; lo terminado no cambia', () => {
    expect(alAbrir(juego('1', 'A', { estado: 'pendiente' }), 9)).toMatchObject({ estado: 'jugando', ultimaVez: 9 })
    expect(alAbrir(juego('1', 'A', { estado: 'terminado' }), 9).estado).toBe('terminado')
  })

  it('filtra la biblioteca por estado y cuenta cuántos hay de cada uno', () => {
    const l = [juego('1', 'A', { ultimaVez: 1 }), juego('2', 'B'), juego('3', 'C', { estado: 'terminado', terminado: 5 }), juego('4', 'D', { estado: 'terminado', terminado: 9 })]
    expect(prepararBiblioteca(l, { estado: 'terminado', orden: 'nombre' }).resto.map((j) => j.id)).toEqual(['3', '4'])
    expect(resumenEstados(l)).toEqual({ pendiente: 1, jugando: 1, terminado: 2, abandonado: 0 })
    expect(terminados(l).map((j) => j.id)).toEqual(['4', '3'])
  })

  it('seguir jugando: los últimos jugados sin terminados ni abandonados, como mucho cinco', () => {
    const l = Array.from({ length: 8 }, (_, i) => juego(String(i), `J${i}`, { ultimaVez: i + 1 }))
    l[7].estado = 'terminado'
    l[6].estado = 'abandonado'
    l.push(juego('x', 'Sin jugar'))
    expect(seguirJugando(l).map((j) => j.id)).toEqual(['5', '4', '3', '2', '1'])
  })
})
