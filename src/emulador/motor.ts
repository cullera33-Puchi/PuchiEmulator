/**
 * El motor de una partida (v0.31.0): el núcleo, los fotogramas, los botones de cada fotograma (turbo y
 * correr fijo), el sonido, los estados para rebobinar y el dibujo. No usa nada que no haya en un hilo
 * aparte (ni la página, ni localStorage, ni IndexedDB): normalmente va en `motor.worker.ts`, y en el
 * hilo principal si el hilo no arranca. Lo demás (el ritmo, los botones de la pantalla, el sonido, el
 * guardado y el registro) lo lleva `Sesion` en el hilo principal.
 */
import type { Disco } from '../lib/discos'
import { ficherosDelDisco } from '../lib/discos'
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
  /** La ROM, para los cartuchos */
  rom?: ArrayBuffer
  /** El disco en los ficheros de la app, para la PlayStation (v0.37.0): el motor lo abre él mismo */
  disco?: Disco
  /** Ficheros para /sistema antes de cargar (la BIOS de PlayStation del usuario, v0.37.0) */
  sistema?: { nombre: string; datos: ArrayBuffer }[]
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
  /** Palanca analógica (Nintendo 64), de -1 a 1 en cada eje */
  palanca?: [number, number]
  /** No hace falta imagen (ahorrar batería con el ritmo propio): no se pinta (v0.36.0) */
  sinImagen?: boolean
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
  /** Nintendo 64: hay un fotograma nuevo en el lienzo de WebGL que aún no se ha enseñado */
  private glNuevo = false

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
    for (const f of c.sistema ?? []) nucleo.escribirSistema(f.nombre, new Uint8Array(f.datos))
    const cargado = c.disco ? nucleo.cargarDisco(await ficherosDelDisco(c.disco), c.disco.principal) : !!c.rom && nucleo.cargarJuego(new Uint8Array(c.rom), c.extension, partida)
    if (!cargado) {
      nucleo.descargar()
      throw new Error('El núcleo no ha podido abrir el juego.')
    }
    if (partida) nucleo.escribirPartida(partida.datos, partida.rtc)
    // El primer fotograma aplica la partida guardada; después se puede cargar el estado
    nucleo.fotograma()
    // Nintendo 64 dibuja en su propio lienzo: el pintor no se usa y no se gasta otro contexto de WebGL
    const { pintor, ms: pintorMs } = nucleo.lienzoGL ? { pintor: new Pintor2D(), ms: undefined } : elegirPintor(c.pintor, nucleo.video())
    const motor = new Motor(nucleo, pintor, c)
    motor.glNuevo = true
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
        pintor: motor.tipoPintor,
        pintorMs,
        imagenes: motor.pintar(),
        autoCargado,
      },
    }
  }

  /** Fotogramas por segundo y frecuencia del sonido del núcleo, ahora */
  get fps(): number {
    return this.nucleo.fps
  }

  get frecuencia(): number {
    return this.nucleo.frecuenciaAudio
  }

  get tipoPintor(): TipoPintor {
    return this.nucleo.lienzoGL ? 'webgl' : this.pintor.tipo
  }

  /** Un fotograma del núcleo; true si hay imagen nueva. */
  private fotograma(): boolean {
    const hay = this.nucleo.fotograma()
    if (hay) this.glNuevo = true
    return hay
  }

  /**
   * Pinta el último fotograma del núcleo. Si la tarjeta gráfica falla, se sigue con el 2D. En Nintendo
   * 64 la imagen ya está dibujada en el lienzo del núcleo: se entrega tal cual, una vez por fotograma.
   */
  private pintar(): Imagenes | null {
    const gl = this.nucleo.lienzoGL
    if (gl) {
      if (!this.glNuevo || !this.nucleo.imagenGL) return null
      this.glNuevo = false
      return { imagen: gl.transferToImageBitmap(), ancho: gl.width, alto: gl.height }
    }
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
    if (p.palanca) this.nucleo.palanca(p.palanca[0], p.palanca[1])
    let hayImagen = false
    let muestras = 0
    const rebobinado: ResultadoFotogramas['rebobinado'] = []
    for (let i = 0; i < p.n; i++) {
      const enviada = mascaraConCorrer(mascaraConTurbo(p.mascara, p.turbo, this.fotogramaTurbo++), p.correr, this.huecoCorrer > 0) | p.extra
      if (this.huecoCorrer > 0) this.huecoCorrer--
      this.nucleo.botones(enviada)
      if (this.fotograma()) hayImagen = true
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
    // Sin imagen pedida, en N64 la del lienzo se queda pendiente (glNuevo) para la próxima vez
    const imagenes = hayImagen && !p.sinImagen ? this.pintar() : null
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
    return { ok, imagenes: this.imagenTrasCargar() }
  }

  /**
   * Imagen del estado recién cargado. En Nintendo 64 la imagen no está en la memoria del núcleo: hay
   * que hacer un fotograma para que la dibuje (v0.36.0; si no, con el juego en pausa, se seguía viendo
   * la de antes).
   */
  private imagenTrasCargar(): Imagenes | null {
    if (this.nucleo.lienzoGL) this.fotograma()
    return this.pintar()
  }

  /** Vuelve al momento de antes de la última carga de un estado. */
  deshacerCarga(): { ok: boolean; imagenes: Imagenes | null } {
    const antes = this.antesDeCargar
    if (!antes) return { ok: false, imagenes: null }
    this.antesDeCargar = null
    const ok = this.nucleo.cargarEstado(antes)
    return { ok, imagenes: this.imagenTrasCargar() }
  }

  /** Rebobinar: carga un estado anterior y hace un fotograma con los botones de entonces. */
  irA(estado: Uint8Array, botones: number): Imagenes | null {
    this.nucleo.cargarEstado(estado)
    this.nucleo.botones(botones)
    this.fotograma()
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
