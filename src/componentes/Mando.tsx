/**
 * Mando táctil. Admite varios dedos a la vez y deslizar de un botón a otro (por ejemplo, de B a A).
 * Un dedo que empieza en la cruceta sigue mandando en ella aunque se salga, y su dirección sale del
 * ángulo respecto al centro (ocho direcciones). Para no redibujar React a cada movimiento, el
 * aspecto de pulsado se cambia directamente en los elementos.
 */
import { Footprints } from 'lucide-react'
import { useEffect, useRef, type PointerEvent as EventoPuntero, type RefObject } from 'react'
import { bit, direccionCruceta, type NombreBoton } from '../emulador/botones'
import { vibracionActiva } from '../lib/ajustes'
import { NOMBRE_BOTON, type BotonMenu } from '../lib/mandoJuego'
import { estiloPieza, type DisposicionPiezas, type Pieza } from '../lib/disposicionMando'
import { fraccionEn, giroDe, vectorJuego } from '../lib/giro'
import { vibrar } from '../lib/vibracion'

interface Props {
  hombros: boolean
  /** X e Y además de A y B, en rombo (Super Nintendo) */
  cuatro?: boolean
  alCambiar: (mascara: number) => void
  /** Cada toque que termina: sirve para activar el sonido en Safari */
  alToque?: () => void
  tactil?: Tactil
  /** Mando para juegos de rol: A grande, B, el botón de menú del juego y los X e Y que sobren */
  jrpg?: { menu: BotonMenu; extras: ('X' | 'Y')[] }
  /** Cruceta sin diagonales */
  cuatroDirecciones?: boolean
  /** Piezas movidas por el usuario (v0.20.0): dónde va cada una y su tamaño */
  colocaciones?: DisposicionPiezas
  /** Editando la colocación: el mando no manda nada al juego */
  editando?: boolean
  /** Máscara de los botones con turbo: se marcan con una «T» */
  turbo?: number
  /** Correr fijo (modo JRPG): botón debajo de la A que se activa y se desactiva con un toque */
  correr?: { activo: boolean; boton: 'B' | 'Y'; alCambiar: () => void }
}

interface Dedo {
  cruceta: boolean
  mascara: number
  /** El dedo empezó en la imagen de una consola táctil: hace de lápiz */
  tactil?: boolean
  /** Botón de acción (correr): actúa al tocarlo, no se mantiene */
  accion?: boolean
}

/** La cruceta recoge los toques hasta un 25 % más allá de su dibujo: el pulgar no siempre cae dentro. */
const CRUCETA_AMPLIADA = 1.25

/** Pantalla táctil (Nintendo DS): el lienzo y a quién avisar del toque (0 a 1 sobre la imagen, o null) */
export interface Tactil {
  lienzo: RefObject<HTMLCanvasElement | null>
  alTocar: (x: number | null, y?: number) => void
}

const BRAZOS: [NombreBoton, string][] = [
  ['ARRIBA', 'arriba'],
  ['ABAJO', 'abajo'],
  ['IZQUIERDA', 'izquierda'],
  ['DERECHA', 'derecha'],
]

export function Mando({ hombros, cuatro, alCambiar, alToque, tactil, jrpg, cuatroDirecciones, correr, turbo = 0, colocaciones, editando }: Props) {
  // Atributos de cada pieza: su nombre (para el editor) y, si se ha movido, su sitio y su tamaño
  const pieza = (p: Pieza) => ({ 'data-pieza': p, style: colocaciones?.[p] ? (estiloPieza(colocaciones[p]!) as React.CSSProperties) : undefined })
  const raiz = useRef<HTMLDivElement>(null)
  const cruceta = useRef<HTMLDivElement>(null)
  const dedos = useRef(new Map<number, Dedo>())
  const mascara = useRef(0)
  const alCambiarRef = useRef(alCambiar)
  alCambiarRef.current = alCambiar
  const cuatroRef = useRef(cuatroDirecciones)
  cuatroRef.current = cuatroDirecciones

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
      // Vibración breve solo al pulsar un botón nuevo, no al soltar
      if (m & ~mascara.current && vibracionActiva()) vibrar()
      mascara.current = m
      pintar(m)
      alCambiarRef.current(m)
    }
  }

  const desdeCruceta = (x: number, y: number, anterior = 0) => {
    const el = cruceta.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const radio = r.width / 2
    // Con la pantalla girada, la dirección se mide en el juego, no en el iPhone
    const [dx, dy] = vectorJuego(x - (r.left + r.width / 2), y - (r.top + r.height / 2), giroDe(el))
    return direccionCruceta(dx / radio, dy / radio, anterior, !!cuatroRef.current)
  }

  /** El punto cae cerca de la cruceta, aunque sea fuera de su dibujo */
  const cercaDeLaCruceta = (x: number, y: number) => {
    const r = cruceta.current?.getBoundingClientRect()
    if (!r) return false
    const radio = r.width / 2
    return Math.hypot(x - (r.left + radio), y - (r.top + r.height / 2)) <= radio * CRUCETA_AMPLIADA
  }

  const enLaImagen = (x: number, y: number): [number, number] | null => {
    const el = tactil?.lienzo.current
    if (!el) return null
    const [fx, fy] = fraccionEn(el, x, y)
    return fx < 0 || fx > 1 || fy < 0 || fy > 1 ? null : [fx, fy]
  }

  const bajoElDedo = (x: number, y: number): Dedo => {
    const el = document.elementFromPoint(x, y)
    if (!el || !raiz.current?.contains(el)) return { cruceta: false, mascara: 0 }
    if (cruceta.current?.contains(el)) return { cruceta: true, mascara: desdeCruceta(x, y) }
    if ((el as HTMLElement).closest('[data-accion]')) return { cruceta: false, mascara: 0, accion: true }
    const boton = (el as HTMLElement).closest<HTMLElement>('[data-boton]')
    if (boton) return { cruceta: false, mascara: bit(boton.dataset.boton as NombreBoton) }
    if (enLaImagen(x, y)) return { cruceta: false, mascara: 0, tactil: true }
    if (cercaDeLaCruceta(x, y)) return { cruceta: true, mascara: desdeCruceta(x, y) }
    return { cruceta: false, mascara: 0 }
  }

  /** Posición del lápiz, limitada a la imagen aunque el dedo se salga */
  const tocar = (x: number, y: number) => {
    const el = tactil?.lienzo.current
    if (!el) return
    const [fx, fy] = fraccionEn(el, x, y)
    tactil?.alTocar(Math.min(1, Math.max(0, fx)), Math.min(1, Math.max(0, fy)))
  }

  const alBajar = (e: EventoPuntero) => {
    e.preventDefault()
    if (editando) return
    const d = bajoElDedo(e.clientX, e.clientY)
    dedos.current.set(e.pointerId, d)
    if (d.tactil) tocar(e.clientX, e.clientY)
    if (d.accion) {
      correr?.alCambiar()
      if (vibracionActiva()) vibrar()
    }
    recalcular()
  }

  const alMover = (e: EventoPuntero) => {
    const d = dedos.current.get(e.pointerId)
    if (!d) return
    e.preventDefault()
    if (d.tactil) {
      tocar(e.clientX, e.clientY)
      return
    }
    if (d.accion) return
    if (d.cruceta) d.mascara = desdeCruceta(e.clientX, e.clientY, d.mascara)
    else {
      const nuevo = bajoElDedo(e.clientX, e.clientY)
      // Deslizar desde un botón hasta la cruceta no la toma: la cruceta es de quien empieza en ella
      d.mascara = nuevo.cruceta ? 0 : nuevo.mascara
    }
    recalcular()
  }

  const alSubir = (e: EventoPuntero) => {
    const d = dedos.current.get(e.pointerId)
    if (!dedos.current.delete(e.pointerId)) return
    if (d?.tactil) tactil?.alTocar(null)
    recalcular()
    alToque?.()
  }

  // Los botones con turbo llevan su marca
  useEffect(() => {
    raiz.current?.querySelectorAll<HTMLElement>('[data-boton]').forEach((el) => {
      el.classList.toggle('turbo', (turbo & bit(el.dataset.boton as NombreBoton)) !== 0)
    })
  })

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
      className={`mando ${editando ? 'editando' : ''}`}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSubir}
      onPointerCancel={alSubir}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="mando"
    >
      <div ref={cruceta} className="control cruceta" aria-label="Cruceta" {...pieza('cruceta')}>
        {BRAZOS.map(([b, clase]) => (
          <span key={b} data-boton={b} className={`brazo ${clase}`} />
        ))}
        <span className="centro" />
      </div>

      {jrpg ? (
        <div className="botones-accion jrpg" {...pieza('botones')}>
          {jrpg.extras.map((b) => (
            <span key={b} data-boton={b} className={`control ${b.toLowerCase()}`} role="button" aria-label={b}>
              {b}
            </span>
          ))}
          <span data-boton={jrpg.menu} className="control menu" role="button" aria-label={`Menú del juego (${NOMBRE_BOTON[jrpg.menu]})`}>
            <span className="leyenda">Menú</span>
            <span className="letra">{NOMBRE_BOTON[jrpg.menu]}</span>
          </span>
          <span data-boton="B" className="control b" role="button" aria-label="B">
            B
          </span>
          <span data-boton="A" className="control a" role="button" aria-label="A">
            A
          </span>
          {correr && (
            <span
              data-accion="correr"
              className={`control correr ${correr.activo ? 'activo' : ''}`}
              role="button"
              aria-label={`Correr con ${correr.boton} fijo`}
              aria-pressed={correr.activo}
            >
              <Footprints size={15} strokeWidth={2.2} />
              <span>{correr.activo ? `${correr.boton} fijo` : 'Correr'}</span>
            </span>
          )}
        </div>
      ) : (
      <div className={`botones-accion ${cuatro ? 'cuatro' : ''}`} {...pieza('botones')}>
        {cuatro && (
          <>
            <span data-boton="X" className="control x" role="button" aria-label="X">
              X
            </span>
            <span data-boton="Y" className="control y" role="button" aria-label="Y">
              Y
            </span>
          </>
        )}
        <span data-boton="B" className="control b" role="button" aria-label="B">
          B
        </span>
        <span data-boton="A" className="control a" role="button" aria-label="A">
          A
        </span>
      </div>
      )}

      {hombros && (
        <>
          <span data-boton="L" className="control hombro l" role="button" aria-label="L" {...pieza('l')}>
            L
          </span>
          <span data-boton="R" className="control hombro r" role="button" aria-label="R" {...pieza('r')}>
            R
          </span>
        </>
      )}

      <span data-boton="SELECT" className="control pequeno select" role="button" aria-label="Select" {...pieza('select')}>
        SELECT
      </span>
      <span data-boton="START" className="control pequeno start" role="button" aria-label="Start" {...pieza('start')}>
        START
      </span>
    </div>
  )
}
