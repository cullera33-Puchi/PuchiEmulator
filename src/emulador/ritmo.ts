/**
 * Ritmo del juego frente al refresco de la pantalla.
 *
 * Si la consola va casi a la misma frecuencia que la pantalla (o a la mitad o el doble), se ejecuta
 * un número fijo de fotogramas por refresco: el movimiento sale perfectamente regular. La pequeña
 * diferencia (por ejemplo, 59,73 Hz de la GBA frente a 60 Hz) la absorbe el sonido, que ajusta su
 * ritmo hasta un 1 %. Si no (por ejemplo, un juego europeo a 50 Hz), se va por tiempo: algunos
 * refrescos llevan un fotograma más o uno menos.
 */

export type PlanRitmo = { modo: 'sincronizado'; cadaRefrescos: number; porRefresco: number } | { modo: 'tiempo' }

/** Diferencia máxima entre la consola y la pantalla para ir sincronizados (1,2 %). */
export const TOLERANCIA = 0.012

/**
 * @param fps fotogramas por segundo de la consola
 * @param refrescoMs duración media de un refresco de la pantalla, en ms (0 si aún no se sabe)
 */
export function planRitmo(fps: number, refrescoMs: number): PlanRitmo {
  if (!(fps > 0) || !(refrescoMs > 0)) return { modo: 'tiempo' }
  const hz = 1000 / refrescoMs
  const r = hz / fps
  if (r >= 0.9) {
    const k = Math.max(1, Math.round(r))
    if (Math.abs(r / k - 1) < TOLERANCIA) return { modo: 'sincronizado', cadaRefrescos: k, porRefresco: 1 }
  } else {
    const m = Math.round(1 / r)
    if (m >= 2 && m <= 4 && Math.abs(1 / (r * m) - 1) < TOLERANCIA) return { modo: 'sincronizado', cadaRefrescos: 1, porRefresco: m }
  }
  return { modo: 'tiempo' }
}

/**
 * Duración media del refresco, con una media móvil que ignora los saltos (la app en segundo plano,
 * un refresco perdido). Hacen falta unas cuantas medidas antes de fiarse.
 */
export class Refresco {
  private media = 0
  private medidas = 0

  medir(dt: number): void {
    if (dt < 4 || dt > 60) return
    if (this.media && Math.abs(dt / this.media - 1) > 0.25) return
    this.media = this.media ? this.media * 0.97 + dt * 0.03 : dt
    this.medidas++
  }

  /** Duración media en ms, o 0 si aún no hay medidas suficientes. */
  get ms(): number {
    return this.medidas >= 30 ? this.media : 0
  }
}
