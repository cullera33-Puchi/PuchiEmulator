import { describe, expect, it } from 'vitest'
import { factorRitmo, Remuestreador } from './remuestreo'

const estereo = (valores: number[]) => new Int16Array(valores.flatMap((v) => [v, -v]))

describe('Remuestreador', () => {
  it('con paso 1 devuelve las mismas muestras con un retraso de una', () => {
    const r = new Remuestreador()
    const s = r.procesar(estereo([16384, 16384, 16384]), 1)
    expect(s.length).toBe(6)
    expect(s[0]).toBe(0) // la anterior al primer bloque es silencio
    expect(s[2]).toBeCloseTo(0.5)
    expect(s[3]).toBeCloseTo(-0.5)
  })

  it('reduce a la mitad con paso 2 y no pierde muestras entre bloques', () => {
    const r = new Remuestreador()
    let total = 0
    for (let i = 0; i < 100; i++) total += r.procesar(estereo(new Array(1097).fill(1000)), 2).length / 2
    // 109.700 muestras de entrada son 54.850 de salida, con una de margen
    expect(Math.abs(total - 54850)).toBeLessThanOrEqual(1)
  })

  it('genera las muestras que tocan al pasar de 65.536 a 48.000 Hz', () => {
    const r = new Remuestreador()
    const paso = 65536 / 48000
    let total = 0
    for (let i = 0; i < 60; i++) total += r.procesar(estereo(new Array(1097).fill(0)), paso).length / 2
    expect(Math.abs(total - (60 * 1097) / paso)).toBeLessThanOrEqual(1)
  })

  it('interpola entre bloques sin saltos', () => {
    const r = new Remuestreador()
    r.procesar(estereo([0, 0, 0, 0]), 1)
    const s = r.procesar(estereo([32767, 32767]), 0.5)
    // Entre el 0 del bloque anterior y el máximo del nuevo hay un valor intermedio
    expect(s[0]).toBeCloseTo(0)
    expect(s[2]).toBeCloseTo(0.5, 1)
  })
})

describe('factorRitmo', () => {
  it('genera más si la cola se vacía y menos si se llena, como mucho un 0,5 %', () => {
    expect(factorRitmo(0, 1000)).toBeCloseTo(1.005)
    expect(factorRitmo(1000, 1000)).toBe(1)
    expect(factorRitmo(5000, 1000)).toBeCloseTo(0.995)
  })
})
