/**
 * Todo lo que guarda la app en el iPhone, en IndexedDB:
 * - juegos: la ficha de cada juego de la biblioteca (sin la ROM, para listar rápido).
 * - roms: la copia de la ROM, por el mismo identificador.
 * - partidas: la partida guardada del juego (SRAM, Flash o EEPROM, y el reloj del cartucho).
 * - estados: estados guardados, por juego y ranura («auto» es el de reanudar).
 *
 * El identificador de un juego es el SHA-1 de su ROM: si se quita de la biblioteca y se vuelve a
 * añadir, encuentra su partida.
 */
import type { SesionJuego } from './estadisticas'
import type { Sistema } from './sistemas'

export interface Juego {
  id: string
  nombre: string
  sistema: Sistema
  titulo: string
  nombreFichero: string
  tam: number
  anadido: number
  ultimaVez?: number
  /** Ya se buscó su carátula automáticamente (se busca una sola vez) */
  caratulaBuscada?: boolean
  /** Marcado como favorito: sale primero en la biblioteca (v0.14.0) */
  favorito?: boolean
}

/** Notas del usuario sobre un juego (v0.14.0). Van aparte del juego: se conservan si se quita y viajan en la copia. */
export interface Nota {
  id: string
  texto: string
  fecha: number
}

export interface Partida {
  id: string
  datos: ArrayBuffer
  rtc?: ArrayBuffer
  fecha: number
}

/** «auto» es el de seguir donde se dejó; «rapida», la del botón de guardar rápido */
export type Ranura = 'auto' | 'rapida' | '1' | '2' | '3'

export interface Estado {
  clave: string
  id: string
  ranura: Ranura
  datos: ArrayBuffer
  fecha: number
  /** Captura de la pantalla en PNG, para reconocer el estado */
  captura?: ArrayBuffer
}

export interface Caratula {
  id: string
  datos: ArrayBuffer
  origen: 'libretro' | 'propia'
  fecha: number
}

const NOMBRE = 'puchiemulator'
/** 1: juegos, roms, partidas y estados. 2: carátulas. 3: sesiones de juego (tiempo jugado). 4: notas. */
const VERSION = 4

let abierta: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  abierta ??= new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE, VERSION)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains('juegos')) bd.createObjectStore('juegos', { keyPath: 'id' })
      if (!bd.objectStoreNames.contains('roms')) bd.createObjectStore('roms')
      if (!bd.objectStoreNames.contains('partidas')) bd.createObjectStore('partidas', { keyPath: 'id' })
      if (!bd.objectStoreNames.contains('estados')) {
        const estados = bd.createObjectStore('estados', { keyPath: 'clave' })
        estados.createIndex('id', 'id')
      }
      if (!bd.objectStoreNames.contains('caratulas')) bd.createObjectStore('caratulas', { keyPath: 'id' })
      if (!bd.objectStoreNames.contains('sesiones')) {
        const sesiones = bd.createObjectStore('sesiones', { keyPath: 'id', autoIncrement: true })
        sesiones.createIndex('juegoId', 'juegoId')
      }
      if (!bd.objectStoreNames.contains('notas')) bd.createObjectStore('notas', { keyPath: 'id' })
    }
    peticion.onsuccess = () => {
      const bd = peticion.result
      // Si otra pestaña abre una versión nueva, se cierra esta conexión para no bloquearla
      bd.onversionchange = () => {
        bd.close()
        abierta = null
      }
      resolver(bd)
    }
    peticion.onerror = () => {
      abierta = null
      rechazar(peticion.error)
    }
  })
  return abierta
}

/** Solo para las pruebas: olvida la conexión abierta. */
export function _reiniciarConexion(): void {
  abierta = null
}

function esperar<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

function terminar(tx: IDBTransaction): Promise<void> {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error)
    tx.onabort = () => rechazar(tx.error ?? new Error('Transacción cancelada'))
  })
}

async function leer<T>(almacen: string, clave: IDBValidKey): Promise<T | undefined> {
  const bd = await abrir()
  return esperar(bd.transaction(almacen).objectStore(almacen).get(clave)) as Promise<T | undefined>
}

async function todos<T>(almacen: string): Promise<T[]> {
  const bd = await abrir()
  return esperar(bd.transaction(almacen).objectStore(almacen).getAll()) as Promise<T[]>
}

async function poner(almacen: string, valor: unknown, clave?: IDBValidKey): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(almacen, 'readwrite')
  tx.objectStore(almacen).put(valor, clave)
  await terminar(tx)
}

/* ---- Juegos ---- */

export function listarJuegos(): Promise<Juego[]> {
  return todos<Juego>('juegos')
}

export function leerJuego(id: string): Promise<Juego | undefined> {
  return leer<Juego>('juegos', id)
}

export async function guardarJuego(juego: Juego, rom: ArrayBuffer): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(['juegos', 'roms'], 'readwrite')
  tx.objectStore('juegos').put(juego)
  tx.objectStore('roms').put(rom, juego.id)
  await terminar(tx)
}

export function actualizarJuego(juego: Juego): Promise<void> {
  return poner('juegos', juego)
}

export function leerRomGuardada(id: string): Promise<ArrayBuffer | undefined> {
  return leer<ArrayBuffer>('roms', id)
}

/** Quita el juego y su ROM de la biblioteca. La partida y los estados se conservan. */
export async function quitarJuego(id: string): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(['juegos', 'roms'], 'readwrite')
  tx.objectStore('juegos').delete(id)
  tx.objectStore('roms').delete(id)
  await terminar(tx)
}

/* ---- Carátulas ---- */

export function listarCaratulas(): Promise<Caratula[]> {
  return todos<Caratula>('caratulas')
}

export function leerCaratula(id: string): Promise<Caratula | undefined> {
  return leer<Caratula>('caratulas', id)
}

export function guardarCaratula(c: Caratula): Promise<void> {
  return poner('caratulas', c)
}

export async function borrarCaratula(id: string): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction('caratulas', 'readwrite')
  tx.objectStore('caratulas').delete(id)
  await terminar(tx)
}

/* ---- Sesiones de juego (tiempo jugado) ---- */

export function listarSesiones(): Promise<SesionJuego[]> {
  return todos<SesionJuego>('sesiones')
}

/** Guarda o actualiza una sesión y devuelve su identificador. */
export async function guardarSesionJuego(s: SesionJuego): Promise<number> {
  const bd = await abrir()
  const tx = bd.transaction('sesiones', 'readwrite')
  const valor = s.id === undefined ? (({ id: _id, ...resto }) => resto)(s) : s
  const p = tx.objectStore('sesiones').put(valor)
  await terminar(tx)
  return p.result as number
}

/** Añade sesiones de una copia sin repetir las que ya están (mismo juego y misma hora de inicio). */
export async function importarSesiones(sesiones: SesionJuego[]): Promise<number> {
  const existentes = new Set((await listarSesiones()).map((s) => `${s.juegoId}:${s.inicio}`))
  const nuevas = sesiones.filter((s) => !existentes.has(`${s.juegoId}:${s.inicio}`))
  if (!nuevas.length) return 0
  const bd = await abrir()
  const tx = bd.transaction('sesiones', 'readwrite')
  for (const { id: _id, ...s } of nuevas) tx.objectStore('sesiones').add(s)
  await terminar(tx)
  return nuevas.length
}

/* ---- Partidas ---- */

export function leerPartida(id: string): Promise<Partida | undefined> {
  return leer<Partida>('partidas', id)
}

export function listarPartidas(): Promise<Partida[]> {
  return todos<Partida>('partidas')
}

/** Cuántas partidas hay guardadas, sin leerlas. */
export async function contarPartidas(): Promise<number> {
  const bd = await abrir()
  return esperar(bd.transaction('partidas').objectStore('partidas').count()) as Promise<number>
}

export function guardarPartida(partida: Partida): Promise<void> {
  return poner('partidas', partida)
}

/** Sustituye todas las partidas (restaurar una copia de seguridad o deshacerlo). */
export async function sustituirPartidas(partidas: Partida[]): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction('partidas', 'readwrite')
  const almacen = tx.objectStore('partidas')
  almacen.clear()
  for (const p of partidas) almacen.put(p)
  await terminar(tx)
}

/* ---- Estados ---- */

export const claveEstado = (id: string, ranura: Ranura) => `${id}:${ranura}`

export function leerEstado(id: string, ranura: Ranura): Promise<Estado | undefined> {
  return leer<Estado>('estados', claveEstado(id, ranura))
}

export function guardarEstado(estado: Omit<Estado, 'clave'>): Promise<void> {
  return poner('estados', { ...estado, clave: claveEstado(estado.id, estado.ranura) })
}

export async function estadosDe(id: string): Promise<Estado[]> {
  const bd = await abrir()
  const indice = bd.transaction('estados').objectStore('estados').index('id')
  return esperar(indice.getAll(id)) as Promise<Estado[]>
}

export function listarEstados(): Promise<Estado[]> {
  return todos<Estado>('estados')
}

export async function borrarEstado(id: string, ranura: Ranura): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction('estados', 'readwrite')
  tx.objectStore('estados').delete(claveEstado(id, ranura))
  await terminar(tx)
}

/** Borra la partida guardada y todos los estados de un juego. */
export async function borrarProgreso(id: string): Promise<void> {
  const estados = await estadosDe(id)
  const bd = await abrir()
  const tx = bd.transaction(['partidas', 'estados'], 'readwrite')
  tx.objectStore('partidas').delete(id)
  for (const e of estados) tx.objectStore('estados').delete(e.clave)
  await terminar(tx)
}

/** Sustituye o añade partidas y estados en una sola transacción (importar una copia). */
export async function importarProgreso(partidas: Partida[], estados: Estado[]): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(['partidas', 'estados'], 'readwrite')
  for (const p of partidas) tx.objectStore('partidas').put(p)
  for (const e of estados) tx.objectStore('estados').put(e)
  await terminar(tx)
}

export function leerNota(id: string): Promise<Nota | undefined> {
  return leer<Nota>('notas', id)
}

export function listarNotas(): Promise<Nota[]> {
  return todos<Nota>('notas')
}

/** Guarda la nota; si queda vacía, la borra. */
export async function guardarNota(id: string, texto: string): Promise<void> {
  if (!texto.trim()) {
    const bd = await abrir()
    const tx = bd.transaction('notas', 'readwrite')
    tx.objectStore('notas').delete(id)
    return terminar(tx)
  }
  return poner('notas', { id, texto, fecha: Date.now() } satisfies Nota)
}

/** Recupera las notas de una copia: sustituyen a las de esos juegos. */
export async function importarNotas(notas: Nota[]): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction('notas', 'readwrite')
  for (const n of notas) tx.objectStore('notas').put(n)
  await terminar(tx)
}

/** Pide al navegador que no borre los datos si falta espacio. */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export async function espacioUsado(): Promise<{ usado: number; cuota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (!e) return null
    return { usado: e.usage ?? 0, cuota: e.quota ?? 0 }
  } catch {
    return null
  }
}
