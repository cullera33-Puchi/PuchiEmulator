/**
 * Historial para rebobinar. Guarda el estado más reciente entero y los anteriores como diferencia
 * (XOR) con el siguiente, comprimida. Entre dos estados cercanos cambia poco, así que cada uno ocupa
 * unos pocos KB. Para ir atrás se deshace la diferencia con el estado más reciente; para hacer
 * sitio se descarta la más antigua, que nadie más necesita.
 */
import { deflateSync, inflateSync } from 'fflate'

export class Rebobinado {
  private actual: Uint8Array | null = null
  private diferencias: Uint8Array[] = []
  /** Botones pulsados en cada estado, para rehacer su imagen tal cual fue */
  private botones: number[] = []
  private bytes = 0
  private readonly maximo: number
  private readonly maximoBytes: number

  /**
   * @param maximo estados que se conservan (con uno cada 10 fotogramas, 180 son unos 30 segundos)
   * @param maximoBytes tope de memoria de las diferencias comprimidas
   */
  constructor(maximo = 180, maximoBytes = 48 * 1024 * 1024) {
    this.maximo = maximo
    this.maximoBytes = maximoBytes
  }

  get cuantos(): number {
    return this.actual ? this.diferencias.length + 1 : 0
  }

  get memoria(): number {
    return this.bytes + (this.actual?.length ?? 0)
  }

  /** Añade un estado (el núcleo da una copia: se queda con ella) y los botones de ese momento. */
  guardar(estado: Uint8Array, botones = 0): void {
    if (this.actual && this.actual.length !== estado.length) this.vaciar()
    if (this.actual) {
      const xor = new Uint8Array(estado.length)
      const a = this.actual
      for (let i = 0; i < xor.length; i++) xor[i] = a[i] ^ estado[i]
      const comprimida = deflateSync(xor, { level: 1 })
      this.diferencias.push(comprimida)
      this.bytes += comprimida.length
    }
    this.actual = estado
    this.botones.push(botones)
    while (this.diferencias.length + 1 > this.maximo || this.bytes > this.maximoBytes) {
      const vieja = this.diferencias.shift()
      if (!vieja) break
      this.botones.shift()
      this.bytes -= vieja.length
    }
  }

  /** Quita el estado más reciente y devuelve el anterior, o null si no queda historial. */
  atras(): { estado: Uint8Array; botones: number } | null {
    const diferencia = this.diferencias.pop()
    if (!diferencia || !this.actual) return null
    this.botones.pop()
    this.bytes -= diferencia.length
    const xor = inflateSync(diferencia)
    const anterior = new Uint8Array(xor.length)
    const a = this.actual
    for (let i = 0; i < anterior.length; i++) anterior[i] = a[i] ^ xor[i]
    this.actual = anterior
    return { estado: anterior, botones: this.botones[this.botones.length - 1] ?? 0 }
  }

  vaciar(): void {
    this.actual = null
    this.diferencias = []
    this.botones = []
    this.bytes = 0
  }
}
