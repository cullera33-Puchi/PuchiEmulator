/**
 * Piezas comunes de la interfaz (guía de usabilidad, apartados 6 y 9): avisos con «Deshacer»,
 * confirmaciones como hoja de acciones y hojas que suben desde abajo y se cierran arrastrando.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { registrar } from '../lib/registro'

interface Aviso {
  id: number
  texto: string
  accion?: Accion
}

/** Botón del aviso: «Deshacer» (4 s) u otro, como «Actualizar» (12 s) */
export interface Accion {
  texto?: string
  fn: () => void
}

interface Confirmacion {
  titulo: string
  mensaje?: string
  aceptar: string
  destructivo?: boolean
  resolver: (si: boolean) => void
}

interface ValorInterfaz {
  avisar: (texto: string, accion?: Accion) => void
  confirmar: (o: Omit<Confirmacion, 'resolver'>) => Promise<boolean>
  /** Quita el aviso que haya en pantalla (v0.46.0) */
  quitarAviso: () => void
}

const Contexto = createContext<ValorInterfaz | null>(null)

export function useInterfaz(): ValorInterfaz {
  const v = useContext(Contexto)
  if (!v) throw new Error('useInterfaz fuera de ProveedorInterfaz')
  return v
}

/** Guardia contra toques fantasma: iOS repite a veces el toque que abre una hoja (guía 6.1). */
const GUARDIA_MS = 450

export function ProveedorInterfaz({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const temporizador = useRef(0)
  const abiertaDesde = useRef(0)

  const avisar = useCallback((texto: string, accion?: Accion) => {
    clearTimeout(temporizador.current)
    setAviso({ id: Date.now(), texto, accion })
    const ms = accion && accion.texto && accion.texto !== 'Deshacer' ? 12000 : 4000
    temporizador.current = window.setTimeout(() => setAviso(null), ms)
  }, [])

  const quitarAviso = useCallback(() => {
    clearTimeout(temporizador.current)
    setAviso(null)
  }, [])

  const confirmar = useCallback(
    (o: Omit<Confirmacion, 'resolver'>) =>
      new Promise<boolean>((resolver) => {
        abiertaDesde.current = Date.now()
        setConfirmacion({ ...o, resolver })
      }),
    [],
  )

  // El mismo objeto siempre (v0.43.2): si no, cada aviso que salía o se iba redibujaba todo el juego
  const valor = useMemo(() => ({ avisar, confirmar, quitarAviso }), [avisar, confirmar, quitarAviso])

  const responder = (si: boolean) => {
    if (Date.now() - abiertaDesde.current < GUARDIA_MS) return
    confirmacion?.resolver(si)
    setConfirmacion(null)
  }

  return (
    <Contexto.Provider value={valor}>
      {children}
      {aviso &&
        createPortal(
          <div
            key={aviso.id}
            role="status"
            className={`aviso velo fixed inset-x-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-zinc-800/90 px-4 py-3 text-[15px] text-white shadow-lg backdrop-blur-xl ${aviso.accion ? 'justify-between' : 'pointer-events-none justify-center text-center'}`}
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            <span>{aviso.texto}</span>
            {aviso.accion && (
              <button
                className="shrink-0 font-semibold text-[#0a84ff]"
                onClick={() => {
                  aviso.accion?.fn()
                  setAviso(null)
                }}
              >
                {aviso.accion.texto ?? 'Deshacer'}
              </button>
            )}
          </div>,
          document.body,
        )}
      {confirmacion &&
        createPortal(
          <div
            className="velo fixed inset-0 z-50 flex items-end bg-black/40 px-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
            role="alertdialog"
            aria-label={confirmacion.titulo}
            onClick={(e) => e.target === e.currentTarget && responder(false)}
          >
            <div className="hoja mx-auto w-full max-w-lg">
              <div className="overflow-hidden rounded-[14px] bg-white/95 text-center backdrop-blur-xl dark:bg-zinc-800/95">
                <div className="px-4 py-3.5">
                  <p className="text-[13px] font-semibold text-zinc-500">{confirmacion.titulo}</p>
                  {confirmacion.mensaje && <p className="mt-1 text-[13px] text-zinc-500">{confirmacion.mensaje}</p>}
                </div>
                <button
                  className={`h-14 w-full border-t border-zinc-200 text-[20px] dark:border-zinc-700 ${confirmacion.destructivo ? 'text-red-600 dark:text-red-500' : 'text-acento dark:text-acento-oscuro'}`}
                  onClick={() => responder(true)}
                >
                  {confirmacion.aceptar}
                </button>
              </div>
              <button className="mt-2 h-14 w-full rounded-[14px] bg-white text-[20px] font-semibold text-acento dark:bg-zinc-800 dark:text-acento-oscuro" onClick={() => responder(false)}>
                Cancelar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </Contexto.Provider>
  )
}

/**
 * Hoja que sube desde abajo. Se cierra tocando el fondo o arrastrando hacia abajo (más de 110 px o
 * con un lanzamiento rápido) desde el asa o desde el contenido cuando está arriba del todo.
 */
export function Hoja({ abierta, alCerrar, titulo, oscura, children }: { abierta: boolean; alCerrar: () => void; titulo?: string; oscura?: boolean; children: ReactNode }) {
  const abiertaDesde = useRef(0)
  const panel = useRef<HTMLDivElement>(null)
  const velo = useRef<HTMLDivElement>(null)
  const alCerrarRef = useRef(alCerrar)
  alCerrarRef.current = alCerrar

  useEffect(() => {
    if (abierta) abiertaDesde.current = Date.now()
  }, [abierta])

  // Arrastre con eventos táctiles nativos: así se puede cancelar el desplazamiento de iOS
  useEffect(() => {
    const el = panel.current
    if (!abierta || !el) return
    let inicioY = 0
    let ultimaY = 0
    let ultimaT = 0
    let velocidad = 0
    let arrastrando = false
    let posible = false
    const mover = (dy: number) => {
      el.style.transform = `translate3d(0, ${Math.max(0, dy)}px, 0)`
      if (velo.current) velo.current.style.opacity = String(Math.max(0.2, 1 - dy / 500))
    }
    const alEmpezar = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const desdeCampo = (e.target as HTMLElement).closest('input, textarea')
      posible = !desdeCampo && el.scrollTop <= 0
      arrastrando = false
      inicioY = ultimaY = t.clientY
      ultimaT = e.timeStamp
      velocidad = 0
    }
    const alMover = (e: TouchEvent) => {
      if (!posible) return
      const y = e.touches[0].clientY
      const dy = y - inicioY
      if (!arrastrando) {
        if (dy > 8 && el.scrollTop <= 0) {
          arrastrando = true
          el.style.transition = 'none'
        } else if (dy < -4) {
          posible = false
          return
        } else return
      }
      e.preventDefault()
      const dt = e.timeStamp - ultimaT
      if (dt > 0) velocidad = 0.6 * ((y - ultimaY) / dt) + 0.4 * velocidad
      ultimaY = y
      ultimaT = e.timeStamp
      mover(dy)
    }
    const alSoltar = (e: TouchEvent) => {
      if (!arrastrando) return
      arrastrando = false
      const dy = ultimaY - inicioY
      // Dedo parado antes de soltar: sin velocidad (guía 4.3)
      const v = e.timeStamp - ultimaT > 80 ? 0 : velocidad
      el.style.transition = ''
      if (dy > 110 || (v > 0.4 && dy > 30)) {
        el.style.transform = 'translate3d(0, 100%, 0)'
        registrar('info', 'Hoja cerrada arrastrando')
        window.setTimeout(() => alCerrarRef.current(), 200)
      } else {
        el.style.transform = ''
        if (velo.current) velo.current.style.opacity = ''
      }
    }
    el.addEventListener('touchstart', alEmpezar, { passive: true })
    el.addEventListener('touchmove', alMover, { passive: false })
    el.addEventListener('touchend', alSoltar)
    el.addEventListener('touchcancel', alSoltar)
    return () => {
      el.removeEventListener('touchstart', alEmpezar)
      el.removeEventListener('touchmove', alMover)
      el.removeEventListener('touchend', alSoltar)
      el.removeEventListener('touchcancel', alSoltar)
    }
  }, [abierta])

  if (!abierta) return null
  return createPortal(
    <div className="hoja-capa fixed inset-0 z-40 flex items-end" data-theme={oscura ? 'dark' : undefined}>
      <div
        ref={velo}
        className="velo absolute inset-0 bg-black/40 transition-opacity"
        onClick={() => {
          if (Date.now() - abiertaDesde.current > GUARDIA_MS) alCerrar()
          else registrar('info', 'Toque en el fondo ignorado (guardia)')
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-label={titulo}
        className="hoja relative mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-[#F2F2F7] px-4 pt-2 text-zinc-900 transition-transform duration-500 dark:bg-zinc-950 dark:text-zinc-100"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', transitionTimingFunction: 'cubic-bezier(.32,.72,0,1)' }}
      >
        <div className="mx-auto mb-2 h-[5px] w-9 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {titulo && <p className="mb-3 truncate px-2 text-center text-[17px] font-semibold">{titulo}</p>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Interruptor al estilo iOS. */
export function Interruptor({ activo, alCambiar, etiqueta, desactivado }: { activo: boolean; alCambiar: (v: boolean) => void; etiqueta: string; desactivado?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={desactivado}
      onClick={() => alCambiar(!activo)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      <span className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
    </button>
  )
}

/** Control segmentado al estilo iOS. */
export function Segmentado<T extends string | number>({ valor, opciones, alCambiar, etiqueta }: { valor: T; opciones: [T, string][]; alCambiar: (v: T) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid rounded-[9px] bg-zinc-200/80 p-0.5 dark:bg-zinc-800" style={{ gridTemplateColumns: `repeat(${opciones.length}, 1fr)` }}>
      {opciones.map(([v, texto]) => (
        <button
          key={String(v)}
          role="radio"
          aria-checked={v === valor}
          onClick={() => alCambiar(v)}
          className={`rounded-[7px] py-1.5 text-[13px] font-medium ${v === valor ? 'bg-white shadow-sm dark:bg-zinc-600' : 'text-zinc-600 dark:text-zinc-300'}`}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}
