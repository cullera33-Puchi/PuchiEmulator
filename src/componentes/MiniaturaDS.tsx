/**
 * Miniatura de la otra pantalla de DS en «grande y pequeña» (v0.17.0). Flota encima de todo: se
 * arrastra para moverla y un toque intercambia las pantallas. Su sitio se guarda por juego como
 * fracción de la pantalla, así que sirve en vertical y en horizontal (el CSS la mantiene dentro).
 */
import { useRef, useState, type PointerEvent as EventoPuntero, type Ref } from 'react'
import { registrar } from '../lib/registro'

interface Props {
  ref: Ref<HTMLCanvasElement>
  posicion?: { x: number; y: number }
  alMover: (posicion: { x: number; y: number }) => void
  alTocar: () => void
}

/** Se considera arrastre a partir de 8 puntos; menos es un toque. */
const UMBRAL = 8

export function MiniaturaDS({ ref, posicion, alMover, alTocar }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const inicio = useRef<{ x: number; y: number; izquierda: number; arriba: number; moviendo: boolean } | null>(null)
  const [arrastre, setArrastre] = useState<{ izquierda: number; arriba: number } | null>(null)

  const bajar = (e: EventoPuntero<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const r = caja.current!.getBoundingClientRect()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // sin captura: el arrastre funciona mientras el dedo siga encima
    }
    inicio.current = { x: e.clientX, y: e.clientY, izquierda: r.left, arriba: r.top, moviendo: false }
  }

  const mover = (e: EventoPuntero<HTMLDivElement>) => {
    const i = inicio.current
    if (!i) return
    const dx = e.clientX - i.x
    const dy = e.clientY - i.y
    if (!i.moviendo && Math.hypot(dx, dy) < UMBRAL) return
    i.moviendo = true
    const r = caja.current!.getBoundingClientRect()
    setArrastre({
      izquierda: Math.min(Math.max(0, i.izquierda + dx), window.innerWidth - r.width),
      arriba: Math.min(Math.max(0, i.arriba + dy), window.innerHeight - r.height),
    })
  }

  const subir = () => {
    const i = inicio.current
    inicio.current = null
    if (!i) return
    if (!i.moviendo) {
      registrar('info', 'Pantallas de DS intercambiadas')
      alTocar()
      return
    }
    if (arrastre) alMover({ x: arrastre.izquierda / window.innerWidth, y: arrastre.arriba / window.innerHeight })
    setArrastre(null)
  }

  // Mientras se arrastra, en puntos; si no, la fracción guardada (el CSS la mantiene dentro)
  const estilo = arrastre
    ? { left: arrastre.izquierda, top: arrastre.arriba, right: 'auto' }
    : posicion
      ? ({ '--mini-x': posicion.x, '--mini-y': posicion.y } as React.CSSProperties)
      : undefined
  return (
    <div
      ref={caja}
      className={`miniatura-ds ${posicion || arrastre ? 'colocada' : ''}`}
      style={estilo}
      onPointerDown={bajar}
      onPointerMove={mover}
      onPointerUp={subir}
      onPointerCancel={subir}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      aria-label="Miniatura de la otra pantalla: toca para intercambiar, arrastra para moverla"
      data-testid="miniatura-ds"
    >
      <canvas ref={ref} width={256} height={192} />
    </div>
  )
}
