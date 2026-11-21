import { describe, expect, it } from 'vitest'
import { ControlRitmo, factorRitmo, leerAviso, objetivoCola, Remuestreador } from './remuestreo'

const estereo = (valores: number[]) => new Int16Array(valores.flatMap((v) => [v, -v]))

describe('Remuestreador', () => {
  /** Tono puro de `hz` a la frecuencia `entrada`, en bloques de `bloque` pares, remuestreado a `salida`. */
  function remuestrear(hz: number, entrada: number, salida: number, segundos: number, bloque = 547) {
    const r = new Remuestreador()
    const total = Math.round(entrada * segundos)
    const partes: Float32Array[] = []
    for (let n = 0; n < total; n += bloque) {
      const pares = Math.min(bloque, total - n)
      const b = new Int16Array(pares * 2)
      for (let i = 0; i < pares; i++) {
        const v = Math.round(Math.sin((2 * Math.PI * hz * (n + i)) / entrada) * 16000)
        b[i * 2] = v
        b[i * 2 + 1] = -v
      }
      partes.push(r.procesar(b, entrada / salida))
    }
    const todo = new Float32Array(partes.reduce((s, p) => s + p.length, 0))
    let k = 0
    for (const p of partes) {
      todo.set(p, k)
      k += p.length
    }
    return todo
  }

  /** Error frente al tono ideal, en dB respecto a la señal. */
  function errorDb(s: Float32Array, hz: number, entrada: number, salida: number): number {
    const retraso = 0
    let err = 0
    let sen = 0
    for (let k = 200; k < s.length / 2 - 200; k++) {
      const ideal = (Math.sin(2 * Math.PI * hz * (k / salida - retraso)) * 16000) / 32768
      err += (s[k * 2] - ideal) ** 2
      sen += ideal ** 2
    }
    return 10 * Math.log10(err / sen)
  }

  it('genera las muestras que tocan sin perder ninguna entre bloques', () => {
    for (const [entrada, salida] of [
      [32768, 48000],
      [65536, 48000],
      [32040, 44100],
    ]) {
      const s = remuestrear(440, entrada, salida, 2)
      // Las 8 últimas muestras de entrada esperan al bloque siguiente
      const enEspera = (8 * salida) / entrada
      expect(Math.abs(s.length / 2 - 2 * salida)).toBeLessThanOrEqual(enEspera + 2)
    }
  })

  it('un tono de 1 kHz de DS (32.768 Hz) a 48 kHz sale limpio: error por debajo de -60 dB', () => {
    expect(errorDb(remuestrear(1000, 32768, 48000, 1), 1000, 32768, 48000)).toBeLessThan(-60)
  })

  it('también los agudos (8 kHz), que con la interpolación lineal sonaban metálicos', () => {
    expect(errorDb(remuestrear(8000, 32768, 48000, 1), 8000, 32768, 48000)).toBeLessThan(-50)
  })

  it('da lo mismo un bloque grande que muchos pequeños', () => {
    const a = remuestrear(3000, 32768, 48000, 0.5, 100000)
    const b = remuestrear(3000, 32768, 48000, 0.5, 37)
    expect(b.length).toBe(a.length)
    let max = 0
    for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
    expect(max).toBeLessThan(1e-5)
  })

  it('en avance rápido (x4) atenúa lo que no cabe en la salida en lugar de convertirlo en ruido', () => {
    // 30 kHz a 131 kHz (DS x4) no cabe en 48 kHz: debe salir casi en silencio
    const s = remuestrear(30000, 32768 * 4, 48000, 0.5)
    let energia = 0
    for (let k = 100; k < s.length / 2; k++) energia += s[k * 2] ** 2
    const rms = Math.sqrt(energia / (s.length / 2 - 100))
    expect(rms).toBeLessThan(0.06) // la entrada tiene 0,35 de RMS (la lineal deja pasar casi todo)
  })

  it('el silencio sigue siendo silencio y la ganancia es 1', () => {
    const r = new Remuestreador()
    expect(Math.max(...r.procesar(new Int16Array(2000), 32768 / 48000).map(Math.abs))).toBe(0)
    const s = r.procesar(new Int16Array(2000).fill(16384), 32768 / 48000)
    expect(s[s.length - 2]).toBeCloseTo(0.5, 3)
    expect(s[s.length - 1]).toBeCloseTo(0.5, 3)
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

  it('con las muestras cada 33 ms (pantalla a 30 Hz), busca más cola; a 60 Hz, la de siempre (v0.49.0)', () => {
    const base = Math.round(48000 * 0.07)
    expect(objetivoCola(base, 1000 / 60, 48000)).toBe(base)
    expect(objetivoCola(base, 1000 / 30, 48000)).toBe(Math.round(48000 * (66.67 + 30) / 1000))
    expect(objetivoCola(base, 0, 48000)).toBe(base)
    const c = new ControlRitmo(48000, base)
    for (let t = 1000; t < 3000; t += 1000 / 30) c.siguiente(t)
    expect(c.objetivoActual).toBeGreaterThan(base * 1.3)
  })

  it('lee el aviso del procesador, el de antes (solo la cola) y el nuevo con los cortes (v0.49.0)', () => {
    expect(leerAviso(3000)).toEqual({ lleno: 3000, cortes: 0 })
    expect(leerAviso([2500, 2])).toEqual({ lleno: 2500, cortes: 2 })
  })

  it('tras reiniciar va a ritmo normal hasta el primer aviso', () => {
    const c = new ControlRitmo(48000, 3360)
    c.aviso(3000, 1000)
    c.siguiente(1000)
    c.reiniciar()
    // Sin aviso, la cola estimada sería 0 y el ritmo se iría a llenarla con un aviso viejo
    for (let t = 5000; t < 6000; t += 16) expect(c.siguiente(t)).toBe(1)
    c.aviso(3360, 6000)
    expect(c.siguiente(6016)).toBeCloseTo(1, 2)
  })
})
