/**
 * Pantalla de inicio: «Seguir jugando» en una fila deslizable y las consolas en dos columnas, de la
 * más jugada a la menos, con su dibujo o una foto del usuario y cuántos juegos tienen; las que no
 * tienen juegos, juntas al final (v0.26.0). Tocar una consola abre su biblioteca.
 */
import { BarChart3, ChevronRight, Ellipsis, Play, Plus, Search, Settings, ShieldCheck, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useAnadirJuegos } from '../componentes/AnadirJuegos'
import { DibujoConsola } from '../componentes/Consolas'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { altavoz } from '../emulador/audio'
import { leerAjustes, useAjustes } from '../lib/ajustes'
import { borrarCaratula, contarPartidas, guardarCaratula, leerCaratula, leerEstado, listarCaratulas, listarJuegos, listarSesiones, type Juego } from '../lib/almacen'
import { duracion, type SesionJuego } from '../lib/estadisticas'
import { reducirImagen } from '../lib/caratulas'
import { ordenarConsolas, prepararBiblioteca, seguirJugando } from '../lib/biblioteca'
import { aplazarCopia, diasSinCopia, exportarCopia, necesitaCopia } from '../lib/copias'
import { APP_VERSION } from '../lib/version'
import { buscarCaratulasPendientes } from '../lib/caratulasAuto'
import { cuando, plural } from '../lib/formato'
import { registrar } from '../lib/registro'
import { CONSOLAS_APP, SISTEMAS, type Consola, type NombreNucleo } from '../lib/sistemas'
import { prepararNucleo } from '../emulador/nucleo'

interface Props {
  /** Falso mientras está debajo de otra pantalla (v0.26.1): al volver a ser la de arriba, se recarga */
  activa?: boolean
  alEstadisticas: () => void
  alAbrirConsola: (c: Consola) => void
  alJugar: (juego: Juego, reanudar: boolean) => void
  alAjustes: () => void
}

/** Solo una vez por apertura de la app */
let nucleosPreparados = false

export const claveFotoConsola = (c: Consola) => `consola-${c}`

export function Inicio({ activa = true, alEstadisticas, alAbrirConsola, alJugar, alAjustes }: Props) {
  const { avisar } = useInterfaz()
  const [juegos, setJuegos] = useState<Juego[] | null>(null)
  // «Seguir jugando»: el último en grande y hasta cuatro más (v0.15.0)
  const [recientes, setRecientes] = useState<{ juego: Juego; caratula?: string; reanudar: boolean }[]>([])
  const ultimo = recientes[0] ?? null
  const [fotos, setFotos] = useState<Map<string, string>>(new Map())
  const [opciones, setOpciones] = useState<Consola | null>(null)
  const [sesiones, setSesiones] = useState<SesionJuego[]>([])
  const [partidas, setPartidas] = useState(0)
  const ajustes = useAjustes()
  const selectorFoto = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    const [lista, imagenes, ses, nPartidas] = await Promise.all([listarJuegos(), listarCaratulas(), listarSesiones(), contarPartidas()])
    setSesiones(ses)
    setPartidas(nPartidas)
    const urls = new Map(imagenes.map((c) => [c.id, URL.createObjectURL(new Blob([c.datos], { type: 'image/jpeg' }))]))
    setFotos((antes) => {
      antes.forEach((u) => URL.revokeObjectURL(u))
      return urls
    })
    setJuegos(lista)
    const ultimos = seguirJugando(lista)
    const autos = await Promise.all(ultimos.map((j) => leerEstado(j.id, 'auto')))
    setRecientes(ultimos.map((j, i) => ({ juego: j, caratula: urls.get(j.id), reanudar: !!autos[i] })))
  }, [])

  useEffect(() => {
    void recargar()
    // Las que quedaron pendientes (por ejemplo, sin conexión al añadir)
    if (leerAjustes().caratulasAuto && navigator.onLine !== false) {
      void buscarCaratulasPendientes().then((r) => {
        if (r.puestas) void recargar()
      })
    }
  }, [recargar])

  // Se queda montada debajo de las pantallas apiladas: al volver, los recuentos y recientes se ponen al día
  const primeraVez = useRef(true)
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false
      return
    }
    if (activa) void recargar()
  }, [activa, recargar])

  // Buscador de juegos de todas las consolas (v0.29.0)
  const [buscando, setBuscando] = useState(false)
  const [texto, setTexto] = useState('')
  const campoBusqueda = useRef<HTMLInputElement>(null)
  const textoDiferido = useDeferredValue(texto)
  const resultados = useMemo(() => {
    if (!buscando || !juegos || !textoDiferido.trim()) return []
    const { favoritos, resto } = prepararBiblioteca(juegos, { texto: textoDiferido, orden: 'reciente' })
    return [...favoritos, ...resto]
  }, [buscando, juegos, textoDiferido])

  const empezarBusqueda = () => {
    setBuscando(true)
    // En el mismo toque: así el iPhone saca el teclado
    campoBusqueda.current?.focus({ preventScroll: true })
  }

  const terminarBusqueda = () => {
    campoBusqueda.current?.blur()
    setBuscando(false)
    setTexto('')
  }

  const anadir = useAnadirJuegos(recargar)

  const tiempoDe = (id: string) => sesiones.filter((x) => x.juegoId === id).reduce((a, x) => a + x.ms, 0)

  const orden = useMemo(() => ordenarConsolas(juegos ?? [], sesiones), [juegos, sesiones])

  // Al abrir la app (una vez), se deja compilado el núcleo del último juego y el de la consola que
  // más se juega (v0.28.0): abrirlos después cuesta menos. Con un respiro, para no frenar el arranque
  useEffect(() => {
    if (nucleosPreparados || !juegos?.length) return
    const nucleos = new Set<NombreNucleo>()
    if (ultimo) nucleos.add(SISTEMAS[ultimo.juego.sistema].nucleo)
    const masJugada = orden.conJuegos[0]
    if (masJugada) nucleos.add(SISTEMAS[CONSOLAS_APP[masJugada].sistemas[0]].nucleo)
    const t = window.setTimeout(() => {
      nucleosPreparados = true
      for (const n of nucleos) {
        const t0 = performance.now()
        prepararNucleo(n).then(
          () => registrar('info', 'Núcleo preparado', { nucleo: n, ms: Math.round(performance.now() - t0) }),
          (e) => registrar('aviso', 'No se pudo preparar el núcleo', { nucleo: n, error: (e as Error)?.message }),
        )
      }
    }, 1200)
    return () => window.clearTimeout(t)
  }, [juegos, ultimo, orden])

  const cuantos = (c: Consola) => juegos?.filter((j) => CONSOLAS_APP[c].sistemas.includes(j.sistema)).length ?? 0

  const ponerFoto = async (f: File | undefined) => {
    if (selectorFoto.current) selectorFoto.current.value = ''
    const s = opciones
    if (!f || !s) return
    setOpciones(null)
    try {
      const anterior = await leerCaratula(claveFotoConsola(s))
      await guardarCaratula({ id: claveFotoConsola(s), datos: await reducirImagen(f, 600), origen: 'propia', fecha: Date.now() })
      registrar('info', 'Foto de consola puesta', { sistema: s })
      await recargar()
      avisar('Foto puesta', { fn: () => void (anterior ? guardarCaratula(anterior) : borrarCaratula(claveFotoConsola(s))).then(recargar) })
    } catch {
      avisar('No se ha podido abrir la imagen')
    }
  }

  const quitarFoto = async (s: Consola) => {
    setOpciones(null)
    const anterior = await leerCaratula(claveFotoConsola(s))
    await borrarCaratula(claveFotoConsola(s))
    await recargar()
    if (anterior) avisar('Vuelve el dibujo', { fn: () => void guardarCaratula(anterior).then(recargar) })
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="cabecera-fija sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between bg-[#F2F2F7]/85 px-4 backdrop-blur-xl dark:bg-black/85">
        <h1 className="text-[22px] font-bold">Consolas</h1>
        <div className="-mr-2 flex items-center">
          {sesiones.length > 0 && (
            <button className="boton-icono" aria-label="Estadísticas" onClick={alEstadisticas}>
              <BarChart3 size={22} />
            </button>
          )}
          {!!juegos?.length && (
            <button className="boton-icono" aria-label="Buscar juegos" onClick={empezarBusqueda}>
              <Search size={22} />
            </button>
          )}
          <button className="boton-icono" aria-label="Añadir juegos" onClick={anadir.abrir}>
            <Plus size={24} />
          </button>
          <button className="boton-icono" aria-label="Ajustes" onClick={alAjustes}>
            <Settings size={22} />
          </button>
        </div>
      </div>
      {anadir.elementos}

      {/* Buscador (v0.29.0): el campo está siempre en la página, plegado, para poder enfocarlo en
          el mismo toque del icono (si no, el iPhone no saca el teclado) */}
      {!!juegos?.length && (
        <div className={`flex items-center gap-2 overflow-hidden transition-[height,margin] duration-200 ${buscando ? 'mb-4 h-9' : 'h-0'}`} aria-hidden={!buscando}>
          <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-zinc-200/80 px-2 text-zinc-500 dark:bg-zinc-800">
            <Search size={17} className="shrink-0" />
            <input
              ref={campoBusqueda}
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder="Buscar en todas las consolas"
              aria-label="Buscar en todas las consolas"
              enterKeyHint="search"
              tabIndex={buscando ? 0 : -1}
              className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-black outline-none placeholder:text-zinc-500 dark:text-white [&::-webkit-search-cancel-button]:hidden"
            />
            {texto && (
              <button className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-400 text-white dark:bg-zinc-600" aria-label="Borrar la búsqueda" onClick={() => setTexto('')}>
                <X size={14} strokeWidth={3} />
              </button>
            )}
          </label>
          <button className="boton-texto shrink-0" tabIndex={buscando ? 0 : -1} onClick={terminarBusqueda}>
            Cancelar
          </button>
        </div>
      )}

      {buscando && (
        <div data-testid="resultados">
          {!texto.trim() ? (
            <p className="pie-grupo mt-2 text-center">Escribe el nombre de un juego de cualquier consola.</p>
          ) : resultados.length === 0 ? (
            <p className="pie-grupo mt-2 text-center">No hay ningún juego que se llame así.</p>
          ) : (
            <>
              <p className="cabecera-grupo">{plural(resultados.length, 'juego', 'juegos')}</p>
              <div className="lista">
                {resultados.map((j, i) => (
                  <div key={j.id}>
                    {i > 0 && <div className="separador ml-[68px]" />}
                    <button
                      className="fila gap-3 py-2 active:opacity-70"
                      aria-label={`${j.nombre}, ${SISTEMAS[j.sistema].nombre}: jugar`}
                      onClick={() => {
                        void altavoz.activar(leerAjustes().sonarEnSilencio)
                        void leerEstado(j.id, 'auto').then((e) => alJugar(j, !!e))
                      }}
                    >
                      <span className="size-11 shrink-0 overflow-hidden rounded-lg" style={{ background: SISTEMAS[j.sistema].color }}>
                        {fotos.get(j.id) && <img src={fotos.get(j.id)} alt="" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{j.nombre}</span>
                        <span className="block truncate text-[13px] text-zinc-500">
                          {SISTEMAS[j.sistema].nombre}
                          {j.ultimaVez ? `, ${cuando(j.ultimaVez)}` : ''}
                        </span>
                      </span>
                      <Play size={18} className="shrink-0 text-acento dark:text-acento-oscuro" fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!buscando && (
        <>

      {necesitaCopia(partidas > 0, ajustes.ultimaCopia, ajustes.copiaAplazada) && (
        <AvisoCopia
          dias={diasSinCopia(ajustes.ultimaCopia)}
          partidas={partidas}
          alGuardar={async () => {
            try {
              const r = await exportarCopia(false, APP_VERSION)
              if (r.resultado !== 'cancelado' && r.resultado !== 'vacia') avisar(`Copia lista: ${plural(r.partidas, 'partida', 'partidas')}`)
            } catch (e) {
              registrar('error', 'No se pudo exportar la copia', (e as Error).message)
              avisar('No se ha podido crear la copia')
            }
          }}
        />
      )}

      {ultimo && (
        <>
          <p className="cabecera-grupo">Seguir jugando</p>
          {/* Fila deslizable (v0.26.0): el último juego más grande, con su botón de jugar */}
          <div className="sin-barra -mx-4 mb-5 flex items-start snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1" data-testid="seguir-jugando">
            <button
              className="w-[150px] shrink-0 snap-start text-left active:opacity-70"
              aria-label={`Seguir jugando a ${ultimo.juego.nombre}`}
              onClick={() => {
                void altavoz.activar(leerAjustes().sonarEnSilencio)
                alJugar(ultimo.juego, ultimo.reanudar)
              }}
            >
              <span className="relative block size-[150px] overflow-hidden rounded-2xl shadow-sm" style={{ background: SISTEMAS[ultimo.juego.sistema].color }}>
                {ultimo.caratula ? (
                  <img src={ultimo.caratula} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-end p-2.5 pr-12 text-[14px] leading-tight font-semibold text-white">{ultimo.juego.nombre}</span>
                )}
                <span className="absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-acento text-white shadow-md dark:bg-acento-oscuro">
                  <Play size={17} fill="currentColor" />
                </span>
              </span>
              <span className="mt-1.5 block truncate text-[14px] font-semibold">{ultimo.juego.nombre}</span>
              <span className="block truncate text-[12px] text-zinc-500">{SISTEMAS[ultimo.juego.sistema].nombre}</span>
              <span className="block truncate text-[12px] text-zinc-500">
                {cuando(ultimo.juego.ultimaVez ?? 0)}
                {tiempoDe(ultimo.juego.id) > 0 && `, ${duracion(tiempoDe(ultimo.juego.id))}`}
              </span>
            </button>
            {recientes.length > 1 && (
              <div className="flex shrink-0 gap-3" data-testid="otros-recientes">
                {recientes.slice(1).map((r) => (
                  <button
                    key={r.juego.id}
                    className="w-24 shrink-0 snap-start text-left active:opacity-70"
                    aria-label={`${r.juego.nombre}, ${SISTEMAS[r.juego.sistema].nombre}: seguir`}
                    onClick={() => {
                      void altavoz.activar(leerAjustes().sonarEnSilencio)
                      alJugar(r.juego, r.reanudar)
                    }}
                  >
                    <span className="block size-24 overflow-hidden rounded-xl shadow-sm" style={{ background: SISTEMAS[r.juego.sistema].color }}>
                      {r.caratula ? (
                        <img src={r.caratula} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-end p-1.5 text-[11px] leading-tight font-semibold text-white">{r.juego.nombre}</span>
                      )}
                    </span>
                    <span className="mt-1.5 block truncate text-[12px] text-zinc-600 dark:text-zinc-400">{r.juego.nombre}</span>
                    <span className="block truncate text-[12px] text-zinc-500">{cuando(r.juego.ultimaVez ?? 0)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Consolas en dos columnas (v0.26.0): las que tienen juegos, de la más jugada a la menos, y
          las vacías juntas al final. Sin ningún juego, todas como tarjeta. */}
      {juegos && <p className="cabecera-grupo">{orden.conJuegos.length ? 'Tus consolas' : 'Consolas'}</p>}
      <div className="grid grid-cols-2 gap-3" data-testid="consolas">
        {(orden.conJuegos.length ? orden.conJuegos : orden.sinJuegos).map((s) => {
          const info = CONSOLAS_APP[s]
          const n = cuantos(s)
          const foto = fotos.get(claveFotoConsola(s))
          return (
            <div key={s} className="relative">
              <button
                className="relative flex h-full min-h-[142px] w-full flex-col overflow-hidden rounded-2xl bg-white p-3 text-left shadow-sm transition-transform active:scale-[0.97] dark:bg-zinc-900"
                aria-label={`${info.nombre}, ${n ? plural(n, 'juego', 'juegos') : 'sin juegos'}`}
                onClick={() => alAbrirConsola(s)}
              >
                <span className="absolute inset-0 opacity-15" style={{ background: `linear-gradient(160deg, transparent 40%, ${info.color})` }} />
                <span className="relative z-[1] flex h-[78px] items-center justify-center px-5 [&_svg]:max-w-full">
                  {foto ? <img src={foto} alt="" className="h-full w-full rounded-xl object-cover" /> : <DibujoConsola consola={s} />}
                </span>
                <span className="relative z-[1] mt-2 block text-[15px] leading-tight font-semibold">{info.titulo}</span>
                <span className="relative z-[1] block text-[13px] text-zinc-500">{n ? plural(n, 'juego', 'juegos') : 'Sin juegos'}</span>
              </button>
              <button className="absolute top-1.5 right-1.5 z-[2] grid size-8 place-items-center rounded-full text-zinc-500 active:opacity-50 dark:text-zinc-400" aria-label={`Opciones de ${info.nombre}`} onClick={() => setOpciones(s)}>
                <Ellipsis size={18} />
              </button>
            </div>
          )
        })}
        {orden.conJuegos.length > 0 && orden.sinJuegos.length > 0 && (
          <div className={`lista flex flex-col justify-center py-1 ${orden.conJuegos.length % 2 === 0 ? 'col-span-2' : ''}`} data-testid="sin-juegos">
            <p className="px-3 pt-2 pb-1 text-[13px] text-zinc-500">Sin juegos</p>
            {orden.sinJuegos.map((s) => (
              <button key={s} className="flex items-center gap-1 px-3 py-1.5 text-left text-[15px] leading-tight active:opacity-50" aria-label={`${CONSOLAS_APP[s].nombre}, sin juegos`} onClick={() => alAbrirConsola(s)}>
                <span className="min-w-0 flex-1">{CONSOLAS_APP[s].titulo}</span>
                <ChevronRight size={16} className="shrink-0 text-zinc-400" />
              </button>
            ))}
          </div>
        )}
      </div>
      {juegos && juegos.length === 0 && <p className="pie-grupo mt-3 text-center">Añade tus juegos con «+». Cada uno va solo a su consola.</p>}
        </>
      )}

      <Hoja abierta={!!opciones} alCerrar={() => setOpciones(null)} titulo={opciones ? CONSOLAS_APP[opciones].nombre : undefined}>
        {opciones && (
          <>
            <div className="lista">
              <button className="fila text-acento dark:text-acento-oscuro" onClick={() => selectorFoto.current?.click()}>
                {fotos.has(claveFotoConsola(opciones)) ? 'Cambiar la foto' : 'Poner una foto'}
              </button>
              {fotos.has(claveFotoConsola(opciones)) && (
                <>
                  <div className="separador" />
                  <button className="fila text-red-600 dark:text-red-500" onClick={() => void quitarFoto(opciones)}>
                    Volver al dibujo
                  </button>
                </>
              )}
            </div>
            <p className="pie-grupo">Por ejemplo, una foto de tu consola. Se guarda solo en este iPhone.</p>
          </>
        )}
      </Hoja>
      <input ref={selectorFoto} type="file" accept="image/*" className="hidden" data-testid="selector-foto-consola" onChange={(e) => void ponerFoto(e.target.files?.[0])} />
    </div>
  )
}

/**
 * Recordatorio de la copia de partidas (v0.14.0): si se borran los datos de la app o se cambia de
 * iPhone, lo único que queda es la copia guardada en Archivos.
 */
function AvisoCopia({ dias, partidas, alGuardar }: { dias: number | null; partidas: number; alGuardar: () => Promise<void> }) {
  return (
    <div className="lista mb-6 p-4" data-testid="aviso-copia">
      <div className="flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-acento/15 text-acento dark:bg-acento-oscuro/20 dark:text-acento-oscuro">
          <ShieldCheck size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Guarda una copia de tus partidas</p>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            {dias === null ? 'Aún no has guardado ninguna fuera del iPhone.' : `La última es de hace ${plural(dias, 'día', 'días')}.`} Si se borran los datos de la app o
            cambias de iPhone, la copia en Archivos es lo que te queda ({plural(partidas, 'partida', 'partidas')}).
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="boton-texto px-3 py-1.5" onClick={() => aplazarCopia()}>
          Más tarde
        </button>
        <button className="boton-lleno px-4 py-1.5" onClick={() => void alGuardar()}>
          Guardar copia
        </button>
      </div>
    </div>
  )
}
