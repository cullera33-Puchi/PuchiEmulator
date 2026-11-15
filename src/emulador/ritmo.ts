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

/** Frecuencias de pantalla habituales (ProMotion baja a 80, 48 o 30 Hz según lo que se mueve). */
const FRECUENCIAS = [30, 40, 48, 60, 80, 90, 120]

/**
 * Duración del refresco, con la mediana de los últimos 90 (v0.12.0). En el iPhone 17 (120 Hz) los
 * intervalos varían mucho de uno a otro y la media móvil que había antes, al descartar los saltos,
 * se quedaba con los cortos: medía de 121 a 138 Hz y el juego salía de la sincronía. La mediana se
 * redondea a la frecuencia habitual más cercana si está a menos de un 3 %.
 */
export class Refresco {
  private readonly ultimos: number[] = []
  private valor = 0
  private cuenta = 0

  medir(dt: number): void {
    if (dt < 4 || dt > 60) return
    this.ultimos.push(dt)
    if (this.ultimos.length > 90) this.ultimos.shift()
    // Se recalcula cada 15 medidas: ordenar 90 números en cada refresco no hace falta
    if (this.ultimos.length >= 30 && ++this.cuenta % 15 === 1) this.valor = estimarRefresco(this.ultimos)
  }

  /** Duración del refresco en ms, o 0 si aún no hay medidas suficientes. */
  get ms(): number {
    return this.valor
  }
}

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  const mitad = orden.length >> 1
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2
}

/**
 * Mediana de los intervalos, ajustada a una frecuencia habitual si está muy cerca. Los intervalos
 * de dos o más refrescos (uno perdido) se dividen entre los que son antes de la segunda pasada,
 * para que no tiren de la mediana hacia arriba.
 */
export function estimarRefresco(intervalos: number[]): number {
  let m = mediana(intervalos)
  for (let i = 0; i < 2; i++) m = mediana(intervalos.map((dt) => dt / Math.max(1, Math.round(dt / m))))
  const hz = 1000 / m
  for (const f of FRECUENCIAS) if (Math.abs(hz / f - 1) < 0.03) return 1000 / f
  return m
}

/**
 * Refrescos que han pasado en un intervalo `dt`: normalmente 1, pero si se pierde alguno (el
 * iPhone no llegó a tiempo) se cuentan todos, para que el juego no vaya más lento.
 */
export function refrescosPasados(dt: number, refrescoMs: number): number {
  if (!(refrescoMs > 0)) return 1
  return Math.max(1, Math.min(4, Math.round(dt / refrescoMs)))
}
