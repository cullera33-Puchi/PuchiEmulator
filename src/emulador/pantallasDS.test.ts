import { describe, expect, it } from 'vitest'
import { aNucleo, tamanoSalida, cuadrosDS } from './pantallasDS'

/** Punto de la táctil (u, v en píxeles de la pantalla de abajo) en la imagen del núcleo, de 0 a 1. */
const tactil = (u: number, v: number): [number, number] => [u / 256, (192 + v) / 384]
const cerca = (a: [number, number] | null, b: [number, number]) => {
  expect(a).not.toBeNull()
  expect(a![0]).toBeCloseTo(b[0], 5)
  expect(a![1]).toBeCloseTo(b[1], 5)
}

describe('pantallas de DS', () => {
  it('tamaño de la imagen: apiladas, libro y grande', () => {
    expect(tamanoSalida('apiladas')).toEqual({ ancho: 256, alto: 384 })
    expect(tamanoSalida('libro-derecha')).toEqual({ ancho: 384, alto: 256 })
    expect(tamanoSalida('grande')).toEqual({ ancho: 256, alto: 192 })
  })

  it('apiladas: el toque va tal cual', () => {
    expect(aNucleo('apiladas', 'abajo', 0.3, 0.8)).toEqual([0.3, 0.8])
  })

  it('libro con la táctil a la derecha: la consola girada a la izquierda', () => {
    // La esquina de arriba a la izquierda de la táctil (0, 0) queda abajo a la izquierda de su mitad
    cerca(aNucleo('libro-derecha', 'abajo', 192 / 384, 256 / 256), tactil(0, 0))
    // La de arriba a la derecha de la táctil (256, 0) queda arriba a la izquierda de su mitad
    cerca(aNucleo('libro-derecha', 'abajo', 192 / 384, 0), tactil(256, 0))
    // Abajo a la derecha de la táctil (256, 192) queda arriba a la derecha de la imagen
    cerca(aNucleo('libro-derecha', 'abajo', 1, 0), tactil(256, 192))
    // La mitad izquierda es la pantalla de arriba: no es táctil
    expect(aNucleo('libro-derecha', 'abajo', 0.2, 0.5)).toBeNull()
  })

  it('libro con la táctil a la izquierda: la consola girada a la derecha', () => {
    // Arriba a la izquierda de la táctil (0, 0) queda arriba a la derecha de su mitad
    cerca(aNucleo('libro-izquierda', 'abajo', 192 / 384, 0), tactil(0, 0))
    // Abajo a la izquierda de la táctil (0, 192) queda arriba a la izquierda de la imagen
    cerca(aNucleo('libro-izquierda', 'abajo', 0, 0), tactil(0, 192))
    // Abajo a la derecha (256, 192) queda abajo a la izquierda
    cerca(aNucleo('libro-izquierda', 'abajo', 0, 1), tactil(256, 192))
    expect(aNucleo('libro-izquierda', 'abajo', 0.8, 0.5)).toBeNull()
  })

  it('lado a lado: la táctil es la mitad derecha, sin girar', () => {
    expect(tamanoSalida('lado')).toEqual({ ancho: 512, alto: 192 })
    cerca(aNucleo('lado', 'abajo', 0.5, 0), tactil(0, 0))
    cerca(aNucleo('lado', 'abajo', 1, 1), tactil(256, 192))
    cerca(aNucleo('lado', 'abajo', 0.75, 0.5), tactil(128, 96))
    expect(aNucleo('lado', 'abajo', 0.4, 0.5)).toBeNull()
  })

  it('grande y pequeña: solo es táctil la grande cuando es la de abajo', () => {
    cerca(aNucleo('grande', 'abajo', 0.5, 0.5), tactil(128, 96))
    expect(aNucleo('grande', 'arriba', 0.5, 0.5)).toBeNull()
  })
})

describe('cuadrosDS (pintar con la tarjeta gráfica, v0.31.0)', () => {
  /** Coordenada del núcleo de un punto de la salida, interpolando las esquinas de su cuadro */
  const muestra = (d: Parameters<typeof cuadrosDS>[0], principal: 'arriba' | 'abajo', px: number, py: number) => {
    const c = cuadrosDS(d, principal, 256, 384).find((q) => px >= q.x0 && px <= q.x1 && py >= q.y0 && py <= q.y1)!
    const fx = (px - c.x0) / (c.x1 - c.x0)
    const fy = (py - c.y0) / (c.y1 - c.y0)
    const [tl, tr, bl, br] = c.uv
    const arriba = [tl[0] + (tr[0] - tl[0]) * fx, tl[1] + (tr[1] - tl[1]) * fx]
    const abajo = [bl[0] + (br[0] - bl[0]) * fx, bl[1] + (br[1] - bl[1]) * fx]
    return [arriba[0] + (abajo[0] - arriba[0]) * fy, arriba[1] + (abajo[1] - arriba[1]) * fy]
  }

  it('sin recolocar, el fotograma entero', () => {
    expect(cuadrosDS(null, 'abajo', 240, 160)).toEqual([{ x0: 0, y0: 0, x1: 240, y1: 160, uv: [[0, 0], [1, 0], [0, 1], [1, 1]] }])
    expect(cuadrosDS('apiladas', 'abajo', 256, 384)).toHaveLength(1)
  })

  it('cubren toda la salida de cada disposición', () => {
    for (const d of ['lado', 'libro-derecha', 'libro-izquierda', 'grande'] as const) {
      const { ancho, alto } = tamanoSalida(d)
      const area = cuadrosDS(d, 'abajo', 256, 384).reduce((a, c) => a + (c.x1 - c.x0) * (c.y1 - c.y0), 0)
      expect(area).toBe(ancho * alto)
    }
  })

  it('la táctil cae donde dice aNucleo, también girada en «libro»', () => {
    for (const d of ['lado', 'libro-derecha', 'libro-izquierda', 'grande'] as const) {
      const { ancho, alto } = tamanoSalida(d)
      for (const [fx, fy] of [[0.9, 0.2], [0.6, 0.8], [0.3, 0.5], [0.1, 0.9]]) {
        const esperado = aNucleo(d, 'abajo', fx, fy)
        if (!esperado) continue
        const [u, v] = muestra(d, 'abajo', fx * ancho, fy * alto)
        expect(u).toBeCloseTo(esperado[0], 6)
        expect(v).toBeCloseTo(esperado[1], 6)
      }
    }
  })

  it('en «libro», la pantalla de arriba queda al otro lado de la táctil', () => {
    const [u1, v1] = muestra('libro-derecha', 'abajo', 96, 128)
    expect(v1).toBeLessThan(0.5)
    expect(u1).toBeCloseTo(0.5, 6)
    const [, v2] = muestra('libro-izquierda', 'abajo', 288, 128)
    expect(v2).toBeLessThan(0.5)
  })
})
