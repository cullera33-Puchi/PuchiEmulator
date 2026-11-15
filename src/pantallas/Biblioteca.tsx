/**
 * Biblioteca: los juegos añadidos desde Archivos, el último jugado arriba.
 * Tocar un juego lo abre donde se dejó (si hay estado «auto»); el botón «…» da el resto de opciones.
 */
import { ChevronRight, Ellipsis, Gamepad2, Plus, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Baldosa, Hoja, useInterfaz } from '../componentes/Interfaz'
import { altavoz } from '../emulador/audio'
import { leerAjustes } from '../lib/ajustes'
import { actualizarJuego, borrarProgreso, leerEstado, leerPartida, listarJuegos, quitarJuego, type Juego } from '../lib/almacen'
import { anadirFichero, ordenarJuegos } from '../lib/biblioteca'
import { cuando, plural, tamano } from '../lib/formato'
import { SISTEMAS } from '../lib/sistemas'

interface Props {
  alJugar: (id: string, reanudar: boolean) => void
  alAjustes: () => void
}

interface Detalle {
  juego: Juego
  partida?: number
  estado?: number
}

export function Biblioteca({ alJugar, alAjustes }: Props) {
  const { avisar, confirmar } = useInterfaz()
  const [juegos, setJuegos] = useState<Juego[] | null>(null)
  const [conEstado, setConEstado] = useState<Set<string>>(new Set())
  const [anadiendo, setAnadiendo] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const selector = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    const lista = ordenarJuegos(await listarJuegos())
    const estados = await Promise.all(lista.map((j) => leerEstado(j.id, 'auto')))
    setConEstado(new Set(lista.filter((_, i) => estados[i]).map((j) => j.id)))
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
        console.error(e)
        fallidos.push(f.name)
      }
    }
    setAnadiendo(null)
    if (selector.current) selector.current.value = ''
    await recargar()
    const partes: string[] = []
    if (nuevos) partes.push(nuevos === 1 ? 'Juego añadido' : `${plural(nuevos, 'juego añadido', 'juegos añadidos')}`)
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
    const [p, e] = await Promise.all([leerPartida(juego.id), leerEstado(juego.id, 'auto')])
    setDetalle({ juego, partida: p?.fecha, estado: e?.fecha })
  }

  const renombrar = async (j: Juego) => {
    const nombre = window.prompt('Nombre del juego', j.nombre)?.trim()
    if (!nombre || nombre === j.nombre) return
    await actualizarJuego({ ...j, nombre })
    setDetalle(null)
    await recargar()
  }

  const quitar = async (j: Juego) => {
    const ok = await confirmar({
      titulo: `¿Quitar «${j.nombre}»?`,
      mensaje: 'Se borra la copia del juego en la app. La partida guardada se conserva: si lo vuelves a añadir, la encontrará.',
      aceptar: 'Quitar',
      destructivo: true,
    })
    if (!ok) return
    await quitarJuego(j.id)
    setDetalle(null)
    await recargar()
    avisar('Juego quitado de la biblioteca')
  }

  const borrarPartida = async (j: Juego) => {
    const ok = await confirmar({
      titulo: '¿Borrar la partida?',
      mensaje: `Se borran la partida guardada y los estados de «${j.nombre}». No se puede deshacer.`,
      aceptar: 'Borrar',
      destructivo: true,
    })
    if (!ok) return
    await borrarProgreso(j.id)
    setDetalle(null)
    await recargar()
    avisar('Partida borrada')
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="flex h-11 items-center justify-end gap-1">
        <button className="boton-icono" aria-label="Añadir juegos" onClick={elegirFicheros}>
          <Plus size={24} />
        </button>
        <button className="boton-icono" aria-label="Ajustes" onClick={alAjustes}>
          <Settings size={22} />
        </button>
      </div>
      <h1 className="mb-4 px-1 text-[34px] leading-tight font-bold">Juegos</h1>

      {/* Sin filtro de tipo: en el iPhone, Archivos no deja elegir extensiones que no conoce */}
      <input ref={selector} type="file" multiple className="hidden" data-testid="selector" onChange={(e) => void alElegir(e.target.files)} />

      {juegos && juegos.length === 0 && (
        <div className="mt-16 flex flex-col items-center px-6 text-center">
          <span className="grid size-20 place-items-center rounded-[22px] bg-[#5856D6] text-white">
            <Gamepad2 size={42} strokeWidth={1.5} />
          </span>
          <p className="mt-5 text-[20px] font-semibold">Aún no hay juegos</p>
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
          <div className="lista">
            {juegos.map((j, i) => {
              const s = SISTEMAS[j.sistema]
              return (
                <div key={j.id}>
                  {i > 0 && <div className="separador ml-[68px]" />}
                  <div className="flex items-center">
                    <button className="fila min-w-0 flex-1 py-2.5" onClick={() => jugar(j, conEstado.has(j.id))}>
                      <Baldosa color={s.color} texto={s.corto} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px]">{j.nombre}</span>
                        <span className="block truncate text-[13px] text-zinc-500">
                          {j.ultimaVez ? `${s.nombre}, jugado ${cuando(j.ultimaVez)}` : s.nombre}
                        </span>
                      </span>
                    </button>
                    <button className="boton-icono mr-2" aria-label={`Opciones de ${j.nombre}`} onClick={() => void abrirDetalle(j)}>
                      <Ellipsis size={22} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="pie-grupo">Toca un juego para seguir donde lo dejaste. Las partidas se guardan en este iPhone.</p>
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
              <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void renombrar(detalle.juego)}>
                Cambiar el nombre
              </button>
              <div className="separador" />
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
          </>
        )}
      </Hoja>
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
