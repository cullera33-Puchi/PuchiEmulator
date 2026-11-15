/**
 * Una partida en marcha: núcleo, imagen, sonido, botones y guardado automático.
 *
 * - El ritmo va por tiempo, no por fotogramas de la pantalla: el iPhone puede refrescar a 60 o a
 *   120 Hz, o a 30 en modo de bajo consumo, y el juego tiene que ir siempre a su velocidad.
 * - La partida guardada del juego se escribe en el iPhone en cuanto cambia (se comprueba cada
 *   segundo), al pausar y al salir.
 * - Al salir o al pasar la app a segundo plano se guarda un estado «auto» para seguir donde se dejó.
 */
import { guardarEstado, guardarPartida, leerEstado, leerPartida, type Juego, type Ranura } from '../lib/almacen'
import { SISTEMAS } from '../lib/sistemas'
import { altavoz } from './audio'
import { botonesDeMando } from './botones'
import { Nucleo } from './nucleo'

const MAX_FOTOGRAMAS_SEGUIDOS = 4

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
  alCambiarTamano?: (ancho: number, alto: number) => void
  alGuardar?: () => void
}

export class Sesion {
  readonly altavoz = altavoz
  private nucleo!: Nucleo
  private contexto!: CanvasRenderingContext2D
  private imagen: ImageData | null = null
  private corriendo = false
  private peticion = 0
  private ultimo = 0
  private acumulado = 0
  private paso = 1000 / 60
  private frecuencia = 32768
  private botonesTactil = 0
  private botonesTeclado = 0
  private ultimaPartida: Uint8Array | null = null
  private temporizadorGuardado = 0
  private guardando: Promise<void> = Promise.resolve()
  private cerrada = false

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

  private async preparar(): Promise<void> {
    const { juego, rom, lienzo } = this.o
    const info = SISTEMAS[juego.sistema]
    this.nucleo = await Nucleo.cargar(info.nucleo)
    if (!this.nucleo.cargarJuego(new Uint8Array(rom), info.extension)) {
      throw new Error('El núcleo no ha podido abrir el juego.')
    }
    const partida = await leerPartida(juego.id)
    if (partida) {
      this.nucleo.escribirPartida(new Uint8Array(partida.datos), partida.rtc ? new Uint8Array(partida.rtc) : undefined)
    }
    this.leerTiempos()
    const ctx = lienzo.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Sin lienzo para la imagen.')
    this.contexto = ctx
    // El primer fotograma aplica la partida guardada; después se puede cargar el estado
    this.nucleo.fotograma()
    if (this.o.reanudar) {
      const estado = await leerEstado(juego.id, 'auto')
      if (estado) this.nucleo.cargarEstado(new Uint8Array(estado.datos))
    }
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
    if (this.cerrada) return
    this.altavoz.silenciar(!sonido)
    void this.altavoz.activar(sonarEnSilencio)
    if (this.corriendo) return
    this.corriendo = true
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
  }

  private bucle = (ahora: number) => {
    if (!this.corriendo) return
    this.peticion = requestAnimationFrame(this.bucle)
    // Tras un parón largo (la app en segundo plano) no se intenta recuperar el tiempo perdido
    this.acumulado += Math.min(ahora - this.ultimo, 250)
    this.ultimo = ahora
    const mascara = this.botonesTactil | this.botonesTeclado | this.botonesMandos()
    let hayImagen = false
    let hechos = 0
    while (this.acumulado >= this.paso && hechos < MAX_FOTOGRAMAS_SEGUIDOS) {
      this.nucleo.botones(mascara)
      if (this.nucleo.fotograma()) hayImagen = true
      this.altavoz.enviar(this.nucleo.audio(), this.frecuencia)
      this.acumulado -= this.paso
      hechos++
    }
    if (this.acumulado >= this.paso) this.acumulado = 0
    if (this.nucleo.avCambiado()) this.leerTiempos()
    if (hayImagen) this.dibujar()
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
    if (!this.imagen || this.imagen.width !== v.ancho || this.imagen.height !== v.alto) {
      lienzo.width = v.ancho
      lienzo.height = v.alto
      this.imagen = new ImageData(v.ancho, v.alto)
      this.o.alCambiarTamano?.(v.ancho, v.alto)
    }
    this.imagen.data.set(v.datos)
    this.contexto.putImageData(this.imagen, 0, 0)
  }

  ponerBotonesTactil(mascara: number): void {
    this.botonesTactil = mascara
  }

  ponerBotonesTeclado(mascara: number): void {
    this.botonesTeclado = mascara
  }

  /** Guarda la partida del juego si ha cambiado desde la última vez. */
  guardarPartidaSiCambia(): Promise<void> {
    if (this.cerrada) return this.guardando
    const actual = this.nucleo.leerPartida()
    if (!actual || iguales(actual.datos, this.ultimaPartida)) return this.guardando
    this.ultimaPartida = actual.datos
    const id = this.o.juego.id
    this.guardando = this.guardando
      .then(() => guardarPartida({ id, datos: actual.datos.slice().buffer, rtc: actual.rtc?.slice().buffer, fecha: Date.now() }))
      .then(() => this.o.alGuardar?.())
      .catch((e) => console.warn('No se ha podido guardar la partida', e))
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
    const datos = this.nucleo.guardarEstado()
    if (!datos) return false
    const captura = await this.captura()
    await guardarEstado({ id: this.o.juego.id, ranura, datos: datos.buffer as ArrayBuffer, fecha: Date.now(), captura })
    return true
  }

  async cargarEstado(ranura: Ranura): Promise<boolean> {
    const estado = await leerEstado(this.o.juego.id, ranura)
    if (!estado) return false
    const ok = this.nucleo.cargarEstado(new Uint8Array(estado.datos))
    this.altavoz.vaciar()
    this.dibujar()
    return ok
  }

  reiniciar(): void {
    this.nucleo.reiniciar()
    this.altavoz.vaciar()
  }

  /** Al pasar a segundo plano: partida y estado «auto» al iPhone. */
  async guardarTodo(): Promise<void> {
    if (this.cerrada) return
    await Promise.all([this.guardarPartidaSiCambia(), this.guardarEstado('auto').catch(() => false)])
  }

  async cerrar(): Promise<void> {
    if (this.cerrada) return
    this.pausar()
    await this.guardarTodo()
    this.cerrada = true
    clearInterval(this.temporizadorGuardado)
    try {
      this.nucleo.descargar()
    } catch {
      // el módulo se descarta igualmente
    }
  }
}
