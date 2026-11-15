import { describe, expect, it } from 'vitest'
import { Rebobinado } from './rebobinado'

function estados(n: number, tam = 4096): Uint8Array[] {
  const lista: Uint8Array[] = []
  let e = new Uint8Array(tam)
  for (let i = 0; i < n; i++) {
    e = e.slice()
    // Cambian unos pocos bytes entre un estado y el siguiente, como en un juego
    for (let k = 0; k < 20; k++) e[(i * 37 + k * 101) % tam] = (i + k) & 0xff
    lista.push(e)
  }
  return lista
}

describe('Rebobinado', () => {
  it('devuelve los estados anteriores en orden inverso y exactos', () => {
    const r = new Rebobinado()
    const lista = estados(10)
    lista.forEach((e) => r.guardar(e))
    expect(r.cuantos).toBe(10)
    for (let i = 8; i >= 0; i--) expect(r.atras()?.estado).toEqual(lista[i])
    expect(r.atras()).toBeNull()
    expect(r.cuantos).toBe(1)
  })

  it('descarta los más antiguos al llegar al máximo', () => {
    const r = new Rebobinado(5)
    const lista = estados(12)
    lista.forEach((e) => r.guardar(e))
    expect(r.cuantos).toBe(5)
    let ultimo: Uint8Array | null = null
    for (let e = r.atras(); e; e = r.atras()) ultimo = e.estado
    expect(ultimo).toEqual(lista[7])
  })

  it('se puede seguir guardando después de rebobinar', () => {
    const r = new Rebobinado()
    const lista = estados(6)
    lista.slice(0, 4).forEach((e) => r.guardar(e))
    r.atras()
    r.atras() // ahora el actual es lista[1]
    r.guardar(lista[5])
    expect(r.atras()?.estado).toEqual(lista[1])
    expect(r.atras()?.estado).toEqual(lista[0])
  })

  it('las diferencias ocupan mucho menos que los estados', () => {
    const r = new Rebobinado()
    estados(50, 256 * 1024).forEach((e) => r.guardar(e))
    expect(r.memoria).toBeLessThan(256 * 1024 + 50 * 4 * 1024)
  })

  it('respeta el tope de memoria', () => {
    const r = new Rebobinado(1000, 10_000)
    const lista: Uint8Array[] = []
    for (let i = 0; i < 40; i++) lista.push(crypto.getRandomValues(new Uint8Array(2048)))
    lista.forEach((e) => r.guardar(e))
    expect(r.memoria - 2048).toBeLessThanOrEqual(10_000)
  })

  it('devuelve los botones de cada estado', () => {
    const r = new Rebobinado()
    estados(4).forEach((e, i) => r.guardar(e, i * 10))
    expect(r.atras()?.botones).toBe(20)
    expect(r.atras()?.botones).toBe(10)
    expect(r.atras()?.botones).toBe(0)
  })

  it('empieza de cero si cambia el tamaño del estado', () => {
    const r = new Rebobinado()
    r.guardar(new Uint8Array(10))
    r.guardar(new Uint8Array(10))
    r.guardar(new Uint8Array(20))
    expect(r.cuantos).toBe(1)
  })
})
