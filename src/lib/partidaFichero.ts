/**
 * La partida de un juego como fichero (v0.38.0): exportarla para otro emulador o importar la de otro.
 * Es la memoria del cartucho (o la tarjeta de memoria de PlayStation) tal cual, sin cabeceras: el
 * formato de RetroArch y de la mayoría de emuladores (.sav en las portátiles de Nintendo, .srm en el
 * resto).
 */
import type { Juego } from './almacen'
import type { Sistema } from './sistemas'

const SAV: Sistema[] = ['gb', 'gbc', 'gba', 'nds']

export function extensionPartida(sistema: Sistema): 'sav' | 'srm' {
  return SAV.includes(sistema) ? 'sav' : 'srm'
}

/** Nombre del fichero: el del juego, sin caracteres que Archivos no admite */
export function nombreFicheroPartida(j: Pick<Juego, 'nombre' | 'sistema'>): string {
  const base = j.nombre.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'partida'
  return `${base}.${extensionPartida(j.sistema)}`
}

/** Tope de tamaño de una partida (la mayor, la de N64, ocupa 290 KB) */
export const TAM_MAXIMO_PARTIDA = 4 * 1024 * 1024

/** Por qué no vale un fichero como partida, o null si vale */
export function problemaPartida(tam: number): string | null {
  if (tam === 0) return 'El fichero está vacío.'
  if (tam > TAM_MAXIMO_PARTIDA) return 'Es demasiado grande para ser una partida guardada.'
  return null
}

/** Aviso si el tamaño no coincide con el de la partida que ya tiene el juego (puede ser de otro juego) */
export function avisoTamano(tam: number, actual?: number): string | null {
  if (!actual || actual === tam) return null
  return `Ocupa ${tam.toLocaleString('es-ES')} bytes y la partida actual del juego, ${actual.toLocaleString('es-ES')}: puede ser de otro juego o de otro emulador.`
}
