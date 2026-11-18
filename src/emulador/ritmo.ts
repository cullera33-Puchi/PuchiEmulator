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
  private cortos = 0

  medir(dt: number): void {
    if (dt < 4 || dt > 60) return
    // Refrescos seguidos mucho más cortos que el medido (v0.43.2): la pantalla ha subido de frecuencia
    // (de 60 a 120 Hz) y la mediana tarda medio segundo en enterarse
    this.cortos = this.valor > 0 && dt < this.valor * 0.6 ? this.cortos + 1 : 0
    this.ultimos.push(dt)
    if (this.ultimos.length > 90) this.ultimos.shift()
    // Se recalcula cada 15 medidas: ordenar 90 números en cada refresco no hace falta
    if (this.ultimos.length >= 30 && ++this.cuenta % 15 === 1) this.valor = estimarRefresco(this.ultimos)
  }

  /** Duración del refresco en ms, o 0 si aún no hay medidas suficientes. */
  get ms(): number {
    return this.valor
  }

  /**
   * La pantalla va bastante más rápido que lo medido (seis refrescos cortos seguidos; el vaivén normal
   * de los intervalos alterna cortos y largos). Mientras dure no se puede contar un fotograma por
   * refresco: el juego iría al doble de velocidad hasta que la mediana se pusiera al día (v0.43.2)
   */
  get atrasado(): boolean {
    return this.cortos >= 6
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

/**
 * Fotogramas que se pueden ejecutar en este refresco sin pasarse de su tiempo (v0.24.1).
 *
 * Tras un refresco perdido, el bucle recupera los fotogramas que faltan. Si recuperarlos todos de
 * golpe tarda más que un refresco, se pierde el siguiente y se vuelve a recuperar: el juego se queda
 * en un ciclo de 15 imágenes por segundo aunque al ritmo normal cabría a 30 (se vio con DS en el
 * iPhone a 30 Hz: 4 fotogramas de 9,5 ms por refresco de 33 ms). Por eso, si los fotogramas normales
 * de un refresco caben en él, la recuperación se limita a lo que quepa; lo que no, se pierde (el
 * juego va un instante más lento, sin que se note). Si ni los normales caben, no se limita: el
 * iPhone no da para más y es mejor mantener la velocidad del juego con menos imágenes.
 *
 * @param toca fotogramas que tocarían
 * @param normal fotogramas de un refresco sin retraso
 * @param costeMs lo que tarda un fotograma (media reciente), 0 si aún no se sabe
 * @param refrescoMs duración de un refresco
 */
export function limitarRecuperacion(toca: number, normal: number, costeMs: number, refrescoMs: number): number {
  if (toca <= normal || !(costeMs > 0) || !(refrescoMs > 0)) return toca
  const disponible = refrescoMs * 0.85
  if (normal * costeMs > disponible) return toca
  return Math.max(normal, Math.min(toca, Math.floor(disponible / costeMs)))
}
