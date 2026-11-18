/**
 * Ritmo propio (v0.33.0 en Nintendo 64; desde la v0.41.0, todas las consolas con el motor en el hilo):
 * el hilo del motor hace los fotogramas a su ritmo, sin esperar a que se los pida la página. Antes, cada tanda la pedía el refresco
 * de la pantalla (requestAnimationFrame) del hilo principal; con la N64, el iPhone lo bajaba a unas 25
 * veces por segundo con parones, y el juego daba tirones, el sonido se cortaba y los botones llegaban
 * tarde. Aquí:
 * - Los botones y la palanca llegan en cuanto cambian (`entrada`) y valen desde el fotograma siguiente.
 * - El sonido va directo del hilo al procesador de audio por su propio canal (`SonidoHilo`).
 * - Cada imagen nueva se manda a la página como evento; la página solo la enseña.
 *
 * Pulso de la pantalla (v0.41.0): en las consolas que van casi al ritmo de la pantalla (GBA a 59,73
 * imágenes por segundo en una de 60), la página manda en cada refresco cuántos fotogramas tocan
 * (`pulso`), como hacía antes con todo el trabajo. Así cada imagen cae en su refresco y el movimiento
 * es regular; con solo el reloj, cada pocos segundos se repetiría una imagen. El trabajo sigue en el
 * hilo y el pulso es un aviso sin respuesta. Si los pulsos dejan de llegar (la página va cargada), el
 * hilo sigue con su reloj. La N64 y la PlayStation van siempre con el reloj (`relojHilo`).
 */
import type { Motor, PeticionFotogramas } from './motor'
import type { Imagenes } from './pintor'
import { ControlRitmo, Remuestreador } from './remuestreo'

/** Botones de ahora: lo que la página manda en cuanto cambia */
export type EntradaRitmo = Omit<PeticionFotogramas, 'n'>

/** Lo que el hilo manda a la página por su cuenta */
export type EventoRitmo =
  | { evento: 'imagen'; imagenes: Imagenes }
  | { evento: 'fallo'; mensaje: string }
  /** La consola ha cambiado de ritmo (v0.43.0): la página cuenta los pulsos con él */
  | { evento: 'tiempos'; fps: number; frecuencia: number }

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
  /** Tandas de más de 50 ms: parones que se notan (N64 al preparar gráficos nuevos, v0.40.0) */
  parones: number
  /** Fotogramas que tocaban y no se han hecho porque el motor iba atrasado (el juego se frena) */
  perdidos: number
  /** Tandas hechas al pulso de la pantalla (v0.41.0); el resto, con el reloj del hilo */
  pulsos: number
  /** Tandas con la imagen del núcleo cambiada y con sonido (v0.43.1, para ver si el juego se para) */
  distintas: number
  conSonido: number
}

/** Una tanda que tarda más que esto se nota como un parón */
const MS_PARON = 50

/** Como mucho, fotogramas seguidos para recuperar (por velocidad); lo que pase se pierde */
const MAX_SEGUIDOS = 4

/** Sin pulso de la pantalla en este tiempo, el hilo vuelve a su reloj (v0.41.0) */
export const MS_SIN_PULSO = 100

/**
 * Imágenes mandadas a la página que aún no ha recibido (v0.43.0). Si la página se atasca (al girar el
 * iPhone, por ejemplo), el hilo deja de pintar en lugar de amontonar imágenes en la cola de mensajes:
 * a 60 por segundo, en unos segundos son cientos de megas e iOS cierra la app.
 */
export const MAX_IMAGENES_EN_VUELO = 2

/** Si la página no confirma ninguna imagen en este tiempo, se vuelve a probar con una (v0.43.0) */
const MS_SIN_CONFIRMAR = 1000

/** Hora común a la página y al hilo (cada uno tiene su propio origen de performance.now()) */
export const horaComun = (): number => performance.timeOrigin + performance.now()

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

const medidaVacia = (): MedidaRitmo => ({ ms: 0, tandas: 0, fotogramas: 0, imagenes: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, parones: 0, perdidos: 0, pulsos: 0, distintas: 0, conSonido: 0 })

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
  /** Tiempo con el bucle en marcha (v0.36.0): las pausas no cuentan en las medidas */
  private msActivos = 0
  private desdeActivo = 0
  /** Último pulso de la pantalla y cuánto más rápido va el juego con él (para el sonido) */
  private ultimoPulso = -Infinity
  private ritmoPulso = 1
  /** Imágenes mandadas que la página aún no ha confirmado, y cuándo se mandó la última (v0.43.0) */
  private enVuelo = 0
  private ultimaEnviada = 0
  /** El menor retraso visto de un pulso, de la página al hilo (v0.43.0) */
  private menorRetraso = Infinity

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
    this.enVuelo = 0
    this.menorRetraso = Infinity
    this.activo = true
    this.desdeActivo = performance.now()
    this.tick()
  }

  parar(): void {
    if (this.activo) this.msActivos += performance.now() - this.desdeActivo
    this.activo = false
    this.ultimoPulso = -Infinity
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

  /** La página ha recibido una imagen (v0.43.0) */
  imagenVista(): void {
    if (this.enVuelo > 0) this.enVuelo--
  }

  /**
   * Pulso de la pantalla (v0.41.0): `n` fotogramas, ya multiplicados por la velocidad, y lo rápido que
   * va el juego así frente a la consola (`ritmoReal`, por ejemplo 60 / 59,73), para el sonido.
   * `hora` (`horaComun`, v0.43.0): cuándo lo mandó la página. Si el hilo iba atrasado y los pulsos se
   * han amontonado en la cola, los viejos se descartan (el juego se frena un poco) y manda el reloj; si
   * no, se harían todos seguidos, con los botones y la pausa llegando cada vez más tarde.
   */
  pulso(n: number, ritmoReal: number, hora?: number): void {
    if (!this.activo) return
    if (hora !== undefined) {
      // Retraso del pulso frente al menor visto: así no importa si los relojes de la página y del hilo
      // no coinciden del todo. Los descartados no se cuentan aquí: si faltan, los pone el reloj
      const retraso = horaComun() - hora
      if (retraso < this.menorRetraso) this.menorRetraso = retraso
      if (retraso - this.menorRetraso > MS_SIN_PULSO) return
    }
    this.ultimoPulso = performance.now()
    this.ritmoPulso = ritmoReal > 0 ? ritmoReal : 1
    const maximo = MAX_SEGUIDOS * this.velocidad
    if (n > maximo) this.medida.perdidos += n - maximo
    const toca = Math.min(n, maximo)
    if (toca <= 0) return
    try {
      this.hacer(toca, 1000 / this.fps, true)
    } catch (e) {
      this.activo = false
      clearTimeout(this.temporizador)
      this.emitir({ evento: 'fallo', mensaje: (e as Error)?.message ?? String(e) }, [])
    }
  }

  /** Tras cargar un estado o reiniciar: el sonido de antes ya no vale y el reloj empieza de nuevo. */
  vaciarSonido(): void {
    this.reiniciarReloj()
    this.sonido?.vaciar()
  }

  /** Lo medido desde la última vez, y empieza otra medida. */
  tomarMedida(): MedidaRitmo {
    const ahora = performance.now()
    const ms = this.msActivos + (this.activo ? ahora - this.desdeActivo : 0)
    const m = { ...this.medida, ms }
    this.medida = medidaVacia()
    this.msActivos = 0
    this.desdeActivo = ahora
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
    // La pantalla marca el ritmo: el reloj solo vigila. Si deja de marcarlo, sigue desde el último pulso
    if (ahora - this.ultimoPulso < MS_SIN_PULSO) {
      this.base = this.ultimoPulso
      this.hechos = 0
      this.temporizador = setTimeout(this.tick, MS_SIN_PULSO / 2)
      return
    }
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
        this.hacer(toca, paso, false)
      } catch (e) {
        this.activo = false
        this.emitir({ evento: 'fallo', mensaje: (e as Error)?.message ?? String(e) }, [])
        return
      }
    }
    const siguiente = this.base + ((this.hechos + 1) * paso) / this.velocidad
    this.temporizador = setTimeout(this.tick, Math.max(0, siguiente - performance.now()))
  }

  private hacer(n: number, paso: number, porPulso: boolean): void {
    // Ahorrar batería: si aún no toca imagen, no se pinta ni se saca del lienzo (v0.36.0). Tampoco si la
    // página no ha recibido las anteriores (v0.43.0); si en un segundo no confirma ninguna, se prueba otra
    const ahora = performance.now()
    if (this.enVuelo >= MAX_IMAGENES_EN_VUELO && ahora - this.ultimaEnviada > MS_SIN_CONFIRMAR) this.enVuelo = MAX_IMAGENES_EN_VUELO - 1
    // Al pulso, la página ya junta los fotogramas cada unos 33 ms con el ahorro: aquí no se vuelve a
    // mirar el tiempo, que con unos milisegundos de retraso del mensaje se saltaba una imagen (v0.43.0)
    const quiereImagen = this.enVuelo < MAX_IMAGENES_EN_VUELO && (!this.limite30 || porPulso || ahora - this.ultimaImagen >= 1000 / 30 - 3)
    const r = this.motor.fotogramas({ n, ...this.entrada, sinImagen: !quiereImagen })
    this.hechos += n
    if (r.tiempos) {
      const fps = r.tiempos.fps > 0 ? r.tiempos.fps : this.fps
      // Con otro ritmo de la consola, el reloj empieza de nuevo: si no, lo que toca saldría mal (v0.36.0)
      const cambia = fps !== this.fps || (r.tiempos.frecuencia || this.frecuencia) !== this.frecuencia
      if (fps !== this.fps) this.reiniciarReloj()
      this.fps = fps
      this.frecuencia = r.tiempos.frecuencia || this.frecuencia
      if (cambia) this.emitir({ evento: 'tiempos', fps: this.fps, frecuencia: this.frecuencia }, [])
    }
    this.sonido?.enviar(r.audio, this.frecuencia * this.velocidad * (porPulso ? this.ritmoPulso : 1))
    const m = this.medida
    m.tandas++
    if (porPulso) m.pulsos++
    if (r.distinta) m.distintas++
    if (r.conSonido) m.conSonido++
    m.fotogramas += n
    m.trabajo += r.msTrabajo
    m.pintar += r.msPintar
    if (r.msTrabajo > m.maximo) m.maximo = r.msTrabajo
    if (r.msTrabajo > paso * 0.8) m.largos++
    if (r.msTrabajo > MS_PARON) m.parones++
    if (!r.imagenes) return
    this.ultimaImagen = performance.now()
    this.ultimaEnviada = this.ultimaImagen
    this.enVuelo++
    m.imagenes++
    const transferir: Transferable[] = [r.imagenes.imagen]
    if (r.imagenes.mini) transferir.push(r.imagenes.mini)
    this.emitir({ evento: 'imagen', imagenes: r.imagenes }, transferir)
  }
}
