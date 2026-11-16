/**
 * Discos de PlayStation (v0.37.0). Pesan de 300 a 700 MB: no caben en IndexedDB de una vez ni en la
 * memoria del iPhone. Se copian por trozos a los ficheros privados de la app (OPFS), en una carpeta
 * por disco, calculando su SHA-1 a la vez (`discos.worker.ts`); el núcleo los lee después sector a
 * sector desde el hilo del motor. Admite CHD (un fichero) y BIN con CUE (la hoja que dice qué pistas
 * hay); un BIN sin CUE vale si es de una sola pista de datos.
 */
import { extensionDe, nombreDesdeFichero } from './sistemas'

/** Disco guardado en el iPhone: su carpeta en OPFS, el fichero que se abre y todos los que tiene */
export interface Disco {
  carpeta: string
  principal: string
  ficheros: string[]
}

/** Lo que el usuario ha elegido para un disco, antes de copiarlo */
export interface GrupoDisco {
  /** Nombre para la biblioteca */
  nombre: string
  nombreFichero: string
  /** CHD o los BIN, en el orden del CUE: lo que se copia y forma el SHA-1 */
  datos: File[]
  /** Hoja CUE ya con los nombres con los que se guardan los BIN (sin ella, es un CHD) */
  cue?: string
}

export const CARPETA_DISCOS = 'discos'

/** Inicio de un sector de CD en bruto (2352 bytes): 00, diez FF y 00 */
export function esSectorCd(b: Uint8Array): boolean {
  if (b.length < 16 || b[0] !== 0 || b[11] !== 0) return false
  for (let i = 1; i < 11; i++) if (b[i] !== 0xff) return false
  return true
}

/** Fichero CHD («MComprHD» al principio) */
export function esChd(b: Uint8Array): boolean {
  return b.length >= 8 && String.fromCharCode(...b.subarray(0, 8)) === 'MComprHD'
}

/** Ficheros que nombra una hoja CUE, en orden y sin repetir */
export function ficherosDelCue(texto: string): string[] {
  const nombres: string[] = []
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+\S+/i.exec(linea)
    if (!m) continue
    const nombre = (m[1] ?? m[2]).split(/[\\/]/).pop()!
    if (!nombres.includes(nombre)) nombres.push(nombre)
  }
  return nombres
}

/** La misma hoja con otros nombres de fichero (los de la copia en el iPhone). */
export function reescribirCue(texto: string, nombres: Map<string, string>): string {
  return texto
    .split(/\r?\n/)
    .map((linea) => {
      const m = /^(\s*FILE\s+)(?:"([^"]+)"|(\S+))(\s+\S+.*)$/i.exec(linea)
      if (!m) return linea
      const original = (m[2] ?? m[3]).split(/[\\/]/).pop()!
      const nuevo = nombres.get(original.toLowerCase())
      return nuevo ? `${m[1]}"${nuevo}"${m[4]}` : linea
    })
    .join('\r\n')
}

/** Hoja para un BIN suelto: una pista de datos, en modo 1 o 2 según su primer sector. */
export function cueParaBin(nombre: string, modo: number): string {
  return `FILE "${nombre}" BINARY\r\n  TRACK 01 MODE${modo === 1 ? 1 : 2}/2352\r\n    INDEX 01 00:00:00\r\n`
}

/** Nombre del BIN número `i` dentro de la carpeta del disco */
export const nombrePista = (i: number) => `pista${i + 1}.bin`

async function cabecera(f: File, bytes = 16): Promise<Uint8Array> {
  return new Uint8Array(await f.slice(0, bytes).arrayBuffer())
}

/**
 * Separa los discos de PlayStation del resto de ficheros elegidos. Cada CUE se junta con sus BIN
 * (por el nombre, sin mayúsculas); si falta alguno, el disco va a `incompletos`. Un BIN sin CUE es un
 * disco si empieza como un sector de CD (si no, puede ser un juego de Mega Drive).
 */
export async function agruparDiscos(ficheros: File[]): Promise<{ discos: GrupoDisco[]; resto: File[]; incompletos: string[] }> {
  const discos: GrupoDisco[] = []
  const incompletos: string[] = []
  const usados = new Set<File>()
  const porNombre = new Map(ficheros.map((f) => [f.name.toLowerCase(), f]))
  for (const f of ficheros) {
    if (extensionDe(f.name) !== 'cue') continue
    usados.add(f)
    const texto = await f.text()
    const nombres = ficherosDelCue(texto)
    const datos = nombres.map((n) => porNombre.get(n.toLowerCase()))
    if (!nombres.length || datos.some((d) => !d)) {
      incompletos.push(f.name)
      continue
    }
    datos.forEach((d) => usados.add(d!))
    const nuevos = new Map(nombres.map((n, i) => [n.toLowerCase(), nombrePista(i)]))
    discos.push({ nombre: nombreDesdeFichero(f.name), nombreFichero: f.name, datos: datos as File[], cue: reescribirCue(texto, nuevos) })
  }
  const resto: File[] = []
  for (const f of ficheros) {
    if (usados.has(f)) continue
    const ext = extensionDe(f.name)
    if (ext === 'chd' || ext === 'bin') {
      const b = await cabecera(f)
      if (esChd(b)) {
        discos.push({ nombre: nombreDesdeFichero(f.name), nombreFichero: f.name, datos: [f] })
        continue
      }
      if (esSectorCd(b)) {
        discos.push({ nombre: nombreDesdeFichero(f.name), nombreFichero: f.name, datos: [f], cue: cueParaBin(nombrePista(0), b[15]) })
        continue
      }
    }
    resto.push(f)
  }
  return { discos, resto, incompletos }
}

/** Ficheros con los que se guarda un disco en su carpeta, y cuál se abre */
export function ficherosDeGrupo(g: GrupoDisco): { nombres: string[]; principal: string } {
  if (!g.cue) return { nombres: ['disco.chd'], principal: 'disco.chd' }
  return { nombres: [...g.datos.map((_, i) => nombrePista(i)), 'disco.cue'], principal: 'disco.cue' }
}

/* ---- Copia en el iPhone, por el hilo de los discos ---- */

type Respuesta = { progreso: number } | { hecho: { sha1: string; tam: number } } | { error: string }

/** Carpeta nueva para un disco: no depende del SHA-1, que se sabe al terminar de copiar */
const carpetaNueva = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/**
 * Copia un disco a su carpeta, con el SHA-1 de sus datos (los BIN o el CHD, no la hoja). Si falla a
 * medias, no deja la carpeta.
 */
export async function copiarDisco(g: GrupoDisco, alProgreso?: (fraccion: number) => void): Promise<{ disco: Disco; sha1: string; tam: number }> {
  const carpeta = carpetaNueva()
  const { nombres, principal } = ficherosDeGrupo(g)
  const total = g.datos.reduce((s, f) => s + f.size, 0)
  const hilo = new Worker(new URL('./discos.worker.ts', import.meta.url), { type: 'module' })
  try {
    const r = await new Promise<{ sha1: string; tam: number }>((resolver, rechazar) => {
      hilo.onmessage = (e: MessageEvent<Respuesta>) => {
        if ('progreso' in e.data) alProgreso?.(total ? e.data.progreso / total : 1)
        else if ('hecho' in e.data) resolver(e.data.hecho)
        else rechazar(new Error(e.data.error))
      }
      hilo.onerror = (e) => rechazar(new Error(e.message || 'El hilo de los discos no ha arrancado'))
      hilo.postMessage({
        orden: 'copiar',
        carpeta,
        ficheros: g.datos.map((f, i) => ({ fichero: f, nombre: nombres[i] })),
        texto: g.cue ? { nombre: 'disco.cue', contenido: g.cue } : undefined,
      })
    })
    return { disco: { carpeta, principal, ficheros: nombres }, ...r }
  } catch (e) {
    await borrarCarpetaDisco(carpeta).catch(() => undefined)
    throw e
  } finally {
    hilo.terminate()
  }
}

async function raizDiscos(): Promise<FileSystemDirectoryHandle> {
  const raiz = await navigator.storage.getDirectory()
  return raiz.getDirectoryHandle(CARPETA_DISCOS, { create: true })
}

export async function borrarCarpetaDisco(carpeta: string): Promise<void> {
  const raiz = await raizDiscos()
  await raiz.removeEntry(carpeta, { recursive: true }).catch((e: DOMException) => {
    if (e?.name !== 'NotFoundError') throw e
  })
}

/**
 * Borra las carpetas de discos que ya no son de ningún juego (v0.37.0). Al quitar un juego, el disco
 * se queda hasta aquí para que «Deshacer» lo recupere; se llama al abrir la app. No toca las carpetas
 * de hace menos de una hora, por si hay una copia en marcha.
 */
export async function limpiarDiscosHuerfanos(enUso: Set<string>, ahora = Date.now()): Promise<number> {
  if (!navigator.storage?.getDirectory) return 0
  const raiz = await raizDiscos()
  let borradas = 0
  for await (const [nombre] of (raiz as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (enUso.has(nombre)) continue
    const creada = parseInt(nombre.slice(1, 9), 36)
    if (Number.isFinite(creada) && ahora - creada < 3_600_000) continue
    await borrarCarpetaDisco(nombre)
    borradas++
  }
  return borradas
}

/** Los ficheros de un disco, para montarlos en el núcleo (en el hilo del motor). */
export async function ficherosDelDisco(d: Disco): Promise<File[]> {
  const carpeta = await (await raizDiscos()).getDirectoryHandle(d.carpeta)
  return Promise.all(d.ficheros.map(async (n) => (await carpeta.getFileHandle(n)).getFile()))
}
