/**
 * Copia de las partidas en un archivo, para guardarla en Archivos o iCloud Drive y recuperarla en
 * otro iPhone. Lleva las partidas guardadas y, si se pide, los estados. Nunca lleva las ROMs.
 */
import {
  importarProgreso,
  importarSesiones,
  listarEstados,
  listarJuegos,
  listarPartidas,
  listarSesiones,
  type Estado,
  type Partida,
  type Ranura,
} from './almacen'
import type { SesionJuego } from './estadisticas'
import type { Sistema } from './sistemas'

export const FORMATO = 'puchiemulator-partidas'
export const VERSION_FORMATO = 1

interface PartidaArchivo {
  id: string
  nombre?: string
  sistema?: Sistema
  datos: string
  rtc?: string
  fecha: number
}

interface EstadoArchivo {
  id: string
  ranura: Ranura
  datos: string
  fecha: number
  captura?: string
}

export interface ArchivoPartidas {
  formato: typeof FORMATO
  version: number
  fecha: number
  app: string
  partidas: PartidaArchivo[]
  estados: EstadoArchivo[]
  /** Tiempo jugado (desde la v0.6.0; los archivos anteriores no lo traen) */
  sesiones?: SesionJuego[]
}

export function aBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function deBase64(texto: string): ArrayBuffer {
  const s = atob(texto)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes.buffer
}

export async function crearArchivo(conEstados: boolean, version: string): Promise<ArchivoPartidas> {
  const [juegos, partidas, estados, sesiones] = await Promise.all([listarJuegos(), listarPartidas(), conEstados ? listarEstados() : Promise.resolve([]), listarSesiones()])
  const porId = new Map(juegos.map((j) => [j.id, j]))
  return {
    formato: FORMATO,
    version: VERSION_FORMATO,
    fecha: Date.now(),
    app: version,
    partidas: partidas.map((p) => ({
      id: p.id,
      nombre: porId.get(p.id)?.nombre,
      sistema: porId.get(p.id)?.sistema,
      datos: aBase64(p.datos),
      rtc: p.rtc ? aBase64(p.rtc) : undefined,
      fecha: p.fecha,
    })),
    estados: estados.map((e) => ({
      id: e.id,
      ranura: e.ranura,
      datos: aBase64(e.datos),
      fecha: e.fecha,
      captura: e.captura ? aBase64(e.captura) : undefined,
    })),
    sesiones: sesiones.map(({ id: _id, ...s }) => s),
  }
}

export class ErrorArchivo extends Error {}

const RANURAS: Ranura[] = ['auto', 'rapida', '1', '2', '3']

/** Comprueba y convierte un archivo leído. Lanza ErrorArchivo con un mensaje para el usuario. */
export function leerArchivo(texto: string): { partidas: Partida[]; estados: Estado[]; sesiones: SesionJuego[] } {
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new ErrorArchivo('El archivo no es una copia de partidas.')
  }
  const a = datos as Partial<ArchivoPartidas>
  if (a?.formato !== FORMATO || !Array.isArray(a.partidas)) throw new ErrorArchivo('El archivo no es una copia de partidas de PuchiEmulator.')
  if ((a.version ?? 0) > VERSION_FORMATO) throw new ErrorArchivo('La copia es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo.')
  const valido = (id: unknown) => typeof id === 'string' && /^[0-9a-f]{40}$/.test(id)
  const partidas: Partida[] = []
  for (const p of a.partidas) {
    if (!valido(p.id) || typeof p.datos !== 'string') throw new ErrorArchivo('La copia está dañada.')
    partidas.push({ id: p.id, datos: deBase64(p.datos), rtc: p.rtc ? deBase64(p.rtc) : undefined, fecha: Number(p.fecha) || Date.now() })
  }
  const estados: Estado[] = []
  for (const e of a.estados ?? []) {
    if (!valido(e.id) || typeof e.datos !== 'string' || !RANURAS.includes(e.ranura)) throw new ErrorArchivo('La copia está dañada.')
    estados.push({
      clave: `${e.id}:${e.ranura}`,
      id: e.id,
      ranura: e.ranura,
      datos: deBase64(e.datos),
      fecha: Number(e.fecha) || Date.now(),
      captura: e.captura ? deBase64(e.captura) : undefined,
    })
  }
  const sesiones: SesionJuego[] = []
  for (const x of a.sesiones ?? []) {
    if (!valido(x.juegoId) || !Number.isFinite(x.inicio) || !Number.isFinite(x.fin) || !Number.isFinite(x.ms) || x.ms < 0) throw new ErrorArchivo('La copia está dañada.')
    sesiones.push({ juegoId: x.juegoId, nombre: String(x.nombre ?? ''), sistema: x.sistema, inicio: x.inicio, fin: x.fin, ms: x.ms })
  }
  return { partidas, estados, sesiones }
}

/** Importa una copia: sustituye la partida y los estados de los juegos que vienen en ella. */
export async function importarArchivo(texto: string): Promise<{ partidas: number; estados: number; sesiones: number }> {
  const { partidas, estados, sesiones } = leerArchivo(texto)
  await importarProgreso(partidas, estados)
  const nuevas = await importarSesiones(sesiones)
  return { partidas: partidas.length, estados: estados.length, sesiones: nuevas }
}

export function nombreArchivo(fecha = new Date()): string {
  const d = (n: number) => String(n).padStart(2, '0')
  return `PuchiEmulator-partidas-${fecha.getFullYear()}-${d(fecha.getMonth() + 1)}-${d(fecha.getDate())}.json`
}

/** Comparte el archivo con la hoja de compartir del iPhone (Guardar en Archivos) o lo descarga. */
export async function compartirArchivo(contenido: string, nombre: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const fichero = new File([contenido], nombre, { type: 'application/json' })
  if (navigator.canShare?.({ files: [fichero] })) {
    try {
      await navigator.share({ files: [fichero], title: nombre })
      return 'compartido'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelado'
    }
  }
  const url = URL.createObjectURL(fichero)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'descargado'
}
