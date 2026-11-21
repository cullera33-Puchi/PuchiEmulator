/**
 * Procesador de sonido (AudioWorklet). Recibe bloques estéreo intercalados ya remuestreados a la
 * frecuencia del iPhone y los reproduce desde una cola circular. Cada 50 ms avisa de cuánto queda
 * en la cola para que el emulador ajuste el ritmo y no haya cortes ni retraso creciente.
 *
 * Ritmo propio (v0.33.0): la página puede pasar un canal (`puerto`) por el que el hilo del motor
 * manda las muestras directamente; mientras exista, los avisos van por ese canal.
 *
 * Cortes (v0.49.0): si la cola se vacía, el sonido se apaga en unas 64 muestras desde la última en
 * lugar de caer a cero de golpe (eso es el chasquido), y vuelve igual de suave. El aviso lleva también
 * las veces que ha pasado, para el registro: `[lleno, cortes]`.
 */
const RAMPA = 1 / 64
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
    this.ganancia = 0
    this.ultimaI = 0
    this.ultimaD = 0
    this.sonando = false
    this.cortes = 0
    this.externo = null
    this.port.onmessage = (e) => this.mensaje(e.data)
  }

  mensaje(d) {
    if (d.tipo === 'muestras') this.encolar(d.muestras)
    else if (d.tipo === 'vaciar') {
      // Vaciar a propósito (pausa, cargar un estado) no es un corte
      this.lectura = this.escritura = this.lleno = 0
      this.sonando = false
    }
    else if (d.tipo === 'maximo') this.maximo = Math.min(this.capacidad, d.pares)
    else if (d.tipo === 'puerto') {
      this.soltar()
      this.idExterno = d.id
      this.externo = d.puerto
      this.externo.onmessage = (e) => this.mensaje(e.data)
      this.lectura = this.escritura = this.lleno = 0
      this.sonando = false
    } else if (d.tipo === 'soltar' && d.id === this.idExterno) this.soltar()
  }

  soltar() {
    if (!this.externo) return
    this.externo.onmessage = null
    this.externo.close()
    this.externo = null
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
        this.ultimaI = this.cola[this.lectura * 2]
        this.ultimaD = this.cola[this.lectura * 2 + 1]
        this.lectura = (this.lectura + 1) % this.capacidad
        this.lleno--
        if (this.ganancia < 1) this.ganancia = Math.min(1, this.ganancia + RAMPA)
        this.sonando = true
      } else {
        // Sin muestras: se apaga suave desde la última. Se cuenta un corte si estaba sonando
        if (this.sonando) {
          this.sonando = false
          this.cortes++
        }
        if (this.ganancia > 0) this.ganancia = Math.max(0, this.ganancia - RAMPA)
      }
      izquierda[i] = this.ultimaI * this.ganancia
      derecha[i] = this.ultimaD * this.ganancia
    }
    this.cuentaAviso += n
    if (this.cuentaAviso >= sampleRate / 20) {
      this.cuentaAviso = 0
      ;(this.externo ?? this.port).postMessage([this.lleno, this.cortes])
      this.cortes = 0
    }
    return true
  }
}

registerProcessor('procesador-audio', ProcesadorAudio)
