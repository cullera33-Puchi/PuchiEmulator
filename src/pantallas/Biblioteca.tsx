/**
 * Biblioteca de una consola: sus juegos en cuadrícula con las carátulas y el último jugado primero.
 * Es una pantalla apilada sobre el inicio («‹ Consolas» o deslizar desde el borde para volver).
 * Tocar un juego lo abre donde se dejó (si hay estado «auto»); mantenerlo pulsado o tocar «…» abre
 * sus opciones. Quitar un juego o borrar su partida se puede deshacer.
 */
import { ChevronLeft, ChevronRight, Ellipsis, Gamepad2, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { useAnadirJuegos } from '../componentes/AnadirJuegos'
import { useVolverDeslizando } from '../componentes/gestos'
import { HojaCaratula } from '../componentes/HojaCaratula'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { altavoz } from '../emulador/audio'
import { leerAjustes } from '../lib/ajustes'
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
  leerPartida,
  leerRomGuardada,
  listarCaratulas,
  listarJuegos,
  quitarJuego,
  type Juego,
} from '../lib/almacen'
import { ordenarJuegos } from '../lib/biblioteca'
import { cuando, tamano } from '../lib/formato'
import { vibrar } from '../lib/vibracion'
import { registrar } from '../lib/registro'
import { SISTEMAS, type Sistema } from '../lib/sistemas'

interface Props {
  sistema: Sistema
  alJugar: (juego: Juego, reanudar: boolean) => void
  alVolver: () => void
}

interface Detalle {
  juego: Juego
  partida?: number
  estado?: number
  caratula: boolean
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

function Ficha({ juego, caratula, alJugar, alOpciones }: { juego: Juego; caratula?: string; alJugar: () => void; alOpciones: () => void }) {
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
          {caratula ? (
            <img src={caratula} alt="" className="h-full w-full object-contain" draggable={false} />
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
          <p className="truncate text-[11px] text-zinc-500">{juego.ultimaVez ? `Jugado ${cuando(juego.ultimaVez)}` : 'Sin jugar'}</p>
        </div>
        <button className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center text-zinc-500 active:opacity-50" aria-label={`Opciones de ${juego.nombre}`} onClick={alOpciones}>
          <Ellipsis size={18} />
        </button>
      </div>
    </div>
  )
}

export function Biblioteca({ sistema, alJugar, alVolver }: Props) {
  const { avisar } = useInterfaz()
  const [juegos, setJuegos] = useState<Juego[] | null>(null)
  const [conEstado, setConEstado] = useState<Set<string>>(new Set())
  const [caratulas, setCaratulas] = useState<Map<string, string>>(new Map())
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [eligiendoCaratula, setEligiendoCaratula] = useState<Juego | null>(null)
  const pantalla = useRef<HTMLDivElement>(null)
  const info = SISTEMAS[sistema]
  useVolverDeslizando(pantalla, alVolver)

  const recargar = useCallback(async () => {
    const lista = ordenarJuegos((await listarJuegos()).filter((j) => j.sistema === sistema))
    const [estados, imagenes] = await Promise.all([Promise.all(lista.map((j) => leerEstado(j.id, 'auto'))), listarCaratulas()])
    setConEstado(new Set(lista.filter((_, i) => estados[i]).map((j) => j.id)))
    setCaratulas((antes) => {
      antes.forEach((u) => URL.revokeObjectURL(u))
      return new Map(imagenes.map((c) => [c.id, URL.createObjectURL(new Blob([c.datos], { type: 'image/jpeg' }))]))
    })
    setJuegos(lista)
  }, [sistema])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const anadir = useAnadirJuegos(recargar, sistema)

  const jugar = (j: Juego, reanudar: boolean) => {
    // El sonido de Safari se desbloquea en este mismo toque
    void altavoz.activar(leerAjustes().sonarEnSilencio)
    setDetalle(null)
    alJugar(j, reanudar)
  }

  const abrirDetalle = async (juego: Juego) => {
    const [p, e, c] = await Promise.all([leerPartida(juego.id), leerEstado(juego.id, 'auto'), leerCaratula(juego.id)])
    setDetalle({ juego, partida: p?.fecha, estado: e?.fecha, caratula: !!c })
  }

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
        if (rom) await guardarJuego(j, rom)
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
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="sticky top-0 z-10 -mx-4 mb-3 grid h-11 grid-cols-[1fr_auto_1fr] items-center bg-[#F2F2F7]/85 px-2 backdrop-blur-xl dark:bg-black/85">
        <button className="boton-texto flex items-center justify-self-start" onClick={alVolver}>
          <ChevronLeft size={26} /> Consolas
        </button>
        <h1 className="truncate text-[17px] font-semibold">{info.nombre}</h1>
        <button className="boton-icono justify-self-end" aria-label="Añadir juegos" onClick={anadir.abrir}>
          <Plus size={24} />
        </button>
      </div>
      {anadir.elementos}

      {juegos && juegos.length === 0 && (
        <div className="mt-16 flex flex-col items-center px-6 text-center">
          <Gamepad2 size={56} strokeWidth={1.25} className="text-zinc-400" />
          <p className="mt-4 text-[20px] font-semibold">Aún no hay juegos de {info.nombre}</p>
          <p className="mt-2 text-[15px] text-zinc-500">Elige tus juegos en Archivos (.gb, .gbc, .gba o .zip). La app guarda una copia y el fichero original se queda donde está.</p>
          <button className="boton-lleno mt-6" onClick={anadir.abrir}>
            <Plus size={20} /> Añadir juegos
          </button>
        </div>
      )}

      {juegos && juegos.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4" data-testid="biblioteca">
            {juegos.map((j) => (
              <Ficha
                key={j.id}
                juego={j}
                caratula={caratulas.get(j.id)}
                alJugar={() => jugar(j, conEstado.has(j.id))}
                alOpciones={() => void abrirDetalle(j)}
              />
            ))}
          </div>
          <p className="pie-grupo mt-4 text-center">Toca un juego para seguir donde lo dejaste. Mantén pulsado para ver sus opciones.</p>
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
