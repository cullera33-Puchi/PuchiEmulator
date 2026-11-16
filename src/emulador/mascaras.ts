/**
 * Botones que llegan al juego en cada fotograma (v0.31.0, aparte para el hilo del motor, que no puede
 * cargar los ajustes): correr fijo y turbo.
 */

/**
 * Botones que llegan al juego con «correr fijo». Si el usuario toca el botón que está fijo (por
 * ejemplo, B para cancelar), el juego no lo notaría porque ya está pulsado: se suelta unos
 * fotogramas (`hueco`) para que vea una pulsación nueva.
 */
export function mascaraConCorrer(base: number, correr: number, hueco: boolean): number {
  if (!correr) return base
  return hueco ? base & ~correr : base | correr
}

/** Fotogramas que dura cada mitad del turbo: 3 pulsado y 3 suelto, unas diez pulsaciones por segundo. */
export const FOTOGRAMAS_TURBO = 3

/**
 * Turbo (v0.19.0): mientras se mantiene un botón con turbo, el juego lo ve pulsarse y soltarse solo.
 * `fotograma` es un contador que avanza uno por fotograma emulado.
 */
export function mascaraConTurbo(base: number, turbo: number, fotograma: number): number {
  if (!turbo || !(base & turbo)) return base
  return Math.floor(fotograma / FOTOGRAMAS_TURBO) % 2 ? base & ~turbo : base
}
