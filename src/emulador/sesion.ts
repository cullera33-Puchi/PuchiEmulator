/**
 * Una partida en marcha: núcleo, imagen, sonido, botones y guardado automático.
 *
 * - El ritmo va por tiempo, no por fotogramas de la pantalla: el iPhone puede refrescar a 60 o a
 *   120 Hz, o a 30 en modo de bajo consumo, y el juego tiene que ir siempre a su velocidad.
 * - La partida guardada del juego se escribe en el iPhone en cuanto cambia (se comprueba cada
 *   segundo), al pausar y al salir.
 * - Al salir o al pasar la app a segundo plano se guarda un estado «auto» para seguir donde se dejó.
 */
import { guardarEstado, guardarPartida, guardarSesionJuego, leerEstado, leerPartida, type Juego, type Ranura } from '../lib/almacen'
import { registrar } from '../lib/registro'
import { SISTEMAS } from '../lib/sistemas'
import { altavoz } from './audio'
import { bit, botonesDeMando } from './botones'
import { Nucleo } from './nucleo'
import { Historial } from './historial'
import { limitarRecuperacion, planRitmo, Refresco, refrescosPasados } from './ritmo'
import { mascaraConCorrer, mascaraConTurbo } from '../lib/mandoJuego'
import { tocaPausar } from '../lib/sueno'
import { leerAjustes } from '../lib/ajustes'
import { aNucleo, componer, tamanoSalida, type PantallasDS, type PrincipalDS } from './pantallasDS'

const MAX_FOTOGRAMAS_SEGUIDOS = 4
/** Cada cuántos fotogramas se guarda un estado para rebobinar (unos 6 por segundo) */
const FOTOGRAMAS_POR_ESTADO = 10
/** Al rebobinar, un estado cada 50 ms: va unas tres veces más rápido que el juego */
const MS_POR_ESTADO_ATRAS = 50
/** Sin tocar ningún botón durante este tiempo, el reloj de tiempo jugado se para */
export const INACTIVIDAD_MS = 10 * 60_000
/** Cada cuánto se guarda el tiempo jugado mientras se juega */
const GUARDAR_TIEMPO_MS = 30_000

function iguales(a: Uint8Array, b: Uint8Array | null): boolean {
  if (!b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export interface OpcionesSesion {
  juego: Juego
  rom: ArrayBuffer
  lienzo: HTMLCanvasElement
  /** Seguir desde el estado «auto» si existe */
  reanudar: boolean
  /** Opciones del núcleo que dependen de los ajustes (por ejemplo, la paleta de Game Boy) */
  opciones?: Record<string, string>
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

/** Cada cuánto se guarda el punto donde se dejó mientras se juega: si algo falla, se pierde poco. */
export const MS_PUNTO_CONTROL = 5 * 60_000

export class Sesion {
  readonly altavoz = altavoz
  private nucleo!: Nucleo
  private contexto!: CanvasRenderingContext2D
  private imagen: ImageData | null = null
  private corriendo = false
  private peticion = 0
  private ultimo = 0
  private acumulado = 0
  /** Lo que tarda un fotograma, media reciente en ms (v0.24.1) */
  private costeFotograma = 0
  private paso = 1000 / 60
  private frecuencia = 32768
  private botonesTactil = 0
  private botonesTeclado = 0
  // Correr fijo (modo JRPG): el botón que se mantiene pulsado, y fotogramas en que se suelta para que
  // el juego vea una pulsación nueva cuando el usuario lo toca
  private correr = 0
  // Turbo (v0.19.0): botones que se pulsan y sueltan solos mientras se mantienen
  private turbo = 0
  /** 30 imágenes por segundo (v0.28.0): solo se trabaja y se dibuja en uno de cada `cada` refrescos */
  private limite30 = false
  private saltados = 0
  private dtPendiente = 0
  /** Duración del refresco con el que se trabaja: la de la pantalla o, con el límite, la de 30 Hz */
  private refrescoEfectivo = 0
  // Botones que pone la app y no el mando: soplar y la tapa de DS (v0.20.0)
  private extra = 0
  private fotogramaTurbo = 0
  // Pantallas de DS (v0.17.0): disposición, cuál va grande y la miniatura
  private pantallas: PantallasDS = 'apiladas'
  private principal: PrincipalDS = 'abajo'
  private mini: CanvasRenderingContext2D | null = null
  private fuente: HTMLCanvasElement | null = null
  // El núcleo ha fallado (memoria corrupta): desde ese momento no se guarda nada suyo
  private roto = false
  private cargaAutoPendiente = false
  // Punto de control: el estado «auto» se guarda también cada 5 minutos de juego (v0.14.0)
  private msDesdeControl = 0
  private fotogramasJugados = 0
  private huecoCorrer = 0
  private basePrevia = 0
  private ultimaPartida: Uint8Array | null = null
  private temporizadorGuardado = 0
  private guardando: Promise<void> = Promise.resolve()
  private cerrada = false
  private velocidad = 1
  private rebobinando = false
  private acumuladoAtras = 0
  private fotogramas = 0
  private readonly historial = new Historial()
  /** Nintendo DS no tiene rebobinado (decisión del usuario): sus estados pesan varios megas */
  private conRebobinado = true
  /** Hay una petición de estado anterior en marcha (rebobinar va al ritmo al que responde el hilo) */
  private pidiendoAnterior = false
  private readonly refresco = new Refresco()
  private refrescos = 0
  /** Medidas de rendimiento, para el registro */
  // Medidas de rendimiento: se acumulan aunque se abra el menú (antes se perdían en cada pausa)
  private medida = { tiempo: 0, refrescos: 0, fotogramas: 0, trabajo: 0, maximo: 0, largos: 0, modo: '' }
  /** Estado de justo antes de la última carga, para «Deshacer» */
  private antesDeCargar: Uint8Array | null = null
  /** Tiempo jugado en esta sesión (sin pausas ni inactividad) */
  private msJugados = 0
  private inicioSesion = 0
  private ultimaActividad = 0
  private ultimaMascara = 0
  private idSesion: number | undefined
  private ultimoGuardadoTiempo = 0
  private guardandoTiempo: Promise<void> = Promise.resolve()

  private readonly o: OpcionesSesion

  private constructor(o: OpcionesSesion) {
    this.o = o
  }

  static async iniciar(o: OpcionesSesion): Promise<Sesion> {
    const s = new Sesion(o)
    await s.preparar()
    return s
  }

  get juego(): Juego {
    return this.o.juego
  }

  /** Lo que ha tardado cada paso de la apertura, en ms (v0.28.0), para el registro */
  tiempos = { nucleo: 0, juego: 0, estado: 0 }

  private async preparar(): Promise<void> {
    const { juego, rom, lienzo } = this.o
    const info = SISTEMAS[juego.sistema]
    let t = performance.now()
    const paso = (k: keyof Sesion['tiempos']) => {
      const ahora = performance.now()
      this.tiempos[k] = Math.round(ahora - t)
      t = ahora
    }
    this.nucleo = await Nucleo.cargar(info.nucleo, this.o.opciones)
    paso('nucleo')
    const partida = await leerPartida(juego.id)
    const datosPartida = partida ? { datos: new Uint8Array(partida.datos), rtc: partida.rtc ? new Uint8Array(partida.rtc) : undefined } : undefined
    if (!this.nucleo.cargarJuego(new Uint8Array(rom), info.extension, datosPartida)) {
      throw new Error('El núcleo no ha podido abrir el juego.')
    }
    if (datosPartida) this.nucleo.escribirPartida(datosPartida.datos, datosPartida.rtc)
    this.conRebobinado = info.rebobinado
    this.leerTiempos()
    const ctx = lienzo.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Sin lienzo para la imagen.')
    this.contexto = ctx
    // El primer fotograma aplica la partida guardada; después se puede cargar el estado
    this.nucleo.fotograma()
    paso('juego')
    if (this.o.reanudar) {
      const estado = await leerEstado(juego.id, 'auto')
      if (estado) {
        marcarCargaAuto(juego.id)
        this.cargaAutoPendiente = true
        this.nucleo.cargarEstado(new Uint8Array(estado.datos))
      }
    } else if (cargaAutoFallida(juego.id)) {
      marcarCargaAuto(null)
    }
    paso('estado')
    this.ultimaPartida = this.nucleo.leerPartida()?.datos ?? null
    this.dibujar()
    this.temporizadorGuardado = window.setInterval(() => void this.guardarPartidaSiCambia(), 1000)
  }

  private leerTiempos(): void {
    const fps = this.nucleo.fps
    this.paso = 1000 / (fps > 0 ? fps : 60)
    this.frecuencia = this.nucleo.frecuenciaAudio || 32768
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
    this.peticion = requestAnimationFrame(this.bucle)
  }

  get enMarcha(): boolean {
    return this.corriendo
  }

  pausar(): void {
    if (!this.corriendo) return
    this.corriendo = false
    cancelAnimationFrame(this.peticion)
    this.altavoz.pausar()
    void this.guardarTiempo()
  }

  /** Tiempo jugado en esta sesión, en ms. */
  get tiempoJugado(): number {
    return this.msJugados
  }

  private contarTiempo(dt: number, mascara: number): void {
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
    }
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
    this.contarTiempo(dtPantalla, mascara | (this.rebobinando ? 1 << 30 : 0) | (this.velocidad > 1 ? 1 << 29 : 0))
    if (this.rebobinando) {
      this.irAtras(dtPantalla)
      return
    }
    // Con el límite de 30 imágenes por segundo, se salta el trabajo en los refrescos intermedios y
    // en el siguiente se hacen los fotogramas de todos: el juego va a su velocidad
    const cada = this.limite30 && this.refresco.ms > 0 ? Math.max(1, Math.round(1000 / 30 / this.refresco.ms)) : 1
    this.dtPendiente += dtPantalla
    if (++this.saltados < cada) return
    this.saltados = 0
    const dt = Math.min(this.dtPendiente, 250)
    this.dtPendiente = 0
    const refresco = this.refresco.ms * cada
    this.refrescoEfectivo = refresco
    const t0 = performance.now()

    // Cuántos fotogramas tocan en este refresco: fijo si la consola va casi al ritmo de la pantalla
    // (movimiento regular), o por tiempo si no
    let toca: number
    // Lo rápido que va el juego de verdad: en sincronía con la pantalla, un poco más o menos que la
    // consola (por ejemplo, 60 Hz frente a 59,73 en GBA); el sonido se ajusta a eso desde el principio
    let ritmoReal = 1
    const plan = planRitmo(1000 / this.paso, refresco)
    if (plan.modo === 'sincronizado' && dt < refresco * 4.5) {
      this.acumulado = 0
      // Si se ha perdido algún refresco, se cuentan también: el juego no se frena
      const antes = Math.floor(this.refrescos / plan.cadaRefrescos)
      this.refrescos += refrescosPasados(dt, refresco)
      const ciclos = Math.floor(this.refrescos / plan.cadaRefrescos) - antes
      toca = Math.min(ciclos * plan.porRefresco, MAX_FOTOGRAMAS_SEGUIDOS) * this.velocidad
      if (this.velocidad === 1) toca = limitarRecuperacion(toca, ciclos > 0 ? plan.porRefresco : 0, this.costeFotograma, refresco * plan.cadaRefrescos)
      ritmoReal = ((1000 / refresco) * plan.porRefresco) / plan.cadaRefrescos / (1000 / this.paso)
    } else {
      this.acumulado += dt * this.velocidad
      toca = Math.min(Math.floor(this.acumulado / this.paso), MAX_FOTOGRAMAS_SEGUIDOS * this.velocidad)
      this.acumulado = toca === MAX_FOTOGRAMAS_SEGUIDOS * this.velocidad ? 0 : this.acumulado - toca * this.paso
      if (this.velocidad === 1 && refresco > 0) {
        const limitado = limitarRecuperacion(toca, Math.ceil(refresco / this.paso), this.costeFotograma, refresco)
        // Lo que no se recupera se pierde: si no, la deuda crecería sin parar
        if (limitado < toca) this.acumulado = Math.min(this.acumulado + (toca - limitado) * this.paso, this.paso)
        toca = limitado
      }
    }

    if (this.correr && mascara & this.correr && !(this.basePrevia & this.correr)) this.huecoCorrer = 3
    this.basePrevia = mascara
    let hayImagen = false
    for (let i = 0; i < toca; i++) {
      const enviada = mascaraConCorrer(mascaraConTurbo(mascara, this.turbo, this.fotogramaTurbo++), this.correr, this.huecoCorrer > 0) | this.extra
      if (this.huecoCorrer > 0) this.huecoCorrer--
      this.nucleo.botones(enviada)
      if (this.cargaAutoPendiente && ++this.fotogramasJugados >= 120) {
        this.cargaAutoPendiente = false
        marcarCargaAuto(null)
      }
      if (this.nucleo.fotograma()) hayImagen = true
      // En avance rápido el sonido se acelera (más agudo) en lugar de cortarse
      this.altavoz.enviar(this.nucleo.audio(), this.frecuencia * this.velocidad * ritmoReal)
      if (this.conRebobinado && ++this.fotogramas % FOTOGRAMAS_POR_ESTADO === 0) {
        // Solo se copia el estado; compararlo y comprimirlo lo hace otro hilo
        const estado = this.nucleo.guardarEstado()
        if (estado) this.historial.guardar(estado, enviada)
      }
    }
    if (this.nucleo.avCambiado()) this.leerTiempos()
    this.msDesdeControl += dt
    if (this.msDesdeControl >= MS_PUNTO_CONTROL) {
      this.msDesdeControl = 0
      void this.guardarEstado('auto').then(
        (ok) => ok && registrar('info', 'Punto de control'),
        (e) => registrar('error', 'No se pudo guardar el punto de control', (e as Error)?.message),
      )
    }
    if (hayImagen) this.dibujar()
    const trabajo = performance.now() - t0
    if (toca > 0 && this.velocidad === 1) {
      const coste = trabajo / toca
      this.costeFotograma = this.costeFotograma ? this.costeFotograma * 0.9 + coste * 0.1 : coste
    }
    this.medir(trabajo, plan.modo, dt, toca)
  }

  /** Cada 30 s de juego, al registro: lo que tarda cada refresco y cuántos se pasan del tiempo. */
  private medir(trabajo: number, modo: string, dt: number, fotogramas: number): void {
    const m = this.medida
    m.refrescos++
    m.fotogramas += fotogramas
    m.tiempo += dt
    m.trabajo += trabajo
    m.modo = modo
    if (trabajo > m.maximo) m.maximo = trabajo
    const presupuesto = this.refrescoEfectivo || this.refresco.ms || 1000 / 60
    if (trabajo > presupuesto * 0.8) m.largos++
    if (m.tiempo >= 30_000) this.anotarRendimiento()
  }

  private anotarRendimiento(): void {
    const m = this.medida
    if (m.refrescos === 0) return
    const presupuesto = this.refresco.ms || 1000 / 60
    registrar('info', 'Rendimiento', {
      sistema: this.o.juego.sistema,
      pantallaHz: Math.round(1000 / presupuesto),
      limite30: this.limite30,
      consolaHz: Math.round(100_000 / this.paso) / 100,
      ritmo: m.modo,
      segundos: Math.round(m.tiempo / 1000),
      mediaMs: Math.round((m.trabajo / m.refrescos) * 10) / 10,
      maxMs: Math.round(m.maximo * 10) / 10,
      largos: m.largos,
      refrescos: m.refrescos,
      // Imágenes que se ven y fotogramas que avanza el juego, por segundo (v0.24.1)
      imagenesSeg: Math.round((m.refrescos / m.tiempo) * 10_000) / 10,
      juegoSeg: Math.round((m.fotogramas / m.tiempo) * 10_000) / 10,
    })
    this.medida = { tiempo: 0, refrescos: 0, fotogramas: 0, trabajo: 0, maximo: 0, largos: 0, modo: '' }
  }

  private irAtras(dt: number): void {
    this.acumuladoAtras += dt
    if (this.pidiendoAnterior || this.acumuladoAtras < MS_POR_ESTADO_ATRAS) return
    this.acumuladoAtras = Math.min(this.acumuladoAtras - MS_POR_ESTADO_ATRAS, MS_POR_ESTADO_ATRAS)
    this.pidiendoAnterior = true
    void this.historial.anterior().then((anterior) => {
      this.pidiendoAnterior = false
      if (!anterior || !this.rebobinando || this.cerrada) return
      this.nucleo.cargarEstado(anterior.estado)
      // Un fotograma con los botones de entonces para tener la imagen de ese momento
      this.nucleo.botones(anterior.botones)
      this.nucleo.fotograma()
      this.dibujar()
    })
  }

  /** Rebobinar mientras se mantiene pulsado. */
  rebobinar(activo: boolean): void {
    if (activo === this.rebobinando) return
    this.rebobinando = activo
    this.acumuladoAtras = MS_POR_ESTADO_ATRAS
    this.acumulado = 0
    this.altavoz.vaciar()
  }

  /** Avance rápido: 1 (normal), 2 o 4 veces más rápido. */
  ponerVelocidad(v: number): void {
    this.velocidad = v
    this.acumulado = 0
    this.altavoz.vaciar()
  }

  private botonesMandos(): number {
    let m = 0
    try {
      for (const mando of navigator.getGamepads?.() ?? []) if (mando) m |= botonesDeMando(mando)
    } catch {
      // sin mandos
    }
    return m
  }

  private dibujar(): void {
    const v = this.nucleo.video()
    if (!v) return
    const lienzo = this.o.lienzo
    // Las pantallas de DS se recolocan; el resto (y DS apiladas) va tal cual
    const recolocar = this.pantallas !== 'apiladas' && v.alto === v.ancho * 1.5
    const salida = recolocar ? tamanoSalida(this.pantallas) : { ancho: v.ancho, alto: v.alto }
    if (!this.imagen || this.imagen.width !== v.ancho || this.imagen.height !== v.alto) this.imagen = new ImageData(v.ancho, v.alto)
    if (lienzo.width !== salida.ancho || lienzo.height !== salida.alto) {
      lienzo.width = salida.ancho
      lienzo.height = salida.alto
      this.o.alCambiarTamano?.(salida.ancho, salida.alto)
    }
    this.imagen.data.set(v.datos)
    if (!recolocar) {
      this.contexto.putImageData(this.imagen, 0, 0)
      return
    }
    if (!this.fuente) this.fuente = document.createElement('canvas')
    if (this.fuente.width !== v.ancho || this.fuente.height !== v.alto) {
      this.fuente.width = v.ancho
      this.fuente.height = v.alto
    }
    this.fuente.getContext('2d')!.putImageData(this.imagen, 0, 0)
    componer(this.contexto, this.fuente, this.pantallas, this.principal, this.mini)
  }

  /**
   * Disposición de las pantallas de DS: cómo se colocan, cuál va grande (en «grande») y el lienzo de
   * la miniatura. Se vuelve a pintar en el momento, aunque el juego esté en pausa.
   */
  ponerPantallas(pantallas: PantallasDS, principal: PrincipalDS, mini: HTMLCanvasElement | null): void {
    this.pantallas = pantallas
    this.principal = principal
    if (mini && (mini.width !== 256 || mini.height !== 192)) {
      mini.width = 256
      mini.height = 192
    }
    this.mini = mini?.getContext('2d', { alpha: false }) ?? null
    if (this.contexto) this.dibujar()
  }

  /** Toque en la imagen que se ve, de 0 a 1 (o null al soltar). Fuera de la táctil, no toca. */
  ponerPuntero(x: number | null, y = 0): void {
    // El lápiz también cuenta como actividad (en Hotel Dusk casi no se tocan botones)
    this.ultimaActividad = Date.now()
    if (x === null) return this.nucleo?.puntero(null)
    const p = aNucleo(this.pantallas, this.principal, x, y)
    this.nucleo?.puntero(p ? p[0] : null, p ? p[1] : 0)
  }

  /** DS: soplar al micrófono (mientras se mantiene) o tener la tapa cerrada. */
  ponerExtra(boton: 'SOPLAR' | 'TAPA', activo: boolean): void {
    const b = bit(boton)
    this.extra = activo ? this.extra | b : this.extra & ~b
    this.ultimaActividad = Date.now()
  }

  /** Turbo: máscara de los botones con turbo (0, ninguno). */
  /** 30 imágenes por segundo (v0.28.0), por juego: menos dibujo y menos refrescos de pantalla */
  ponerLimite30(activo: boolean): void {
    if (activo === this.limite30) return
    this.limite30 = activo
    this.saltados = 0
    this.dtPendiente = 0
  }

  ponerTurbo(mascara: number): void {
    this.turbo = mascara
  }

  /** Correr fijo: máscara del botón que queda pulsado (0, ninguno). */
  ponerCorrer(mascara: number): void {
    this.correr = mascara
    this.huecoCorrer = 0
  }

  ponerBotonesTactil(mascara: number): void {
    this.botonesTactil = mascara
  }

  ponerBotonesTeclado(mascara: number): void {
    this.botonesTeclado = mascara
  }

  /** Guarda la partida del juego si ha cambiado desde la última vez. */
  guardarPartidaSiCambia(): Promise<void> {
    if (this.cerrada || this.roto) return this.guardando
    const actual = this.nucleo.leerPartida()
    if (!actual || iguales(actual.datos, this.ultimaPartida)) return this.guardando
    this.ultimaPartida = actual.datos
    const id = this.o.juego.id
    this.guardando = this.guardando
      .then(() => guardarPartida({ id, datos: actual.datos.slice().buffer, rtc: actual.rtc?.slice().buffer, fecha: Date.now() }))
      .then(() => this.o.alGuardar?.())
      .catch((e) => registrar('error', 'No se pudo guardar la partida', (e as Error)?.message))
    return this.guardando
  }

  private captura(): Promise<ArrayBuffer | undefined> {
    return new Promise((resolver) => {
      try {
        this.o.lienzo.toBlob((b) => {
          if (!b) return resolver(undefined)
          b.arrayBuffer().then(resolver, () => resolver(undefined))
        }, 'image/png')
      } catch {
        resolver(undefined)
      }
    })
  }

  async guardarEstado(ranura: Ranura): Promise<boolean> {
    if (this.roto) return false
    const datos = this.nucleo.guardarEstado()
    if (!datos) return false
    const captura = await this.captura()
    await guardarEstado({ id: this.o.juego.id, ranura, datos: datos.buffer as ArrayBuffer, fecha: Date.now(), captura })
    return true
  }

  async cargarEstado(ranura: Ranura): Promise<boolean> {
    const estado = await leerEstado(this.o.juego.id, ranura)
    if (!estado) return false
    this.antesDeCargar = this.nucleo.guardarEstado()
    const ok = this.nucleo.cargarEstado(new Uint8Array(estado.datos))
    this.altavoz.vaciar()
    this.dibujar()
    return ok
  }

  /** Vuelve al momento de antes de la última carga de un estado. */
  deshacerCarga(): boolean {
    const antes = this.antesDeCargar
    if (!antes) return false
    this.antesDeCargar = null
    const ok = this.nucleo.cargarEstado(antes)
    this.altavoz.vaciar()
    this.dibujar()
    return ok
  }

  /** Cambia una opción del núcleo con el juego en marcha. */
  opcion(clave: string, valor: string): void {
    this.nucleo.opcion(clave, valor)
  }

  reiniciar(): void {
    try {
      this.nucleo.reiniciar()
    } catch (e) {
      this.fallar(e)
      return
    }
    this.altavoz.vaciar()
  }

  /** Error dentro del núcleo: se para, se anota y no se vuelve a guardar nada de esta sesión. */
  private fallar(e: unknown): void {
    if (this.roto) return
    this.roto = true
    this.corriendo = false
    cancelAnimationFrame(this.peticion)
    clearInterval(this.temporizadorGuardado)
    this.altavoz.pausar()
    const mensaje = (e as Error)?.message ?? String(e)
    registrar('error', 'El emulador ha fallado; no se guarda nada después del fallo', { sistema: this.o.juego.sistema, mensaje })
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
    try {
      this.nucleo.descargar()
    } catch {
      // el módulo se descarta igualmente
    }
  }
}
