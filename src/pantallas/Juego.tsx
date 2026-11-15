/**
 * Pantalla de juego a pantalla completa, en vertical u horizontal (la distribución la decide el CSS
 * según la orientación). El menú pausa el juego; al pasar la app a segundo plano también se pausa y
 * se guarda todo.
 */
import { Menu, Play, RotateCcw, Save, Upload, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mando } from '../componentes/Mando'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { bit, TECLAS } from '../emulador/botones'
import { Sesion } from '../emulador/sesion'
import { cambiarAjustes, useAjustes } from '../lib/ajustes'
import { actualizarJuego, estadosDe, leerJuego, leerRomGuardada, type Estado, type Ranura } from '../lib/almacen'
import { cuando } from '../lib/formato'
import { SISTEMAS } from '../lib/sistemas'

interface Props {
  id: string
  reanudar: boolean
  alSalir: () => void
}

const RANURAS: Ranura[] = ['1', '2', '3']

export function Juego({ id, reanudar, alSalir }: Props) {
  const ajustes = useAjustes()
  const { avisar, confirmar } = useInterfaz()
  const lienzo = useRef<HTMLCanvasElement>(null)
  const sesion = useRef<Sesion | null>(null)
  const [nombre, setNombre] = useState('')
  const [hombros, setHombros] = useState(false)
  const [proporcion, setProporcion] = useState(2 / 3)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [menu, setMenu] = useState(false)
  const [pausaFondo, setPausaFondo] = useState(false)
  const [estados, setEstados] = useState<Estado[] | null>(null)
  const [verEstados, setVerEstados] = useState(false)
  const ajustesRef = useRef(ajustes)
  ajustesRef.current = ajustes

  const seguir = useCallback(() => {
    setMenu(false)
    setPausaFondo(false)
    setVerEstados(false)
    void sesion.current?.jugar(ajustesRef.current.sonido, ajustesRef.current.sonarEnSilencio)
  }, [])

  // Arranque
  useEffect(() => {
    let cancelado = false
    let creada: Sesion | null = null
    ;(async () => {
      try {
        const [juego, rom] = await Promise.all([leerJuego(id), leerRomGuardada(id)])
        if (!juego || !rom) throw new Error('El juego ya no está en la biblioteca.')
        if (cancelado) return
        setNombre(juego.nombre)
        setHombros(SISTEMAS[juego.sistema].hombros)
        creada = await Sesion.iniciar({
          juego,
          rom,
          lienzo: lienzo.current!,
          reanudar,
          alCambiarTamano: (ancho, alto) => setProporcion(alto / ancho),
        })
        if (cancelado) {
          void creada.cerrar()
          return
        }
        sesion.current = creada
        void actualizarJuego({ ...juego, ultimaVez: Date.now() })
        setCargando(false)
        await creada.jugar(ajustesRef.current.sonido, ajustesRef.current.sonarEnSilencio)
      } catch (e) {
        console.error(e)
        if (!cancelado) setError((e as Error).message || 'No se ha podido abrir el juego.')
      }
    })()
    return () => {
      cancelado = true
      sesion.current = null
      void creada?.cerrar()
    }
  }, [id, reanudar])

  // Segundo plano: pausa y guardado
  useEffect(() => {
    const alOcultar = () => {
      const s = sesion.current
      if (!s) return
      if (document.visibilityState === 'hidden') {
        if (s.enMarcha) setPausaFondo(true)
        s.pausar()
        void s.guardarTodo()
      }
    }
    const alSalirPagina = () => void sesion.current?.guardarTodo()
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', alSalirPagina)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', alSalirPagina)
    }
  }, [])

  // Teclado
  useEffect(() => {
    let m = 0
    const tecla = (abajo: boolean) => (e: KeyboardEvent) => {
      const b = TECLAS[e.code]
      if (!b) return
      e.preventDefault()
      m = abajo ? m | bit(b) : m & ~bit(b)
      sesion.current?.ponerBotonesTeclado(m)
    }
    const bajar = tecla(true)
    const subir = tecla(false)
    window.addEventListener('keydown', bajar)
    window.addEventListener('keyup', subir)
    return () => {
      window.removeEventListener('keydown', bajar)
      window.removeEventListener('keyup', subir)
    }
  }, [])

  const abrirMenu = () => {
    sesion.current?.pausar()
    void sesion.current?.guardarPartidaSiCambia()
    setMenu(true)
  }

  const cargarListaEstados = async () => setEstados(await estadosDe(id))

  const abrirEstados = () => {
    setVerEstados(true)
    void cargarListaEstados()
  }

  const guardarEn = async (r: Ranura) => {
    const ok = await sesion.current?.guardarEstado(r)
    avisar(ok ? `Estado guardado en la ranura ${r}` : 'No se ha podido guardar el estado')
    await cargarListaEstados()
  }

  const cargarDe = async (r: Ranura) => {
    const ok = await sesion.current?.cargarEstado(r)
    if (ok) {
      avisar(`Estado de la ranura ${r} cargado`)
      seguir()
    } else avisar('No se ha podido cargar el estado')
  }

  const reiniciar = async () => {
    if (!(await confirmar({ titulo: '¿Reiniciar el juego?', mensaje: 'Se pierde lo que no hayas guardado dentro del juego.', aceptar: 'Reiniciar', destructivo: true }))) return
    sesion.current?.reiniciar()
    seguir()
  }

  const salir = async () => {
    setMenu(false)
    await sesion.current?.cerrar()
    sesion.current = null
    alSalir()
  }

  const estadoDe = (r: Ranura) => estados?.find((e) => e.ranura === r)

  return (
    <div
      className={`juego ${ajustes.nitido ? '' : 'suave'}`}
      style={{ '--proporcion': proporcion, '--opacidad-horizontal': ajustes.opacidadMando } as React.CSSProperties}
      data-testid="juego"
    >
      <div className="zona-pantalla">
        <canvas ref={lienzo} width={240} height={160} aria-label="Pantalla del juego" data-testid="pantalla" />
      </div>

      <Mando hombros={hombros} alCambiar={(m) => sesion.current?.ponerBotonesTactil(m)} alToque={() => {
        // Safari solo deja sonar después de un toque: se reintenta en cada uno hasta que suena
        if (!sesion.current?.altavoz.activo) void sesion.current?.altavoz.activar(ajustesRef.current.sonarEnSilencio)
      }} />

      <button className="boton-menu" aria-label="Menú" onClick={abrirMenu}>
        <Menu size={22} />
      </button>

      {(cargando || error) && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/80 p-8 text-center">
          {error ? (
            <div>
              <p className="text-[17px] font-semibold">No se ha podido abrir el juego</p>
              <p className="mt-2 text-[15px] text-zinc-400">{error}</p>
              <button className="boton-lleno mt-6" onClick={alSalir}>
                Volver a la biblioteca
              </button>
            </div>
          ) : (
            <p className="text-[15px] text-zinc-400">Cargando…</p>
          )}
        </div>
      )}

      {pausaFondo && !menu && (
        <button className="absolute inset-0 z-10 grid place-items-center bg-black/70" onClick={seguir} aria-label="Seguir jugando">
          <span className="flex flex-col items-center gap-3">
            <span className="grid size-16 place-items-center rounded-full bg-white/15">
              <Play size={30} />
            </span>
            <span className="text-[17px] font-semibold">En pausa</span>
            <span className="text-[13px] text-zinc-400">Toca para seguir</span>
          </span>
        </button>
      )}

      <Hoja oscura abierta={menu && !verEstados} alCerrar={seguir} titulo={nombre}>
        <div className="lista">
          <button className="fila font-semibold text-acento dark:text-acento-oscuro" onClick={seguir}>
            <Play size={20} /> Seguir jugando
          </button>
          <div className="separador" />
          <button className="fila" onClick={abrirEstados}>
            <Save size={20} className="text-acento dark:text-acento-oscuro" /> Estados guardados
          </button>
          <div className="separador" />
          <button className="fila" onClick={() => cambiarAjustes({ sonido: !ajustes.sonido })}>
            {ajustes.sonido ? <Volume2 size={20} className="text-acento dark:text-acento-oscuro" /> : <VolumeX size={20} className="text-zinc-400" />}
            <span className="flex-1">Sonido</span>
            <span className="text-zinc-500">{ajustes.sonido ? 'Activado' : 'Desactivado'}</span>
          </button>
          <div className="separador" />
          <button className="fila" onClick={reiniciar}>
            <RotateCcw size={20} className="text-acento dark:text-acento-oscuro" /> Reiniciar
          </button>
        </div>
        <p className="pie-grupo">La partida que guardas dentro del juego se guarda sola en el iPhone.</p>
        <div className="lista mt-4">
          <button className="fila text-red-600 dark:text-red-500" onClick={salir}>
            <X size={20} /> Salir a la biblioteca
          </button>
        </div>
      </Hoja>

      <Hoja oscura abierta={menu && verEstados} alCerrar={() => setVerEstados(false)} titulo="Estados guardados">
        <p className="pie-grupo mb-2">Un estado guarda el momento exacto del juego. Hay tres ranuras por juego; al salir se guarda otro aparte para seguir donde lo dejaste.</p>
        <div className="lista">
          {RANURAS.map((r, i) => {
            const e = estadoDe(r)
            return (
              <div key={r}>
                {i > 0 && <div className="separador" />}
                <div className="fila">
                  <Captura estado={e} />
                  <div className="min-w-0 flex-1">
                    <p>Ranura {r}</p>
                    <p className="text-[13px] text-zinc-500">{e ? cuando(e.fecha) : 'Vacía'}</p>
                  </div>
                  <button className="boton-icono" aria-label={`Guardar en la ranura ${r}`} onClick={() => void guardarEn(r)}>
                    <Save size={20} />
                  </button>
                  <button className="boton-icono" aria-label={`Cargar la ranura ${r}`} disabled={!e} onClick={() => void cargarDe(r)}>
                    <Upload size={20} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <button className="boton-texto mt-4 w-full py-2" onClick={() => setVerEstados(false)}>
          Volver al menú
        </button>
      </Hoja>
    </div>
  )
}

function Captura({ estado }: { estado?: Estado }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!estado?.captura) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(new Blob([estado.captura], { type: 'image/png' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [estado])
  return (
    <span className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
      {url && <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />}
    </span>
  )
}
