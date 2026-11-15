/**
 * Mando táctil. Admite varios dedos a la vez y deslizar de un botón a otro (por ejemplo, de B a A).
 * Un dedo que empieza en la cruceta sigue mandando en ella aunque se salga, y su dirección sale del
 * ángulo respecto al centro (ocho direcciones). Para no redibujar React a cada movimiento, el
 * aspecto de pulsado se cambia directamente en los elementos.
 */
import { useEffect, useRef, type PointerEvent as EventoPuntero } from 'react'
import { bit, direccionCruceta, type NombreBoton } from '../emulador/botones'

interface Props {
  hombros: boolean
  alCambiar: (mascara: number) => void
  /** Cada toque que termina: sirve para activar el sonido en Safari */
  alToque?: () => void
}

interface Dedo {
  cruceta: boolean
  mascara: number
}

const BRAZOS: [NombreBoton, string][] = [
  ['ARRIBA', 'arriba'],
  ['ABAJO', 'abajo'],
  ['IZQUIERDA', 'izquierda'],
  ['DERECHA', 'derecha'],
]

export function Mando({ hombros, alCambiar, alToque }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const cruceta = useRef<HTMLDivElement>(null)
  const dedos = useRef(new Map<number, Dedo>())
  const mascara = useRef(0)
  const alCambiarRef = useRef(alCambiar)
  alCambiarRef.current = alCambiar

  const pintar = (m: number) => {
    const r = raiz.current
    if (!r) return
    r.querySelectorAll<HTMLElement>('[data-boton]').forEach((el) => {
      const b = el.dataset.boton as NombreBoton
      el.classList.toggle('pulsado', (m & bit(b)) !== 0)
    })
  }

  const recalcular = () => {
    let m = 0
    for (const d of dedos.current.values()) m |= d.mascara
    if (m !== mascara.current) {
      mascara.current = m
      pintar(m)
      alCambiarRef.current(m)
    }
  }

  const desdeCruceta = (x: number, y: number) => {
    const r = cruceta.current?.getBoundingClientRect()
    if (!r) return 0
    const radio = r.width / 2
    return direccionCruceta((x - (r.left + radio)) / radio, (y - (r.top + r.height / 2)) / radio)
  }

  const bajoElDedo = (x: number, y: number): { cruceta: boolean; mascara: number } => {
    const el = document.elementFromPoint(x, y)
    if (!el || !raiz.current?.contains(el)) return { cruceta: false, mascara: 0 }
    if (cruceta.current?.contains(el)) return { cruceta: true, mascara: desdeCruceta(x, y) }
    const boton = (el as HTMLElement).closest<HTMLElement>('[data-boton]')
    return { cruceta: false, mascara: boton ? bit(boton.dataset.boton as NombreBoton) : 0 }
  }

  const alBajar = (e: EventoPuntero) => {
    e.preventDefault()
    dedos.current.set(e.pointerId, bajoElDedo(e.clientX, e.clientY))
    recalcular()
  }

  const alMover = (e: EventoPuntero) => {
    const d = dedos.current.get(e.pointerId)
    if (!d) return
    e.preventDefault()
    if (d.cruceta) d.mascara = desdeCruceta(e.clientX, e.clientY)
    else {
      const nuevo = bajoElDedo(e.clientX, e.clientY)
      // Deslizar desde un botón hasta la cruceta no la toma: la cruceta es de quien empieza en ella
      d.mascara = nuevo.cruceta ? 0 : nuevo.mascara
    }
    recalcular()
  }

  const alSubir = (e: EventoPuntero) => {
    if (!dedos.current.delete(e.pointerId)) return
    recalcular()
    alToque?.()
  }

  // Si la app pasa a segundo plano con un dedo puesto, se sueltan todos los botones
  useEffect(() => {
    const soltar = () => {
      dedos.current.clear()
      recalcular()
    }
    window.addEventListener('blur', soltar)
    document.addEventListener('visibilitychange', soltar)
    return () => {
      window.removeEventListener('blur', soltar)
      document.removeEventListener('visibilitychange', soltar)
    }
  }, [])

  return (
    <div
      ref={raiz}
      className="mando"
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSubir}
      onPointerCancel={alSubir}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="mando"
    >
      <div ref={cruceta} className="control cruceta" aria-label="Cruceta">
        {BRAZOS.map(([b, clase]) => (
          <span key={b} data-boton={b} className={`brazo ${clase}`} />
        ))}
        <span className="centro" />
      </div>

      <div className="botones-accion">
        <span data-boton="B" className="control b" role="button" aria-label="B">
          B
        </span>
        <span data-boton="A" className="control a" role="button" aria-label="A">
          A
        </span>
      </div>

      {hombros && (
        <>
          <span data-boton="L" className="control hombro l" role="button" aria-label="L">
            L
          </span>
          <span data-boton="R" className="control hombro r" role="button" aria-label="R">
            R
          </span>
        </>
      )}

      <span data-boton="SELECT" className="control pequeno select" role="button" aria-label="Select">
        SELECT
      </span>
      <span data-boton="START" className="control pequeno start" role="button" aria-label="Start">
        START
      </span>
    </div>
  )
}
