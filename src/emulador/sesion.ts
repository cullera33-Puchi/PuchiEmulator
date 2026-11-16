/**
 * Una partida en marcha: imagen, sonido, botones y guardado automático.
 *
 * - Desde la v0.31.0, el núcleo, los fotogramas y el dibujo van en el motor (`motor.ts`), en un hilo
 *   aparte si se puede (`conexion.ts`). Aquí, en el hilo principal, se queda el ritmo de la pantalla,
 *   los botones, el tiempo jugado, el sonido, el rebobinado y el guardado. Cada imagen vuelve del
 *   motor ya pintada y se enseña sin copiarla (`bitmaprenderer`).
 * - El ritmo va por tiempo, no por fotogramas de la pantalla: el iPhone puede refrescar a 60 o a
 *   120 Hz, o a 30 en modo de bajo consumo, y el juego tiene que ir siempre a su velocidad. Si el
 *   motor aún no ha terminado lo anterior, los fotogramas que tocan se suman al siguiente envío.
 * - La partida guardada del juego se escribe en el iPhone en cuanto cambia (se comprueba cada
 *   segundo), al pausar y al salir.
 * - Al salir o al pasar la app a segundo plano se guarda un estado «auto» para seguir donde se dejó.
 */
import { guardarEstado, guardarPartida, guardarSesionJuego, leerEstado, leerPartida, type Juego, type Ranura } from '../lib/almacen'
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
/** Al rebobinar, un estado cada 50 ms: va unas tres veces más rápido que el juego */
const MS_POR_ESTADO_ATRAS = 50
/** Sin tocar ningún botón durante este tiempo, el reloj de tiempo jugado se para */
export const INACTIVIDAD_MS = 10 * 60_000
/** Cada cuánto se guarda el tiempo jugado mientras se juega */
const GUARDAR_TIEMPO_MS = 30_000

export interface OpcionesSesion {
  juego: Juego
  rom: ArrayBuffer
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

function contextoDe(lienzo: HTMLCanvasElement): ImageBitmapRenderingContext | CanvasRenderingContext2D | null {
  return lienzo.getContext('bitmaprenderer') ?? lienzo.getContext('2d', { alpha: false })
}

function ensenar(c: ImageBitmapRenderingContext | CanvasRenderingContext2D, imagen: ImageBitmap): void {
  if ('transferFromImageBitmap' in c) return c.transferFromImageBitmap(imagen)
  c.drawImage(imagen, 0, 0)
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

export class Sesion {
  readonly altavoz = altavoz
  private motor!: ConexionMotor
  /** Donde se enseña la imagen: sin copiarla (`bitmaprenderer`) o, si no lo hay, dibujándola en 2D */
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
  /** Nintendo 64 (v0.32.0): palanca de la pantalla, de -1 a 1 */
  private palancaTactil: [number, number] = [0, 0]
  private readonly n64: boolean
  /**
   * Ritmo propio (v0.33.0, solo Nintendo 64 en el hilo aparte): el hilo hace los fotogramas a su
   * ritmo y manda las imágenes; aquí solo se le pasan los botones en cuanto cambian
   */
  private propio = false
  /** Última entrada mandada al hilo, para no repetirla */
  private entradaEnviada = ''
  /** El sonido ya va directo del hilo al procesador */
  private sonidoAlHilo = false
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
  private medida = { tiempo: 0, refrescos: 0, envios: 0, imagenes: 0, fotogramas: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, modo: '' }
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
    this.pantallas = o.pantallas ?? 'apiladas'
    this.principal = o.principal ?? 'abajo'
  }

  static async iniciar(o: OpcionesSesion): Promise<Sesion> {
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
    const { juego, rom, lienzo } = this.o
    const info = SISTEMAS[juego.sistema]
    const contexto = contextoDe(lienzo)
    if (!contexto) throw new Error('Sin lienzo para la imagen.')
    this.contexto = contexto
    const partida = await leerPartida(juego.id)
    const estadoAuto = this.o.reanudar ? await leerEstado(juego.id, 'auto') : undefined
    if (estadoAuto) marcarCargaAuto(juego.id)
    else if (cargaAutoFallida(juego.id)) marcarCargaAuto(null)
    const { conexion, info: m, motivoLocal } = await abrirMotor(
      {
        nucleo: info.nucleo,
        opciones: this.o.opciones ?? {},
        rom,
        extension: info.extension,
        partida: partida ? { datos: partida.datos, rtc: partida.rtc } : undefined,
        estadoAuto: estadoAuto?.datos,
        conRebobinado: info.rebobinado,
        disposicion: { pantallas: this.pantallas, principal: this.principal, conMini: false },
        pintor: pintorElegido(),
      },
      leerAjustes().emulacionEnHilo !== false,
    )
    this.motor = conexion
    this.enHilo = conexion.enHilo
    this.pintor = m.pintor
    this.pintorMs = m.pintorMs
    this.motivoLocal = motivoLocal
    this.tiempos = m.tiempos
    this.cargaAutoPendiente = m.autoCargado
    this.ponerTiempos(m.fps, m.frecuencia)
    this.mostrar(m.imagenes)
    this.propio = this.n64 && !!conexion.ritmo
    conexion.ritmo?.alEvento(this.propio ? (e) => this.alEventoRitmo(e) : null)
    this.temporizadorGuardado = window.setInterval(() => void this.guardarPartidaSiCambia(), 1000)
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
    if (this.tamano.ancho !== imagenes.ancho || this.tamano.alto !== imagenes.alto) {
      this.tamano = { ancho: imagenes.ancho, alto: imagenes.alto }
      lienzo.width = imagenes.ancho
      lienzo.height = imagenes.alto
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
    if (this.cerrada || this.roto) return
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
    if (!this.corriendo || this.roto) {
      e.imagenes.imagen.close()
      e.imagenes.mini?.close()
      return
    }
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
      palanca: this.n64 ? this.palanca() : undefined,
    }
  }

  /** Ritmo propio: manda los botones al hilo si han cambiado (al tocar, y en cada refresco por los mandos). */
  private enviarEntrada(): void {
    if (!this.propio || !this.corriendo) return
    const e = this.entrada()
    const clave = `${e.mascara}|${e.turbo}|${e.correr}|${e.extra}|${e.palanca?.[0] ?? 0}|${e.palanca?.[1] ?? 0}`
    if (clave === this.entradaEnviada) return
    this.entradaEnviada = clave
    this.motor.ritmo?.entrada(e)
  }

  /** El hilo hace los fotogramas a su ritmo (v0.33.0, Nintendo 64) */
  get ritmoPropio(): boolean {
    return this.propio
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
    if (!this.corriendo) return
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
    const mascara = this.botonesTactil | this.botonesTeclado | this.botonesMandos()
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
    const sincronizado = plan.modo === 'sincronizado' && dtPantalla < this.refresco.ms * 4.5
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
    if (this.medida.tiempo >= 30_000) this.anotarRendimiento()
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
    if (!this.sonidoAlHilo && this.altavoz.activo) {
      const canal = this.altavoz.canalParaHilo()
      if (canal) {
        this.motor.ritmo?.sonido(canal.puerto, canal.frecuencia, canal.objetivo)
        this.sonidoAlHilo = true
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
    if (this.medida.tiempo >= 30_000) this.anotarRendimiento()
  }

  /** Pide `n` fotogramas al motor y, al volver, enseña la imagen, suena y guarda lo de rebobinar. */
  private enviar(n: number, mascara: number, frecuenciaSonido: number): void {
    this.enVuelo = true
    this.motor.fotogramas({ n, mascara, turbo: this.turbo, correr: this.correr, extra: this.extra, palanca: this.n64 ? this.palanca() : undefined }).then(
      (r) => {
        this.enVuelo = false
        if (this.cerrada || this.roto) {
          r.imagenes?.imagen.close()
          r.imagenes?.mini?.close()
          return
        }
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

  private anotarRendimiento(): void {
    const m = this.medida
    if (m.refrescos === 0) return
    if (this.propio) {
      this.anotarRendimientoPropio()
      return
    }
    const presupuesto = this.refresco.ms || 1000 / 60
    registrar('info', 'Rendimiento', {
      sistema: this.o.juego.sistema,
      pantallaHz: Math.round(1000 / presupuesto),
      limite30: this.limite30,
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
    this.medida = { tiempo: 0, refrescos: 0, envios: 0, imagenes: 0, fotogramas: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, modo: '' }
  }

  /** Rendimiento del ritmo propio: lo mide el hilo; aquí, los refrescos de la página. */
  private anotarRendimientoPropio(): void {
    const m = this.medida
    this.medida = { tiempo: 0, refrescos: 0, envios: 0, imagenes: 0, fotogramas: 0, trabajo: 0, pintar: 0, maximo: 0, largos: 0, modo: '' }
    const ritmo = this.motor.ritmo
    if (!ritmo) return
    const presupuesto = this.refresco.ms || 1000 / 60
    void ritmo.medida().then(
      (h) => {
        const seg = h.ms / 1000 || 1
        registrar('info', 'Rendimiento', {
          sistema: this.o.juego.sistema,
          ritmo: 'propio',
          pantallaHz: Math.round(1000 / presupuesto),
          limite30: this.limite30,
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
          // Fotogramas que tocaban y no se hicieron (el juego se frena)
          perdidos: h.perdidos,
          refrescos: m.refrescos,
          refrescosSeg: Math.round((m.refrescos / (m.tiempo / 1000 || 1)) * 10) / 10,
          imagenesSeg: Math.round((h.imagenes / seg) * 10) / 10,
          juegoSeg: Math.round((h.fotogramas / seg) * 10) / 10,
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

  /** Palanca de Nintendo 64: la de la pantalla o, si está suelta, la de un mando físico. */
  private palanca(): [number, number] {
    if (this.palancaTactil[0] || this.palancaTactil[1]) return this.palancaTactil
    try {
      for (const mando of navigator.getGamepads?.() ?? []) {
        if (!mando) continue
        const p = palancaDeMando(mando)
        if (p[0] || p[1]) return p
      }
    } catch {
      // sin mandos
    }
    return [0, 0]
  }

  /** Palanca de la pantalla (Nintendo 64), de -1 a 1 en cada eje. */
  ponerPalanca(x: number, y: number): void {
    this.palancaTactil = [x, y]
    this.ultimaActividad = Date.now()
    this.enviarEntrada()
  }

  private botonesMandos(): number {
    let m = 0
    try {
      for (const mando of navigator.getGamepads?.() ?? []) if (mando) m |= botonesDeMando(mando, this.n64)
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

  /** 30 imágenes por segundo (v0.28.0), por juego: menos dibujo y menos refrescos de pantalla */
  ponerLimite30(activo: boolean): void {
    if (activo === this.limite30) return
    this.limite30 = activo
    this.dtPendiente = 0
    if (this.propio) this.motor.ritmo?.limite30(activo)
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

  async guardarEstado(ranura: Ranura): Promise<boolean> {
    if (this.roto || this.cerrada || !this.motor) return false
    const r = await this.motor.guardarEstado()
    if (!r || this.roto) return false
    // Nintendo 64: el motor no tiene la imagen (la dibuja el núcleo), se toma la que se ve
    const captura = r.captura ?? (await capturaDelLienzo(this.o.lienzo))
    await guardarEstado({ id: this.o.juego.id, ranura, datos: r.datos.slice().buffer as ArrayBuffer, fecha: Date.now(), captura })
    return true
  }

  async cargarEstado(ranura: Ranura): Promise<boolean> {
    const estado = await leerEstado(this.o.juego.id, ranura)
    if (!estado) return false
    const r = await this.motor.cargarEstado(new Uint8Array(estado.datos))
    this.altavoz.vaciar()
    if (this.propio) this.motor.ritmo?.vaciarSonido()
    this.porHacer = 0
    this.mostrar(r.imagenes)
    return r.ok
  }

  /** Vuelve al momento de antes de la última carga de un estado. */
  async deshacerCarga(): Promise<boolean> {
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
  private fallar(e: unknown): void {
    if (this.roto || this.cerrada) return
    this.roto = true
    this.corriendo = false
    cancelAnimationFrame(this.peticion)
    if (this.propio) this.motor?.ritmo?.parar()
    clearInterval(this.temporizadorGuardado)
    this.altavoz.pausar()
    const mensaje = (e as Error)?.message ?? String(e)
    registrar('error', 'El emulador ha fallado; no se guarda nada después del fallo', { sistema: this.o.juego.sistema, hilo: this.enHilo, mensaje })
    this.o.alFallar?.(mensaje)
  }

  get fallida(): boolean {
    return this.roto
  }

  /** Al pasar a segundo plano: partida y estado «auto» al iPhone. */
  async guardarTodo(): Promise<void> {
    if (this.cerrada) return
    await Promise.all([this.guardarPartidaSiCambia(), this.guardarEstado('auto').catch(() => false), this.guardarTiempo()])
  }

  async cerrar(): Promise<void> {
    if (this.cerrada) return
    this.pausar()
    // Lo que quede de la última medida, si es una partida corta
    if (this.medida.tiempo >= 5000) this.anotarRendimiento()
    await this.guardarTodo()
    if (this.cargaAutoPendiente && !this.roto) marcarCargaAuto(null)
    this.cerrada = true
    clearInterval(this.temporizadorGuardado)
    this.historial.cerrar()
    if (this.sonidoAlHilo) this.altavoz.soltarCanalHilo()
    await this.motor?.descargar().catch(() => undefined)
  }
}
