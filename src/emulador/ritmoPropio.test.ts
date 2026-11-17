import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Motor, PeticionFotogramas, ResultadoFotogramas } from './motor'
import { MS_SIN_PULSO, RitmoPropio } from './ritmoPropio'

/** Motor de mentira: cuenta los fotogramas que le piden y no pinta nada */
function motorDePrueba() {
  const peticiones: PeticionFotogramas[] = []
  const motor = {
    fotogramas(p: PeticionFotogramas): ResultadoFotogramas {
      peticiones.push(p)
      return { hechos: p.n, audio: new Int16Array(0), imagenes: null, rebobinado: [], msTrabajo: 1, msPintar: 0 }
    },
  } as unknown as Motor
  const total = () => peticiones.reduce((s, p) => s + p.n, 0)
  return { motor, peticiones, total }
}

const entrada = { mascara: 0, turbo: 0, correr: 0, extra: 0 }

describe('ritmo propio del hilo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('con el reloj, hace los fotogramas de la consola (60 por segundo)', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    vi.advanceTimersByTime(1000)
    expect(total()).toBeGreaterThanOrEqual(59)
    expect(total()).toBeLessThanOrEqual(61)
    expect(r.tomarMedida().pulsos).toBe(0)
    r.cerrar()
  })

  it('al pulso de la pantalla, solo los que manda la página, y el reloj no añade ninguno', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 59.73, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    const antes = total()
    // Un pulso por refresco de 60 Hz, durante un segundo
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(1000 / 60)
      r.pulso(1, 60 / 59.73)
    }
    // Lo que hizo el reloj antes del primer pulso, y después solo los 60 del pulso
    expect(total() - antes).toBeLessThanOrEqual(61)
    expect(total() - antes).toBeGreaterThanOrEqual(60)
    expect(r.tomarMedida().pulsos).toBe(60)
    r.cerrar()
  })

  it('sin pulsos, vuelve al reloj desde el último pulso', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000 / 60)
      r.pulso(1, 1)
    }
    const conPulso = total()
    // La página deja de mandar pulsos: tras el margen, el reloj sigue (unos 60 por segundo)
    vi.advanceTimersByTime(1000)
    const despues = total() - conPulso
    expect(despues).toBeGreaterThanOrEqual(60 - Math.ceil((MS_SIN_PULSO * 60) / 1000) - 1)
    expect(despues).toBeLessThanOrEqual(61)
    r.cerrar()
  })

  it('un pulso con demasiados fotogramas se recorta y lo demás se cuenta como perdido', () => {
    const { motor, peticiones } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    peticiones.length = 0
    r.pulso(10, 1)
    expect(peticiones.at(-1)?.n).toBe(4)
    expect(r.tomarMedida().perdidos).toBe(6)
    r.cerrar()
  })

  it('parado, los pulsos no hacen nada', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.pulso(1, 1)
    expect(total()).toBe(0)
  })
})
