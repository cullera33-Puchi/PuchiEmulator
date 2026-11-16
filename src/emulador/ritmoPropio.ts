/**
 * Ritmo propio (v0.33.0, de momento solo Nintendo 64): el hilo del motor hace los fotogramas a su
 * ritmo, con su reloj, sin esperar a que se los pida la página. Antes, cada tanda la pedía el refresco
 * de la pantalla (requestAnimationFrame) del hilo principal; con la N64, el iPhone lo bajaba a unas 25
 * veces por segundo con parones, y el juego daba tirones, el sonido se cortaba y los botones llegaban
 * tarde. Aquí:
 * - Los botones y la palanca llegan en cuanto cambian (`entrada`) y valen desde el fotograma siguiente.
 * - El sonido va directo del hilo al procesador de audio por su propio canal (`SonidoHilo`).
 * - Cada imagen nueva se manda a la página como evento; la página solo la enseña.
 */
import type { Motor, PeticionFotogramas } from './motor'
import type { Imagenes } from './pintor'
import { ControlRitmo, Remuestreador } from './remuestreo'

/** Botones de ahora: lo que la página manda en cuanto cambia */
export type EntradaRitmo = Omit<PeticionFotogramas, 'n'>

/** Lo que el hilo manda a la página por su cuenta */
export type EventoRitmo = { evento: 'imagen'; imagenes: Imagenes } | { evento: 'fallo'; mensaje: string }

/** Medidas para el registro, acumuladas desde la última vez que se pidieron */
export interface MedidaRitmo {
  ms: number
  tandas: number
  fotogramas: number
  imagenes: number
  trabajo: number
  pintar: number
  maximo: number
  largos: number
  /** Fotogramas que tocaban y no se han hecho porque el motor iba atrasado (el juego se frena) */
  perdidos: number
}

/** Como mucho, fotogramas seguidos para recuperar (por velocidad); lo que pase se pierde */
const MAX_SEGUIDOS = 4

/** El sonido del hilo, directo al procesador de audio (`public/procesador-audio.js`). */
export class SonidoHilo {
  private readonly ritmo: ControlRitmo
  private readonly remuestreo = new Remuestreador()
  private readonly puerto: MessagePort
  private readonly frecuenciaSalida: number

  constructor(puerto: MessagePort, frecuenciaSalida: number, objetivo: number) {
    this.puerto = puerto
    this.frecuenciaSalida = frecuenciaSalida
    this.ritmo = new ControlRitmo(frecuenciaSalida, objetivo)
    // El procesador avisa cada 50 ms de lo que le queda en la cola
    puerto.onmessage = (e) => this.ritmo.aviso(e.data as number, performance.now())
  }

  enviar(muestras: Int16Array, frecuencia: number): void {
    if (muestras.length === 0) return
    const paso = frecuencia / this.frecuenciaSalida / this.ritmo.siguiente(performance.now())
    const salida = this.remuestreo.procesar(muestras, paso)
    if (!salida.length) return
    this.ritmo.enviado(salida.length >> 1)
    this.puerto.postMessage({ tipo: 'muestras', muestras: salida }, [salida.buffer])
  }

  vaciar(): void {
    this.remuestreo.reiniciar()
    this.ritmo.reiniciar()
    this.puerto.postMessage({ tipo: 'vaciar' })
  }

  cerrar(): void {
    this.puerto.onmessage = null
    this.puerto.close()
  }
}

const medidaVacia = (): MedidaRitmo => ({ ms: 0, tandas: 0, fotogramas: 0, imagenes: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, perdidos: 0 })

export class RitmoPropio {
  private activo = false
  private temporizador: ReturnType<typeof setTimeout> | undefined
  /** Momento de referencia y fotogramas hechos desde él: lo que toca sale de aquí, sin acumular errores */
  private base = 0
  private hechos = 0
  private velocidad = 1
  private limite30 = false
  private ultimaImagen = 0
  private entrada: EntradaRitmo = { mascara: 0, turbo: 0, correr: 0, extra: 0 }
  private sonido: SonidoHilo | null = null
  private medida = medidaVacia()
  private inicioMedida = performance.now()

  private readonly motor: Motor
  private fps: number
  private frecuencia: number
  private readonly emitir: (e: EventoRitmo, transferir: Transferable[]) => void

  constructor(motor: Motor, fps: number, frecuencia: number, emitir: (e: EventoRitmo, transferir: Transferable[]) => void) {
    this.motor = motor
    this.fps = fps > 0 ? fps : 60
    this.frecuencia = frecuencia
    this.emitir = emitir
  }

  arrancar(entrada: EntradaRitmo, velocidad: number, limite30: boolean): void {
    this.entrada = entrada
    this.velocidad = velocidad
    this.limite30 = limite30
    this.reiniciarReloj()
    this.sonido?.vaciar()
    if (this.activo) return
    this.activo = true
    this.tick()
  }

  parar(): void {
    this.activo = false
    clearTimeout(this.temporizador)
    this.sonido?.vaciar()
  }

  ponerEntrada(entrada: EntradaRitmo): void {
    this.entrada = entrada
  }

  ponerVelocidad(v: number): void {
    this.velocidad = v
    this.reiniciarReloj()
    this.sonido?.vaciar()
  }

  ponerLimite30(activo: boolean): void {
    this.limite30 = activo
  }

  ponerSonido(sonido: SonidoHilo): void {
    this.sonido?.cerrar()
    this.sonido = sonido
  }

  /** Tras cargar un estado o reiniciar: el sonido de antes ya no vale y el reloj empieza de nuevo. */
  vaciarSonido(): void {
    this.reiniciarReloj()
    this.sonido?.vaciar()
  }

  /** Lo medido desde la última vez, y empieza otra medida. */
  tomarMedida(): MedidaRitmo {
    const m = { ...this.medida, ms: performance.now() - this.inicioMedida }
    this.medida = medidaVacia()
    this.inicioMedida = performance.now()
    return m
  }

  cerrar(): void {
    this.parar()
    this.sonido?.cerrar()
    this.sonido = null
  }

  private reiniciarReloj(): void {
    this.base = performance.now()
    this.hechos = 0
  }

  private readonly tick = (): void => {
    if (!this.activo) return
    const paso = 1000 / this.fps
    const ahora = performance.now()
    let toca = Math.floor(((ahora - this.base) * this.velocidad) / paso) - this.hechos
    const maximo = MAX_SEGUIDOS * this.velocidad
    if (toca > maximo) {
      // El motor no llega: se salta ese tiempo (el juego va más lento) en lugar de ir a trompicones
      this.medida.perdidos += toca - maximo
      this.hechos += toca - maximo
      toca = maximo
    }
    if (toca > 0) {
      try {
        this.hacer(toca, paso)
      } catch (e) {
        this.activo = false
        this.emitir({ evento: 'fallo', mensaje: (e as Error)?.message ?? String(e) }, [])
        return
      }
    }
    const siguiente = this.base + ((this.hechos + 1) * paso) / this.velocidad
    this.temporizador = setTimeout(this.tick, Math.max(0, siguiente - performance.now()))
  }

  private hacer(n: number, paso: number): void {
    const r = this.motor.fotogramas({ n, ...this.entrada })
    this.hechos += n
    if (r.tiempos) {
      this.fps = r.tiempos.fps > 0 ? r.tiempos.fps : this.fps
      this.frecuencia = r.tiempos.frecuencia || this.frecuencia
    }
    this.sonido?.enviar(r.audio, this.frecuencia * this.velocidad)
    const m = this.medida
    m.tandas++
    m.fotogramas += n
    m.trabajo += r.msTrabajo
    m.pintar += r.msPintar
    if (r.msTrabajo > m.maximo) m.maximo = r.msTrabajo
    if (r.msTrabajo > paso * 0.8) m.largos++
    if (!r.imagenes) return
    const ahora = performance.now()
    // Ahorrar batería: como mucho unas 30 imágenes por segundo (el juego sigue a su velocidad)
    if (this.limite30 && ahora - this.ultimaImagen < 1000 / 30 - 3) {
      r.imagenes.imagen.close()
      r.imagenes.mini?.close()
      return
    }
    this.ultimaImagen = ahora
    m.imagenes++
    const transferir: Transferable[] = [r.imagenes.imagen]
    if (r.imagenes.mini) transferir.push(r.imagenes.mini)
    this.emitir({ evento: 'imagen', imagenes: r.imagenes }, transferir)
  }
}
