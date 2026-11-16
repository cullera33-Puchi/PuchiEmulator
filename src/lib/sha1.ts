/**
 * SHA-1 por trozos (v0.37.0). El identificador de cada juego es el SHA-1 de su ROM; los discos de
 * PlayStation pesan cientos de megas y no se pueden leer enteros a la memoria para pasarlos a
 * `crypto.subtle.digest`, que no admite trozos. Este lo calcula mientras se copian.
 */
export class Sha1 {
  private readonly h = new Int32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0])
  private readonly bloque = new Uint8Array(64)
  private readonly w = new Int32Array(80)
  private enBloque = 0
  private total = 0

  actualizar(datos: Uint8Array): void {
    let i = 0
    this.total += datos.length
    // Lo que falta para completar el bloque a medias
    if (this.enBloque) {
      const n = Math.min(64 - this.enBloque, datos.length)
      this.bloque.set(datos.subarray(0, n), this.enBloque)
      this.enBloque += n
      i = n
      if (this.enBloque < 64) return
      this.procesar(this.bloque, 0)
      this.enBloque = 0
    }
    for (; i + 64 <= datos.length; i += 64) this.procesar(datos, i)
    if (i < datos.length) {
      this.bloque.set(datos.subarray(i), 0)
      this.enBloque = datos.length - i
    }
  }

  /** Resumen en hexadecimal; después no se puede seguir actualizando. */
  resumen(): string {
    const bits = this.total * 8
    const relleno = new Uint8Array(((this.enBloque < 56 ? 56 : 120) - this.enBloque) + 8)
    relleno[0] = 0x80
    const fin = relleno.length - 8
    // Longitud en bits, en big endian (hasta 2^53, de sobra)
    const alto = Math.floor(bits / 0x100000000)
    const bajo = bits >>> 0
    relleno[fin] = alto >>> 24
    relleno[fin + 1] = alto >>> 16
    relleno[fin + 2] = alto >>> 8
    relleno[fin + 3] = alto
    relleno[fin + 4] = bajo >>> 24
    relleno[fin + 5] = bajo >>> 16
    relleno[fin + 6] = bajo >>> 8
    relleno[fin + 7] = bajo
    const total = this.total
    this.actualizar(relleno)
    this.total = total
    return Array.from(this.h, (v) => (v >>> 0).toString(16).padStart(8, '0')).join('')
  }

  private procesar(d: Uint8Array, o: number): void {
    const w = this.w
    for (let t = 0; t < 16; t++) w[t] = (d[o + t * 4] << 24) | (d[o + t * 4 + 1] << 16) | (d[o + t * 4 + 2] << 8) | d[o + t * 4 + 3]
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]
      w[t] = (x << 1) | (x >>> 31)
    }
    let [a, b, c, dd, e] = this.h
    for (let t = 0; t < 80; t++) {
      let f: number
      let k: number
      if (t < 20) {
        f = (b & c) | (~b & dd)
        k = 0x5a827999
      } else if (t < 40) {
        f = b ^ c ^ dd
        k = 0x6ed9eba1
      } else if (t < 60) {
        f = (b & c) | (b & dd) | (c & dd)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ dd
        k = 0xca62c1d6
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0
      e = dd
      dd = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }
    this.h[0] = (this.h[0] + a) | 0
    this.h[1] = (this.h[1] + b) | 0
    this.h[2] = (this.h[2] + c) | 0
    this.h[3] = (this.h[3] + dd) | 0
    this.h[4] = (this.h[4] + e) | 0
  }
}
