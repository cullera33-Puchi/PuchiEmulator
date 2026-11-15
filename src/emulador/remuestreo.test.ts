import { describe, expect, it } from 'vitest'
import { ControlRitmo, factorRitmo, Remuestreador } from './remuestreo'

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
  it('genera más si la cola se vacía y menos si se llena, como mucho un 1 %', () => {
    expect(factorRitmo(0, 1000)).toBeCloseTo(1.01)
    expect(factorRitmo(1000, 1000)).toBe(1)
    expect(factorRitmo(5000, 1000)).toBeCloseTo(0.99)
  })
})

describe('ControlRitmo', () => {
  /**
   * Simulación de 20 s: el juego envía un bloque por refresco de 60 Hz con un 0,45 % más de muestras
   * de las que suenan (GBA sincronizada con la pantalla); el procesador consume a 48 kHz y avisa cada
   * 50 ms. El tono (el factor) no debe oscilar y la cola debe quedarse estable.
   */
  function simular(control: ControlRitmo, sobra: number) {
    const salida = 48000
    const objetivo = Math.round(salida * 0.07)
    let cola = 0
    const factores: number[] = []
    const colas: number[] = []
    let siguienteAviso = 50
    for (let t = 0; t < 20000; t += 1000 / 60) {
      // Lo que ha sonado desde el último bloque
      cola = Math.max(0, cola - (salida * (1000 / 60)) / 1000)
      if (t >= siguienteAviso) {
        control.aviso(cola, t)
        siguienteAviso += 50
      }
      const f = control.siguiente(t)
      const pares = ((salida / 60) * (1 + sobra)) / f
      cola += pares
      control.enviado(pares)
      if (t > 10000) {
        factores.push(f)
        colas.push(cola)
      }
    }
    return { objetivo, factores, colas }
  }

  it('estable: el tono apenas varía (menos de 0,02 %) y la cola no se desborda', () => {
    const { objetivo, factores, colas } = simular(new ControlRitmo(48000, Math.round(48000 * 0.07)), 0.0045)
    const variacion = Math.max(...factores) - Math.min(...factores)
    expect(variacion).toBeLessThan(0.0002)
    expect(Math.max(...colas)).toBeLessThan(objetivo * 2)
    expect(Math.min(...colas)).toBeGreaterThan(0)
  })

  it('estima la cola restando lo que ya ha sonado', () => {
    const c = new ControlRitmo(48000, 3360)
    c.aviso(3000, 1000)
    c.enviado(800)
    expect(c.estimado(1000 + 1000 / 60)).toBeCloseTo(3000)
  })
})
