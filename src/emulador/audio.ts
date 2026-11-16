/**
 * Salida de sonido. El AudioContext se crea y se reanuda dentro de un toque del usuario (Safari no
 * deja sonar sin un gesto). Con «sonar en silencio», la sesión de audio de iOS pasa a reproducción
 * y suena aunque el interruptor de silencio esté activado.
 */
import { ControlRitmo, Remuestreador } from './remuestreo'

type SesionAudio = { type: string }

export class Altavoz {
  private contexto: AudioContext | null = null
  private nodo: AudioWorkletNode | null = null
  private ganancia: GainNode | null = null
  private remuestreo = new Remuestreador()
  private objetivo = 0
  private ritmo: ControlRitmo | null = null
  private listo: Promise<void> | null = null
  silenciado = false
  /** Volumen de 0 a 1 (v0.22.0) */
  volumen = 1

  /** Llamar dentro de un toque. */
  activar(sonarEnSilencio: boolean): Promise<void> {
    try {
      const sesion = (navigator as Navigator & { audioSession?: SesionAudio }).audioSession
      if (sesion) sesion.type = sonarEnSilencio ? 'playback' : 'ambient'
    } catch {
      // sin sesión de audio
    }
    if (!this.contexto) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.contexto = new Ctor({ latencyHint: 'interactive' })
      const ctx = this.contexto
      // Unos 70 ms en la cola: sin cortes y sin retraso que se note
      this.objetivo = Math.round(ctx.sampleRate * 0.07)
      this.ritmo = new ControlRitmo(ctx.sampleRate, this.objetivo)
      this.listo = ctx.audioWorklet
        .addModule(`${import.meta.env.BASE_URL}procesador-audio.js`)
        .then(() => {
          this.nodo = new AudioWorkletNode(ctx, 'procesador-audio', { numberOfInputs: 0, outputChannelCount: [2] })
          this.nodo.port.onmessage = (e) => {
            this.ritmo?.aviso(e.data as number, performance.now())
          }
          this.nodo.port.postMessage({ tipo: 'maximo', pares: this.objetivo * 4 })
          this.ganancia = ctx.createGain()
          this.ganancia.gain.value = this.silenciado ? 0 : this.volumen
          this.nodo.connect(this.ganancia).connect(ctx.destination)
        })
        .catch((e) => {
          console.warn('Sin sonido:', e)
        })
    }
    if (this.contexto.state !== 'running') this.contexto.resume().catch(() => undefined)
    return this.listo ?? Promise.resolve()
  }

  get activo(): boolean {
    return this.contexto?.state === 'running' && !!this.nodo
  }

  silenciar(silencio: boolean): void {
    this.silenciado = silencio
    if (this.ganancia) this.ganancia.gain.value = silencio ? 0 : this.volumen
  }

  /** Volumen del juego, de 0 a 1, sin tocar el del iPhone. */
  ponerVolumen(v: number): void {
    this.volumen = Math.min(1, Math.max(0, v))
    if (this.ganancia && !this.silenciado) this.ganancia.gain.value = this.volumen
  }

  /**
   * Muestras de un fotograma. `frecuencia` es la del núcleo multiplicada por lo rápido que va de
   * verdad (avance rápido, o el ajuste a la pantalla cuando va sincronizado).
   */
  enviar(muestras: Int16Array, frecuencia: number): void {
    if (!this.nodo || !this.contexto || !this.ritmo || muestras.length === 0) return
    const paso = frecuencia / this.contexto.sampleRate / this.ritmo.siguiente(performance.now())
    const salida = this.remuestreo.procesar(muestras, paso)
    if (salida.length) {
      this.ritmo.enviado(salida.length >> 1)
      this.nodo.port.postMessage({ tipo: 'muestras', muestras: salida }, [salida.buffer])
    }
  }

  /**
   * Canal directo para el ritmo propio (v0.33.0): el hilo del motor manda las muestras al procesador
   * sin pasar por la página. Devuelve la otra punta del canal, la frecuencia del iPhone y la cola que se
   * busca; null si el sonido aún no está listo (Safari lo activa con un toque).
   */
  canalParaHilo(): { id: number; puerto: MessagePort; frecuencia: number; objetivo: number } | null {
    if (!this.nodo || !this.contexto) return null
    const canal = new MessageChannel()
    const id = ++this.ultimoCanal
    this.nodo.port.postMessage({ tipo: 'puerto', puerto: canal.port1, id }, [canal.port1])
    return { id, puerto: canal.port2, frecuencia: this.contexto.sampleRate, objetivo: this.objetivo }
  }

  /**
   * El procesador deja de escuchar al hilo y vuelve a avisar a la página, si el canal sigue siendo ese
   * (v0.36.0: el cierre de una partida anterior no suelta el de la nueva).
   */
  soltarCanalHilo(id: number): void {
    this.nodo?.port.postMessage({ tipo: 'soltar', id })
  }

  private ultimoCanal = 0

  vaciar(): void {
    this.remuestreo.reiniciar()
    this.ritmo?.reiniciar()
    this.nodo?.port.postMessage({ tipo: 'vaciar' })
  }

  pausar(): void {
    this.vaciar()
    this.contexto?.suspend().catch(() => undefined)
  }

  cerrar(): void {
    this.nodo?.disconnect()
    this.contexto?.close().catch(() => undefined)
    this.contexto = null
    this.nodo = null
    this.listo = null
  }
}

/** Un único altavoz para toda la app: se activa en el toque que abre el juego. */
export const altavoz = new Altavoz()
