/**
 * Piezas comunes de la interfaz: avisos breves abajo, confirmaciones al estilo iOS y hojas que
 * suben desde abajo.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Aviso {
  id: number
  texto: string
}

interface Confirmacion {
  titulo: string
  mensaje?: string
  aceptar: string
  destructivo?: boolean
  resolver: (si: boolean) => void
}

interface ValorInterfaz {
  avisar: (texto: string) => void
  confirmar: (o: Omit<Confirmacion, 'resolver'>) => Promise<boolean>
}

const Contexto = createContext<ValorInterfaz | null>(null)

export function useInterfaz(): ValorInterfaz {
  const v = useContext(Contexto)
  if (!v) throw new Error('useInterfaz fuera de ProveedorInterfaz')
  return v
}

export function ProveedorInterfaz({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const temporizador = useRef(0)

  const avisar = useCallback((texto: string) => {
    clearTimeout(temporizador.current)
    setAviso({ id: Date.now(), texto })
    temporizador.current = window.setTimeout(() => setAviso(null), 3200)
  }, [])

  const confirmar = useCallback(
    (o: Omit<Confirmacion, 'resolver'>) => new Promise<boolean>((resolver) => setConfirmacion({ ...o, resolver })),
    [],
  )

  const responder = (si: boolean) => {
    confirmacion?.resolver(si)
    setConfirmacion(null)
  }

  return (
    <Contexto.Provider value={{ avisar, confirmar }}>
      {children}
      {aviso &&
        createPortal(
          <div
            key={aviso.id}
            role="status"
            className="velo pointer-events-none fixed inset-x-4 z-50 mx-auto max-w-sm rounded-2xl bg-zinc-800/95 px-4 py-3 text-center text-[15px] text-white shadow-lg"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            {aviso.texto}
          </div>,
          document.body,
        )}
      {confirmacion &&
        createPortal(
          <div className="velo fixed inset-0 z-50 grid place-items-center bg-black/40 p-8" role="alertdialog" aria-label={confirmacion.titulo}>
            <div className="w-full max-w-[270px] overflow-hidden rounded-2xl bg-white/95 text-center backdrop-blur dark:bg-zinc-800/95">
              <div className="px-4 pt-5 pb-4">
                <p className="text-[17px] font-semibold">{confirmacion.titulo}</p>
                {confirmacion.mensaje && <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-300">{confirmacion.mensaje}</p>}
              </div>
              <div className="grid grid-cols-2 border-t border-zinc-300 dark:border-zinc-700">
                <button className="py-3 text-[17px] text-acento dark:text-acento-oscuro" onClick={() => responder(false)}>
                  Cancelar
                </button>
                <button
                  className={`border-l border-zinc-300 py-3 text-[17px] font-semibold dark:border-zinc-700 ${confirmacion.destructivo ? 'text-red-600 dark:text-red-500' : 'text-acento dark:text-acento-oscuro'}`}
                  onClick={() => responder(true)}
                >
                  {confirmacion.aceptar}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Contexto.Provider>
  )
}

/** Hoja que sube desde abajo. Se cierra tocando fuera. */
export function Hoja({ abierta, alCerrar, titulo, oscura, children }: { abierta: boolean; alCerrar: () => void; titulo?: string; oscura?: boolean; children: ReactNode }) {
  // Guardia contra el toque que la abre: en iOS el mismo toque puede llegar al velo y cerrarla
  const abiertaDesde = useRef(0)
  useEffect(() => {
    if (abierta) abiertaDesde.current = Date.now()
  }, [abierta])
  if (!abierta) return null
  return createPortal(
    <div
      className="velo fixed inset-0 z-40 flex items-end bg-black/40"
      data-theme={oscura ? 'dark' : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget && Date.now() - abiertaDesde.current > 450) alCerrar()
      }}
    >
      <div
        role="dialog"
        aria-label={titulo}
        className="hoja mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[#F2F2F7] px-4 pt-2 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <div className="mx-auto mb-2 h-1.5 w-9 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {titulo && <p className="mb-3 truncate px-2 text-center text-[15px] font-semibold">{titulo}</p>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Baldosa de color con el nombre corto de la consola. */
export function Baldosa({ color, texto, grande }: { color: string; texto: string; grande?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[10px] font-bold text-white ${grande ? 'size-14 text-sm' : 'size-10 text-[11px]'}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {texto}
    </span>
  )
}

/** Interruptor al estilo iOS. */
export function Interruptor({ activo, alCambiar, etiqueta }: { activo: boolean; alCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => alCambiar(!activo)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${activo ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      <span className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
    </button>
  )
}
