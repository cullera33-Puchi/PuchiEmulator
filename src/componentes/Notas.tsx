/**
 * Notas de un juego (v0.14.0): dónde te quedaste, contraseñas, lo que falta por hacer. Se guardan
 * solas mientras se escribe y al cerrar; una nota vacía se borra.
 */
import { useEffect, useRef, useState } from 'react'
import { guardarNota, leerNota } from '../lib/almacen'
import { cuando } from '../lib/formato'
import { registrar } from '../lib/registro'

export function EditorNotas({ juegoId, oscura, alCambiar }: { juegoId: string; oscura?: boolean; alCambiar?: (texto: string) => void }) {
  const [texto, setTexto] = useState<string | null>(null)
  const [estado, setEstado] = useState<'guardada' | 'guardando' | null>(null)
  const [fecha, setFecha] = useState<number | null>(null)
  const pendiente = useRef<string | null>(null)
  const temporizador = useRef(0)

  const guardar = async () => {
    clearTimeout(temporizador.current)
    const t = pendiente.current
    if (t === null) return
    pendiente.current = null
    try {
      await guardarNota(juegoId, t)
      setEstado('guardada')
      setFecha(Date.now())
      alCambiar?.(t)
    } catch (e) {
      registrar('error', 'No se pudo guardar la nota', (e as Error)?.message)
    }
  }
  const guardarRef = useRef(guardar)
  guardarRef.current = guardar

  useEffect(() => {
    let cancelado = false
    void leerNota(juegoId).then((n) => {
      if (cancelado) return
      setTexto(n?.texto ?? '')
      setFecha(n?.fecha ?? null)
    })
    return () => {
      cancelado = true
      // Lo que quede sin guardar, al cerrar
      void guardarRef.current()
    }
  }, [juegoId])

  if (texto === null) return null
  return (
    <div>
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          pendiente.current = e.target.value
          setEstado('guardando')
          clearTimeout(temporizador.current)
          temporizador.current = window.setTimeout(() => void guardarRef.current(), 600)
        }}
        onBlur={() => void guardarRef.current()}
        placeholder="Dónde te quedaste, contraseñas, lo que te falta por hacer…"
        aria-label="Notas del juego"
        rows={8}
        className={`block w-full resize-none rounded-xl p-3 text-[17px] leading-snug outline-none ${oscura ? 'bg-zinc-800 text-white placeholder:text-zinc-500' : 'bg-white placeholder:text-zinc-400 dark:bg-zinc-900'}`}
      />
      <p className="pie-grupo">{estado === 'guardando' ? 'Guardando…' : estado === 'guardada' ? 'Guardada' : fecha ? `Última vez, ${cuando(fecha)}` : 'Se guarda sola mientras escribes.'}</p>
    </div>
  )
}
