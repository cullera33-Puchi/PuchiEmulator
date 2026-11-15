/**
 * Para jugar en la cama (v0.19.0): temporizador de sueño y pausa si se deja de tocar.
 */

/** Minutos del temporizador de sueño que se ofrecen. */
export const MINUTOS_SUENO = [15, 30, 45, 60] as const

/** Aviso antes de que acabe el temporizador: tiempo para buscar dónde guardar. */
export const AVISO_SUENO_MS = 5 * 60_000

/**
 * Cómo va el temporizador en `ahora`: lo que queda, si toca avisar (quedan 5 minutos o menos y no
 * se ha avisado) y si ya ha terminado.
 */
export function estadoSueno(fin: number, ahora: number, avisado: boolean): { restanteMs: number; avisar: boolean; terminado: boolean } {
  const restanteMs = Math.max(0, fin - ahora)
  return { restanteMs, avisar: !avisado && restanteMs > 0 && restanteMs <= AVISO_SUENO_MS, terminado: restanteMs === 0 }
}

/** «Quedan 23 min» con los minutos redondeados hacia arriba. */
export function textoRestante(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000))
  return `Quedan ${min} min`
}

/** Si toca pausar por llevar `minutos` sin tocar nada (0: nunca). */
export function tocaPausar(minutos: number, ultimaActividad: number, ahora: number): boolean {
  return minutos > 0 && ahora - ultimaActividad >= minutos * 60_000
}
