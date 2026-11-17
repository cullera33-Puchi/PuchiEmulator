/**
 * Conexión con el motor de la partida (v0.31.0). Normalmente, un hilo aparte (`motor.worker.ts`), uno
 * solo para toda la app: así el núcleo que se prepara al abrirla ya está compilado allí. Si el hilo no
 * arranca o no contesta, el mismo motor en el hilo principal (como hasta la v0.30.0).
 */
import type { NombreNucleo } from '../lib/sistemas'
import { Motor, type ConfigMotor, type InfoMotor, type PeticionFotogramas, type ResultadoFotogramas } from './motor'
import { prepararNucleo, type FicheroSombreadores } from './nucleo'
import type { PantallasDS, PrincipalDS } from './pantallasDS'
import type { Disposicion, Imagenes } from './pintor'
import type { EntradaRitmo, EventoRitmo, MedidaRitmo } from './ritmoPropio'

/** El hilo no ha arrancado o ha dejado de contestar (no es un fallo del juego) */
export class ErrorHilo extends Error {}

/** Lo que tarda como mucho en abrir un juego el hilo antes de darlo por perdido */
const ESPERA_CREAR_MS = 20_000

export interface ConexionMotor {
  readonly enHilo: boolean
  crear(c: ConfigMotor): Promise<InfoMotor>
  fotogramas(p: PeticionFotogramas): Promise<ResultadoFotogramas>
  partidaSiCambia(): Promise<{ datos: Uint8Array; rtc?: Uint8Array } | null>
  sombreadoresSiCambian(): Promise<FicheroSombreadores[] | null>
  guardarEstado(): Promise<{ datos: Uint8Array; captura?: ArrayBuffer } | null>
  cargarEstado(datos: Uint8Array): Promise<{ ok: boolean; imagenes: Imagenes | null }>
  deshacerCarga(): Promise<{ ok: boolean; imagenes: Imagenes | null }>
  irA(estado: Uint8Array, botones: number): Promise<Imagenes | null>
  ponerDisposicion(d: Disposicion): Promise<Imagenes | null>
  puntero(x: number | null, y: number, pantallas: PantallasDS, principal: PrincipalDS): Promise<void>
  opcion(clave: string, valor: string): Promise<void>
  reiniciar(): Promise<void>
  /** Discos del juego y cambiar de disco (PlayStation, v0.38.0) */
  discos(): Promise<{ total: number; actual: number }>
  cambiarDisco(indice: number): Promise<boolean>
  ponerMando(tipo: number): Promise<void>
  descargar(): Promise<void>
  /** Ritmo propio (v0.33.0): solo en el hilo aparte */
  readonly ritmo?: RitmoConexion
}

/**
 * El bucle de fotogramas del hilo (`ritmoPropio.ts`), visto desde la página. Los avisos no esperan
 * respuesta: los botones tienen que llegar cuanto antes.
 */
export interface RitmoConexion {
  arrancar(entrada: EntradaRitmo, velocidad: number, limite30: boolean): void
  parar(): void
  entrada(e: EntradaRitmo): void
  velocidad(v: number): void
  limite30(activo: boolean): void
  /** Canal directo al procesador de audio, con su frecuencia y la cola que se busca */
  sonido(puerto: MessagePort, frecuenciaSalida: number, objetivo: number): void
  vaciarSonido(): void
  medida(): Promise<MedidaRitmo>
  /** Imágenes nuevas y fallos que manda el hilo por su cuenta */
  alEvento(f: ((e: EventoRitmo) => void) | null): void
}

/** El motor en el hilo principal: las mismas llamadas, sin mensajes. */
class ConexionLocal implements ConexionMotor {
  readonly enHilo = false
  private motor: Motor | null = null

  private usar(): Motor {
    if (!this.motor) throw new Error('No hay ningún juego abierto en el motor')
    return this.motor
  }

  async crear(c: ConfigMotor): Promise<InfoMotor> {
    const { motor, info } = await Motor.crear(c)
    this.motor = motor
    return info
  }

  fotogramas = async (p: PeticionFotogramas) => this.usar().fotogramas(p)
  partidaSiCambia = async () => this.usar().partidaSiCambia()
  sombreadoresSiCambian = async () => this.usar().sombreadoresSiCambian()
  guardarEstado = async () => this.usar().guardarEstado()
  cargarEstado = async (datos: Uint8Array) => this.usar().cargarEstado(datos)
  deshacerCarga = async () => this.usar().deshacerCarga()
  irA = async (estado: Uint8Array, botones: number) => this.usar().irA(estado, botones)
  ponerDisposicion = async (d: Disposicion) => this.usar().ponerDisposicion(d)
  puntero = async (x: number | null, y: number, pantallas: PantallasDS, principal: PrincipalDS) => this.usar().puntero(x, y, pantallas, principal)
  opcion = async (clave: string, valor: string) => this.usar().opcion(clave, valor)
  reiniciar = async () => this.usar().reiniciar()
  discos = async () => this.usar().discos()
  cambiarDisco = async (indice: number) => this.usar().cambiarDisco(indice)
  ponerMando = async (tipo: number) => this.usar().ponerMando(tipo)
  descargar = async () => {
    this.motor?.descargar()
    this.motor = null
  }
}

/** El hilo, compartido por todas las partidas; se vuelve a crear si se cae. */
class Hilo {
  private readonly hilo: Worker
  private siguiente = 1
  private readonly pendientes = new Map<number, { resolver: (r: unknown) => void; rechazar: (e: unknown) => void }>()
  caido = false
  /** A quién se pasan los eventos del ritmo propio (imágenes y fallos) */
  alEvento: ((e: EventoRitmo) => void) | null = null

  constructor() {
    this.hilo = new Worker(new URL('./motor.worker.ts', import.meta.url), { type: 'module' })
    this.hilo.onmessage = (e: MessageEvent<{ id: number; r?: unknown; error?: string } | EventoRitmo>) => {
      if ('evento' in e.data) {
        if (this.alEvento) this.alEvento(e.data)
        else if (e.data.evento === 'imagen') {
          e.data.imagenes.imagen.close()
          e.data.imagenes.mini?.close()
        }
        return
      }
      const p = this.pendientes.get(e.data.id)
      if (!p) return
      this.pendientes.delete(e.data.id)
      if (e.data.error !== undefined) p.rechazar(new Error(e.data.error))
      else p.resolver(e.data.r)
    }
    const caer = (motivo: string) => {
      this.caido = true
      for (const p of this.pendientes.values()) p.rechazar(new ErrorHilo(motivo))
      this.pendientes.clear()
    }
    this.hilo.onerror = (e) => caer(e.message || 'El hilo del motor no ha arrancado')
    this.hilo.onmessageerror = () => caer('Mensaje del hilo ilegible')
  }

  llamar<T>(metodo: string, args: unknown[] = [], transferir: Transferable[] = []): Promise<T> {
    if (this.caido) return Promise.reject(new ErrorHilo('El hilo del motor se ha caído'))
    const id = this.siguiente++
    return new Promise<T>((resolver, rechazar) => {
      this.pendientes.set(id, { resolver: resolver as (r: unknown) => void, rechazar })
      try {
        this.hilo.postMessage({ id, metodo, args }, transferir)
      } catch (e) {
        this.pendientes.delete(id)
        rechazar(new ErrorHilo((e as Error)?.message ?? 'No se ha podido hablar con el hilo'))
      }
    })
  }

  /** Aviso sin respuesta (id 0). */
  avisar(metodo: string, args: unknown[] = [], transferir: Transferable[] = []): void {
    if (this.caido) return
    try {
      this.hilo.postMessage({ id: 0, metodo, args }, transferir)
    } catch {
      // si el hilo se ha caído, lo dirá la siguiente llamada
    }
  }

  terminar(): void {
    this.caido = true
    this.hilo.terminate()
  }
}

let hilo: Hilo | null = null

function hiloVivo(): Hilo {
  if (!hilo || hilo.caido) hilo = new Hilo()
  return hilo
}

class ConexionHilo implements ConexionMotor {
  readonly enHilo = true
  private readonly h = hiloVivo()

  async crear(c: ConfigMotor): Promise<InfoMotor> {
    let espera = 0
    const limite = new Promise<never>((_, rechazar) => {
      espera = window.setTimeout(() => rechazar(new ErrorHilo('El hilo del motor no contesta')), ESPERA_CREAR_MS)
    })
    try {
      return await Promise.race([this.h.llamar<InfoMotor>('crear', [c]), limite])
    } catch (e) {
      // Si no contesta, se descarta: la próxima vez se crea otro
      if (e instanceof ErrorHilo) this.h.terminar()
      throw e
    } finally {
      clearTimeout(espera)
    }
  }

  fotogramas = (p: PeticionFotogramas) => this.h.llamar<ResultadoFotogramas>('fotogramas', [p])
  partidaSiCambia = () => this.h.llamar<{ datos: Uint8Array; rtc?: Uint8Array } | null>('partidaSiCambia')
  sombreadoresSiCambian = () => this.h.llamar<FicheroSombreadores[] | null>('sombreadoresSiCambian')
  guardarEstado = () => this.h.llamar<{ datos: Uint8Array; captura?: ArrayBuffer } | null>('guardarEstado')
  cargarEstado = (datos: Uint8Array) => this.h.llamar<{ ok: boolean; imagenes: Imagenes | null }>('cargarEstado', [datos])
  deshacerCarga = () => this.h.llamar<{ ok: boolean; imagenes: Imagenes | null }>('deshacerCarga')
  irA = (estado: Uint8Array, botones: number) => this.h.llamar<Imagenes | null>('irA', [estado, botones], [estado.buffer as ArrayBuffer])
  ponerDisposicion = (d: Disposicion) => this.h.llamar<Imagenes | null>('ponerDisposicion', [d])
  puntero = (x: number | null, y: number, pantallas: PantallasDS, principal: PrincipalDS) => this.h.llamar<void>('puntero', [x, y, pantallas, principal])
  opcion = (clave: string, valor: string) => this.h.llamar<void>('opcion', [clave, valor])
  reiniciar = () => this.h.llamar<void>('reiniciar')
  discos = () => this.h.llamar<{ total: number; actual: number }>('discos')
  cambiarDisco = (indice: number) => this.h.llamar<boolean>('cambiarDisco', [indice])
  ponerMando = (tipo: number) => this.h.llamar<void>('ponerMando', [tipo])
  /** El manejador de eventos de esta partida: al descargar se quita solo si sigue siendo el suyo */
  private miEvento: ((e: EventoRitmo) => void) | null = null
  descargar = () => {
    if (this.h.alEvento === this.miEvento) this.h.alEvento = null
    return this.h.llamar<void>('descargar')
  }
  readonly ritmo: RitmoConexion = {
    arrancar: (entrada, velocidad, limite30) => this.h.avisar('ritmoArrancar', [entrada, velocidad, limite30]),
    parar: () => this.h.avisar('ritmoParar'),
    entrada: (e) => this.h.avisar('ritmoEntrada', [e]),
    velocidad: (v) => this.h.avisar('ritmoVelocidad', [v]),
    limite30: (activo) => this.h.avisar('ritmoLimite30', [activo]),
    sonido: (puerto, frecuenciaSalida, objetivo) => this.h.avisar('ritmoSonido', [puerto, frecuenciaSalida, objetivo], [puerto]),
    vaciarSonido: () => this.h.avisar('ritmoVaciarSonido'),
    medida: () => this.h.llamar<MedidaRitmo>('ritmoMedida'),
    alEvento: (f) => {
      this.h.alEvento = f
      this.miEvento = f
    },
  }
}

/**
 * Abre el juego en el motor: en el hilo aparte si se puede (y si no se ha desactivado en Ajustes); si
 * el hilo no arranca o no contesta, en el hilo principal. Un fallo del juego (ROM o núcleo) no cambia
 * de hilo: se devuelve tal cual.
 */
export async function abrirMotor(c: ConfigMotor, enHilo: boolean): Promise<{ conexion: ConexionMotor; info: InfoMotor; motivoLocal?: string }> {
  if (enHilo && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const conexion = new ConexionHilo()
      return { conexion, info: await conexion.crear(c) }
    } catch (e) {
      if (!(e instanceof ErrorHilo)) throw e
      const local = new ConexionLocal()
      return { conexion: local, info: await local.crear(c), motivoLocal: e.message }
    }
  }
  const local = new ConexionLocal()
  return { conexion: local, info: await local.crear(c), motivoLocal: enHilo ? 'Sin hilos ni OffscreenCanvas' : 'Desactivado en Ajustes' }
}

/** Núcleos que ya están compilados en el hilo (para el registro de la apertura). */
const preparadosEnHilo = new Set<NombreNucleo>()
export const preparadoEnHilo = (n: NombreNucleo) => preparadosEnHilo.has(n)

/**
 * Deja compilado un núcleo donde se va a usar: en el hilo aparte o, si no, en el principal (v0.28.0,
 * en el hilo desde la v0.31.0).
 */
export async function prepararMotor(n: NombreNucleo, enHilo: boolean): Promise<'hilo' | 'principal'> {
  if (enHilo && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      await hiloVivo().llamar('preparar', [n])
      preparadosEnHilo.add(n)
      return 'hilo'
    } catch (e) {
      if (!(e instanceof ErrorHilo)) throw e
    }
  }
  await prepararNucleo(n)
  return 'principal'
}
