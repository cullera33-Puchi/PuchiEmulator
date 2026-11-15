import { describe, expect, it } from 'vitest'
import { buscarEn, palabras, urlCaratula } from './caratulas'
import indiceGba from '../../public/caratulas/gba.json'

const nombres = (indiceGba as { nombres: string[] }).nombres
const normalizados = nombres.map(palabras)
const buscar = (q: string) => buscarEn(nombres, normalizados, q)

describe('palabras', () => {
  it('quita acentos, signos, etiquetas y palabras vacías', () => {
    expect(palabras('Pokémon - Edición Esmeralda (Spain) [!]')).toEqual(['pokemon', 'edicion', 'esmeralda'])
    expect(palabras('The Legend of Zelda: The Minish Cap')).toEqual(['legend', 'zelda', 'minish', 'cap'])
  })
})

describe('buscarEn', () => {
  it('encuentra el juego con un nombre de fichero habitual y prefiere la edición europea', () => {
    const r = buscar('Advance Wars')
    expect(r[0].nombre).toMatch(/^Advance Wars \((Europe|USA)/)
    expect(r[0].nombre).toMatch(/Europe/)
  })

  it('encuentra juegos aunque el nombre venga con guiones bajos o mayúsculas', () => {
    expect(buscar('mario kart super circuit')[0].nombre).toMatch(/^Mario Kart - Super Circuit/)
  })

  it('no propone nada si no comparte ninguna palabra', () => {
    expect(buscar('zzzz qqqq')).toEqual([])
  })
})

describe('urlCaratula', () => {
  it('codifica el nombre y admite la carpeta de otra consola', () => {
    expect(urlCaratula('Nintendo_-_Game_Boy', 'Tetris (World) (Rev 1)')).toBe(
      'https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Game_Boy/master/Named_Boxarts/Tetris%20(World)%20(Rev%201).png',
    )
    expect(urlCaratula('Nintendo_-_Game_Boy', 'Nintendo_-_Game_Boy_Color/Juego (Europe)')).toContain('/Nintendo_-_Game_Boy_Color/master/Named_Boxarts/Juego%20(Europe).png')
  })
})
