/**
 * Biblioteca de una consola: sus juegos en cuadrícula con las carátulas, con búsqueda, orden
 * (recientes, nombre o más jugados) y los favoritos primero (v0.14.0).
 * Es una pantalla apilada sobre el inicio («‹ Consolas» o deslizar desde el borde para volver).
 * Tocar un juego lo abre donde se dejó (si hay estado «auto»); mantenerlo pulsado o tocar «…» abre
 * sus opciones. Quitar un juego o borrar su partida se puede deshacer.
 */
import { Check, ChevronLeft, ChevronRight, Ellipsis, Gamepad2, NotebookPen, Plus, Search, Star, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { useAnadirJuegos } from '../componentes/AnadirJuegos'
import { useVolverDeslizando } from '../componentes/gestos'
import { HojaCaratula } from '../componentes/HojaCaratula'
import { Hoja, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { EditorNotas } from '../componentes/Notas'
import { altavoz } from '../emulador/audio'
import { cambiarAjustes, leerAjustes, useAjustes } from '../lib/ajustes'
import {
  actualizarJuego,
  borrarCaratula,
  borrarProgreso,
  estadosDe,
  guardarCaratula,
  guardarJuego,
  importarProgreso,
  leerCaratula,
  leerEstado,
  leerNota,
  leerPartida,
  leerRomGuardada,
  listarCaratulas,
  listarJuegos,
  listarSesiones,
  quitarJuego,
  type EstadoJuego,
  type Juego,
} from '../lib/almacen'
import { conEstado as estadoNuevo, ESTADOS, estadoDe, NOMBRE_ESTADO, prepararBiblioteca, resumenEstados, type OrdenBiblioteca } from '../lib/biblioteca'
import { duracion, porJuego } from '../lib/estadisticas'
import { cuando, cuandoCorto, plural, tamano } from '../lib/formato'
import { vibrar } from '../lib/vibracion'
import { registrar } from '../lib/registro'
import { CONSOLAS_APP, SISTEMAS, type Consola } from '../lib/sistemas'

interface Props {
  consola: Consola
  alJugar: (juego: Juego, reanudar: boolean) => void
  alVolver: () => void
}

interface Tiempo {
  ms: number
  sesiones: number
}

interface Detalle {
  juego: Juego
  tiempo?: Tiempo
  partida?: number
  estado?: number
  caratula: boolean
  nota?: string
}

/** Pulsación larga de 500 ms; si el dedo se mueve, es desplazamiento y no cuenta. */
function usePulsacionLarga(alMantener: () => void) {
  const temporizador = useRef(0)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const disparada = useRef(false)
  const cancelar = () => {
    clearTimeout(temporizador.current)
    inicio.current = null
  }
  return {
    onPointerDown: (e: EventoPuntero) => {
      disparada.current = false
      inicio.current = { x: e.clientX, y: e.clientY }
      temporizador.current = window.setTimeout(() => {
        disparada.current = true
        vibrar()
        alMantener()
      }, 500)
    },
    onPointerMove: (e: EventoPuntero) => {
      const i = inicio.current
      if (i && (Math.abs(e.clientY - i.y) > 8 || Math.abs(e.clientX - i.x) > 10)) cancelar()
    },
    onPointerUp: cancelar,
    onPointerCancel: cancelar,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    /** true si el toque que acaba fue una pulsación larga (para no abrir el juego) */
    fueLarga: () => disparada.current,
  }
}

function Ficha({ juego, caratula, tiempo, alJugar, alOpciones }: { juego: Juego; caratula?: string; tiempo?: Tiempo; alJugar: () => void; alOpciones: () => void }) {
  const s = SISTEMAS[juego.sistema]
  const larga = usePulsacionLarga(alOpciones)
  const { fueLarga, ...gestos } = larga
  return (
    <div className="min-w-0">
      <button
        {...gestos}
        className="block w-full touch-manipulation text-left transition-transform active:scale-[0.97]"
        aria-label={`${juego.nombre}, ${s.nombre}`}
        onClick={() => {
          if (!fueLarga()) alJugar()
        }}
      >
        <span className="relative block aspect-square overflow-hidden rounded-xl bg-white shadow-sm dark:bg-zinc-900">
          {estadoDe(juego) === 'terminado' && (
            <span className="absolute bottom-1.5 left-1.5 z-[1] flex h-5 items-center gap-0.5 rounded-full bg-black/60 pr-1.5 pl-1 text-[10px] font-semibold text-white" aria-label="Terminado">
              <Check size={12} strokeWidth={3} className="text-green-400" /> Terminado
            </span>
          )}
          {juego.favorito && (
            <span className="absolute top-1.5 right-1.5 z-[1] grid size-6 place-items-center rounded-full bg-black/55 text-amber-300" aria-label="Favorito">
              <Star size={14} fill="currentColor" />
            </span>
          )}
          {caratula ? (
            <img decoding="sync" src={caratula} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <span className="flex h-full w-full flex-col justify-between p-2.5 text-white" style={{ background: `linear-gradient(160deg, ${s.color}, #1c1c1e)` }}>
              <span className="text-[11px] font-bold opacity-80">{s.corto}</span>
              <span className="line-clamp-3 text-[13px] leading-tight font-semibold">{juego.nombre}</span>
            </span>
          )}
        </span>
      </button>
      <div className="mt-1.5 flex items-start gap-0.5">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] leading-tight">{juego.nombre}</p>
          <p className="truncate text-[11px] text-zinc-500">{tiempo?.ms ? `${duracion(tiempo.ms)}${juego.ultimaVez ? `, ${cuandoCorto(juego.ultimaVez)}` : ''}` : juego.ultimaVez ? `Jugado ${cuandoCorto(juego.ultimaVez)}` : 'Sin jugar'}</p>
        </div>
        <button className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center text-zinc-500 active:opacity-50" aria-label={`Opciones de ${juego.nombre}`} onClick={alOpciones}>
          <Ellipsis size={18} />
        </button>
      </div>
    </div>
  )
}

export function Biblioteca({ consola, alJugar, alVolver }: Props) {
  const { avisar } = useInterfaz()
  const [juegos, setJuegos] = useState<Juego[] | null>(null)
  const [conEstado, setConEstado] = useState<Set<string>>(new Set())
  const [caratulas, setCaratulas] = useState<Map<string, string>>(new Map())
  const [tiempos, setTiempos] = useState<Map<string, Tiempo>>(new Map())
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [eligiendoCaratula, setEligiendoCaratula] = useState<Juego | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<EstadoJuego | 'todos'>('todos')
  const [notasDe, setNotasDe] = useState<Juego | null>(null)
  const orden = useAjustes().ordenBiblioteca
  const pantalla = useRef<HTMLDivElement>(null)
  const info = CONSOLAS_APP[consola]
  useVolverDeslizando(pantalla, alVolver)

  const recargar = useCallback(async () => {
    const lista = (await listarJuegos()).filter((j) => info.sistemas.includes(j.sistema))
    const [estados, imagenes, sesiones] = await Promise.all([Promise.all(lista.map((j) => leerEstado(j.id, 'auto'))), listarCaratulas(), listarSesiones()])
    setTiempos(new Map(porJuego(sesiones).map((f) => [f.juegoId, { ms: f.ms, sesiones: f.sesiones }])))
    setConEstado(new Set(lista.filter((_, i) => estados[i]).map((j) => j.id)))
    setCaratulas((antes) => {
      antes.forEach((u) => URL.revokeObjectURL(u))
      return new Map(imagenes.map((c) => [c.id, URL.createObjectURL(new Blob([c.datos], { type: 'image/jpeg' }))]))
    })
    setJuegos(lista)
  }, [info])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const anadir = useAnadirJuegos(recargar, consola)

  const jugar = (j: Juego, reanudar: boolean) => {
    // El sonido de Safari se desbloquea en este mismo toque
    void altavoz.activar(leerAjustes().sonarEnSilencio)
    setDetalle(null)
    alJugar(j, reanudar)
  }

  const abrirDetalle = async (juego: Juego) => {
    const [p, e, c, n] = await Promise.all([leerPartida(juego.id), leerEstado(juego.id, 'auto'), leerCaratula(juego.id), leerNota(juego.id)])
    setDetalle({ juego, partida: p?.fecha, estado: e?.fecha, caratula: !!c, tiempo: tiempos.get(juego.id), nota: n?.texto })
  }

  const cambiarFavorito = async (j: Juego) => {
    const nuevo = { ...j, favorito: !j.favorito }
    await actualizarJuego(nuevo)
    setDetalle((d) => (d ? { ...d, juego: nuevo } : d))
    await recargar()
    avisar(nuevo.favorito ? 'Añadido a favoritos' : 'Quitado de favoritos')
  }

  const cambiarEstado = async (j: Juego, estado: EstadoJuego) => {
    const nuevo = estadoNuevo(j, estado)
    await actualizarJuego(nuevo)
    setDetalle((d) => (d ? { ...d, juego: nuevo } : d))
    registrar('info', 'Estado del juego cambiado', { estado })
    await recargar()
  }

  const recuento = juegos ? resumenEstados(juegos) : null
  const vista = juegos ? prepararBiblioteca(juegos, { texto: busqueda, orden, estado: filtro, tiempos: new Map([...tiempos].map(([id, t]) => [id, t.ms])) }) : null
  const ficha = (j: Juego) => (
    <Ficha key={j.id} juego={j} caratula={caratulas.get(j.id)} tiempo={tiempos.get(j.id)} alJugar={() => jugar(j, conEstado.has(j.id))} alOpciones={() => void abrirDetalle(j)} />
  )

  const renombrar = async (j: Juego) => {
    const nombre = window.prompt('Nombre del juego', j.nombre)?.trim()
    if (!nombre || nombre === j.nombre) return
    await actualizarJuego({ ...j, nombre })
    setDetalle(null)
    await recargar()
    avisar('Nombre cambiado', { fn: () => void actualizarJuego(j).then(recargar) })
  }

  const quitar = async (j: Juego) => {
    const [rom, caratula] = await Promise.all([leerRomGuardada(j.id), leerCaratula(j.id)])
    await quitarJuego(j.id)
    await borrarCaratula(j.id)
    setDetalle(null)
    registrar('info', 'Juego quitado de la biblioteca')
    await recargar()
    avisar('Juego quitado. La partida se conserva', {
      fn: async () => {
        if (rom || j.disco) await guardarJuego(j, rom)
        if (caratula) await guardarCaratula(caratula)
        registrar('info', 'Quitar juego deshecho')
        await recargar()
      },
    })
  }

  const borrarPartida = async (j: Juego) => {
    const [partida, estados] = await Promise.all([leerPartida(j.id), estadosDe(j.id)])
    await borrarProgreso(j.id)
    setDetalle(null)
    registrar('info', 'Partida borrada', { estados: estados.length })
    await recargar()
    avisar('Partida y estados borrados', {
      fn: async () => {
        await importarProgreso(partida ? [partida] : [], estados)
        registrar('info', 'Borrar partida deshecho')
        await recargar()
      },
    })
  }

  return (
    <div ref={pantalla} className="min-h-dvh bg-[#F2F2F7] dark:bg-black">
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="cabecera-fija sticky top-0 z-10 -mx-4 mb-3 grid grid-cols-[1fr_auto_1fr] items-center bg-[#F2F2F7]/85 px-2 backdrop-blur-xl dark:bg-black/85">
        <button className="boton-texto flex items-center justify-self-start" onClick={alVolver}>
          <ChevronLeft size={26} /> Consolas
        </button>
        <h1 className="truncate text-[17px] font-semibold">{info.titulo}</h1>
        <button className="boton-icono justify-self-end" aria-label="Añadir juegos" onClick={anadir.abrir}>
          <Plus size={24} />
        </button>
      </div>
      {anadir.elementos}

      {juegos && juegos.length === 0 && (
        <div className="mt-16 flex flex-col items-center px-6 text-center">
          <Gamepad2 size={56} strokeWidth={1.25} className="text-zinc-400" />
          <p className="mt-4 text-[20px] font-semibold">Aún no hay juegos de {info.nombre}</p>
          <p className="mt-2 text-[15px] text-zinc-500">Elige tus juegos en Archivos ({info.extensiones} o .zip). La app guarda una copia y el fichero original se queda donde está.</p>
          <button className="boton-lleno mt-6" onClick={anadir.abrir}>
            <Plus size={20} /> Añadir juegos
          </button>
        </div>
      )}

      {juegos && juegos.length > 0 && vista && (
        <>
          <div className="mb-4 space-y-2">
            <label className="flex h-9 items-center gap-1.5 rounded-[10px] bg-zinc-200/80 px-2 text-zinc-500 dark:bg-zinc-800">
              <Search size={17} className="shrink-0" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar"
                aria-label="Buscar juegos"
                enterKeyHint="search"
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-black outline-none placeholder:text-zinc-500 dark:text-white [&::-webkit-search-cancel-button]:hidden"
              />
              {busqueda && (
                <button className="grid size-6 place-items-center rounded-full bg-zinc-400 text-white dark:bg-zinc-600" aria-label="Borrar la búsqueda" onClick={() => setBusqueda('')}>
                  <X size={14} strokeWidth={3} />
                </button>
              )}
            </label>
            {juegos.length > 1 && (
              <Segmentado
                etiqueta="Ordenar los juegos"
                valor={orden}
                opciones={[
                  ['reciente', 'Recientes'],
                  ['nombre', 'Nombre'],
                  ['tiempo', 'Más jugados'],
                ]}
                alCambiar={(v: OrdenBiblioteca) => cambiarAjustes({ ordenBiblioteca: v })}
              />
            )}
            {recuento && juegos.length > 1 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Ver los juegos">
                {(['todos', ...ESTADOS] as const)
                  .filter((e) => e === 'todos' || recuento[e] > 0 || filtro === e)
                  .map((e) => (
                    <button
                      key={e}
                      role="radio"
                      aria-checked={filtro === e}
                      onClick={() => setFiltro(e)}
                      className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium ${filtro === e ? 'bg-acento text-white dark:bg-acento-oscuro' : 'bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}
                    >
                      {e === 'todos' ? `Todos ${juegos.length}` : `${NOMBRE_ESTADO[e]} ${recuento[e]}`}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div data-testid="biblioteca">
            {vista.favoritos.length > 0 && (
              <>
                <p className="cabecera-grupo">Favoritos</p>
                <div className="mb-5 grid grid-cols-3 gap-x-3 gap-y-4">{vista.favoritos.map(ficha)}</div>
                {vista.resto.length > 0 && <p className="cabecera-grupo">Todos los juegos</p>}
              </>
            )}
            <div className="grid grid-cols-3 gap-x-3 gap-y-4">{vista.resto.map(ficha)}</div>
          </div>
          {!vista.favoritos.length && !vista.resto.length && (
            <p className="mt-10 text-center text-[15px] text-zinc-500">
              {busqueda ? `Ningún juego coincide con «${busqueda}»` : `No hay juegos en «${filtro === 'todos' ? 'Todos' : NOMBRE_ESTADO[filtro]}»`}
            </p>
          )}
          {!busqueda && <p className="pie-grupo mt-4 text-center">Toca un juego para seguir donde lo dejaste. Mantén pulsado para ver sus opciones.</p>}
        </>
      )}

      <Hoja abierta={!!detalle} alCerrar={() => setDetalle(null)} titulo={detalle?.juego.nombre}>
        {detalle && (
          <>
            <div className="lista">
              <button className="fila" onClick={() => jugar(detalle.juego, !!detalle.estado)}>
                <span className="flex-1 text-acento dark:text-acento-oscuro">{detalle.estado ? 'Seguir donde lo dejé' : 'Jugar'}</span>
                <ChevronRight size={18} className="text-zinc-400" />
              </button>
              {detalle.estado && (
                <>
                  <div className="separador" />
                  <button className="fila" onClick={() => jugar(detalle.juego, false)}>
                    <span className="flex-1 text-acento dark:text-acento-oscuro">Arrancar el juego desde el principio</span>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </button>
                </>
              )}
            </div>
            <p className="pie-grupo">
              {detalle.estado ? `Lo dejaste ${cuando(detalle.estado)}. ` : ''}
              Arrancar desde el principio carga la partida que guardaste dentro del juego.
            </p>

            <div className="lista mt-5">
              <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void cambiarFavorito(detalle.juego)}>
                <Star size={20} fill={detalle.juego.favorito ? 'currentColor' : 'none'} />
                <span className="flex-1">{detalle.juego.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}</span>
              </button>
              <div className="separador" />
              <button
                className="fila"
                onClick={() => {
                  setNotasDe(detalle.juego)
                  setDetalle(null)
                }}
              >
                <NotebookPen size={20} className="text-acento dark:text-acento-oscuro" />
                <span className="min-w-0 flex-1">
                  <span className="block text-acento dark:text-acento-oscuro">Notas</span>
                  {detalle.nota && <span className="block truncate text-[13px] text-zinc-500">{detalle.nota}</span>}
                </span>
                <ChevronRight size={18} className="text-zinc-400" />
              </button>
            </div>

            <p className="cabecera-grupo mt-5">Estado</p>
            <div className="lista" role="radiogroup" aria-label="Estado del juego">
              {ESTADOS.map((e, i) => (
                <div key={e}>
                  {i > 0 && <div className="separador" />}
                  <button className="fila" role="radio" aria-checked={estadoDe(detalle.juego) === e} onClick={() => void cambiarEstado(detalle.juego, e)}>
                    <span className="flex-1">{NOMBRE_ESTADO[e]}</span>
                    {e === 'terminado' && detalle.juego.terminado && estadoDe(detalle.juego) === 'terminado' && (
                      <span className="text-[15px] text-zinc-500">{cuando(detalle.juego.terminado)}</span>
                    )}
                    {estadoDe(detalle.juego) === e && <Check size={20} className="text-acento dark:text-acento-oscuro" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="lista mt-5">
              <button
                className="fila text-acento dark:text-acento-oscuro"
                onClick={() => {
                  setEligiendoCaratula(detalle.juego)
                  setDetalle(null)
                }}
              >
                <span className="flex-1">{detalle.caratula ? 'Cambiar la carátula' : 'Poner carátula'}</span>
                <ChevronRight size={18} className="text-zinc-400" />
              </button>
              <div className="separador" />
              <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void renombrar(detalle.juego)}>
                Cambiar el nombre
              </button>
            </div>

            <p className="cabecera-grupo mt-5">Información</p>
            <div className="lista">
              <Dato titulo="Consola" valor={SISTEMAS[detalle.juego.sistema].nombre} />
              <div className="separador" />
              <Dato titulo="Fichero" valor={detalle.juego.nombreFichero} />
              <div className="separador" />
              <Dato titulo="Tamaño" valor={tamano(detalle.juego.tam)} />
              <div className="separador" />
              <Dato titulo="Partida guardada" valor={detalle.partida ? cuando(detalle.partida) : 'Ninguna'} />
              <div className="separador" />
              <Dato titulo="Tiempo jugado" valor={detalle.tiempo?.ms ? `${duracion(detalle.tiempo.ms)} en ${plural(detalle.tiempo.sesiones, 'partida', 'partidas')}` : 'Aún nada'} />
            </div>

            <div className="lista mt-5">
              <button className="fila text-red-600 dark:text-red-500" onClick={() => void quitar(detalle.juego)}>
                Quitar de la biblioteca
              </button>
              {(detalle.partida || detalle.estado) && (
                <>
                  <div className="separador" />
                  <button className="fila text-red-600 dark:text-red-500" onClick={() => void borrarPartida(detalle.juego)}>
                    Borrar la partida y los estados
                  </button>
                </>
              )}
            </div>
            <p className="pie-grupo">Al quitar un juego, su partida se conserva: si lo vuelves a añadir, la encuentra. Las dos acciones se pueden deshacer durante unos segundos.</p>
          </>
        )}
      </Hoja>

      <Hoja abierta={!!notasDe} alCerrar={() => setNotasDe(null)} titulo={notasDe ? `Notas de ${notasDe.nombre}` : undefined}>
        {notasDe && <EditorNotas juegoId={notasDe.id} />}
      </Hoja>

      <HojaCaratula juego={eligiendoCaratula} alCerrar={() => setEligiendoCaratula(null)} alCambiar={() => void recargar()} />
    </div>
    </div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="fila justify-between">
      <span>{titulo}</span>
      <span className="min-w-0 truncate pl-4 text-right text-zinc-500">{valor}</span>
    </div>
  )
}
