/**
 * Historial de rebobinado visto desde el juego. Guarda y pide estados al hilo de
 * `rebobinado.worker.ts`; si el navegador no puede crear el hilo, lo hace en el principal.
 */
import { Rebobinado } from './rebobinado'

export interface Anterior {
  estado: Uint8Array
  botones: number
}

export class Historial {
  private hilo: Worker | null = null
  private local: Rebobinado | null = null
  private siguienteId = 0
  private pendientes = new Map<number, (a: Anterior | null) => void>()

  constructor() {
    try {
      this.hilo = new Worker(new URL('./rebobinado.worker.ts', import.meta.url), { type: 'module' })
      this.hilo.onmessage = (e: MessageEvent<{ id: number; estado: ArrayBuffer | null; botones: number }>) => {
        const r = this.pendientes.get(e.data.id)
        this.pendientes.delete(e.data.id)
        r?.(e.data.estado ? { estado: new Uint8Array(e.data.estado), botones: e.data.botones } : null)
      }
      this.hilo.onerror = () => this.pasarAlPrincipal()
    } catch {
      this.pasarAlPrincipal()
    }
  }

  private pasarAlPrincipal(): void {
    this.hilo?.terminate()
    this.hilo = null
    this.local ??= new Rebobinado()
    for (const r of this.pendientes.values()) r(null)
    this.pendientes.clear()
  }

  /** Guarda un estado (el historial se queda con él: no hay que volver a usarlo). */
  guardar(estado: Uint8Array, botones: number): void {
    if (this.hilo) {
      const buffer = estado.byteOffset === 0 && estado.byteLength === estado.buffer.byteLength ? estado.buffer : estado.slice().buffer
      this.hilo.postMessage({ tipo: 'guardar', estado: buffer, botones }, [buffer as ArrayBuffer])
    } else this.local?.guardar(estado, botones)
  }

  /** El estado anterior, o null si no queda historial. */
  anterior(): Promise<Anterior | null> {
    if (!this.hilo) return Promise.resolve(this.local?.atras() ?? null)
    const id = this.siguienteId++
    return new Promise((resolver) => {
      this.pendientes.set(id, resolver)
      this.hilo!.postMessage({ tipo: 'atras', id })
    })
  }

  vaciar(): void {
    if (this.hilo) this.hilo.postMessage({ tipo: 'vaciar' })
    else this.local?.vaciar()
  }

  cerrar(): void {
    this.hilo?.terminate()
    this.hilo = null
    this.local = null
    for (const r of this.pendientes.values()) r(null)
    this.pendientes.clear()
  }
}
