import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Motor, PeticionFotogramas, ResultadoFotogramas } from './motor'
import { horaComun, MAX_IMAGENES_EN_VUELO, MS_SIN_PULSO, RitmoPropio } from './ritmoPropio'

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

  it('con avance rápido, no pide sonido ni lo manda; al volver a normal, sí (v0.46.0)', () => {
    const { motor, peticiones } = motorDePrueba()
    const enviar = vi.fn()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.ponerSonido({ enviar, vaciar: vi.fn(), cerrar: vi.fn() } as unknown as Parameters<RitmoPropio['ponerSonido']>[0])
    r.arrancar(entrada, 2, false)
    vi.advanceTimersByTime(500)
    expect(peticiones.length).toBeGreaterThan(0)
    expect(peticiones.every((p) => p.sinSonido)).toBe(true)
    expect(enviar).not.toHaveBeenCalled()
    peticiones.length = 0
    r.ponerVelocidad(1)
    vi.advanceTimersByTime(500)
    expect(peticiones.some((p) => !p.sinSonido)).toBe(true)
    expect(enviar).toHaveBeenCalled()
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

  it('los pulsos viejos (amontonados en la cola mientras el hilo iba atrasado) se descartan (v0.43.0)', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    // El primero marca el retraso normal (aquí, con los relojes desfasados 500 ms: no importa)
    r.pulso(1, 1, horaComun() - 500)
    const antes = total()
    r.pulso(1, 1, horaComun() - 500 - MS_SIN_PULSO - 50)
    r.pulso(1, 1, horaComun() - 500 - MS_SIN_PULSO - 30)
    expect(total()).toBe(antes)
    r.pulso(1, 1, horaComun() - 500)
    expect(total()).toBe(antes + 1)
    r.cerrar()
  })

  it('sin confirmar las imágenes, deja de pintar y sigue el juego; al confirmar, vuelve a pintar (v0.43.0)', () => {
    const pedidas: boolean[] = []
    const motor = {
      fotogramas(p: PeticionFotogramas): ResultadoFotogramas {
        pedidas.push(!p.sinImagen)
        const imagenes = p.sinImagen ? null : { imagen: { close() {} } as unknown as ImageBitmap, ancho: 1, alto: 1 }
        return { hechos: p.n, audio: new Int16Array(0), imagenes, rebobinado: [], msTrabajo: 1, msPintar: 0 }
      },
    } as unknown as Motor
    let recibidas = 0
    const r = new RitmoPropio(motor, 60, 48000, (e) => e.evento === 'imagen' && recibidas++)
    r.arrancar(entrada, 1, false)
    for (let i = 0; i < 10; i++) r.pulso(1, 1, horaComun())
    expect(recibidas).toBe(MAX_IMAGENES_EN_VUELO)
    expect(pedidas.length).toBe(10)
    r.imagenVista()
    r.pulso(1, 1, horaComun())
    expect(recibidas).toBe(MAX_IMAGENES_EN_VUELO + 1)
    // Si la página no contesta en un segundo, se prueba con otra (el reloj sigue, sin pulsos): una por segundo
    const antes = recibidas
    vi.advanceTimersByTime(1100)
    expect(recibidas).toBe(antes + 1)
    r.cerrar()
  })

  it('si la página se salta varios refrescos, el reloj sigue enseguida y no se pierde ningún fotograma (v0.49.0)', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(1000 / 60)
      r.pulso(1, 1)
    }
    const antes = total()
    // Cinco refrescos sin pulso (83 ms): la página no los cuenta y sigue con uno
    vi.advanceTimersByTime((1000 / 60) * 6)
    r.pulso(1, 1)
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(1000 / 60)
      r.pulso(1, 1)
    }
    // 36 refrescos en total, uno arriba o abajo; antes se perdían los cinco
    expect(total() - antes).toBeGreaterThanOrEqual(35)
    expect(total() - antes).toBeLessThanOrEqual(37)
    const m = r.tomarMedida()
    expect(m.relevos).toBe(1)
    expect(m.perdidos).toBe(0)
    r.cerrar()
  })

  it('los pulsos que llegan tarde, después de que el reloj haya seguido, no se hacen dos veces (v0.49.0)', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(1000 / 60)
      r.pulso(1, 1)
    }
    const antes = total()
    // Tres refrescos cuyos pulsos llegan juntos, tarde: el reloj ya ha hecho esos fotogramas
    vi.advanceTimersByTime(50)
    const delReloj = total() - antes
    expect(delReloj).toBeGreaterThanOrEqual(2)
    r.pulso(1, 1)
    r.pulso(1, 1)
    r.pulso(1, 1)
    expect(total() - antes).toBe(Math.max(delReloj, 3))
    r.cerrar()
  })

  it('con un núcleo que va sobrado, recupera más de 4 fotogramas seguidos sin perderlos (v0.49.0)', () => {
    const { motor, peticiones } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.arrancar(entrada, 1, false)
    // Unos cuantos pulsos para medir lo que tarda: 1 ms por fotograma
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000 / 60)
      r.pulso(1, 1)
    }
    r.tomarMedida()
    r.pulso(8, 1)
    expect(peticiones.at(-1)?.n).toBe(8)
    expect(r.tomarMedida().perdidos).toBe(0)
    r.cerrar()
  })

  it('parado, los pulsos no hacen nada', () => {
    const { motor, total } = motorDePrueba()
    const r = new RitmoPropio(motor, 60, 48000, () => undefined)
    r.pulso(1, 1)
    expect(total()).toBe(0)
  })
})
