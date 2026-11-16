/**
 * Miniatura de la otra pantalla de DS en «grande y pequeña» (v0.17.0). Flota encima de todo: se
 * arrastra para moverla y un toque intercambia las pantallas. Su sitio se guarda por juego como
 * fracción de la pantalla, así que sirve en vertical y en horizontal (el CSS la mantiene dentro).
 */
import { useRef, useState, type PointerEvent as EventoPuntero, type Ref } from 'react'
import { registrar } from '../lib/registro'
import { giroDe, vectorJuego } from '../lib/giro'

interface Props {
  ref: Ref<HTMLCanvasElement>
  posicion?: { x: number; y: number }
  alMover: (posicion: { x: number; y: number }) => void
  alTocar: () => void
  tamano?: 'pequena' | 'mediana' | 'grande'
}

const ESCALA_MINI = { pequena: 0.7, mediana: 1, grande: 1.35 }

/** Se considera arrastre a partir de 8 puntos; menos es un toque. */
const UMBRAL = 8

export function MiniaturaDS({ ref, posicion, alMover, alTocar, tamano = 'mediana' }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const inicio = useRef<{ x: number; y: number; izquierda: number; arriba: number; moviendo: boolean } | null>(null)
  const [arrastre, setArrastre] = useState<{ izquierda: number; arriba: number } | null>(null)

  /** Medida del recuadro del juego (girado o no) */
  const recuadro = () => {
    const padre = caja.current?.offsetParent as HTMLElement | null
    return { ancho: padre?.clientWidth || window.innerWidth, alto: padre?.clientHeight || window.innerHeight }
  }

  const bajar = (e: EventoPuntero<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const el = caja.current!
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // sin captura: el arrastre funciona mientras el dedo siga encima
    }
    inicio.current = { x: e.clientX, y: e.clientY, izquierda: el.offsetLeft, arriba: el.offsetTop, moviendo: false }
  }

  const mover = (e: EventoPuntero<HTMLDivElement>) => {
    const i = inicio.current
    if (!i) return
    const [dx, dy] = vectorJuego(e.clientX - i.x, e.clientY - i.y, giroDe(caja.current))
    if (!i.moviendo && Math.hypot(dx, dy) < UMBRAL) return
    i.moviendo = true
    const el = caja.current!
    const { ancho, alto } = recuadro()
    setArrastre({
      izquierda: Math.min(Math.max(0, i.izquierda + dx), ancho - el.offsetWidth),
      arriba: Math.min(Math.max(0, i.arriba + dy), alto - el.offsetHeight),
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
    if (arrastre) {
      const { ancho, alto } = recuadro()
      alMover({ x: arrastre.izquierda / ancho, y: arrastre.arriba / alto })
    }
    setArrastre(null)
  }

  // Mientras se arrastra, en puntos; si no, la fracción guardada (el CSS la mantiene dentro)
  const escala = { '--escala-mini': ESCALA_MINI[tamano] } as React.CSSProperties
  const estilo = arrastre
    ? { ...escala, left: arrastre.izquierda, top: arrastre.arriba, right: 'auto' }
    : posicion
      ? ({ ...escala, '--mini-x': posicion.x, '--mini-y': posicion.y } as React.CSSProperties)
      : escala
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
