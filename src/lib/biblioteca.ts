/**
 * Añadir juegos a la biblioteca desde ficheros elegidos en Archivos.
 * La ROM se copia en el iPhone (IndexedDB) para no tener que elegirla cada vez; el fichero original
 * se queda donde estaba.
 */
import { borrarCaratula, guardarCaratula, guardarJuego, leerCaratula, leerJuego, leerRomGuardada, listarJuegos, quitarJuego, type EstadoJuego, type Juego } from './almacen'
import { borrarCarpetaDisco, copiarDisco, copiarPlanJuntar, discosQueFaltan, limpiarDiscosHuerfanos, numeroDeDisco, numerosDeDisco, planJuntar, type GrupoDisco } from './discos'
import { registrar } from './registro'
import { CONSOLAS, CONSOLAS_APP, consolaDe, leerRom, nombreDesdeFichero, tituloInterno, type Consola, type Sistema } from './sistemas'

export async function sha1(bytes: Uint8Array): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-1', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type ResultadoAnadir =
  | { tipo: 'nuevo'; juego: Juego; faltan?: number[] }
  | { tipo: 'repetido'; juego: Juego }
  | { tipo: 'no-reconocido'; fichero: string }
  /** Discos de PlayStation añadidos a un juego que ya estaba (v0.47.0) */
  | { tipo: 'juntado'; juego: Juego; anadidos: number[]; faltan: number[] }

export async function anadirFichero(nombre: string, contenido: ArrayBuffer): Promise<ResultadoAnadir> {
  const rom = leerRom(new Uint8Array(contenido), nombre)
  if (!rom) return { tipo: 'no-reconocido', fichero: nombre }
  const id = await sha1(rom.bytes)
  const existente = await leerJuego(id)
  if (existente) return { tipo: 'repetido', juego: existente }
  const juego: Juego = {
    id,
    // Si venía en un zip, el nombre del zip suele ser el bueno
    nombre: nombreDesdeFichero(nombre),
    sistema: rom.sistema,
    titulo: tituloInterno(rom.bytes, rom.sistema),
    nombreFichero: nombre,
    tam: rom.bytes.byteLength,
    anadido: Date.now(),
  }
  const copia = rom.bytes.slice().buffer
  await guardarJuego(juego, copia)
  return { tipo: 'nuevo', juego }
}

/**
 * Añade un disco de PlayStation (v0.37.0): se copia a los ficheros de la app por trozos, con su SHA-1
 * (el de los BIN o el CHD) como identificador. Si ya estaba, se borra la copia nueva.
 */
export async function anadirDisco(g: GrupoDisco, alProgreso?: (fraccion: number) => void): Promise<ResultadoAnadir> {
  // Discos con número de un juego que ya está (v0.47.0): se le añaden en lugar de ser otro juego
  const mismoJuego = g.base ? (await listarJuegos()).find((j) => j.disco && !j.disco.principal.endsWith('.pbp') && numerosDeDisco(j.disco, j.nombreFichero)?.base === g.base) : undefined
  if (mismoJuego && !g.datos.some((f) => /\.pbp$/i.test(f.name))) return juntarDiscos(mismoJuego, g, alProgreso)
  const { disco, sha1: id, tam } = await copiarDisco(g, alProgreso)
  const existente = await leerJuego(id)
  if (existente) {
    await borrarCarpetaDisco(disco.carpeta).catch(() => undefined)
    return { tipo: 'repetido', juego: existente }
  }
  const juego: Juego = { id, nombre: g.nombre, sistema: 'psx', titulo: '', nombreFichero: g.nombreFichero, tam, anadido: Date.now(), disco }
  try {
    await guardarJuego(juego)
  } catch (e) {
    await borrarCarpetaDisco(disco.carpeta).catch(() => undefined)
    throw e
  }
  const faltan = g.base ? discosQueFaltan(g.numeros, g.total) : []
  return faltan.length ? { tipo: 'nuevo', juego, faltan } : { tipo: 'nuevo', juego }
}

/**
 * Añade a un juego de PlayStation los discos que faltaban (v0.47.0). El juego conserva su
 * identificador (su tarjeta de memoria y sus estados) y su nombre, salvo el que puso la app con el
 * número de disco dentro («Juego (Disc 1)»), que pasa a ser el del juego.
 */
async function juntarDiscos(j: Juego, g: GrupoDisco, alProgreso?: (fraccion: number) => void): Promise<ResultadoAnadir> {
  const plan = planJuntar(j.disco!, j.nombreFichero, g)
  if (!plan) return { tipo: 'repetido', juego: j }
  const { tam } = await copiarPlanJuntar(plan, alProgreso)
  // La ficha de ahora, por si ha cambiado mientras se copiaba
  const ficha = (await leerJuego(j.id)) ?? j
  const nombre = ficha.nombre === nombreDesdeFichero(ficha.nombreFichero) ? g.nombre : ficha.nombre
  const juego: Juego = { ...ficha, nombre, tam: ficha.tam + tam, disco: { ...plan.disco, actual: plan.disco.actual } }
  await guardarJuego(juego)
  registrar('info', 'Discos juntados con su juego', { anadidos: plan.anadidos.length, discos: plan.disco.discos })
  return { tipo: 'juntado', juego, anadidos: plan.anadidos, faltan: discosQueFaltan(plan.disco.numeros!, Math.max(g.total ?? 0, numeroDeDisco(j.nombreFichero).de ?? 0) || null) }
}

/** Lo que se espera para borrar el disco de un juego quitado: el aviso con «Deshacer» dura 4 segundos */
const MS_DISCO_QUITADO = 30_000

/**
 * Quita un juego de la biblioteca (su ROM y su carátula; la partida y los estados se conservan) y
 * devuelve cómo deshacerlo. El disco de un juego de PlayStation se queda medio minuto, para «Deshacer».
 */
export async function quitarDeLaBiblioteca(j: Juego): Promise<() => Promise<void>> {
  const [rom, caratula] = await Promise.all([leerRomGuardada(j.id), leerCaratula(j.id)])
  await quitarJuego(j.id)
  await borrarCaratula(j.id)
  registrar('info', 'Juego quitado de la biblioteca')
  // El disco se borra cuando ya no se puede deshacer (v0.43.2): antes ocupaba sus cientos de megas
  // hasta volver a abrir la app, y quitar un juego para hacer sitio no hacía sitio
  const carpeta = j.disco?.carpeta
  if (carpeta) {
    setTimeout(() => {
      void listarJuegos()
        .then(async (juegos) => {
          if (juegos.some((x) => x.disco?.carpeta === carpeta)) return
          await borrarCarpetaDisco(carpeta)
          registrar('info', 'Disco de un juego quitado borrado')
        })
        .catch(() => undefined)
    }, MS_DISCO_QUITADO)
  }
  return async () => {
    if (rom || j.disco) await guardarJuego(j, rom)
    if (caratula) await guardarCaratula(caratula)
    registrar('info', 'Quitar juego deshecho')
  }
}

let discosLimpios = false

/** Una vez por apertura de la app: borra los discos de juegos quitados (ya sin «Deshacer»). */
export async function limpiarDiscosQuitados(): Promise<void> {
  if (discosLimpios) return
  discosLimpios = true
  const enUso = new Set((await listarJuegos()).flatMap((j) => (j.disco ? [j.disco.carpeta] : [])))
  const borrados = await limpiarDiscosHuerfanos(enUso)
  if (borrados) registrar('info', 'Discos de juegos quitados borrados', { borrados })
}

export type OrdenBiblioteca = 'reciente' | 'nombre' | 'tiempo'

const porNombre = (a: Juego, b: Juego) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' })

/** Sin acentos ni mayúsculas, para buscar. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function ordenarJuegos(juegos: Juego[], orden: OrdenBiblioteca = 'reciente', tiempos: Map<string, number> = new Map()): Juego[] {
  const lista = [...juegos]
  if (orden === 'nombre') return lista.sort(porNombre)
  if (orden === 'tiempo') return lista.sort((a, b) => (tiempos.get(b.id) ?? 0) - (tiempos.get(a.id) ?? 0) || porNombre(a, b))
  return lista.sort((a, b) => (b.ultimaVez ?? 0) - (a.ultimaVez ?? 0) || porNombre(a, b))
}

export const NOMBRE_ESTADO: Record<EstadoJuego, string> = { pendiente: 'Pendiente', jugando: 'Jugando', terminado: 'Terminado', abandonado: 'Abandonado' }
export const ESTADOS: EstadoJuego[] = ['pendiente', 'jugando', 'terminado', 'abandonado']

/** Estado de un juego: el que ha elegido el usuario o, si no, «jugando» si ya se ha jugado y «pendiente» si no. */
export function estadoDe(j: Juego): EstadoJuego {
  return j.estado ?? (j.ultimaVez ? 'jugando' : 'pendiente')
}

/** El juego con su estado nuevo; al terminarlo se anota la fecha, y al cambiar a otro se quita. */
export function conEstado(j: Juego, estado: EstadoJuego, ahora = Date.now()): Juego {
  return { ...j, estado, terminado: estado === 'terminado' ? (j.estado === 'terminado' && j.terminado ? j.terminado : ahora) : undefined }
}

/** Al abrir un juego pendiente, pasa a «jugando». Lo terminado o abandonado no cambia. */
export function alAbrir(j: Juego, ahora = Date.now()): Juego {
  return { ...j, ultimaVez: ahora, estado: j.estado === 'pendiente' ? 'jugando' : j.estado }
}

/** Cuántos juegos hay en cada estado. */
export function resumenEstados(juegos: Juego[]): Record<EstadoJuego, number> {
  const r: Record<EstadoJuego, number> = { pendiente: 0, jugando: 0, terminado: 0, abandonado: 0 }
  for (const j of juegos) r[estadoDe(j)]++
  return r
}

/** Terminados, del más reciente al más antiguo. */
export function terminados(juegos: Juego[]): Juego[] {
  return juegos.filter((j) => estadoDe(j) === 'terminado').sort((a, b) => (b.terminado ?? 0) - (a.terminado ?? 0))
}

/**
 * Para «Seguir jugando» en el inicio (v0.15.0): los últimos jugados, sin los terminados ni los
 * abandonados, del más reciente al más antiguo.
 */
export function seguirJugando(juegos: Juego[], cuantos = 5): Juego[] {
  return juegos
    .filter((j) => j.ultimaVez && estadoDe(j) !== 'terminado' && estadoDe(j) !== 'abandonado')
    .sort((a, b) => (b.ultimaVez ?? 0) - (a.ultimaVez ?? 0))
    .slice(0, cuantos)
}

/**
 * Biblioteca lista para mostrar (v0.14.0): los del estado elegido (v0.15.0) que coinciden con la búsqueda (cada palabra en el
 * nombre o en el título de la ROM, sin acentos ni mayúsculas), en el orden elegido y con los
 * favoritos aparte, primero.
 */
export function prepararBiblioteca(
  juegos: Juego[],
  {
    texto = '',
    orden = 'reciente',
    tiempos = new Map(),
    estado = 'todos',
  }: { texto?: string; orden?: OrdenBiblioteca; tiempos?: Map<string, number>; estado?: EstadoJuego | 'todos' } = {},
): { favoritos: Juego[]; resto: Juego[] } {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  const coinciden = juegos.filter((j) => {
    if (estado !== 'todos' && estadoDe(j) !== estado) return false
    const donde = normalizar(`${j.nombre} ${j.titulo}`)
    return palabras.every((p) => donde.includes(p))
  })
  const ordenados = ordenarJuegos(coinciden, orden, tiempos)
  return { favoritos: ordenados.filter((j) => j.favorito), resto: ordenados.filter((j) => !j.favorito) }
}

/**
 * Consolas del inicio (v0.26.0, decisión del usuario): las que tienen juegos, de la más jugada a la
 * menos (tiempo de todas las sesiones, aunque el juego ya no esté), y a igual tiempo, la que tiene
 * más juegos y después el orden de siempre. Las que no tienen juegos van aparte, al final.
 */
export function ordenarConsolas(juegos: Pick<Juego, 'sistema'>[], sesiones: { sistema: Sistema; ms: number }[]): { conJuegos: Consola[]; sinJuegos: Consola[] } {
  const tiempo = new Map<Consola, number>()
  for (const s of sesiones) tiempo.set(consolaDe(s.sistema), (tiempo.get(consolaDe(s.sistema)) ?? 0) + s.ms)
  const cuantos = (c: Consola) => juegos.filter((j) => CONSOLAS_APP[c].sistemas.includes(j.sistema)).length
  const conJuegos = CONSOLAS.filter((c) => cuantos(c) > 0).sort(
    (a, b) => (tiempo.get(b) ?? 0) - (tiempo.get(a) ?? 0) || cuantos(b) - cuantos(a) || CONSOLAS.indexOf(a) - CONSOLAS.indexOf(b),
  )
  return { conJuegos, sinJuegos: CONSOLAS.filter((c) => cuantos(c) === 0) }
}
