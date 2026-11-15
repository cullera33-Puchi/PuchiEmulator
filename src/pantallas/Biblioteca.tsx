/**
 * Biblioteca: los juegos añadidos desde Archivos, en cuadrícula con sus carátulas y el último jugado
 * primero. Tocar un juego lo abre donde se dejó (si hay estado «auto»); mantenerlo pulsado o tocar
 * «…» abre sus opciones. Quitar un juego o borrar su partida se puede deshacer.
 */
import { ChevronRight, Ellipsis, Gamepad2, Plus, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
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
import { anadirFichero, ordenarJuegos } from '../lib/biblioteca'
import { cuando, plural, tamano } from '../lib/formato'
import { vibrar } from '../lib/vibracion'
import { registrar } from '../lib/registro'
import { SISTEMAS } from '../lib/sistemas'

interface Props {
  alJugar: (id: string, reanudar: boolean) => void
  alAjustes: () => void
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
          <p className="truncate text-[11px] text-zinc-500">{juego.ultimaVez ? `Jugado ${cuando(juego.ultimaVez)}` : s.nombre}</p>
        </div>
        <button className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center text-zinc-500 active:opacity-50" aria-label={`Opciones de ${juego.nombre}`} onClick={alOpciones}>
          <Ellipsis size={18} />
        </button>
      </div>
    </div>
  )
}

export function Biblioteca({ alJugar, alAjustes }: Props) {
  const { avisar } = useInterfaz()
  const [juegos, setJuegos] = useState<Juego[] | null>(null)
  const [conEstado, setConEstado] = useState<Set<string>>(new Set())
  const [caratulas, setCaratulas] = useState<Map<string, string>>(new Map())
  const [anadiendo, setAnadiendo] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [eligiendoCaratula, setEligiendoCaratula] = useState<Juego | null>(null)
  const selector = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    const lista = ordenarJuegos(await listarJuegos())
    const [estados, imagenes] = await Promise.all([Promise.all(lista.map((j) => leerEstado(j.id, 'auto'))), listarCaratulas()])
    setConEstado(new Set(lista.filter((_, i) => estados[i]).map((j) => j.id)))
    setCaratulas((antes) => {
      antes.forEach((u) => URL.revokeObjectURL(u))
      return new Map(imagenes.map((c) => [c.id, URL.createObjectURL(new Blob([c.datos], { type: 'image/jpeg' }))]))
    })
    setJuegos(lista)
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const elegirFicheros = () => selector.current?.click()

  const alElegir = async (ficheros: FileList | null) => {
    if (!ficheros?.length) return
    let nuevos = 0
    let repetidos = 0
    const fallidos: string[] = []
    for (const [i, f] of Array.from(ficheros).entries()) {
      setAnadiendo(ficheros.length > 1 ? `Añadiendo ${i + 1} de ${ficheros.length}…` : 'Añadiendo…')
      try {
        const r = await anadirFichero(f.name, await f.arrayBuffer())
        if (r.tipo === 'nuevo') nuevos++
        else if (r.tipo === 'repetido') repetidos++
        else fallidos.push(f.name)
      } catch (e) {
        registrar('error', 'No se pudo añadir un juego', (e as Error).message)
        fallidos.push(f.name)
      }
    }
    setAnadiendo(null)
    if (selector.current) selector.current.value = ''
    registrar('info', 'Juegos añadidos', { nuevos, repetidos, fallidos: fallidos.length })
    await recargar()
    const partes: string[] = []
    if (nuevos) partes.push(nuevos === 1 ? 'Juego añadido' : plural(nuevos, 'juego añadido', 'juegos añadidos'))
    if (repetidos) partes.push(repetidos === 1 ? 'uno ya estaba en la biblioteca' : `${repetidos} ya estaban en la biblioteca`)
    if (fallidos.length) partes.push(fallidos.length === 1 ? `«${fallidos[0]}» no es un juego que se pueda abrir` : `${fallidos.length} ficheros no se han reconocido`)
    const texto = partes.join(', ')
    avisar(texto.charAt(0).toUpperCase() + texto.slice(1))
  }

  const jugar = (j: Juego, reanudar: boolean) => {
    // El sonido de Safari se desbloquea en este mismo toque
    void altavoz.activar(leerAjustes().sonarEnSilencio)
    setDetalle(null)
    alJugar(j.id, reanudar)
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
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex h-11 items-center justify-between bg-[#F2F2F7]/85 px-4 backdrop-blur-xl dark:bg-black/85">
        <h1 className="text-[22px] font-bold">Juegos</h1>
        <div className="-mr-2 flex items-center">
          <button className="boton-icono" aria-label="Añadir juegos" onClick={elegirFicheros}>
            <Plus size={24} />
          </button>
          <button className="boton-icono" aria-label="Ajustes" onClick={alAjustes}>
            <Settings size={22} />
          </button>
        </div>
      </div>

      {/* Sin filtro de tipo: en el iPhone, Archivos no deja elegir extensiones que no conoce */}
      <input ref={selector} type="file" multiple className="hidden" data-testid="selector" onChange={(e) => void alElegir(e.target.files)} />

      {juegos && juegos.length === 0 && (
        <div className="mt-16 flex flex-col items-center px-6 text-center">
          <Gamepad2 size={56} strokeWidth={1.25} className="text-zinc-400" />
          <p className="mt-4 text-[20px] font-semibold">Aún no hay juegos</p>
          <p className="mt-2 text-[15px] text-zinc-500">
            Elige tus juegos de Game Boy, Game Boy Color o Game Boy Advance en Archivos (.gb, .gbc, .gba o .zip). La app guarda una copia y el fichero original se queda donde está.
          </p>
          <button className="boton-lleno mt-6" onClick={elegirFicheros}>
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

      {anadiendo && (
        <div className="velo fixed inset-0 z-50 grid place-items-center bg-black/40">
          <p className="rounded-2xl bg-white px-6 py-4 text-[15px] dark:bg-zinc-800">{anadiendo}</p>
        </div>
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
