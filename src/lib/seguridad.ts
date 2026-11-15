/**
 * Copias de seguridad de las partidas en el propio iPhone (guía de usabilidad, apartado 12).
 * - Una al día, al abrir la app; se conservan las 7 más recientes.
 * - Otra antes de recuperar una copia de Archivos o de restaurar una de estas.
 * Solo llevan las partidas guardadas dentro de los juegos (pesan poco). Los estados no entran:
 * pueden ocupar medio mega cada uno.
 */
import { listarPartidas, sustituirPartidas, type Partida } from './almacen'
import { registrar } from './registro'

export interface MetaCopia {
  fecha: string // AAAA-MM-DD, o con hora si es manual o previa
  creada: number
  partidas: number
  motivo: 'diaria' | 'manual' | 'previa'
}

interface Copia {
  fecha: string
  creada: number
  partidas: Partida[]
}

const BASE = 'puchiemulator-copias'
const MAXIMO = 7
const CLAVE_SALTAR = 'puchiemulator-copia-saltar'

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const p = indexedDB.open(BASE, 1)
    p.onupgradeneeded = () => {
      const bd = p.result
      if (!bd.objectStoreNames.contains('copias')) bd.createObjectStore('copias', { keyPath: 'fecha' })
      if (!bd.objectStoreNames.contains('meta')) bd.createObjectStore('meta', { keyPath: 'fecha' })
    }
    p.onsuccess = () => resolver(p.result)
    p.onerror = () => rechazar(p.error)
  })
}

async function transaccion(modo: IDBTransactionMode, fn: (copias: IDBObjectStore, meta: IDBObjectStore) => void): Promise<void> {
  const bd = await abrir()
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(['copias', 'meta'], modo)
    fn(tx.objectStore('copias'), tx.objectStore('meta'))
    tx.oncomplete = () => {
      bd.close()
      resolver()
    }
    tx.onerror = () => {
      bd.close()
      rechazar(tx.error)
    }
  })
}

export function hoy(d = new Date()): string {
  const n = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}`
}

export async function listarCopias(): Promise<MetaCopia[]> {
  const bd = await abrir()
  return new Promise((resolver, rechazar) => {
    const p = bd.transaction('meta').objectStore('meta').getAll()
    p.onsuccess = () => {
      bd.close()
      resolver((p.result as MetaCopia[]).sort((a, b) => b.creada - a.creada))
    }
    p.onerror = () => rechazar(p.error)
  })
}

async function leerCopia(fecha: string): Promise<Copia | undefined> {
  const bd = await abrir()
  return new Promise((resolver, rechazar) => {
    const p = bd.transaction('copias').objectStore('copias').get(fecha)
    p.onsuccess = () => {
      bd.close()
      resolver(p.result as Copia | undefined)
    }
    p.onerror = () => rechazar(p.error)
  })
}

export async function crearCopia(motivo: MetaCopia['motivo']): Promise<MetaCopia> {
  const partidas = await listarPartidas()
  const ahora = new Date()
  const fecha = motivo === 'diaria' ? hoy(ahora) : `${hoy(ahora)} ${ahora.toTimeString().slice(0, 8)}`
  const meta: MetaCopia = { fecha, creada: ahora.getTime(), partidas: partidas.length, motivo }
  await transaccion('readwrite', (c, m) => {
    c.put({ fecha, creada: meta.creada, partidas })
    m.put(meta)
  })
  const sobran = (await listarCopias()).slice(MAXIMO)
  if (sobran.length) {
    await transaccion('readwrite', (c, m) =>
      sobran.forEach((s) => {
        c.delete(s.fecha)
        m.delete(s.fecha)
      }),
    )
  }
  registrar('info', `Copia de seguridad ${motivo}`, { partidas: partidas.length })
  return meta
}

/** Al abrir la app: la copia del día si no está hecha (y no se borró a mano hoy). */
export async function copiaDiaria(): Promise<void> {
  try {
    const d = hoy()
    try {
      if (localStorage.getItem(CLAVE_SALTAR) === d) return
    } catch {
      // sin almacenamiento
    }
    if ((await listarCopias()).some((c) => c.fecha === d)) return
    if (!(await listarPartidas()).length) return
    await crearCopia('diaria')
  } catch (e) {
    registrar('aviso', 'Sin copias de seguridad', (e as Error).message)
  }
}

/** Restaura una copia: sustituye todas las partidas. Devuelve las de antes, para deshacer. */
export async function restaurarCopia(fecha: string): Promise<{ antes: Partida[]; restauradas: number }> {
  const copia = await leerCopia(fecha)
  if (!copia) throw new Error('La copia ya no existe')
  const antes = await listarPartidas()
  await crearCopia('previa')
  await sustituirPartidas(copia.partidas)
  registrar('info', 'Copia de seguridad restaurada', { partidas: copia.partidas.length })
  return { antes, restauradas: copia.partidas.length }
}

export async function borrarCopia(fecha: string): Promise<void> {
  await transaccion('readwrite', (c, m) => {
    c.delete(fecha)
    m.delete(fecha)
  })
  // Si se borra a mano la de hoy, no se vuelve a crear hasta mañana
  if (fecha === hoy()) {
    try {
      localStorage.setItem(CLAVE_SALTAR, fecha)
    } catch {
      // sin almacenamiento
    }
  }
  registrar('info', 'Copia de seguridad borrada')
}

export async function borrarTodasLasCopias(): Promise<void> {
  await transaccion('readwrite', (c, m) => {
    c.clear()
    m.clear()
  })
  try {
    localStorage.setItem(CLAVE_SALTAR, hoy())
  } catch {
    // sin almacenamiento
  }
  registrar('info', 'Copias de seguridad borradas')
}
