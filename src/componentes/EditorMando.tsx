/**
 * Editor de los botones (v0.20.0): con el juego en pausa, se arrastra cada pieza del mando para
 * moverla y se cambia su tamaño con − y +. Se guarda por juego y por orientación al tocar «Listo».
 */
import { Minus, Plus } from 'lucide-react'
import { useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { desdeRect, escalar, mover, type Colocacion, type DisposicionPiezas, type Pieza } from '../lib/disposicionMando'

interface Props {
  colocaciones: DisposicionPiezas
  alCambiar: (c: DisposicionPiezas) => void
  alRestablecer: () => void
  alListo: () => void
}

const NOMBRE: Record<Pieza, string> = { cruceta: 'Cruceta', botones: 'Botones', l: 'L', r: 'R', select: 'Select', start: 'Start' }

export function EditorMando({ colocaciones, alCambiar, alRestablecer, alListo }: Props) {
  const [elegida, setElegida] = useState<Pieza | null>(null)
  const arrastre = useRef<{ pieza: Pieza; x: number; y: number; inicio: Colocacion } | null>(null)

  /** La colocación de una pieza: la guardada o, si no, donde está ahora en pantalla. */
  const colocacionDe = (p: Pieza): Colocacion | null => {
    if (colocaciones[p]) return colocaciones[p]!
    const el = document.querySelector<HTMLElement>(`.mando [data-pieza="${p}"]`)
    if (!el) return null
    return desdeRect(el.getBoundingClientRect(), window.innerWidth, window.innerHeight)
  }

  const bajar = (e: EventoPuntero<HTMLDivElement>) => {
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.closest('.mando [data-pieza]'))
    const p = el?.closest<HTMLElement>('[data-pieza]')?.dataset.pieza as Pieza | undefined
    if (!p) return
    const inicio = colocacionDe(p)
    if (!inicio) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setElegida(p)
    arrastre.current = { pieza: p, x: e.clientX, y: e.clientY, inicio }
  }

  const moverDedo = (e: EventoPuntero<HTMLDivElement>) => {
    const a = arrastre.current
    if (!a) return
    const c = mover(a.inicio, (e.clientX - a.x) / window.innerWidth, (e.clientY - a.y) / window.innerHeight)
    alCambiar({ ...colocaciones, [a.pieza]: c })
  }

  const subir = () => {
    arrastre.current = null
  }

  const tamano = (pasos: number) => {
    if (!elegida) return
    const c = colocacionDe(elegida)
    if (c) alCambiar({ ...colocaciones, [elegida]: escalar(c, pasos) })
  }

  return (
    <div
      className="editor-mando"
      onPointerDown={bajar}
      onPointerMove={moverDedo}
      onPointerUp={subir}
      onPointerCancel={subir}
      data-testid="editor-mando"
      data-elegida={elegida ?? undefined}
    >
      <div className="editor-barra" onPointerDown={(e) => e.stopPropagation()}>
        <p className="text-[13px] text-zinc-300">{elegida ? `${NOMBRE[elegida]}: arrástrala o cambia su tamaño` : 'Arrastra cada botón a donde lo quieras'}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button className="boton-icono" aria-label="Más pequeño" disabled={!elegida} onClick={() => tamano(-1)}>
              <Minus size={20} />
            </button>
            <span className="w-12 text-center text-[15px] tabular-nums">{elegida ? `${Math.round((colocacionDe(elegida)?.escala ?? 1) * 100)} %` : ''}</span>
            <button className="boton-icono" aria-label="Más grande" disabled={!elegida} onClick={() => tamano(1)}>
              <Plus size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="boton-texto px-2 py-1" onClick={alRestablecer}>
              Restablecer
            </button>
            <button className="boton-lleno px-4 py-1.5" onClick={alListo}>
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
