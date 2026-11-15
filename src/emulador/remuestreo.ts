/**
 * Remuestreo lineal de audio estéreo de 16 bits (la frecuencia del núcleo) a coma flotante a la
 * frecuencia del iPhone. Conserva la posición entre bloques para que no haya saltos.
 */
export class Remuestreador {
  private posicion = 0 // posición fraccionaria dentro del bloque de entrada
  private anteriorI = 0
  private anteriorD = 0

  /**
   * @param entrada muestras intercaladas (izquierda, derecha)
   * @param paso pares de entrada por cada par de salida (frecuencia del núcleo / frecuencia de salida)
   */
  procesar(entrada: Int16Array, paso: number): Float32Array {
    const pares = entrada.length >> 1
    if (pares === 0 || !(paso > 0)) return new Float32Array(0)
    // La posición -1 corresponde a la última muestra del bloque anterior
    const salidaPares = Math.max(0, Math.floor((pares - 1 - this.posicion) / paso) + 1)
    const salida = new Float32Array(salidaPares * 2)
    let pos = this.posicion
    for (let k = 0; k < salidaPares; k++) {
      const i = Math.floor(pos)
      const f = pos - i
      const i0 = i - 1
      const izq0 = i0 < 0 ? this.anteriorI : entrada[i0 * 2]
      const der0 = i0 < 0 ? this.anteriorD : entrada[i0 * 2 + 1]
      const izq1 = entrada[i * 2]
      const der1 = entrada[i * 2 + 1]
      salida[k * 2] = (izq0 + (izq1 - izq0) * f) / 32768
      salida[k * 2 + 1] = (der0 + (der1 - der0) * f) / 32768
      pos += paso
    }
    this.posicion = pos - pares
    this.anteriorI = entrada[(pares - 1) * 2]
    this.anteriorD = entrada[(pares - 1) * 2 + 1]
    return salida
  }

  reiniciar(): void {
    this.posicion = 0
    this.anteriorI = 0
    this.anteriorD = 0
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
    const dt = this.ultimo ? Math.min(t - this.ultimo, 100) : 0
    this.ultimo = t
    const meta = factorRitmo(this.estimado(t), this.objetivo)
    this.factor += (meta - this.factor) * Math.min(1, dt / 1000)
    return this.factor
  }

  reiniciar(): void {
    this.reportado = 0
    this.enviados = 0
    this.factor = 1
    this.ultimo = 0
  }
}
