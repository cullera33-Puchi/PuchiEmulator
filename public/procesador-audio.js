/**
 * Procesador de sonido (AudioWorklet). Recibe bloques estéreo intercalados ya remuestreados a la
 * frecuencia del iPhone y los reproduce desde una cola circular. Cada 50 ms avisa de cuánto queda
 * en la cola para que el emulador ajuste el ritmo y no haya cortes ni retraso creciente.
 */
class ProcesadorAudio extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capacidad = 48000 // pares estéreo: un segundo como máximo
    this.cola = new Float32Array(this.capacidad * 2)
    this.lectura = 0
    this.escritura = 0
    this.lleno = 0
    this.maximo = this.capacidad
    this.cuentaAviso = 0
    this.port.onmessage = (e) => {
      const d = e.data
      if (d.tipo === 'muestras') this.encolar(d.muestras)
      else if (d.tipo === 'vaciar') this.lectura = this.escritura = this.lleno = 0
      else if (d.tipo === 'maximo') this.maximo = Math.min(this.capacidad, d.pares)
    }
  }

  encolar(muestras) {
    const pares = muestras.length >> 1
    for (let i = 0; i < pares; i++) {
      if (this.lleno >= this.maximo) {
        // Cola llena (el emulador va adelantado): se descarta lo más antiguo
        this.lectura = (this.lectura + 1) % this.capacidad
        this.lleno--
      }
      this.cola[this.escritura * 2] = muestras[i * 2]
      this.cola[this.escritura * 2 + 1] = muestras[i * 2 + 1]
      this.escritura = (this.escritura + 1) % this.capacidad
      this.lleno++
    }
  }

  process(_entradas, salidas) {
    const salida = salidas[0]
    const izquierda = salida[0]
    const derecha = salida[1] ?? salida[0]
    const n = izquierda.length
    for (let i = 0; i < n; i++) {
      if (this.lleno > 0) {
        izquierda[i] = this.cola[this.lectura * 2]
        derecha[i] = this.cola[this.lectura * 2 + 1]
        this.lectura = (this.lectura + 1) % this.capacidad
        this.lleno--
      } else {
        izquierda[i] = 0
        derecha[i] = 0
      }
    }
    this.cuentaAviso += n
    if (this.cuentaAviso >= sampleRate / 20) {
      this.cuentaAviso = 0
      this.port.postMessage(this.lleno)
    }
    return true
  }
}

registerProcessor('procesador-audio', ProcesadorAudio)
