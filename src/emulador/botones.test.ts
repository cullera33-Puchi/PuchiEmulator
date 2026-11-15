import { describe, expect, it } from 'vitest'
import { bit, botonesDeMando, direccionCruceta } from './botones'

describe('direccionCruceta', () => {
  it('da las cuatro direcciones', () => {
    expect(direccionCruceta(1, 0)).toBe(bit('DERECHA'))
    expect(direccionCruceta(-1, 0)).toBe(bit('IZQUIERDA'))
    expect(direccionCruceta(0, -1)).toBe(bit('ARRIBA'))
    expect(direccionCruceta(0, 1)).toBe(bit('ABAJO'))
  })

  it('da las diagonales', () => {
    expect(direccionCruceta(0.7, -0.7)).toBe(bit('ARRIBA') | bit('DERECHA'))
    expect(direccionCruceta(-0.7, 0.7)).toBe(bit('ABAJO') | bit('IZQUIERDA'))
  })

  it('no pulsa nada en el centro', () => {
    expect(direccionCruceta(0.05, 0.05)).toBe(0)
  })

  it('un poco desviado sigue siendo la dirección recta', () => {
    expect(direccionCruceta(1, 0.3)).toBe(bit('DERECHA'))
  })
})

describe('botonesDeMando', () => {
  const mando = (pulsados: number[], ejes = [0, 0]) =>
    ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pulsados.includes(i) })), axes: ejes }) as unknown as Gamepad

  it('usa la distribución de Nintendo', () => {
    expect(botonesDeMando(mando([0]))).toBe(bit('B'))
    expect(botonesDeMando(mando([1]))).toBe(bit('A'))
    expect(botonesDeMando(mando([9, 12]))).toBe(bit('START') | bit('ARRIBA'))
  })

  it('lee la palanca izquierda como cruceta', () => {
    expect(botonesDeMando(mando([], [0.9, 0]))).toBe(bit('DERECHA'))
    expect(botonesDeMando(mando([], [0.2, 0]))).toBe(0)
  })
})
