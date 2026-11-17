/**
 * Lo que ocupa cada juego en el iPhone (v0.38.0, Ajustes, Almacenamiento): el juego (la ROM o el
 * disco), sus estados guardados y su partida, de más a menos.
 */
import type { Juego } from './almacen'

export interface OcupacionJuego {
  juego: Juego
  /** La ROM o el disco */
  bytesJuego: number
  estados: number
  bytesEstados: number
  bytesPartida: number
  total: number
}

export function ocupacionPorJuego(juegos: Juego[], guardado: Map<string, { estados: number; bytesEstados: number; partida: number }>): OcupacionJuego[] {
  return juegos
    .map((juego) => {
      const g = guardado.get(juego.id) ?? { estados: 0, bytesEstados: 0, partida: 0 }
      return {
        juego,
        bytesJuego: juego.tam,
        estados: g.estados,
        bytesEstados: g.bytesEstados,
        bytesPartida: g.partida,
        total: juego.tam + g.bytesEstados + g.partida,
      }
    })
    .sort((a, b) => b.total - a.total || a.juego.nombre.localeCompare(b.juego.nombre, 'es'))
}

/** Estados y partidas de juegos que ya no están en la biblioteca (se conservan al quitarlos) */
export function guardadoSinJuego(juegos: Juego[], guardado: Map<string, { estados: number; bytesEstados: number; partida: number }>): { juegos: number; bytes: number } {
  const ids = new Set(juegos.map((j) => j.id))
  let n = 0
  let bytes = 0
  for (const [id, g] of guardado) {
    if (ids.has(id)) continue
    n++
    bytes += g.bytesEstados + g.partida
  }
  return { juegos: n, bytes }
}
