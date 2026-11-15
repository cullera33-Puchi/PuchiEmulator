import { describe, expect, it } from 'vitest'
import { cuando, plural, tamano } from './formato'

describe('formato', () => {
  it('tamaños', () => {
    expect(tamano(500)).toBe('500 B')
    expect(tamano(32 * 1024)).toBe('32 KB')
    expect(tamano(16 * 1024 * 1024)).toBe('16 MB')
  })

  it('plural', () => {
    expect(plural(1, 'juego', 'juegos')).toBe('1 juego')
    expect(plural(3, 'juego', 'juegos')).toBe('3 juegos')
  })

  it('cuándo', () => {
    const ahora = new Date(2026, 10, 15, 20, 0).getTime()
    expect(cuando(new Date(2026, 10, 15, 18, 30).getTime(), ahora)).toBe('hoy a las 18:30')
    expect(cuando(new Date(2026, 10, 14, 9, 5).getTime(), ahora)).toBe('ayer a las 9:05')
    expect(cuando(new Date(2026, 10, 2, 9, 5).getTime(), ahora)).toMatch(/^2 nov/)
  })
})
