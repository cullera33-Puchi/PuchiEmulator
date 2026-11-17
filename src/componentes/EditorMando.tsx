/**
 * Editor de los botones (v0.20.0): con el juego en pausa, se arrastra cada pieza del mando para
 * moverla y se cambia su tamaño con − y +. Se guarda por juego y por orientación al tocar «Listo».
 */
import { Minus, Plus } from 'lucide-react'
import { useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { aAltoActual, altoSinDato, escalar, mover, type Colocacion, type DisposicionPiezas, type Orientacion, type Pieza } from '../lib/disposicionMando'
import { giroDe, vectorJuego } from '../lib/giro'

interface Props {
  colocaciones: DisposicionPiezas
  /** Orientación del recuadro del juego, para las piezas guardadas sin su alto */
  orientacion: Orientacion
  alCambiar: (c: DisposicionPiezas) => void
  alRestablecer: () => void
  alListo: () => void
}

const NOMBRE: Record<Pieza, string> = {
  cruceta: 'Cruceta',
  botones: 'Botones',
  l: 'L',
  r: 'R',
  select: 'Select',
  start: 'Start',
  guardar: 'Guardar y cargar',
  herramientas: 'Herramientas',
  menu: 'Menú',
  palanca: 'Palanca derecha',
}

/**
 * El nombre de una pieza: el del botón que se ve si es uno solo (v0.36.0: en N64, la pieza «l» es la Z
 * y «select» es la L), o el genérico.
 */
function nombreDe(p: Pieza): string {
  if (p === 'cruceta' || p === 'l' || p === 'r' || p === 'select' || p === 'start') {
    const etiqueta = document.querySelector(`.juego [data-pieza="${p}"]`)?.getAttribute('aria-label')
    if (etiqueta) return etiqueta
  }
  return NOMBRE[p]
}

export function EditorMando({ colocaciones, orientacion, alCambiar, alRestablecer, alListo }: Props) {
  const [elegida, setElegida] = useState<Pieza | null>(null)
  const arrastre = useRef<{ pieza: Pieza; x: number; y: number; inicio: Colocacion; dedo: number } | null>(null)

  /** La colocación de una pieza: la guardada o, si no, donde está ahora en pantalla. */
  const colocacionDe = (p: Pieza): Colocacion | null => {
    // La guardada, llevada al alto de ahora: si no, al empezar a moverla saltaba (v0.43.0)
    const guardada = colocaciones[p]
    if (guardada) {
      const alto = document.querySelector<HTMLElement>('.mando')?.clientHeight ?? 0
      return aAltoActual(guardada, alto, guardada.alto ?? altoSinDato(orientacion))
    }
    // Las del mando y, desde la v0.35.0, las herramientas, que están fuera de él (mismo recuadro)
    const el = document.querySelector<HTMLElement>(`.juego [data-pieza="${p}"]`)
    const mando = document.querySelector<HTMLElement>('.mando')
    if (!el || !mando) return null
    // Centro de la pieza en el recuadro del juego (vale también con la pantalla girada)
    return { x: (el.offsetLeft + el.offsetWidth / 2) / mando.clientWidth, y: (el.offsetTop + el.offsetHeight / 2) / mando.clientHeight, escala: 1, alto: mando.clientHeight }
  }

  const medida = () => {
    const m = document.querySelector<HTMLElement>('.mando')
    return { ancho: m?.clientWidth || window.innerWidth, alto: m?.clientHeight || window.innerHeight, giro: giroDe(m) }
  }

  const bajar = (e: EventoPuntero<HTMLDivElement>) => {
    // Un solo dedo a la vez (v0.30.0): un segundo dedo no le quita la pieza al primero
    if (arrastre.current) return
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.closest('.juego [data-pieza]'))
    const p = el?.closest<HTMLElement>('[data-pieza]')?.dataset.pieza as Pieza | undefined
    if (!p) return
    const inicio = colocacionDe(p)
    if (!inicio) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setElegida(p)
    arrastre.current = { pieza: p, x: e.clientX, y: e.clientY, inicio, dedo: e.pointerId }
  }

  const moverDedo = (e: EventoPuntero<HTMLDivElement>) => {
    const a = arrastre.current
    if (!a || e.pointerId !== a.dedo) return
    const { ancho, alto, giro } = medida()
    const [dx, dy] = vectorJuego(e.clientX - a.x, e.clientY - a.y, giro)
    const c = mover(a.inicio, dx / ancho, dy / alto, alto)
    alCambiar({ ...colocaciones, [a.pieza]: c })
  }

  const subir = (e: EventoPuntero<HTMLDivElement>) => {
    if (arrastre.current && e.pointerId !== arrastre.current.dedo) return
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
        <p className="text-[13px] text-zinc-300">{elegida ? `${nombreDe(elegida)}: arrástrala o cambia su tamaño` : 'Arrastra cada botón a donde lo quieras'}</p>
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
