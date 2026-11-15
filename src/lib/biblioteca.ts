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

export function ordenarJuegos(juegos: Juego[]): Juego[] {
  return [...juegos].sort((a, b) => (b.ultimaVez ?? 0) - (a.ultimaVez ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
}
