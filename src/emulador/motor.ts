/**
 * El motor de una partida (v0.31.0): el núcleo, los fotogramas, los botones de cada fotograma (turbo y
 * correr fijo), el sonido, los estados para rebobinar y el dibujo. No usa nada que no haya en un hilo
 * aparte (ni la página, ni localStorage, ni IndexedDB): normalmente va en `motor.worker.ts`, y en el
 * hilo principal si el hilo no arranca. Lo demás (el ritmo, los botones de la pantalla, el sonido, el
 * guardado y el registro) lo lleva `Sesion` en el hilo principal.
 */
import type { NombreNucleo } from '../lib/sistemas'
import { mascaraConCorrer, mascaraConTurbo } from './mascaras'
import { Nucleo } from './nucleo'
import { aNucleo, type PantallasDS, type PrincipalDS } from './pantallasDS'
import { elegirPintor, Pintor2D, type Disposicion, type Imagenes, type Pintor, type PreferenciaPintor, type TipoPintor } from './pintor'

/** Cada cuántos fotogramas se guarda un estado para rebobinar (unos 6 por segundo) */
const FOTOGRAMAS_POR_ESTADO = 10

export interface ConfigMotor {
  nucleo: NombreNucleo
  opciones: Record<string, string>
  rom: ArrayBuffer
  extension: string
  partida?: { datos: ArrayBuffer; rtc?: ArrayBuffer }
  /** Estado donde se dejó, si se sigue desde ahí */
  estadoAuto?: ArrayBuffer
  conRebobinado: boolean
  disposicion: Disposicion
  pintor: PreferenciaPintor
}

export interface InfoMotor {
  fps: number
  frecuencia: number
  /** Partida tal como queda tras cargar (para saber después si ha cambiado) */
  partida: { datos: Uint8Array; rtc?: Uint8Array } | null
  tiempos: { nucleo: number; juego: number; estado: number }
  pintor: TipoPintor
  /** Lo que tardaba cada pintor al elegirlo, en ms por imagen */
  pintorMs?: Record<TipoPintor, number>
  imagenes: Imagenes | null
  /** Se ha cargado el estado donde se dejó */
  autoCargado: boolean
}

export interface PeticionFotogramas {
  n: number
  mascara: number
  turbo: number
  correr: number
  extra: number
}

export interface ResultadoFotogramas {
  hechos: number
  /** Sonido de todos los fotogramas, estéreo intercalado */
  audio: Int16Array
  imagenes: Imagenes | null
  rebobinado: { estado: Uint8Array; botones: number }[]
  /** Lo que ha tardado todo (fotogramas y dibujo) y solo el dibujo, en ms */
  msTrabajo: number
  msPintar: number
  /** Si el núcleo ha cambiado de ritmo o de frecuencia de sonido */
  tiempos?: { fps: number; frecuencia: number }
}

export class Motor {
  private readonly nucleo: Nucleo
  private pintor: Pintor
  private disposicion: Disposicion
  private readonly conRebobinado: boolean
  private fotogramaTurbo = 0
  private huecoCorrer = 0
  private basePrevia = 0
  private contadorFotogramas = 0
  private ultimaPartida: Uint8Array | null = null
  private antesDeCargar: Uint8Array | null = null
  private audio = new Int16Array(8192)

  private constructor(nucleo: Nucleo, pintor: Pintor, c: ConfigMotor) {
    this.nucleo = nucleo
    this.pintor = pintor
    this.disposicion = c.disposicion
    this.conRebobinado = c.conRebobinado
  }

  static async crear(c: ConfigMotor): Promise<{ motor: Motor; info: InfoMotor }> {
    let t = performance.now()
    const tiempos = { nucleo: 0, juego: 0, estado: 0 }
    const paso = (k: keyof typeof tiempos) => {
      const ahora = performance.now()
      tiempos[k] = Math.round(ahora - t)
      t = ahora
    }
    const nucleo = await Nucleo.cargar(c.nucleo, c.opciones)
    paso('nucleo')
    const partida = c.partida ? { datos: new Uint8Array(c.partida.datos), rtc: c.partida.rtc ? new Uint8Array(c.partida.rtc) : undefined } : undefined
    if (!nucleo.cargarJuego(new Uint8Array(c.rom), c.extension, partida)) {
      nucleo.descargar()
      throw new Error('El núcleo no ha podido abrir el juego.')
    }
    if (partida) nucleo.escribirPartida(partida.datos, partida.rtc)
    // El primer fotograma aplica la partida guardada; después se puede cargar el estado
    nucleo.fotograma()
    const { pintor, ms: pintorMs } = elegirPintor(c.pintor, nucleo.video())
    const motor = new Motor(nucleo, pintor, c)
    paso('juego')
    let autoCargado = false
    if (c.estadoAuto) {
      nucleo.cargarEstado(new Uint8Array(c.estadoAuto))
      autoCargado = true
    }
    paso('estado')
    motor.ultimaPartida = nucleo.leerPartida()?.datos ?? null
    return {
      motor,
      info: {
        fps: nucleo.fps,
        frecuencia: nucleo.frecuenciaAudio,
        partida: motor.ultimaPartida ? { datos: motor.ultimaPartida } : null,
        tiempos,
        pintor: motor.pintor.tipo,
        pintorMs,
        imagenes: motor.pintar(),
        autoCargado,
      },
    }
  }

  get tipoPintor(): TipoPintor {
    return this.pintor.tipo
  }

  /** Pinta el último fotograma del núcleo. Si la tarjeta gráfica falla, se sigue con el 2D. */
  private pintar(): Imagenes | null {
    const v = this.nucleo.video()
    if (!v) return null
    try {
      return this.pintor.pintar(v.datos, v.ancho, v.alto, this.disposicion)
    } catch {
      if (this.pintor.tipo === '2d') throw new Error('No se puede pintar la imagen')
      this.pintor = new Pintor2D()
      return this.pintor.pintar(v.datos, v.ancho, v.alto, this.disposicion)
    }
  }

  /** Ejecuta `n` fotogramas con los botones de ahora y pinta el último. */
  fotogramas(p: PeticionFotogramas): ResultadoFotogramas {
    const t0 = performance.now()
    // Correr fijo: al tocar el botón que está fijo, se suelta unos fotogramas para que el juego lo note
    if (p.correr && p.mascara & p.correr && !(this.basePrevia & p.correr)) this.huecoCorrer = 3
    this.basePrevia = p.mascara
    let hayImagen = false
    let muestras = 0
    const rebobinado: ResultadoFotogramas['rebobinado'] = []
    for (let i = 0; i < p.n; i++) {
      const enviada = mascaraConCorrer(mascaraConTurbo(p.mascara, p.turbo, this.fotogramaTurbo++), p.correr, this.huecoCorrer > 0) | p.extra
      if (this.huecoCorrer > 0) this.huecoCorrer--
      this.nucleo.botones(enviada)
      if (this.nucleo.fotograma()) hayImagen = true
      const a = this.nucleo.audio()
      if (muestras + a.length > this.audio.length) {
        const mayor = new Int16Array(Math.max(this.audio.length * 2, muestras + a.length))
        mayor.set(this.audio.subarray(0, muestras))
        this.audio = mayor
      }
      this.audio.set(a, muestras)
      muestras += a.length
      if (this.conRebobinado && ++this.contadorFotogramas % FOTOGRAMAS_POR_ESTADO === 0) {
        const estado = this.nucleo.guardarEstado()
        if (estado) rebobinado.push({ estado, botones: enviada })
      }
    }
    const t1 = performance.now()
    const imagenes = hayImagen ? this.pintar() : null
    const t2 = performance.now()
    const cambio = this.nucleo.avCambiado()
    return {
      hechos: p.n,
      audio: this.audio.slice(0, muestras),
      imagenes,
      rebobinado,
      msTrabajo: t2 - t0,
      msPintar: t2 - t1,
      tiempos: cambio ? { fps: this.nucleo.fps, frecuencia: this.nucleo.frecuenciaAudio } : undefined,
    }
  }

  /** La partida del juego, si ha cambiado desde la última vez que se pidió. */
  partidaSiCambia(): { datos: Uint8Array; rtc?: Uint8Array } | null {
    const actual = this.nucleo.leerPartida()
    if (!actual) return null
    const antes = this.ultimaPartida
    if (antes && antes.length === actual.datos.length && antes.every((b, i) => b === actual.datos[i])) return null
    this.ultimaPartida = actual.datos.slice()
    return actual
  }

  async guardarEstado(): Promise<{ datos: Uint8Array; captura?: ArrayBuffer } | null> {
    const datos = this.nucleo.guardarEstado()
    if (!datos) return null
    const v = this.nucleo.video()
    const captura = v ? await this.pintor.captura(v.datos, v.ancho, v.alto, this.disposicion) : undefined
    return { datos, captura }
  }

  cargarEstado(datos: Uint8Array): { ok: boolean; imagenes: Imagenes | null } {
    this.antesDeCargar = this.nucleo.guardarEstado()
    const ok = this.nucleo.cargarEstado(datos)
    return { ok, imagenes: this.pintar() }
  }

  /** Vuelve al momento de antes de la última carga de un estado. */
  deshacerCarga(): { ok: boolean; imagenes: Imagenes | null } {
    const antes = this.antesDeCargar
    if (!antes) return { ok: false, imagenes: null }
    this.antesDeCargar = null
    const ok = this.nucleo.cargarEstado(antes)
    return { ok, imagenes: this.pintar() }
  }

  /** Rebobinar: carga un estado anterior y hace un fotograma con los botones de entonces. */
  irA(estado: Uint8Array, botones: number): Imagenes | null {
    this.nucleo.cargarEstado(estado)
    this.nucleo.botones(botones)
    this.nucleo.fotograma()
    return this.pintar()
  }

  ponerDisposicion(d: Disposicion): Imagenes | null {
    this.disposicion = d
    return this.pintar()
  }

  /** Toque en la imagen que se ve, de 0 a 1 (o null al soltar). Fuera de la táctil, no toca. */
  puntero(x: number | null, y: number, pantallas: PantallasDS, principal: PrincipalDS): void {
    if (x === null) return this.nucleo.puntero(null)
    const p = aNucleo(pantallas, principal, x, y)
    this.nucleo.puntero(p ? p[0] : null, p ? p[1] : 0)
  }

  opcion(clave: string, valor: string): void {
    this.nucleo.opcion(clave, valor)
  }

  reiniciar(): void {
    this.nucleo.reiniciar()
  }

  descargar(): void {
    this.nucleo.descargar()
  }
}
