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
 * muestras; si se llena, algo menos. Como mucho un 0,5 %, que no se oye.
 */
export function factorRitmo(lleno: number, objetivo: number): number {
  if (objetivo <= 0) return 1
  const desvio = Math.max(-1, Math.min(1, (objetivo - lleno) / objetivo))
  return 1 + desvio * 0.005
}
