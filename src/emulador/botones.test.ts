import { describe, expect, it } from 'vitest'
import { bit, botonesDeMando, direccionCruceta } from './botones'

describe('direccionCruceta', () => {
  const grados = (g: number, r = 1): [number, number] => [Math.cos((g * Math.PI) / 180) * r, Math.sin((g * Math.PI) / 180) * r]
  const D = bit('DERECHA')
  const AB = bit('ABAJO')

  it('da las cuatro direcciones', () => {
    expect(direccionCruceta(1, 0)).toBe(D)
    expect(direccionCruceta(-1, 0)).toBe(bit('IZQUIERDA'))
    expect(direccionCruceta(0, -1)).toBe(bit('ARRIBA'))
    expect(direccionCruceta(0, 1)).toBe(AB)
  })

  it('da las diagonales', () => {
    expect(direccionCruceta(0.7, -0.7)).toBe(bit('ARRIBA') | D)
    expect(direccionCruceta(-0.7, 0.7)).toBe(AB | bit('IZQUIERDA'))
  })

  it('no pulsa nada en el centro', () => {
    expect(direccionCruceta(0.05, 0.05)).toBe(0)
    expect(direccionCruceta(...grados(0, 0.2))).toBe(0)
  })

  it('un pulgar torcido hasta 30 grados sigue siendo la dirección recta (antes, 22,5)', () => {
    expect(direccionCruceta(...grados(28))).toBe(D)
    expect(direccionCruceta(...grados(-28))).toBe(D)
    expect(direccionCruceta(...grados(32))).toBe(D | AB)
  })

  it('en la frontera no salta: lo pulsado aguanta 10 grados más', () => {
    // Pulsando a la derecha, a 36 grados sigue a la derecha; a 42 ya es la diagonal
    expect(direccionCruceta(...grados(36), D)).toBe(D)
    expect(direccionCruceta(...grados(42), D)).toBe(D | AB)
    // Y de vuelta desde la diagonal, a 24 grados sigue en diagonal
    expect(direccionCruceta(...grados(24), D | AB)).toBe(D | AB)
    expect(direccionCruceta(...grados(18), D | AB)).toBe(D)
  })

  it('el centro también tiene margen: se suelta al volver al 12 % del radio', () => {
    expect(direccionCruceta(...grados(0, 0.18))).toBe(0)
    expect(direccionCruceta(...grados(0, 0.18), D)).toBe(D)
    expect(direccionCruceta(...grados(0, 0.1), D)).toBe(0)
  })

  it('con cuatro direcciones no hay diagonales', () => {
    expect(direccionCruceta(...grados(44), 0, true)).toBe(D)
    expect(direccionCruceta(...grados(46), 0, true)).toBe(AB)
    expect(direccionCruceta(...grados(50), D, true)).toBe(D)
    expect(direccionCruceta(...grados(60), D, true)).toBe(AB)
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
