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
import type { Disco } from './discos'
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
  /** Estado que elige el usuario (v0.15.0); sin él, «jugando» si ya se ha jugado y si no «pendiente» */
  estado?: EstadoJuego
  /** Fecha en que se marcó como terminado */
  terminado?: number
  /**
   * PlayStation (v0.37.0): el disco está en los ficheros de la app (OPFS), no en el almacén `roms`.
   * Al quitar el juego, la carpeta se queda hasta la siguiente apertura (para «Deshacer»)
   */
  disco?: Disco
}

export type EstadoJuego = 'pendiente' | 'jugando' | 'terminado' | 'abandonado'

/** Lo que el usuario dice de un juego y viaja en la copia: favorito, estado y fecha de terminado. */
export type FichaJuego = Pick<Juego, 'id' | 'favorito' | 'estado' | 'terminado'>

/** Notas del usuario sobre un juego (v0.14.0). Van aparte del juego: se conservan si se quita y viajan en la copia. */
export interface Nota {
  id: string
  texto: string
  fecha: number
}

/** Un truco: su nombre, el código tal cual y si está puesto (v0.48.0) */
export interface Truco {
  nombre: string
  codigo: string
  activo: boolean
  /** Lo ha escrito el usuario (no viene del archivo de trucos) */
  propio?: boolean
}

/**
 * Los trucos de un juego (v0.48.0), aparte de su ficha: un fichero del archivo puede traer más de
 * mil, y la ficha se lee entera con toda la biblioteca. `origen`: el fichero del que salieron.
 */
export interface TrucosJuego {
  id: string
  origen?: string
  trucos: Truco[]
  fecha: number
}

export interface Partida {
  id: string
  datos: ArrayBuffer
  rtc?: ArrayBuffer
  fecha: number
}

/** «auto» es el de seguir donde se dejó; «rapida», la del botón de guardar rápido */
/** Ranuras de estado que elige el usuario: nueve desde la v0.19.0 (antes, tres). */
export const RANURAS_USUARIO = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
export type Ranura = 'auto' | 'rapida' | (typeof RANURAS_USUARIO)[number]
export const RANURAS: Ranura[] = ['auto', 'rapida', ...RANURAS_USUARIO]

export interface Estado {
  clave: string
  id: string
  ranura: Ranura
  datos: ArrayBuffer
  fecha: number
  /** Captura de la pantalla en PNG, para reconocer el estado */
  captura?: ArrayBuffer
  /** Nombre que le pone el usuario («Antes del jefe»), v0.19.0 */
  nombre?: string
  /** PlayStation con varios discos (v0.47.0): el fichero del disco que estaba puesto */
  disco?: string
}

export interface Caratula {
  id: string
  datos: ArrayBuffer
  origen: 'libretro' | 'propia'
  fecha: number
}

const NOMBRE = 'puchiemulator'
/** 1: juegos, roms, partidas y estados. 2: carátulas. 3: sesiones de juego (tiempo jugado). 4: notas. 5: trucos (v0.48.0). */
const VERSION = 5

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
      if (!bd.objectStoreNames.contains('trucos')) bd.createObjectStore('trucos', { keyPath: 'id' })
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

export async function guardarJuego(juego: Juego, rom?: ArrayBuffer): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(['juegos', 'roms'], 'readwrite')
  tx.objectStore('juegos').put(juego)
  if (rom) tx.objectStore('roms').put(rom, juego.id)
  await terminar(tx)
}

export function actualizarJuego(juego: Juego): Promise<void> {
  return poner('juegos', juego)
}

/**
 * BIOS de PlayStation del usuario (v0.37.0): en el almacén de las ROM, con su propia clave. Nunca va
 * en las copias de partidas (como las ROM).
 */
const CLAVE_BIOS_PSX = 'bios:psx'

export function leerBiosPsx(): Promise<ArrayBuffer | undefined> {
  return leer<ArrayBuffer>('roms', CLAVE_BIOS_PSX)
}

export async function guardarBiosPsx(datos: ArrayBuffer | null): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(['roms'], 'readwrite')
  if (datos) tx.objectStore('roms').put(datos, CLAVE_BIOS_PSX)
  else tx.objectStore('roms').delete(CLAVE_BIOS_PSX)
  await terminar(tx)
}

/**
 * Lista de sombreadores de un juego de Nintendo 64 (v0.40.0): en el almacén de las ROM, con su propia
 * clave. Se rehace sola si se pierde; no va en las copias de partidas
 */
export interface Sombreadores {
  nombre: string
  datos: ArrayBuffer
}

const claveSombreadores = (id: string) => `sombreadores:${id}`

export function leerSombreadores(id: string): Promise<Sombreadores[] | undefined> {
  return leer<Sombreadores[]>('roms', claveSombreadores(id))
}

export async function guardarSombreadores(id: string, lista: Sombreadores[]): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction(['roms'], 'readwrite')
  tx.objectStore('roms').put(lista, claveSombreadores(id))
  await terminar(tx)
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
  tx.objectStore('roms').delete(claveSombreadores(id))
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

/** Guarda un estado. Si no trae nombre, conserva el que tuviera la ranura. */
export async function guardarEstado(estado: Omit<Estado, 'clave'>): Promise<void> {
  const clave = claveEstado(estado.id, estado.ranura)
  const nombre = estado.nombre ?? (await leer<Estado>('estados', clave))?.nombre
  return poner('estados', { ...estado, nombre, clave })
}

/** Pone o quita (vacío) el nombre de una ranura. */
export async function renombrarEstado(id: string, ranura: Ranura, nombre: string): Promise<void> {
  const e = await leer<Estado>('estados', claveEstado(id, ranura))
  if (!e) return
  return poner('estados', { ...e, nombre: nombre.trim() || undefined })
}

export async function estadosDe(id: string): Promise<Estado[]> {
  const bd = await abrir()
  const indice = bd.transaction('estados').objectStore('estados').index('id')
  return esperar(indice.getAll(id)) as Promise<Estado[]>
}

/** Un estado sin sus datos: lo que hace falta para enseñarlo en la lista de ranuras */
export type ResumenEstado = Omit<Estado, 'datos'>

/**
 * Los estados de un juego sin sus datos (v0.43.2), uno a uno. La lista de ranuras guardaba los estados
 * enteros mientras durase el juego: hasta 11 de 16 MB en Nintendo 64, cuando solo usa nombre, fecha y captura.
 */
export async function resumenEstados(id: string): Promise<ResumenEstado[]> {
  const bd = await abrir()
  const indice = bd.transaction('estados').objectStore('estados').index('id')
  return new Promise((resolver, rechazar) => {
    const lista: ResumenEstado[] = []
    const peticion = indice.openCursor(IDBKeyRange.only(id))
    peticion.onerror = () => rechazar(peticion.error)
    peticion.onsuccess = () => {
      const cursor = peticion.result
      if (!cursor) return resolver(lista)
      const e = cursor.value as Estado
      lista.push({ clave: e.clave, id: e.id, ranura: e.ranura, fecha: e.fecha, captura: e.captura, nombre: e.nombre, disco: e.disco })
      cursor.continue()
    }
  })
}

/** Si hay un estado en esa ranura, sin leerlo (v0.43.2) */
export async function hayEstado(id: string, ranura: Ranura): Promise<boolean> {
  const bd = await abrir()
  return (await esperar(bd.transaction('estados').objectStore('estados').count(claveEstado(id, ranura)))) > 0
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

/**
 * Deja los estados como estaban (v0.30.0, «Deshacer» al recuperar una copia): vuelve a poner los que
 * había y borra los que no existían antes.
 */
export async function restaurarEstados(previos: Estado[], nuevos: (readonly [string, Ranura])[]): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction('estados', 'readwrite')
  for (const [id, ranura] of nuevos) tx.objectStore('estados').delete(claveEstado(id, ranura))
  for (const e of previos) tx.objectStore('estados').put(e)
  await terminar(tx)
}

/**
 * Lo que ocupan los estados y la partida de cada juego (v0.38.0, Ajustes, Almacenamiento). Recorre
 * los almacenes con un cursor, de uno en uno: los estados de N64 pesan 16 MB y no se cargan todos a
 * la vez.
 */
export async function ocupacionGuardada(): Promise<Map<string, { estados: number; bytesEstados: number; partida: number }>> {
  const bd = await abrir()
  const mapa = new Map<string, { estados: number; bytesEstados: number; partida: number }>()
  const de = (id: string) => {
    let o = mapa.get(id)
    if (!o) mapa.set(id, (o = { estados: 0, bytesEstados: 0, partida: 0 }))
    return o
  }
  const recorrer = (almacen: 'estados' | 'partidas', alVer: (v: Estado | Partida) => void) =>
    new Promise<void>((resolver, rechazar) => {
      const peticion = bd.transaction(almacen).objectStore(almacen).openCursor()
      peticion.onsuccess = () => {
        const c = peticion.result
        if (!c) return resolver()
        alVer(c.value)
        c.continue()
      }
      peticion.onerror = () => rechazar(peticion.error)
    })
  await recorrer('estados', (v) => {
    const e = v as Estado
    const o = de(e.id)
    o.estados++
    o.bytesEstados += e.datos.byteLength + (e.captura?.byteLength ?? 0)
  })
  await recorrer('partidas', (v) => {
    const p = v as Partida
    de(p.id).partida = p.datos.byteLength + (p.rtc?.byteLength ?? 0)
  })
  return mapa
}

/** Borra los estados de un juego (la partida no) y los devuelve, para «Deshacer» (v0.38.0). */
export async function borrarEstadosDe(id: string): Promise<Estado[]> {
  const estados = await estadosDe(id)
  const bd = await abrir()
  const tx = bd.transaction('estados', 'readwrite')
  for (const e of estados) tx.objectStore('estados').delete(e.clave)
  await terminar(tx)
  return estados
}

/** Borra solo la partida de un juego, sin sus estados («Deshacer» al importar una, v0.38.0). */
export async function borrarSoloPartida(id: string): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction('partidas', 'readwrite')
  tx.objectStore('partidas').delete(id)
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

/** Recupera favorito y estado de una copia en los juegos que están en la biblioteca. */
export async function aplicarFichas(fichas: FichaJuego[]): Promise<number> {
  let n = 0
  for (const f of fichas) {
    const j = await leerJuego(f.id)
    if (!j) continue
    await actualizarJuego({ ...j, favorito: f.favorito, estado: f.estado, terminado: f.terminado })
    n++
  }
  return n
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

export function leerTrucos(id: string): Promise<TrucosJuego | undefined> {
  return leer<TrucosJuego>('trucos', id)
}

export function guardarTrucos(t: TrucosJuego): Promise<void> {
  return poner('trucos', t)
}
