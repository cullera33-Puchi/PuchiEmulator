/**
 * Hilo del motor (v0.31.0): recibe las llamadas de `conexion.ts` ({ id, metodo, args }) y contesta
 * con el resultado o el error. Las imágenes, el sonido y los estados viajan sin copiarse.
 */
import { Motor, type ConfigMotor, type PeticionFotogramas } from './motor'
import { prepararNucleo } from './nucleo'
import { RitmoPropio, SonidoHilo, type EntradaRitmo, type EventoRitmo } from './ritmoPropio'
import type { Disposicion } from './pintor'
import type { NombreNucleo } from '../lib/sistemas'
import type { PantallasDS, PrincipalDS } from './pantallasDS'

let motor: Motor | null = null
/** Ritmo propio (v0.33.0; todas las consolas desde la v0.41.0): el bucle de fotogramas del hilo */
let ritmo: RitmoPropio | null = null
/** Número de la partida abierta (v0.43.0), lo pone la página */
let partidaActual: number | undefined

const emitir = (e: EventoRitmo, transferir: Transferable[]) => (self as unknown as Worker).postMessage(e, transferir)

const conRitmo = (): RitmoPropio => {
  const m = usar()
  ritmo ??= new RitmoPropio(m, m.fps, m.frecuencia, emitir)
  return ritmo
}

const soltarRitmo = () => {
  ritmo?.cerrar()
  ritmo = null
}

/** Lo que se puede pasar sin copiar dentro de un resultado */
function transferibles(r: unknown, lista: Transferable[] = []): Transferable[] {
  if (!r || typeof r !== 'object') return lista
  if (r instanceof ImageBitmap) lista.push(r)
  else if (ArrayBuffer.isView(r)) {
    if (r.buffer instanceof ArrayBuffer && !lista.includes(r.buffer)) lista.push(r.buffer)
  } else if (r instanceof ArrayBuffer) {
    if (!lista.includes(r)) lista.push(r)
  } else if (Array.isArray(r)) for (const x of r) transferibles(x, lista)
  else for (const x of Object.values(r)) transferibles(x, lista)
  return lista
}

const usar = (): Motor => {
  if (!motor) throw new Error('No hay ningún juego abierto en el motor')
  return motor
}

const metodos: Record<string, (...args: never[]) => unknown> = {
  preparar: async (nombre: NombreNucleo) => {
    await prepararNucleo(nombre)
    return true
  },
  crear: async (c: ConfigMotor, partida?: number) => {
    soltarRitmo()
    motor?.descargar()
    motor = null
    partidaActual = partida
    const { motor: m, info } = await Motor.crear(c)
    // Si mientras se abría ha llegado otra apertura, esta ya no vale
    if (partidaActual !== partida) {
      m.descargar()
      throw new Error('Se ha abierto otro juego')
    }
    motor = m
    return info
  },
  fotogramas: (p: PeticionFotogramas) => usar().fotogramas(p),
  partidaSiCambia: () => usar().partidaSiCambia(),
  sombreadoresSiCambian: () => usar().sombreadoresSiCambian(),
  guardarEstado: () => usar().guardarEstado(),
  cargarEstado: (datos: Uint8Array) => usar().cargarEstado(datos),
  deshacerCarga: () => usar().deshacerCarga(),
  irA: (estado: Uint8Array, botones: number) => usar().irA(estado, botones),
  ponerDisposicion: (d: Disposicion) => usar().ponerDisposicion(d),
  puntero: (x: number | null, y: number, pantallas: PantallasDS, principal: PrincipalDS) => usar().puntero(x, y, pantallas, principal),
  opcion: (clave: string, valor: string) => usar().opcion(clave, valor),
  reiniciar: () => usar().reiniciar(),
  discos: () => usar().discos(),
  cambiarDisco: (indice: number) => usar().cambiarDisco(indice),
  ponerTrucos: (codigos: string[]) => usar().ponerTrucos(codigos),
  ponerMando: (tipo: number) => usar().ponerMando(tipo),
  descargar: (partida?: number) => {
    // El cierre tardío de un juego anterior no descarga el que se acaba de abrir (v0.43.0)
    if (partida !== undefined && partidaActual !== undefined && partida !== partidaActual) return
    soltarRitmo()
    motor?.descargar()
    motor = null
  },
  ritmoArrancar: (entrada: EntradaRitmo, velocidad: number, limite30: boolean) => conRitmo().arrancar(entrada, velocidad, limite30),
  ritmoParar: () => ritmo?.parar(),
  ritmoEntrada: (entrada: EntradaRitmo) => ritmo?.ponerEntrada(entrada),
  ritmoPulso: (n: number, ritmoReal: number, hora?: number) => ritmo?.pulso(n, ritmoReal, hora),
  ritmoImagenVista: () => ritmo?.imagenVista(),
  ritmoVelocidad: (v: number) => conRitmo().ponerVelocidad(v),
  ritmoLimite30: (activo: boolean) => conRitmo().ponerLimite30(activo),
  ritmoSonido: (puerto: MessagePort, frecuenciaSalida: number, objetivo: number) => conRitmo().ponerSonido(new SonidoHilo(puerto, frecuenciaSalida, objetivo)),
  ritmoVaciarSonido: () => ritmo?.vaciarSonido(),
  ritmoMedida: () => conRitmo().tomarMedida(),
}

self.onmessage = async (e: MessageEvent<{ id: number; metodo: string; args: unknown[] }>) => {
  const { id, metodo, args } = e.data
  // Avisos sin respuesta (id 0): los botones del ritmo propio, que llegan a cada cambio
  if (id === 0) {
    try {
      ;(metodos[metodo] as (...a: unknown[]) => unknown)(...args)
    } catch (error) {
      // Un aviso no tiene a quién contestar: si falla el del ritmo propio, se dice como fallo (v0.36.0)
      if (metodo.startsWith('ritmo')) emitir({ evento: 'fallo', mensaje: (error as Error)?.message ?? String(error) }, [])
    }
    return
  }
  try {
    const r = await (metodos[metodo] as (...a: unknown[]) => unknown)(...args)
    ;(self as unknown as Worker).postMessage({ id, r }, transferibles(r))
  } catch (error) {
    ;(self as unknown as Worker).postMessage({ id, error: (error as Error)?.message ?? String(error) })
  }
}
