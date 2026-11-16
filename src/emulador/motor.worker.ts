/**
 * Hilo del motor (v0.31.0): recibe las llamadas de `conexion.ts` ({ id, metodo, args }) y contesta
 * con el resultado o el error. Las imágenes, el sonido y los estados viajan sin copiarse.
 */
import { Motor, type ConfigMotor, type PeticionFotogramas } from './motor'
import { prepararNucleo } from './nucleo'
import type { Disposicion } from './pintor'
import type { NombreNucleo } from '../lib/sistemas'
import type { PantallasDS, PrincipalDS } from './pantallasDS'

let motor: Motor | null = null

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
  crear: async (c: ConfigMotor) => {
    motor?.descargar()
    motor = null
    const { motor: m, info } = await Motor.crear(c)
    motor = m
    return info
  },
  fotogramas: (p: PeticionFotogramas) => usar().fotogramas(p),
  partidaSiCambia: () => usar().partidaSiCambia(),
  guardarEstado: () => usar().guardarEstado(),
  cargarEstado: (datos: Uint8Array) => usar().cargarEstado(datos),
  deshacerCarga: () => usar().deshacerCarga(),
  irA: (estado: Uint8Array, botones: number) => usar().irA(estado, botones),
  ponerDisposicion: (d: Disposicion) => usar().ponerDisposicion(d),
  puntero: (x: number | null, y: number, pantallas: PantallasDS, principal: PrincipalDS) => usar().puntero(x, y, pantallas, principal),
  opcion: (clave: string, valor: string) => usar().opcion(clave, valor),
  reiniciar: () => usar().reiniciar(),
  descargar: () => {
    motor?.descargar()
    motor = null
  },
}

self.onmessage = async (e: MessageEvent<{ id: number; metodo: string; args: unknown[] }>) => {
  const { id, metodo, args } = e.data
  try {
    const r = await (metodos[metodo] as (...a: unknown[]) => unknown)(...args)
    ;(self as unknown as Worker).postMessage({ id, r }, transferibles(r))
  } catch (error) {
    ;(self as unknown as Worker).postMessage({ id, error: (error as Error)?.message ?? String(error) })
  }
}
