/**
 * Añadir juegos a la biblioteca desde ficheros elegidos en Archivos.
 * La ROM se copia en el iPhone (IndexedDB) para no tener que elegirla cada vez; el fichero original
 * se queda donde estaba.
 */
import { guardarJuego, leerJuego, type Juego } from './almacen'
import { leerRom, nombreDesdeFichero, tituloInterno } from './sistemas'

export async function sha1(bytes: Uint8Array): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-1', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type ResultadoAnadir =
  | { tipo: 'nuevo'; juego: Juego }
  | { tipo: 'repetido'; juego: Juego }
  | { tipo: 'no-reconocido'; fichero: string }

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

/**
 * Biblioteca lista para mostrar (v0.14.0): los que coinciden con la búsqueda (cada palabra en el
 * nombre o en el título de la ROM, sin acentos ni mayúsculas), en el orden elegido y con los
 * favoritos aparte, primero.
 */
export function prepararBiblioteca(
  juegos: Juego[],
  { texto = '', orden = 'reciente', tiempos = new Map() }: { texto?: string; orden?: OrdenBiblioteca; tiempos?: Map<string, number> } = {},
): { favoritos: Juego[]; resto: Juego[] } {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  const coinciden = juegos.filter((j) => {
    const donde = normalizar(`${j.nombre} ${j.titulo}`)
    return palabras.every((p) => donde.includes(p))
  })
  const ordenados = ordenarJuegos(coinciden, orden, tiempos)
  return { favoritos: ordenados.filter((j) => j.favorito), resto: ordenados.filter((j) => !j.favorito) }
}
