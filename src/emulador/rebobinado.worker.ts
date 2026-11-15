/**
 * Hilo aparte para el historial de rebobinado. Comparar y comprimir cada estado cuesta varios
 * milisegundos (unos 8 ms con los 800 KB de un estado de Super Nintendo): aquí no frena el juego.
 */
import { Rebobinado } from './rebobinado'

type Mensaje =
  | { tipo: 'guardar'; estado: ArrayBuffer; botones: number }
  | { tipo: 'atras'; id: number }
  | { tipo: 'vaciar' }

const historial = new Rebobinado()

self.onmessage = (e: MessageEvent<Mensaje>) => {
  const m = e.data
  if (m.tipo === 'guardar') historial.guardar(new Uint8Array(m.estado), m.botones)
  else if (m.tipo === 'vaciar') historial.vaciar()
  else if (m.tipo === 'atras') {
    const anterior = historial.atras()
    if (!anterior) {
      self.postMessage({ id: m.id, estado: null, botones: 0 })
      return
    }
    // Se envía una copia: el historial se queda con el suyo para seguir deshaciendo diferencias
    const copia = anterior.estado.slice()
    self.postMessage({ id: m.id, estado: copia.buffer, botones: anterior.botones }, { transfer: [copia.buffer] })
  }
}
