import { describe, expect, it } from 'vitest'
import { aNucleo, tamanoSalida } from './pantallasDS'

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

  it('grande y pequeña: solo es táctil la grande cuando es la de abajo', () => {
    cerca(aNucleo('grande', 'abajo', 0.5, 0.5), tactil(128, 96))
    expect(aNucleo('grande', 'arriba', 0.5, 0.5)).toBeNull()
  })
})
