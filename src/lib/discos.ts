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
  /** Varios discos (v0.38.0): cuántos y cuál estaba puesto la última vez (desde 0) */
  discos?: number
  actual?: number
}

/** Lo que el usuario ha elegido para un juego (uno o varios discos), listo para copiar */
export interface GrupoDisco {
  /** Nombre para la biblioteca */
  nombre: string
  /** El fichero del primer disco, como se eligió */
  nombreFichero: string
  /** Los BIN, CHD o PBP de todos los discos, en orden: lo que se copia y forma el SHA-1 */
  datos: File[]
  /** Nombre con el que se guarda cada uno de `datos` */
  nombres: string[]
  /** Hojas que escribe la app: los CUE con los nombres nuevos y, con varios discos, la lista .m3u */
  textos: { nombre: string; contenido: string }[]
  /** El fichero que abre el núcleo */
  principal: string
  discos: number
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

/** Fichero PBP, el formato de PlayStation de la PSP (v0.38.0): «\0PBP» al principio */
export function esPbp(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0 && b[1] === 0x50 && b[2] === 0x42 && b[3] === 0x50
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

/**
 * Número de disco en el nombre («Juego (Disc 2)», «(Disco 2 de 3)», «[CD2]») y el nombre sin él, para
 * juntar los discos de un mismo juego (v0.38.0).
 */
export function numeroDeDisco(nombre: string): { base: string; numero: number | null } {
  const sinExtension = nombre.replace(/\.[^.]+$/, '')
  const m = /\s*[([]\s*(?:disc|disco|disk|cd)\s*(\d+)(?:\s*(?:of|de|\/)\s*\d+)?\s*[)\]]/i.exec(sinExtension)
  if (!m) return { base: sinExtension.trim(), numero: null }
  return { base: (sinExtension.slice(0, m.index) + sinExtension.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(), numero: Number(m[1]) }
}

/** Un disco suelto, antes de juntarlo con los demás de su juego */
interface DiscoSuelto {
  nombreFichero: string
  tipo: 'cue' | 'chd' | 'pbp'
  datos: File[]
  /** Hoja CUE original (o la de un BIN suelto), con los nombres de los BIN de `datos` */
  cue?: string
  nombresCue?: string[]
}

async function cabecera(f: File, bytes = 16): Promise<Uint8Array> {
  return new Uint8Array(await f.slice(0, bytes).arrayBuffer())
}

/** Nombres de la copia: los de siempre con un disco; con varios, «disco2-pista1.bin», «disco2.cue»… */
function montarGrupo(partes: DiscoSuelto[]): GrupoDisco {
  const varios = partes.length > 1
  const datos: File[] = []
  const nombres: string[] = []
  const textos: { nombre: string; contenido: string }[] = []
  const principales: string[] = []
  partes.forEach((p, i) => {
    const prefijo = varios ? `disco${i + 1}` : 'disco'
    if (p.tipo !== 'cue') {
      datos.push(p.datos[0])
      nombres.push(`${prefijo}.${p.tipo}`)
      principales.push(`${prefijo}.${p.tipo}`)
      return
    }
    const pistas = p.datos.map((_, n) => (varios ? `${prefijo}-pista${n + 1}.bin` : `pista${n + 1}.bin`))
    datos.push(...p.datos)
    nombres.push(...pistas)
    const cambios = new Map(p.nombresCue!.map((n, k) => [n.toLowerCase(), pistas[k]]))
    textos.push({ nombre: `${prefijo}.cue`, contenido: reescribirCue(p.cue!, cambios) })
    principales.push(`${prefijo}.cue`)
  })
  if (varios) textos.push({ nombre: 'discos.m3u', contenido: principales.join('\n') + '\n' })
  const primero = numeroDeDisco(partes[0].nombreFichero)
  return {
    nombre: nombreDesdeFichero(varios ? `${primero.base}.x` : partes[0].nombreFichero),
    nombreFichero: partes[0].nombreFichero,
    datos,
    nombres,
    textos,
    principal: varios ? 'discos.m3u' : principales[0],
    discos: partes.length,
  }
}

/**
 * Separa los discos de PlayStation del resto de ficheros elegidos. Cada CUE se junta con sus BIN
 * (por el nombre, sin mayúsculas); si falta alguno, el disco va a `incompletos`. Un BIN sin CUE es un
 * disco si empieza como un sector de CD (si no, puede ser un juego de Mega Drive). Los discos de un
 * mismo juego («(Disc 1)», «(Disc 2)»…) se juntan en uno (v0.38.0).
 */
export async function agruparDiscos(ficheros: File[]): Promise<{ discos: GrupoDisco[]; resto: File[]; incompletos: string[]; sinHoja: string[] }> {
  const sueltos: DiscoSuelto[] = []
  const incompletos: string[] = []
  const sinHoja: string[] = []
  const usados = new Set<File>()
  // Sin mayúsculas y con las tildes en la misma forma (v0.43.2): Archivos da «é» en dos caracteres y
  // la hoja suele llevarla en uno, y el BIN de «Pokémon» no se encontraba
  const clave = (n: string) => n.normalize('NFC').toLowerCase()
  const porNombre = new Map(ficheros.map((f) => [clave(f.name), f]))
  for (const f of ficheros) {
    if (extensionDe(f.name) !== 'cue') continue
    usados.add(f)
    const texto = await f.text()
    const nombres = ficherosDelCue(texto)
    const datos = nombres.map((n) => porNombre.get(clave(n)))
    if (!nombres.length || datos.some((d) => !d)) {
      incompletos.push(f.name)
      // Las pistas que sí están son de este disco (v0.43.2): no se añaden como otro juego con la
      // pista 1 sola (sin música y con otra tarjeta de memoria)
      for (const d of datos) if (d) usados.add(d)
      continue
    }
    datos.forEach((d) => usados.add(d!))
    sueltos.push({ nombreFichero: f.name, tipo: 'cue', datos: datos as File[], cue: texto, nombresCue: nombres })
  }
  const resto: File[] = []
  for (const f of ficheros) {
    if (usados.has(f)) continue
    const ext = extensionDe(f.name)
    if (ext === 'chd' || ext === 'bin' || ext === 'pbp') {
      const b = await cabecera(f)
      if (esChd(b)) {
        sueltos.push({ nombreFichero: f.name, tipo: 'chd', datos: [f] })
        continue
      }
      if (esPbp(b)) {
        sueltos.push({ nombreFichero: f.name, tipo: 'pbp', datos: [f] })
        continue
      }
      // Una pista suelta («Juego (Track 1).bin») es parte de un disco con varias: sin su hoja no se
      // sabe cuáles son ni en qué orden (v0.43.2; antes la pista 1 entraba sola como otro juego)
      if (ext === 'bin' && /\(track\s*\d+\)/i.test(f.name)) {
        sinHoja.push(f.name)
        continue
      }
      if (esSectorCd(b)) {
        sueltos.push({ nombreFichero: f.name, tipo: 'cue', datos: [f], cue: cueParaBin(f.name, b[15]), nombresCue: [f.name] })
        continue
      }
    }
    resto.push(f)
  }
  // Los discos con número y el mismo nombre de juego van juntos, en orden; el resto, cada uno solo
  const juntos = new Map<string, { numero: number; disco: DiscoSuelto }[]>()
  const discos: GrupoDisco[] = []
  for (const d of sueltos) {
    const { base, numero } = numeroDeDisco(d.nombreFichero)
    if (numero === null) {
      discos.push(montarGrupo([d]))
      continue
    }
    const clave = base.toLowerCase()
    if (!juntos.has(clave)) juntos.set(clave, [])
    juntos.get(clave)!.push({ numero, disco: d })
  }
  for (const lista of juntos.values()) discos.push(montarGrupo(lista.sort((a, b) => a.numero - b.numero).map((x) => x.disco)))
  return { discos, resto, incompletos, sinHoja }
}

/**
 * Si un fichero que no es un disco se puede leer entero a la memoria para ver qué juego es (v0.43.2).
 * Las imágenes de disco que la app no abre (.iso, .img) y los .bin de más de 64 MB (un cartucho de Mega
 * Drive no pasa de 8) no se leen: 700 MB de golpe en la memoria cerraban la app solo para decir «no reconocido».
 */
export function seLeeEntero(nombre: string, tam: number): boolean {
  const ext = extensionDe(nombre)
  if (ext === 'iso' || ext === 'img') return false
  if (ext === 'bin') return tam <= 64 * 1024 * 1024
  return tam <= 640 * 1024 * 1024
}

/** Ficheros con los que se guarda un disco en su carpeta, y cuál se abre */
export function ficherosDeGrupo(g: GrupoDisco): { nombres: string[]; principal: string } {
  return { nombres: [...g.nombres, ...g.textos.map((t) => t.nombre)], principal: g.principal }
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
        ficheros: g.datos.map((f, i) => ({ fichero: f, nombre: g.nombres[i] })),
        textos: g.textos,
      })
    })
    return { disco: { carpeta, principal, ficheros: nombres, ...(g.discos > 1 ? { discos: g.discos, actual: 0 } : {}) }, ...r }
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
