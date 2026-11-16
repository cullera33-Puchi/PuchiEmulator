/**
 * Remuestreo de audio estéreo de 16 bits (la frecuencia del núcleo) a coma flotante a la frecuencia
 * del iPhone, con un filtro sinc enventanado de 16 coeficientes (v0.12.0).
 *
 * La interpolación lineal que había antes deja pasar imágenes del sonido por encima de la mitad de
 * la frecuencia del núcleo (32 kHz en DS y Super Nintendo): a 48 kHz se oyen como un brillo
 * metálico. El filtro las quita y, en avance rápido, baja el corte para no meter agudos falsos.
 * Conserva la posición y las últimas muestras entre bloques para que no haya saltos. Retraso:
 * 8 muestras de entrada (0,25 ms).
 */
const MEDIO = 8 // coeficientes a cada lado
const TAPS = MEDIO * 2
const FASES = 256 // posiciones fraccionarias precalculadas (se interpola entre dos)

/** Kaiser (beta 8): unos 80 dB de rechazo con 16 coeficientes. */
function bessel0(x: number): number {
  let suma = 1
  let termino = 1
  for (let k = 1; k < 30; k++) {
    termino *= (x / (2 * k)) * (x / (2 * k))
    suma += termino
    if (termino < 1e-12 * suma) break
  }
  return suma
}
const BETA = 8
const NORMA = bessel0(BETA)

/** Tabla de (FASES + 1) filas de TAPS coeficientes, cada fila normalizada a ganancia 1. */
export function tablaFiltro(corte: number): Float32Array {
  const tabla = new Float32Array((FASES + 1) * TAPS)
  for (let p = 0; p <= FASES; p++) {
    const f = p / FASES
    let suma = 0
    for (let j = 0; j < TAPS; j++) {
      // Distancia entre el instante de salida y la muestra j de la ventana
      const u = f + MEDIO - 1 - j
      const x = u / MEDIO
      const ventana = Math.abs(x) >= 1 ? 0 : bessel0(BETA * Math.sqrt(1 - x * x)) / NORMA
      const a = Math.PI * corte * u
      const sinc = a === 0 ? 1 : Math.sin(a) / a
      const c = corte * sinc * ventana
      tabla[p * TAPS + j] = c
      suma += c
    }
    for (let j = 0; j < TAPS; j++) tabla[p * TAPS + j] /= suma
  }
  return tabla
}

/** Corte relativo a la mitad de la frecuencia de entrada: algo por debajo para dejar transición. */
function corteDe(paso: number): number {
  const c = Math.min(1, 1 / paso) * 0.92
  return Math.round(c * 40) / 40 // escalones del 2,5 %: la tabla solo se rehace al cambiar de velocidad
}

export class Remuestreador {
  private posicion = 0 // posición fraccionaria de la siguiente salida dentro del bloque nuevo
  private historiaI = new Float32Array(TAPS)
  private historiaD = new Float32Array(TAPS)
  private corte = 0
  private tabla: Float32Array = new Float32Array(0)
  private bufI = new Float32Array(0)
  private bufD = new Float32Array(0)

  /**
   * @param entrada muestras intercaladas (izquierda, derecha)
   * @param paso pares de entrada por cada par de salida (frecuencia del núcleo / frecuencia de salida)
   */
  procesar(entrada: Int16Array, paso: number): Float32Array {
    const pares = entrada.length >> 1
    if (pares === 0 || !(paso > 0)) return new Float32Array(0)
    const corte = corteDe(paso)
    if (corte !== this.corte) {
      this.corte = corte
      this.tabla = tablaFiltro(corte)
    }
    // Bloque de trabajo: las TAPS últimas muestras anteriores y las nuevas
    const largo = TAPS + pares
    if (this.bufI.length < largo) {
      this.bufI = new Float32Array(largo * 2)
      this.bufD = new Float32Array(largo * 2)
    }
    const bi = this.bufI
    const bd = this.bufD
    bi.set(this.historiaI)
    bd.set(this.historiaD)
    for (let i = 0; i < pares; i++) {
      bi[TAPS + i] = entrada[i * 2] / 32768
      bd[TAPS + i] = entrada[i * 2 + 1] / 32768
    }
    // Una salida en t (índice del bloque de trabajo) usa las muestras floor(t) - 7 a floor(t) + 8
    const ultimo = largo - 1 - MEDIO
    let t = TAPS + this.posicion
    const salidaPares = t > ultimo ? 0 : Math.floor((ultimo - t) / paso) + 1
    const salida = new Float32Array(salidaPares * 2)
    const tabla = this.tabla
    for (let k = 0; k < salidaPares; k++) {
      const i = Math.floor(t)
      const fase = (t - i) * FASES
      const p = Math.floor(fase)
      const mezcla = fase - p
      const fila0 = p * TAPS
      const fila1 = fila0 + TAPS
      const base = i - MEDIO + 1
      let izq = 0
      let der = 0
      for (let j = 0; j < TAPS; j++) {
        const c0 = tabla[fila0 + j]
        const c = c0 + (tabla[fila1 + j] - c0) * mezcla
        izq += bi[base + j] * c
        der += bd[base + j] * c
      }
      salida[k * 2] = izq
      salida[k * 2 + 1] = der
      t += paso
    }
    this.posicion = t - TAPS - pares
    this.historiaI.set(bi.subarray(largo - TAPS, largo))
    this.historiaD.set(bd.subarray(largo - TAPS, largo))
    return salida
  }

  reiniciar(): void {
    this.posicion = 0
    this.historiaI.fill(0)
    this.historiaD.fill(0)
  }
}

/**
 * Ajuste del ritmo según lo que queda en la cola del altavoz: si se vacía, se generan algo más de
 * muestras; si se llena, algo menos. Como mucho un 1 %, que no se oye: cubre la diferencia entre
 * la consola y la pantalla cuando el juego va sincronizado con ella (ver ritmo.ts).
 */
export function factorRitmo(lleno: number, objetivo: number): number {
  if (objetivo <= 0) return 1
  const desvio = Math.max(-1, Math.min(1, (objetivo - lleno) / objetivo))
  return 1 + desvio * 0.01
}

/**
 * Control del ritmo del sonido. El procesador de audio avisa de lo que le queda en cola cada 50 ms;
 * entre aviso y aviso se estima restando lo que ya ha sonado por el tiempo pasado (si solo se
 * sumara lo enviado, el tono subiría y bajaría 20 veces por segundo: suena metálico). El factor se
 * suaviza para que tarde en torno a un segundo en cambiar.
 */
export class ControlRitmo {
  private reportado = 0
  private momento = 0
  private enviados = 0
  private factor = 1
  private ultimo = 0
  private readonly frecuenciaSalida: number
  private readonly objetivo: number

  constructor(frecuenciaSalida: number, objetivo: number) {
    this.frecuenciaSalida = frecuenciaSalida
    this.objetivo = objetivo
  }

  /** Aviso del procesador: pares que le quedan en cola, recibido en el momento `t` (ms). */
  aviso(lleno: number, t: number): void {
    this.reportado = lleno
    this.momento = t
    this.enviados = 0
  }

  /** Pares enviados al procesador después del último aviso. */
  enviado(pares: number): void {
    this.enviados += pares
  }

  /** Lo que se estima que queda en cola en el momento `t`. */
  estimado(t: number): number {
    return Math.max(0, this.reportado + this.enviados - ((t - this.momento) / 1000) * this.frecuenciaSalida)
  }

  /** Factor de ritmo para el bloque que se va a enviar en `t`, suavizado. */
  siguiente(t: number): number {
    // Tras reiniciar, hasta el primer aviso no se sabe lo que hay en cola: ritmo normal (v0.36.0)
    if (this.momento === 0) return this.factor
    const dt = this.ultimo ? Math.min(t - this.ultimo, 100) : 0
    this.ultimo = t
    const meta = factorRitmo(this.estimado(t), this.objetivo)
    this.factor += (meta - this.factor) * Math.min(1, dt / 1000)
    return this.factor
  }

  reiniciar(): void {
    this.reportado = 0
    this.momento = 0
    this.enviados = 0
    this.factor = 1
    this.ultimo = 0
  }
}
