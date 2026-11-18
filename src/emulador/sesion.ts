/**
 * Una partida en marcha: imagen, sonido, botones y guardado automático.
 *
 * - Desde la v0.31.0, el núcleo, los fotogramas y el dibujo van en el motor (`motor.ts`), en un hilo
 *   aparte si se puede (`conexion.ts`). Aquí, en el hilo principal, se queda el ritmo de la pantalla,
 *   los botones, el tiempo jugado, el sonido, el rebobinado y el guardado. Cada imagen vuelve del
 *   motor ya pintada y se dibuja en el lienzo en 2D (desde la v0.43.3; antes, `bitmaprenderer`).
 * - El ritmo va por tiempo, no por fotogramas de la pantalla: el iPhone puede refrescar a 60 o a
 *   120 Hz, o a 30 en modo de bajo consumo, y el juego tiene que ir siempre a su velocidad. Si el
 *   motor aún no ha terminado lo anterior, los fotogramas que tocan se suman al siguiente envío.
 * - La partida guardada del juego se escribe en el iPhone en cuanto cambia (se comprueba cada
 *   segundo), al pausar y al salir.
 * - Al salir o al pasar la app a segundo plano se guarda un estado «auto» para seguir donde se dejó.
 */
import { actualizarJuego, guardarEstado, guardarPartida, guardarSesionJuego, guardarSombreadores, leerEstado, leerJuego, leerPartida, leerRomGuardada, leerSombreadores, type Juego, type Ranura } from '../lib/almacen'
import { registrar } from '../lib/registro'
import { SISTEMAS } from '../lib/sistemas'
import { altavoz } from './audio'
import { bit, botonesDeMando, palancaDeMando } from './botones'
import type { EntradaRitmo, EventoRitmo } from './ritmoPropio'
import { Historial } from './historial'
import { limitarRecuperacion, planRitmo, Refresco, refrescosPasados } from './ritmo'
import { tocaPausar } from '../lib/sueno'
import { leerAjustes } from '../lib/ajustes'
import type { PantallasDS, PrincipalDS } from './pantallasDS'
import { abrirMotor, type ConexionMotor } from './conexion'
import type { Imagenes, PreferenciaPintor, TipoPintor } from './pintor'

const MAX_FOTOGRAMAS_SEGUIDOS = 4
/** Tipos de mando de libretro: el normal y el DualShock de PCSX ReARMed (subclase 1 del analógico) */
export const MANDO_NORMAL = 1
export const MANDO_DUALSHOCK = (2 << 8) | 5

/** Al rebobinar, un estado cada 50 ms: va unas tres veces más rápido que el juego */
const MS_POR_ESTADO_ATRAS = 50
/** El juego parece parado con la imagen sin cambiar este tiempo y estos botones pulsados (v0.43.3) */
export const MS_PARADO = 8000
export const TOQUES_PARADO = 6
/** Sin tocar ningún botón durante este tiempo, el reloj de tiempo jugado se para */
export const INACTIVIDAD_MS = 10 * 60_000
/** Cada cuánto se guarda el tiempo jugado mientras se juega */
const GUARDAR_TIEMPO_MS = 30_000

export interface OpcionesSesion {
  juego: Juego
  /** La ROM de un cartucho; los discos (PlayStation) los abre el motor desde los ficheros de la app */
  rom?: ArrayBuffer
  /** Tipo de mando del puerto 1, si no es el normal (PlayStation con palancas: DualShock, v0.38.0) */
  mando?: number
  /** Ficheros para el núcleo antes de cargar (la BIOS de PlayStation del usuario, v0.37.0) */
  sistema?: { nombre: string; datos: ArrayBuffer }[]
  lienzo: HTMLCanvasElement
  /** Seguir desde el estado «auto» si existe */
  reanudar: boolean
  /** Opciones del núcleo que dependen de los ajustes (por ejemplo, la paleta de Game Boy) */
  opciones?: Record<string, string>
  /** Disposición de las pantallas de DS al abrir */
  pantallas?: PantallasDS
  principal?: PrincipalDS
  alCambiarTamano?: (ancho: number, alto: number) => void
  alGuardar?: () => void
  /** Se ha pausado (y guardado) por llevar un rato sin tocar nada */
  alInactividad?: () => void
  /** El núcleo ha fallado: la sesión se para y ya no guarda nada (para no estropear la partida) */
  alFallar?: (mensaje: string) => void
}

/**
 * Marca de «cargando el punto donde se dejó». Se pone antes de cargarlo y se quita a los dos
 * segundos de juego o al cerrar bien. Si el punto está estropeado y tumba la página (no hay error
 * que recoger), la marca sigue ahí en la siguiente apertura y el juego se abre sin ese punto.
 */
const CLAVE_CARGA_AUTO = 'puchiemulator-cargando-auto'

export function cargaAutoFallida(juegoId: string): boolean {
  try {
    return localStorage.getItem(CLAVE_CARGA_AUTO) === juegoId
  } catch {
    return false
  }
}

function marcarCargaAuto(juegoId: string | null): void {
  try {
    if (juegoId) localStorage.setItem(CLAVE_CARGA_AUTO, juegoId)
    else localStorage.removeItem(CLAVE_CARGA_AUTO)
  } catch {
    // sin almacenamiento
  }
}

/** Contexto para enseñar las imágenes del motor: sin copiarlas si se puede; si no, en 2D. */
/** La imagen que se ve, en PNG, para la miniatura de un estado guardado. */
function capturaDelLienzo(lienzo: HTMLCanvasElement): Promise<ArrayBuffer | undefined> {
  return new Promise((resolver) => {
    try {
      lienzo.toBlob((b) => (b ? b.arrayBuffer().then(resolver, () => resolver(undefined)) : resolver(undefined)), 'image/png')
    } catch {
      resolver(undefined)
    }
  })
}

/**
 * Contexto para enseñar las imágenes del motor. En 2D desde la v0.43.3: `bitmaprenderer` las enseñaba
 * sin copiarlas, pero es una vía poco usada en Safari y la principal sospecha de la imagen que se quedaba
 * parada en el iPhone con el juego en marcha. Copiar una imagen de 256 x 224 cuesta muy poco.
 * `puchiemulator-pantalla` = `bitmap` en localStorage vuelve a la de antes (para probar).
 */
function contextoDe(lienzo: HTMLCanvasElement): ImageBitmapRenderingContext | CanvasRenderingContext2D | null {
  let antigua = false
  try {
    antigua = localStorage.getItem('puchiemulator-pantalla') === 'bitmap'
  } catch {
    // sin almacenamiento
  }
  if (antigua) return lienzo.getContext('bitmaprenderer') ?? lienzo.getContext('2d', { alpha: false })
  const c = lienzo.getContext('2d', { alpha: false })
  if (c) c.imageSmoothingEnabled = false
  return c ?? lienzo.getContext('bitmaprenderer')
}

function ensenar(c: ImageBitmapRenderingContext | CanvasRenderingContext2D, imagen: ImageBitmap): void {
  if ('transferFromImageBitmap' in c) return c.transferFromImageBitmap(imagen)
  // A la medida del lienzo: la miniatura de la DS es de 256 x 192 y la imagen, la misma
  c.drawImage(imagen, 0, 0, c.canvas.width, c.canvas.height)
  imagen.close()
}

/** Pintor: el más rápido en este aparato; «puchiemulator-pintor» en localStorage fuerza uno (para medir) */
function pintorElegido(): PreferenciaPintor {
  try {
    const v = localStorage.getItem('puchiemulator-pintor')
    return v === '2d' || v === 'webgl' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** Cada cuánto se guarda el punto donde se dejó mientras se juega: si algo falla, se pierde poco. */
export const MS_PUNTO_CONTROL = 5 * 60_000

/**
 * El cierre de la partida anterior (v0.36.0): guardar el estado de una N64 lleva un rato y, si se
 * abría otro juego mientras, el cierre de la anterior soltaba el hilo y el sonido del nuevo. La
 * siguiente apertura espera a que termine.
 */
let cierreEnCurso: Promise<void> = Promise.resolve()

export class Sesion {
  readonly altavoz = altavoz
  private motor!: ConexionMotor
  /** Donde se enseña la imagen: en 2D (v0.43.3) o, si se fuerza para probar, sin copiarla (`bitmaprenderer`) */
  private contexto!: ImageBitmapRenderingContext | CanvasRenderingContext2D
  private corriendo = false
  private peticion = 0
  private ultimo = 0
  private acumulado = 0
  /** Lo que tarda un fotograma en el motor (con el dibujo), media reciente en ms (v0.24.1) */
  private costeFotograma = 0
  private paso = 1000 / 60
  private frecuencia = 32768
  private botonesTactil = 0
  private botonesTeclado = 0
  /** Palancas de la pantalla (Nintendo 64, v0.32.0; PlayStation, la izquierda y la derecha, v0.38.0), de -1 a 1 */
  private palancaTactil: [[number, number], [number, number]] = [
    [0, 0],
    [0, 0],
  ]
  /** PlayStation con las palancas activadas (mando DualShock, v0.38.0) */
  private palancasPsx = false
  private readonly n64: boolean
  /**
   * Ritmo propio (v0.33.0 en Nintendo 64; desde la v0.41.0, todas las consolas con el motor en el hilo
   * y sin rebobinar): el hilo hace los fotogramas y manda las imágenes; aquí solo se le pasan los
   * botones en cuanto cambian y, si la consola va casi al ritmo de la pantalla, el pulso de cada refresco
   */
  private propio = false
  /** Al pulso de la pantalla (v0.41.0): todas salvo las de `relojHilo` (N64 y PlayStation) */
  private conPulso = false
  /** Pulso acumulado con «Ahorrar batería»: se manda cada unos 33 ms */
  private pulsoPendiente = 0
  private dtPulso = 0
  /** Última entrada mandada al hilo, para no repetirla */
  private entradaEnviada = ''
  /** Canal del sonido directo del hilo al procesador, si ya lo hay (su número, para soltar solo el suyo) */
  private canalSonido: number | null = null
  /** Última posición de la palanca vista (para contarla como actividad) */
  private ultimaPalanca = '0,0'
  /** Imágenes que han llegado del hilo (para dar por buena la carga del estado «auto») */
  private imagenesPropias = 0
  // Correr fijo (modo JRPG) y turbo: los aplica el motor en cada fotograma
  private correr = 0
  private turbo = 0
  /**
   * 30 imágenes por segundo (v0.28.0): solo se trabaja y se dibuja cuando han pasado unos 33 ms, por
   * tiempo y con los refrescos contados en todas las llamadas (v0.30.0).
   */
  private limite30 = false
  /** Lo que ha pedido el usuario (para este juego o para todos) y si la pantalla va a 30 o menos */
  private limiteUsuario = false
  private origenLimite: 'juego' | 'todos' = 'juego'
  private pantallaLenta = false
  /** Tiempo con avance rápido: en la medida en curso y en toda la partida (v0.42.0) */
  private msAvance = 0
  private msAvanceTotal = 0
  private dtPendiente = 0
  /** Fotogramas que tocan en modo sincronizado y aún no se han hecho (con el límite, de varias llamadas) */
  private debidos = 0
  /** Fotogramas que tocaban mientras el motor estaba ocupado: van en el siguiente envío (v0.31.0) */
  private porHacer = 0
  /** Hay una petición de fotogramas en el motor */
  private enVuelo = false
  /** Duración del ciclo de trabajo: un refresco (o los que lleve el plan) o, con el límite, unos 33 ms */
  private refrescoEfectivo = 0
  // Botones que pone la app y no el mando: soplar y la tapa de DS (v0.20.0)
  private extra = 0
  // Pantallas de DS (v0.17.0): disposición, cuál va grande y la miniatura
  private pantallas: PantallasDS = 'apiladas'
  private principal: PrincipalDS = 'abajo'
  private mini: ImageBitmapRenderingContext | CanvasRenderingContext2D | null = null
  private tamano = { ancho: 0, alto: 0 }
  // El núcleo ha fallado (memoria corrupta): desde ese momento no se guarda nada suyo
  private roto = false
  private cargaAutoPendiente = false
  // Punto de control: el estado «auto» se guarda también cada 5 minutos de juego (v0.14.0)
  private msDesdeControl = 0
  private fotogramasJugados = 0
  private temporizadorGuardado = 0
  /** Ficheros con la lista de sombreadores de la vez anterior al abrir (N64, para el registro) */
  sombreadoresAlAbrir = 0
  private guardando: Promise<void> = Promise.resolve()
  private cerrada = false
  private velocidad = 1
  private rebobinando = false
  private acumuladoAtras = 0
  private readonly historial = new Historial()
  /** Hay una petición de estado anterior en marcha (rebobinar va al ritmo al que responde el hilo) */
  private pidiendoAnterior = false
  private readonly refresco = new Refresco()
  private refrescos = 0
  // Medidas de rendimiento: se acumulan aunque se abra el menú (antes se perdían en cada pausa)
  private medida = { tiempo: 0, refrescos: 0, envios: 0, imagenes: 0, fotogramas: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, modo: '', mostradas: 0, entradas: 0, cambiosTamano: 0 }
  /** Tiempo jugado en esta sesión (sin pausas ni inactividad) */
  private msJugados = 0
  private inicioSesion = 0
  private ultimaActividad = 0
  private ultimaMascara = 0
  private idSesion: number | undefined
  private ultimoGuardadoTiempo = 0
  private guardandoTiempo: Promise<void> = Promise.resolve()

  private readonly o: OpcionesSesion

  /** Lo que ha tardado cada paso de la apertura, en ms (v0.28.0), para el registro */
  tiempos = { nucleo: 0, juego: 0, estado: 0 }
  /** Dónde va el motor y con qué se pinta (v0.31.0), para el registro */
  enHilo = false
  pintor: TipoPintor = '2d'
  pintorMs: Record<TipoPintor, number> | undefined
  motivoLocal: string | undefined

  private constructor(o: OpcionesSesion) {
    this.o = o
    this.n64 = !!SISTEMAS[o.juego.sistema].n64
    this.palancasPsx = !!SISTEMAS[o.juego.sistema].psx && o.mando === MANDO_DUALSHOCK
    this.pantallas = o.pantallas ?? 'apiladas'
    this.principal = o.principal ?? 'abajo'
  }

  static async iniciar(o: OpcionesSesion): Promise<Sesion> {
    // Como mucho 8 s: si el cierre anterior se queda colgado, el juego se abre igual
    await Promise.race([cierreEnCurso, new Promise((r) => setTimeout(r, 8000))])
    const s = new Sesion(o)
    try {
      await s.preparar()
    } catch (e) {
      // Si la apertura falla, no quedan sueltos el hilo del rebobinado, el motor ni el temporizador (v0.30.0)
      window.clearInterval(s.temporizadorGuardado)
      s.historial.cerrar()
      void s.motor?.descargar().catch(() => undefined)
      throw e
    }
    return s
  }

  get juego(): Juego {
    return this.o.juego
  }

  private async preparar(): Promise<void> {
    const { juego, lienzo } = this.o
    // La ROM va al hilo sin copiarse (v0.43.0) y aquí se queda vacía: si se vuelve a abrir (por ejemplo,
    // sin el punto donde se dejó), se lee otra vez
    const releerRom = () => leerRomGuardada(juego.id)
    const rom = this.o.rom && this.o.rom.byteLength === 0 ? await releerRom() : this.o.rom
    this.o.rom = undefined
    const info = SISTEMAS[juego.sistema]
    const contexto = contextoDe(lienzo)
    if (!contexto) throw new Error('Sin lienzo para la imagen.')
    this.contexto = contexto
    const partida = await leerPartida(juego.id)
    // Nintendo 64: la lista de sombreadores de la vez anterior, para prepararlos al abrir (v0.40.0)
    const sombreadores = info.n64 ? await leerSombreadores(juego.id).catch(() => undefined) : undefined
    this.sombreadoresAlAbrir = sombreadores?.length ?? 0
    const estadoAuto = this.o.reanudar ? await leerEstado(juego.id, 'auto') : undefined
    if (estadoAuto) marcarCargaAuto(juego.id)
    else if (cargaAutoFallida(juego.id)) marcarCargaAuto(null)
    // Rebobinar, desactivado salvo que se active en los ajustes (v0.37.3)
    const conRebobinado = info.rebobinado && leerAjustes().rebobinado
    const { conexion, info: m, motivoLocal } = await abrirMotor(
      {
        nucleo: info.nucleo,
        opciones: this.o.opciones ?? {},
        rom,
        disco: juego.disco,
        mando: this.o.mando,
        sistema: this.o.sistema,
        extension: info.extension,
        sombreadores,
        partida: partida ? { datos: partida.datos, rtc: partida.rtc } : undefined,
        estadoAuto: estadoAuto?.datos,
        conRebobinado,
        disposicion: { pantallas: this.pantallas, principal: this.principal, conMini: false },
        pintor: pintorElegido(),
      },
      leerAjustes().emulacionEnHilo !== false,
      releerRom,
    )
    this.motor = conexion
    this.enHilo = conexion.enHilo
    this.pintor = m.pintor
    this.pintorMs = m.pintorMs
    this.motivoLocal = motivoLocal
    this.tiempos = m.tiempos
    this.cargaAutoPendiente = m.autoCargado
    this.desdeAuto = m.autoCargado
    this.ponerTiempos(m.fps, m.frecuencia)
    this.mostrar(m.imagenes)
    // Ritmo propio (v0.33.0 en N64; v0.37.0, PlayStation; v0.41.0, todas): el hilo lleva el ritmo. Rebobinar
    // necesita que la página pida cada tanda (guarda los estados al volver): con él, como antes
    this.propio = !conRebobinado && !!conexion.ritmo
    this.conPulso = this.propio && !info.relojHilo
    conexion.ritmo?.alEvento(this.propio ? (e) => this.alEventoRitmo(e) : null)
    let segundos = 0
    this.temporizadorGuardado = window.setInterval(() => {
      void this.guardarPartidaSiCambia()
      if (this.n64 && ++segundos % 10 === 0) void this.guardarSombreadoresSiCambian()
    }, 1000)
  }

  private ponerTiempos(fps: number, frecuencia: number): void {
    this.paso = 1000 / (fps > 0 ? fps : 60)
    this.frecuencia = frecuencia || 32768
  }

  /** Enseña lo que ha pintado el motor; las imágenes que no se usan se sueltan. */
  private mostrar(imagenes: Imagenes | null): void {
    if (!imagenes) return
    if (this.cerrada) {
      imagenes.imagen.close()
      imagenes.mini?.close()
      return
    }
    const lienzo = this.o.lienzo
    this.medida.mostradas++
    if (this.tamano.ancho !== imagenes.ancho || this.tamano.alto !== imagenes.alto) {
      this.medida.cambiosTamano++
      this.tamano = { ancho: imagenes.ancho, alto: imagenes.alto }
      lienzo.width = imagenes.ancho
      lienzo.height = imagenes.alto
      // Cambiar el tamaño del lienzo deja el 2D como nuevo
      if ('imageSmoothingEnabled' in this.contexto) this.contexto.imageSmoothingEnabled = false
      this.o.alCambiarTamano?.(imagenes.ancho, imagenes.alto)
    }
    ensenar(this.contexto, imagenes.imagen)
    if (imagenes.mini) {
      if (this.mini) ensenar(this.mini, imagenes.mini)
      else imagenes.mini.close()
    }
  }

  /** Arranca o reanuda. Llamar dentro de un toque para que suene. */
  async jugar(sonido: boolean, sonarEnSilencio: boolean): Promise<void> {
    // Tampoco mientras se cierra (v0.43.2): el cierre guarda antes de darse por cerrada, y un toque en
    // «Seguir» en ese rato dejaba el bucle en marcha mandando pulsos al juego siguiente
    if (this.cerrada || this.roto || this.cierre) return
    this.altavoz.silenciar(!sonido)
    void this.altavoz.activar(sonarEnSilencio)
    if (this.corriendo) return
    this.corriendo = true
    this.ultimaActividad = Date.now()
    this.inicioSesion ||= Date.now()
    this.ultimo = performance.now()
    this.acumulado = 0
    this.dtPendiente = 0
    this.debidos = 0
    this.porHacer = 0
    this.peticion = requestAnimationFrame(this.bucle)
    if (this.propio) {
      this.entradaEnviada = ''
      this.motor.ritmo?.arrancar(this.entrada(), this.velocidad, this.limite30)
    }
  }

  /** Imagen nueva o fallo que manda el hilo en el ritmo propio. */
  private alEventoRitmo(e: EventoRitmo): void {
    if (e.evento === 'fallo') {
      this.fallar(new Error(e.mensaje))
      return
    }
    if (e.evento === 'tiempos') {
      this.ponerTiempos(e.fps, e.frecuencia)
      return
    }
    if (!this.corriendo || this.roto) {
      e.imagenes.imagen.close()
      e.imagenes.mini?.close()
      return
    }
    if (e.cambio) this.imagenCambiada()
    this.mostrar(e.imagenes)
    if (this.cargaAutoPendiente && ++this.imagenesPropias >= 120) {
      this.cargaAutoPendiente = false
      marcarCargaAuto(null)
    }
  }

  /** Botones de ahora para el hilo: los de la pantalla, el teclado y los mandos, y la palanca. */
  private entrada(): EntradaRitmo {
    return {
      mascara: this.botonesTactil | this.botonesTeclado | this.botonesMandos(),
      turbo: this.turbo,
      correr: this.correr,
      extra: this.extra,
      palanca: this.n64 || this.palancasPsx ? this.palanca(0) : undefined,
      palancaDer: this.palancasPsx ? this.palanca(1) : undefined,
    }
  }

  /** Ritmo propio: manda los botones al hilo si han cambiado (al tocar, y en cada refresco por los mandos). */
  private enviarEntrada(): void {
    if (!this.propio || !this.corriendo) return
    const e = this.entrada()
    const clave = `${e.mascara}|${e.turbo}|${e.correr}|${e.extra}|${e.palanca?.[0] ?? 0}|${e.palanca?.[1] ?? 0}|${e.palancaDer?.[0] ?? 0}|${e.palancaDer?.[1] ?? 0}`
    if (clave === this.entradaEnviada) return
    this.entradaEnviada = clave
    this.medida.entradas++
    this.motor.ritmo?.entrada(e)
  }

  /** El hilo hace los fotogramas a su ritmo (v0.33.0, Nintendo 64; v0.41.0, todas) */
  get ritmoPropio(): boolean {
    return this.propio
  }

  /** Con ritmo propio, al pulso de la pantalla cuando la consola va casi a su ritmo (v0.41.0) */
  get alPulso(): boolean {
    return this.conPulso
  }

  get enMarcha(): boolean {
    return this.corriendo
  }

  pausar(): void {
    if (!this.corriendo) return
    this.corriendo = false
    cancelAnimationFrame(this.peticion)
    if (this.propio) this.motor.ritmo?.parar()
    this.altavoz.pausar()
    void this.guardarTiempo()
  }

  /** Tiempo jugado en esta sesión, en ms. */
  get tiempoJugado(): number {
    return this.msJugados
  }

  /** Cuenta el tiempo jugado; true si ha pausado el juego por no tocar nada. */
  private contarTiempo(dt: number, mascara: number): boolean {
    const ahora = Date.now()
    if (mascara !== this.ultimaMascara) {
      // Cada botón que se pulsa con la imagen sin cambiar cuenta para ver si el juego se ha parado (v0.43.3)
      if (mascara & ~this.ultimaMascara) this.toquesSinCambio++
      this.ultimaMascara = mascara
      this.ultimaActividad = ahora
    }
    // Con el juego abierto pero sin tocarlo un buen rato (por ejemplo, el iPhone en la mesa), no cuenta
    if (ahora - this.ultimaActividad < INACTIVIDAD_MS) this.msJugados += dt
    if (ahora - this.ultimoGuardadoTiempo > GUARDAR_TIEMPO_MS) void this.guardarTiempo()
    // Te has dormido con el juego en marcha: se pausa y se guarda (v0.19.0)
    if (tocaPausar(leerAjustes().pausaSinTocar, this.ultimaActividad, ahora)) {
      registrar('info', 'Pausa por no tocar', { minutos: leerAjustes().pausaSinTocar })
      this.pausar()
      void this.guardarTodo()
      this.o.alInactividad?.()
      return true
    }
    return false
  }

  /** Guarda (o actualiza) la sesión de juego con el tiempo jugado hasta ahora. */
  guardarTiempo(): Promise<void> {
    if (this.msJugados < 1000 || !this.inicioSesion) return this.guardandoTiempo
    this.ultimoGuardadoTiempo = Date.now()
    const { juego } = this.o
    this.guardandoTiempo = this.guardandoTiempo
      .then(async () => {
        this.idSesion = await guardarSesionJuego({
          id: this.idSesion,
          juegoId: juego.id,
          nombre: juego.nombre,
          sistema: juego.sistema,
          inicio: this.inicioSesion,
          fin: Date.now(),
          ms: Math.round(this.msJugados),
        })
      })
      .catch((e) => registrar('error', 'No se pudo guardar el tiempo jugado', (e as Error)?.message))
    return this.guardandoTiempo
  }

  private bucle = (ahora: number) => {
    if (!this.corriendo || this.cerrada) return
    this.peticion = requestAnimationFrame(this.bucle)
    try {
      this.avanzar(ahora)
    } catch (e) {
      this.fallar(e)
    }
  }

  private avanzar(ahora: number): void {
    // Tras un parón largo (la app en segundo plano) no se intenta recuperar el tiempo perdido
    const dtPantalla = Math.min(ahora - this.ultimo, 250)
    this.ultimo = ahora
    this.refresco.medir(dtPantalla)
    // Ahorro automático (v0.42.0): la pantalla a 32 refrescos o menos (modo de bajo consumo); se quita
    // al volver a 45 o más. Con margen (v0.42.3): con 40 se encendía y apagaba cada segundo en la DS,
    // con la pantalla del iPhone entre 40 y 80
    const hz = this.refresco.ms ? 1000 / this.refresco.ms : 60
    const lenta = this.pantallaLenta ? hz < 45 : hz <= 32
    if (lenta !== this.pantallaLenta) {
      this.pantallaLenta = lenta
      registrar('info', 'Ahorro automático', { activo: lenta, pantallaHz: Math.round(1000 / (this.refresco.ms || 1000 / 60)) })
      this.aplicarLimite()
    }
    if (this.velocidad > 1) {
      this.msAvance += dtPantalla
      this.msAvanceTotal += dtPantalla
    }
    const mascara = this.botonesTactil | this.botonesTeclado | this.botonesMandos()
    // La palanca de un mando físico (N64) también cuenta como actividad (v0.36.0)
    if (this.n64 || this.palancasPsx) {
      const [px, py] = this.palanca(0)
      const [qx, qy] = this.palancasPsx ? this.palanca(1) : [0, 0]
      const firma = `${Math.round(px * 8)},${Math.round(py * 8)},${Math.round(qx * 8)},${Math.round(qy * 8)}`
      if (firma !== this.ultimaPalanca) {
        this.ultimaPalanca = firma
        if (px || py || qx || qy) this.ultimaActividad = Date.now()
      }
    }
    // Si se acaba de pausar por no tocar, no se hace nada más en este refresco (v0.30.0)
    if (this.contarTiempo(dtPantalla, mascara | (this.rebobinando ? 1 << 30 : 0) | (this.velocidad > 1 ? 1 << 29 : 0))) return
    if (this.propio) {
      this.avanzarPropio(dtPantalla)
      return
    }
    if (this.rebobinando) {
      this.irAtras(dtPantalla)
      return
    }
    // Cuántos fotogramas tocan: fijo si la consola va casi al ritmo de la pantalla (movimiento regular),
    // o por tiempo si no. Los refrescos se cuentan en todas las llamadas
    const plan = planRitmo(1000 / this.paso, this.refresco.ms)
    const sincronizado = plan.modo === 'sincronizado' && dtPantalla < this.refresco.ms * 4.5 && !this.refresco.atrasado
    if (sincronizado) {
      this.acumulado = 0
      // Si se ha perdido algún refresco, se cuentan también: el juego no se frena
      const antes = Math.floor(this.refrescos / plan.cadaRefrescos)
      this.refrescos += refrescosPasados(dtPantalla, this.refresco.ms)
      this.debidos += (Math.floor(this.refrescos / plan.cadaRefrescos) - antes) * plan.porRefresco
    } else {
      this.debidos = 0
    }
    // Con el límite de 30 imágenes por segundo, se trabaja cuando han pasado unos 33 ms (con medio
    // refresco de margen) y se hacen los fotogramas de todo ese tiempo: el juego va a su velocidad
    this.dtPendiente += dtPantalla
    const objetivo = this.limite30 && this.refresco.ms > 0 && this.refresco.ms < 1000 / 30 - 2 ? 1000 / 30 : 0
    if (objetivo && this.dtPendiente < objetivo - this.refresco.ms / 2) return
    const dt = Math.min(this.dtPendiente, 250)
    this.dtPendiente = 0
    const ciclo = Math.max(objetivo, this.refresco.ms * (sincronizado ? plan.cadaRefrescos : 1))
    this.refrescoEfectivo = ciclo

    let toca: number
    let normal: number
    // Lo rápido que va el juego de verdad: en sincronía con la pantalla, un poco más o menos que la
    // consola (por ejemplo, 60 Hz frente a 59,73 en GBA); el sonido se ajusta a eso desde el principio
    let ritmoReal = 1
    if (sincronizado) {
      normal = this.debidos > 0 ? Math.max(1, Math.round((ciclo / this.refresco.ms) * (plan.porRefresco / plan.cadaRefrescos))) : 0
      toca = Math.min(this.debidos, MAX_FOTOGRAMAS_SEGUIDOS) * this.velocidad
      this.debidos = 0
      ritmoReal = ((1000 / this.refresco.ms) * plan.porRefresco) / plan.cadaRefrescos / (1000 / this.paso)
    } else {
      this.acumulado += dt * this.velocidad
      toca = Math.min(Math.floor(this.acumulado / this.paso), MAX_FOTOGRAMAS_SEGUIDOS * this.velocidad)
      this.acumulado = toca === MAX_FOTOGRAMAS_SEGUIDOS * this.velocidad ? 0 : this.acumulado - toca * this.paso
      normal = Math.ceil(ciclo / this.paso)
    }

    this.msDesdeControl += dt
    if (this.msDesdeControl >= MS_PUNTO_CONTROL) {
      this.msDesdeControl = 0
      void this.guardarEstado('auto').then(
        (ok) => ok && registrar('info', 'Punto de control'),
        (e) => registrar('error', 'No se pudo guardar el punto de control', (e as Error)?.message),
      )
    }

    // Si el motor sigue con lo anterior, lo que toca se suma al siguiente envío
    this.porHacer = Math.min(this.porHacer + toca, MAX_FOTOGRAMAS_SEGUIDOS * this.velocidad * 2)
    this.medida.tiempo += dt
    this.medida.refrescos++
    this.medida.modo = plan.modo
    if (this.medida.tiempo >= (this.medidaCorta ? 10_000 : 30_000)) this.anotarRendimiento()
    if (this.enVuelo || this.porHacer === 0) return
    let n = Math.min(this.porHacer, MAX_FOTOGRAMAS_SEGUIDOS * this.velocidad)
    // No recuperar de golpe más de lo que cabe en un ciclo (v0.24.1)
    if (this.velocidad === 1) {
      const limitado = limitarRecuperacion(n, normal, this.costeFotograma, ciclo)
      if (!sincronizado && limitado < n) this.acumulado = Math.min(this.acumulado + (n - limitado) * this.paso, this.paso)
      n = limitado
    }
    this.porHacer = 0
    this.enviar(n, mascara, this.frecuencia * this.velocidad * ritmoReal)
  }

  /**
   * Ritmo propio: el refresco de la pantalla solo lleva lo de alrededor (los mandos físicos, el sonido
   * directo en cuanto Safari lo deja sonar, el punto de control y las medidas); los fotogramas los hace
   * el hilo a su ritmo.
   */
  private avanzarPropio(dt: number): void {
    this.enviarEntrada()
    if (this.conPulso) this.mandarPulso(dt)
    if (this.canalSonido === null && this.altavoz.activo) {
      const canal = this.altavoz.canalParaHilo()
      if (canal) {
        this.motor.ritmo?.sonido(canal.puerto, canal.frecuencia, canal.objetivo)
        this.canalSonido = canal.id
      }
    }
    this.msDesdeControl += dt
    if (this.msDesdeControl >= MS_PUNTO_CONTROL) {
      this.msDesdeControl = 0
      void this.guardarEstado('auto').then(
        (ok) => ok && registrar('info', 'Punto de control'),
        (e) => registrar('error', 'No se pudo guardar el punto de control', (e as Error)?.message),
      )
    }
    this.medida.tiempo += dt
    this.medida.refrescos++
    this.medida.modo = 'propio'
    if (this.medida.tiempo >= (this.medidaCorta ? 10_000 : 30_000)) this.anotarRendimiento()
  }

  /**
   * Pulso de la pantalla (v0.41.0): si la consola va casi a su ritmo, los fotogramas que tocan en este
   * refresco, contados como en el ritmo de la pantalla (`planRitmo`); si no, el hilo sigue con su reloj.
   * Con «Ahorrar batería», se juntan y se mandan cada unos 33 ms.
   */
  private mandarPulso(dt: number): void {
    const plan = planRitmo(1000 / this.paso, this.refresco.ms)
    // Sin pulso también si la pantalla acaba de subir de frecuencia y la medida aún no lo sabe (v0.43.2):
    // el hilo sigue con su reloj hasta que se ponga al día
    if (plan.modo !== 'sincronizado' || dt >= this.refresco.ms * 4.5 || this.refresco.atrasado) {
      this.pulsoPendiente = 0
      this.dtPulso = 0
      return
    }
    const antes = Math.floor(this.refrescos / plan.cadaRefrescos)
    this.refrescos += refrescosPasados(dt, this.refresco.ms)
    this.pulsoPendiente += (Math.floor(this.refrescos / plan.cadaRefrescos) - antes) * plan.porRefresco
    this.dtPulso += dt
    const objetivo = this.limite30 && this.refresco.ms > 0 && this.refresco.ms < 1000 / 30 - 2 ? 1000 / 30 : 0
    if (objetivo && this.dtPulso < objetivo - this.refresco.ms / 2) return
    this.dtPulso = 0
    if (this.pulsoPendiente <= 0) return
    const ritmoReal = ((1000 / this.refresco.ms) * plan.porRefresco) / plan.cadaRefrescos / (1000 / this.paso)
    this.motor.ritmo?.pulso(this.pulsoPendiente * this.velocidad, ritmoReal)
    this.pulsoPendiente = 0
  }

  /** Pide `n` fotogramas al motor y, al volver, enseña la imagen, suena y guarda lo de rebobinar. */
  private enviar(n: number, mascara: number, frecuenciaSonido: number): void {
    this.enVuelo = true
    this.motor.fotogramas({ n, mascara, turbo: this.turbo, correr: this.correr, extra: this.extra, palanca: this.n64 || this.palancasPsx ? this.palanca(0) : undefined, palancaDer: this.palancasPsx ? this.palanca(1) : undefined }).then(
      (r) => {
        this.enVuelo = false
        if (this.cerrada || this.roto) {
          r.imagenes?.imagen.close()
          r.imagenes?.mini?.close()
          return
        }
        if (r.distinta) this.imagenCambiada()
        this.mostrar(r.imagenes)
        // Si ya se ha pausado, el sonido de esos fotogramas no se pone en la cola
        if (this.corriendo && !this.rebobinando) this.altavoz.enviar(r.audio, frecuenciaSonido)
        for (const e of r.rebobinado) this.historial.guardar(e.estado, e.botones)
        if (r.tiempos) this.ponerTiempos(r.tiempos.fps, r.tiempos.frecuencia)
        if (r.hechos > 0 && this.velocidad === 1) {
          const coste = r.msTrabajo / r.hechos
          this.costeFotograma = this.costeFotograma ? this.costeFotograma * 0.9 + coste * 0.1 : coste
        }
        if (this.cargaAutoPendiente && (this.fotogramasJugados += r.hechos) >= 120) {
          this.cargaAutoPendiente = false
          marcarCargaAuto(null)
        }
        const m = this.medida
        m.envios++
        m.fotogramas += r.hechos
        m.trabajo += r.msTrabajo
        m.pintar += r.msPintar
        if (r.imagenes) m.imagenes++
        if (r.msTrabajo > m.maximo) m.maximo = r.msTrabajo
        if (r.msTrabajo > (this.refrescoEfectivo || 1000 / 60) * 0.8) m.largos++
      },
      (e) => {
        this.enVuelo = false
        this.fallar(e)
      },
    )
  }

  /** Anota ya la medida de rendimiento en curso, si hay algo (para enviar el registro desde el menú) */
  async medirAhora(): Promise<void> {
    if (this.medida.tiempo < 1000) return
    if (!this.propio) {
      this.anotarRendimiento()
      return
    }
    await this.anotarRendimientoPropio()
  }

  /**
   * La primera medida tras abrir el juego o cargar un estado, a los 10 s y no a los 30 (v0.43.1): si se
   * congela poco después, suele cerrarse antes de los 30 s y a veces a la fuerza, sin la medida del cierre
   */
  private medidaCorta = true

  private anotarRendimiento(): void {
    const m = this.medida
    if (m.refrescos === 0) return
    this.medidaCorta = false
    if (this.propio) {
      this.anotarRendimientoPropio()
      return
    }
    const presupuesto = this.refresco.ms || 1000 / 60
    registrar('info', 'Rendimiento', {
      sistema: this.o.juego.sistema,
      pantallaHz: Math.round(1000 / presupuesto),
      limite30: this.limite30,
      ahorro: this.ahorro,
      avanceSeg: Math.round(this.msAvance / 1000),
      hilo: this.enHilo,
      pintor: this.pintor,
      consolaHz: Math.round(100_000 / this.paso) / 100,
      ritmo: m.modo,
      segundos: Math.round(m.tiempo / 1000),
      // Lo que tarda cada envío al motor (fotogramas y dibujo) y solo el dibujo
      mediaMs: m.envios ? Math.round((m.trabajo / m.envios) * 10) / 10 : 0,
      pintarMs: m.envios ? Math.round((m.pintar / m.envios) * 100) / 100 : 0,
      maxMs: Math.round(m.maximo * 10) / 10,
      largos: m.largos,
      refrescos: m.refrescos,
      // Imágenes que se ven y fotogramas que avanza el juego, por segundo (v0.24.1)
      imagenesSeg: Math.round((m.imagenes / m.tiempo) * 10_000) / 10,
      juegoSeg: Math.round((m.fotogramas / m.tiempo) * 10_000) / 10,
    })
    this.medida = { tiempo: 0, refrescos: 0, envios: 0, imagenes: 0, fotogramas: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, modo: '', mostradas: 0, entradas: 0, cambiosTamano: 0 }
    this.msAvance = 0
  }

  /** Rendimiento del ritmo propio: lo mide el hilo; aquí, los refrescos de la página. */
  private anotarRendimientoPropio(): Promise<void> {
    const m = this.medida
    this.medida = { tiempo: 0, refrescos: 0, envios: 0, imagenes: 0, fotogramas: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, modo: '', mostradas: 0, entradas: 0, cambiosTamano: 0 }
    const avance = this.msAvance
    this.msAvance = 0
    const ritmo = this.motor.ritmo
    if (!ritmo) return Promise.resolve()
    const presupuesto = this.refresco.ms || 1000 / 60
    return ritmo.medida().then(
      (h) => {
        const seg = h.ms / 1000 || 1
        registrar('info', 'Rendimiento', {
          sistema: this.o.juego.sistema,
          ritmo: 'propio',
          pantallaHz: Math.round(1000 / presupuesto),
          limite30: this.limite30,
          ahorro: this.ahorro,
          avanceSeg: Math.round(avance / 1000),
          hilo: this.enHilo,
          pintor: this.pintor,
          consolaHz: Math.round(100_000 / this.paso) / 100,
          segundos: Math.round(seg),
          // Lo que tarda cada tanda de fotogramas en el hilo y solo el dibujo
          mediaMs: h.tandas ? Math.round((h.trabajo / h.tandas) * 10) / 10 : 0,
          msFotograma: h.fotogramas ? Math.round((h.trabajo / h.fotogramas) * 10) / 10 : 0,
          pintarMs: h.tandas ? Math.round((h.pintar / h.tandas) * 100) / 100 : 0,
          maxMs: Math.round(h.maximo * 10) / 10,
          largos: h.largos,
          parones: h.parones,
          // Fotogramas que tocaban y no se hicieron (el juego se frena)
          perdidos: h.perdidos,
          // Tandas al pulso de la pantalla; el resto, con el reloj del hilo (v0.41.0)
          pulsos: h.pulsos,
          tandas: h.tandas,
          refrescos: m.refrescos,
          refrescosSeg: Math.round((m.refrescos / (m.tiempo / 1000 || 1)) * 10) / 10,
          imagenesSeg: Math.round((h.imagenes / seg) * 10) / 10,
          juegoSeg: Math.round((h.fotogramas / seg) * 10) / 10,
          // Para ver qué se para si el juego se congela (v0.43.1): tandas con la imagen del núcleo
          // distinta y con sonido (en el hilo), y en la página las imágenes enseñadas, los cambios de
          // botones mandados al hilo, los cambios de tamaño de la imagen y el tamaño de ahora
          distintasSeg: Math.round((h.distintas / seg) * 10) / 10,
          sonidoSeg: Math.round((h.conSonido / seg) * 10) / 10,
          mostradasSeg: Math.round((m.mostradas / (m.tiempo / 1000 || 1)) * 10) / 10,
          entradas: m.entradas,
          cambiosTamano: m.cambiosTamano,
          tamano: `${this.tamano.ancho}x${this.tamano.alto}`,
        })
      },
      () => undefined,
    )
  }

  private irAtras(dt: number): void {
    this.acumuladoAtras += dt
    if (this.pidiendoAnterior || this.acumuladoAtras < MS_POR_ESTADO_ATRAS) return
    this.acumuladoAtras = Math.min(this.acumuladoAtras - MS_POR_ESTADO_ATRAS, MS_POR_ESTADO_ATRAS)
    this.pidiendoAnterior = true
    void this.historial
      .anterior()
      .then(async (anterior) => {
        if (!anterior || !this.rebobinando || this.cerrada) return
        // Un fotograma con los botones de entonces para tener la imagen de ese momento
        this.mostrar(await this.motor.irA(anterior.estado, anterior.botones))
      })
      .catch((e) => this.fallar(e))
      .finally(() => {
        this.pidiendoAnterior = false
      })
  }

  /** Rebobinar mientras se mantiene pulsado. */
  rebobinar(activo: boolean): void {
    if (activo === this.rebobinando) return
    this.rebobinando = activo
    this.acumuladoAtras = MS_POR_ESTADO_ATRAS
    this.acumulado = 0
    this.porHacer = 0
    this.altavoz.vaciar()
  }

  /** Avance rápido: 1 (normal), 2 o 4 veces más rápido. */
  ponerVelocidad(v: number): void {
    this.velocidad = v
    if (this.propio) this.motor.ritmo?.velocidad(v)
    this.acumulado = 0
    this.dtPendiente = 0
    this.debidos = 0
    this.porHacer = 0
    this.altavoz.vaciar()
  }

  /** Una palanca (0, la izquierda; 1, la derecha): la de la pantalla o, si está suelta, la de un mando físico. */
  private palanca(lado: 0 | 1 = 0): [number, number] {
    const t = this.palancaTactil[lado]
    if (t[0] || t[1]) return t
    try {
      for (const mando of navigator.getGamepads?.() ?? []) {
        if (!mando) continue
        const p = palancaDeMando(mando, lado)
        if (p[0] || p[1]) return p
      }
    } catch {
      // sin mandos
    }
    return [0, 0]
  }

  /** Palanca de la pantalla, de -1 a 1 en cada eje (la derecha, solo PlayStation con palancas). */
  ponerPalanca(x: number, y: number, lado: 0 | 1 = 0): void {
    this.palancaTactil[lado] = [x, y]
    // Soltarla (también al pasar a segundo plano) no cuenta como tocar
    if (x || y) this.ultimaActividad = Date.now()
    this.enviarEntrada()
  }

  private botonesMandos(): number {
    let m = 0
    try {
      for (const mando of navigator.getGamepads?.() ?? []) if (mando) m |= botonesDeMando(mando, this.n64, !!SISTEMAS[this.o.juego.sistema].psx, this.palancasPsx)
    } catch {
      // sin mandos
    }
    return m
  }

  /**
   * Disposición de las pantallas de DS: cómo se colocan, cuál va grande (en «grande») y el lienzo de
   * la miniatura. Se vuelve a pintar en el momento, aunque el juego esté en pausa.
   */
  ponerPantallas(pantallas: PantallasDS, principal: PrincipalDS, mini: HTMLCanvasElement | null): void {
    this.pantallas = pantallas
    this.principal = principal
    this.mini = mini ? contextoDe(mini) : null
    if (!this.motor || this.cerrada) return
    this.motor.ponerDisposicion({ pantallas, principal, conMini: !!this.mini }).then(
      (imagenes) => this.mostrar(imagenes),
      (e) => this.fallar(e),
    )
  }

  /** Toque en la imagen que se ve, de 0 a 1 (o null al soltar). Fuera de la táctil, no toca. */
  ponerPuntero(x: number | null, y = 0): void {
    // El lápiz también cuenta como actividad (en Hotel Dusk casi no se tocan botones)
    this.ultimaActividad = Date.now()
    void this.motor?.puntero(x, y, this.pantallas, this.principal).catch(() => undefined)
  }

  /** DS: soplar al micrófono (mientras se mantiene) o tener la tapa cerrada. */
  ponerExtra(boton: 'SOPLAR' | 'TAPA', activo: boolean): void {
    const b = bit(boton)
    this.extra = activo ? this.extra | b : this.extra & ~b
    this.ultimaActividad = Date.now()
    this.enviarEntrada()
  }

  /**
   * 30 imágenes por segundo (v0.28.0), por juego; desde la v0.42.0, también para todos los juegos desde
   * Ajustes (`origen` «todos»). Menos dibujo y menos refrescos de pantalla
   */
  ponerLimite30(activo: boolean, origen: 'juego' | 'todos' = 'juego'): void {
    this.limiteUsuario = activo
    this.origenLimite = origen
    this.aplicarLimite()
  }

  /**
   * El límite que vale: el del usuario o el automático (v0.42.0). Con la pantalla a 30 refrescos o
   * menos (el iPhone con el modo de bajo consumo, o caliente), dibujar más imágenes es trabajo que no
   * se ve
   */
  private aplicarLimite(): void {
    const activo = this.limiteUsuario || this.pantallaLenta
    if (activo === this.limite30) return
    this.limite30 = activo
    this.dtPendiente = 0
    if (this.propio) this.motor.ritmo?.limite30(activo)
  }

  /** Qué ahorro de batería hay para el registro (v0.42.0) */
  private get ahorro(): 'juego' | 'todos' | 'auto' | 'no' {
    return this.limiteUsuario ? this.origenLimite : this.pantallaLenta ? 'auto' : 'no'
  }

  /** Segundos de juego con avance rápido en esta partida (v0.42.0) */
  get segundosAvance(): number {
    return Math.round(this.msAvanceTotal / 1000)
  }

  /** Turbo: máscara de los botones con turbo (0, ninguno). */
  ponerTurbo(mascara: number): void {
    this.turbo = mascara
    this.enviarEntrada()
  }

  /** Correr fijo: máscara del botón que queda pulsado (0, ninguno). */
  ponerCorrer(mascara: number): void {
    this.correr = mascara
    this.enviarEntrada()
  }

  ponerBotonesTactil(mascara: number): void {
    this.botonesTactil = mascara
    this.enviarEntrada()
  }

  ponerBotonesTeclado(mascara: number): void {
    this.botonesTeclado = mascara
    this.enviarEntrada()
  }

  /** Guarda la partida del juego si ha cambiado desde la última vez. */
  guardarPartidaSiCambia(): Promise<void> {
    if (this.cerrada || this.roto || !this.motor) return this.guardando
    const id = this.o.juego.id
    this.guardando = this.guardando
      .then(async () => {
        if (this.cerrada || this.roto) return
        const actual = await this.motor.partidaSiCambia()
        // Si el núcleo ha fallado mientras tanto, lo que traiga no se guarda
        if (!actual || this.roto) return
        await guardarPartida({ id, datos: actual.datos.slice().buffer, rtc: actual.rtc?.slice().buffer, fecha: Date.now() })
        this.o.alGuardar?.()
      })
      .catch((e) => registrar('error', 'No se pudo guardar la partida', (e as Error)?.message))
    return this.guardando
  }

  /**
   * Nintendo 64 (v0.40.0): la lista de sombreadores que ha ido preparando el núcleo, por juego, para
   * prepararlos todos al abrir la próxima vez en lugar de en mitad de la partida (los parones)
   */
  guardarSombreadoresSiCambian(): Promise<void> {
    if (!this.n64 || this.cerrada || this.roto || !this.motor) return this.guardando
    const id = this.o.juego.id
    this.guardando = this.guardando
      .then(async () => {
        if (this.cerrada || this.roto) return
        const lista = await this.motor.sombreadoresSiCambian()
        if (!lista || this.roto) return
        await guardarSombreadores(id, lista.map((f) => ({ nombre: f.nombre, datos: f.datos.slice().buffer as ArrayBuffer })))
      })
      .catch((e) => registrar('aviso', 'No se pudo guardar la lista de sombreadores', (e as Error)?.message))
    return this.guardando
  }

  /**
   * El juego parece parado (v0.43.3): la imagen no cambia desde hace 8 segundos aunque se han pulsado
   * botones al menos 6 veces. Entonces no se guarda el punto donde se dejó: si se guardara, la próxima
   * vez se seguiría desde un juego parado. Se queda el anterior; la partida del juego se guarda igual.
   */
  get pareceParado(): boolean {
    return Date.now() - this.ultimoCambioImagen > MS_PARADO && this.toquesSinCambio >= TOQUES_PARADO
  }

  /** No se ha guardado el punto donde se dejó porque el juego parecía parado */
  autoDescartado = false

  private imagenCambiada(): void {
    this.ultimoCambioImagen = Date.now()
    this.toquesSinCambio = 0
  }

  private ultimoCambioImagen = Date.now()
  private toquesSinCambio = 0

  async guardarEstado(ranura: Ranura): Promise<boolean> {
    if (this.roto || this.cerrada || !this.motor) return false
    if (ranura === 'auto' && this.pareceParado) {
      if (!this.autoDescartado) {
        registrar('aviso', 'Punto donde se dejó sin guardar: el juego parecía parado', {
          sistema: this.o.juego.sistema,
          segundosSinCambio: Math.round((Date.now() - this.ultimoCambioImagen) / 1000),
          toques: this.toquesSinCambio,
        })
      }
      this.autoDescartado = true
      return false
    }
    const r = await this.motor.guardarEstado()
    if (!r || this.roto) return false
    // Nintendo 64: el motor no tiene la imagen (la dibuja el núcleo), se toma la que se ve. No en el
    // estado «auto», que no se enseña: al pasar a segundo plano, iOS da poco tiempo (v0.36.0)
    const captura = r.captura ?? (ranura === 'auto' ? undefined : await capturaDelLienzo(this.o.lienzo))
    // Llega del hilo con su propio búfer: no hace falta copiarlo (16 MB en N64)
    const datos = r.datos.byteOffset === 0 && r.datos.byteLength === r.datos.buffer.byteLength ? (r.datos.buffer as ArrayBuffer) : (r.datos.slice().buffer as ArrayBuffer)
    await guardarEstado({ id: this.o.juego.id, ranura, datos, fecha: Date.now(), captura })
    if (ranura === 'auto') this.autoGuardado = true
    return true
  }

  async cargarEstado(ranura: Ranura): Promise<boolean> {
    if (this.roto || this.cerrada || this.cierre || !this.motor) return false
    const estado = await leerEstado(this.o.juego.id, ranura)
    if (!estado) return false
    const r = await this.motor.cargarEstado(new Uint8Array(estado.datos))
    // El motor ya ha vuelto a como estaba (v0.43.0)
    if (!r.ok) registrar('aviso', 'El núcleo no ha aceptado el estado', { sistema: this.o.juego.sistema, ranura })
    else {
      this.imagenCambiada()
      registrar('info', 'Estado cargado', { sistema: this.o.juego.sistema, ranura, kb: Math.round(estado.datos.byteLength / 1024) })
      // Lo que se mida hasta ahora va a su línea, y la siguiente sale a los 10 s
      if (this.medida.tiempo >= 5000) this.anotarRendimiento()
      this.medidaCorta = true
    }
    this.altavoz.vaciar()
    if (this.propio) this.motor.ritmo?.vaciarSonido()
    this.porHacer = 0
    this.mostrar(r.imagenes)
    return r.ok
  }

  /** Vuelve al momento de antes de la última carga de un estado. */
  async deshacerCarga(): Promise<boolean> {
    // El aviso con «Deshacer» puede seguir en pantalla después de salir del juego (v0.43.2)
    if (this.roto || this.cerrada || this.cierre || !this.motor) return false
    const r = await this.motor.deshacerCarga()
    this.altavoz.vaciar()
    if (this.propio) this.motor.ritmo?.vaciarSonido()
    this.porHacer = 0
    this.mostrar(r.imagenes)
    return r.ok
  }

  /** Cambia una opción del núcleo con el juego en marcha. */
  opcion(clave: string, valor: string): void {
    void this.motor?.opcion(clave, valor).catch((e) => registrar('aviso', 'No se pudo cambiar una opción del núcleo', (e as Error)?.message))
  }

  reiniciar(): void {
    this.porHacer = 0
    this.motor.reiniciar().catch((e) => this.fallar(e))
    this.altavoz.vaciar()
    if (this.propio) this.motor.ritmo?.vaciarSonido()
  }

  /** Error dentro del núcleo: se para, se anota y no se vuelve a guardar nada de esta sesión. */
  /** Se abrió donde se dejó, y se ha guardado otro punto desde entonces (v0.43.0) */
  private desdeAuto = false
  private autoGuardado = false

  private fallar(e: unknown): void {
    if (this.roto || this.cerrada) return
    this.roto = true
    this.corriendo = false
    cancelAnimationFrame(this.peticion)
    if (this.propio) this.motor?.ritmo?.parar()
    clearInterval(this.temporizadorGuardado)
    this.altavoz.pausar()
    const mensaje = (e as Error)?.message ?? String(e)
    // Si se abrió donde se dejó y aún no se ha guardado otro punto, la próxima vez se abre sin él
    // (v0.43.0): si el fallo viene de ese punto, se repetiría cada vez que se siguiera desde ahí
    if (this.desdeAuto && !this.autoGuardado) marcarCargaAuto(this.o.juego.id)
    registrar('error', 'El emulador ha fallado; no se guarda nada después del fallo', { sistema: this.o.juego.sistema, hilo: this.enHilo, mensaje })
    this.o.alFallar?.(mensaje)
  }

  get fallida(): boolean {
    return this.roto
  }

  /** Activa o quita las palancas de PlayStation en marcha (v0.38.0): el mando pasa a DualShock o vuelve al normal. */
  async ponerPalancasPsx(activas: boolean): Promise<void> {
    if (!this.motor || this.cerrada || activas === this.palancasPsx) return
    this.palancasPsx = activas
    this.palancaTactil = [
      [0, 0],
      [0, 0],
    ]
    await this.motor.ponerMando(activas ? MANDO_DUALSHOCK : MANDO_NORMAL)
    this.enviarEntrada()
    registrar('info', 'Palancas de PlayStation', { activas })
  }

  /** Discos del juego (PlayStation, v0.38.0): cuántos y cuál está puesto */
  async discos(): Promise<{ total: number; actual: number }> {
    if (!this.motor || this.cerrada) return { total: 0, actual: 0 }
    return this.motor.discos()
  }

  /**
   * Cambia de disco, cuando el juego lo pide. Se recuerda en el juego: al volver a abrirlo (también
   * para seguir donde se dejó) se pone ese disco antes de arrancar.
   */
  async cambiarDisco(indice: number): Promise<boolean> {
    if (!this.motor || this.cerrada || this.roto) return false
    const ok = await this.motor.cambiarDisco(indice)
    const disco = this.o.juego.disco
    if (ok && disco) {
      this.o.juego = { ...this.o.juego, disco: { ...disco, actual: indice } }
      // Sobre la ficha de ahora (v0.43.2): la de esta sesión se leyó antes de apuntar «jugado hoy», y
      // guardarla tal cual deshacía la última vez jugado y el paso de «pendiente» a «jugando»
      const ficha = await leerJuego(this.o.juego.id)
      if (ficha?.disco) await actualizarJuego({ ...ficha, disco: { ...ficha.disco, actual: indice } })
    }
    registrar(ok ? 'info' : 'aviso', ok ? 'Disco cambiado' : 'No se pudo cambiar de disco', { disco: indice + 1 })
    return ok
  }

  /** Al pasar a segundo plano: partida y estado «auto» al iPhone. */
  async guardarTodo(): Promise<void> {
    if (this.cerrada) return
    await Promise.all([this.guardarPartidaSiCambia(), this.guardarSombreadoresSiCambian(), this.guardarEstado('auto').catch(() => false), this.guardarTiempo()])
  }

  cerrar(): Promise<void> {
    if (!this.cierre) {
      this.cierre = this.cerrarAhora()
      cierreEnCurso = this.cierre.catch(() => undefined)
    }
    return this.cierre
  }

  /** El cierre, una sola vez aunque se pida varias */
  private cierre: Promise<void> | null = null

  private async cerrarAhora(): Promise<void> {
    if (this.cerrada) return
    this.pausar()
    // Lo que quede de la última medida, si es una partida corta
    if (this.medida.tiempo >= 5000) this.anotarRendimiento()
    await this.guardarTodo()
    if (this.cargaAutoPendiente && !this.roto) marcarCargaAuto(null)
    this.cerrada = true
    clearInterval(this.temporizadorGuardado)
    this.historial.cerrar()
    if (this.canalSonido !== null) this.altavoz.soltarCanalHilo(this.canalSonido)
    await this.motor?.descargar().catch(() => undefined)
  }
}
