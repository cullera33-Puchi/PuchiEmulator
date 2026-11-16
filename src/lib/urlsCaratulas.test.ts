import { describe, expect, it } from 'vitest'
import { actualizarUrls, type UrlGuardada } from './urlsCaratulas'

describe('actualizarUrls', () => {
  const img = (id: string, fecha: number, tam = 10) => ({ id, fecha, datos: new ArrayBuffer(tam) })

  it('reutiliza las que no cambian, crea las nuevas y suelta las cambiadas y las quitadas', () => {
    let n = 0
    const creadas: string[] = []
    const soltadas: string[] = []
    const crear = (c: { id: string }) => {
      const u = `blob:${c.id}-${++n}`
      creadas.push(u)
      return u
    }
    const soltar = (u: string) => soltadas.push(u)
    const primera = actualizarUrls(new Map<string, UrlGuardada>(), [img('a', 1), img('b', 1), img('c', 1)], crear, soltar)
    expect(creadas).toHaveLength(3)
    const segunda = actualizarUrls(primera, [img('a', 1), img('b', 2), img('d', 1)], crear, soltar)
    expect(segunda.get('a')).toBe(primera.get('a'))
    expect(segunda.get('b')!.url).not.toBe(primera.get('b')!.url)
    expect(soltadas.sort()).toEqual([primera.get('b')!.url, primera.get('c')!.url].sort())
    expect(creadas).toHaveLength(5)
  })
})
