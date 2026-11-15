/**
 * Elegir la carátula de un juego: búsqueda en el archivo de libretro por nombre, foto propia o
 * quitarla. Las miniaturas de la búsqueda se cargan de internet solo mientras la hoja está abierta.
 */
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { borrarCaratula, guardarCaratula, leerCaratula, type Caratula, type Juego } from '../lib/almacen'
import { buscarCaratulas, descargarCaratula, nombreVisible, reducirImagen, urlCaratula, type Candidato } from '../lib/caratulas'
import { registrar } from '../lib/registro'
import { Hoja, useInterfaz } from './Interfaz'

interface Props {
  juego: Juego | null
  alCerrar: () => void
  alCambiar: () => void
}

export function HojaCaratula({ juego, alCerrar, alCambiar }: Props) {
  const { avisar } = useInterfaz()
  const [consulta, setConsulta] = useState('')
  const [repo, setRepo] = useState('')
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)
  const [estado, setEstado] = useState<'buscando' | 'error' | 'listo'>('listo')
  const [guardando, setGuardando] = useState<string | null>(null)
  const [tieneCaratula, setTieneCaratula] = useState(false)
  const selector = useRef<HTMLInputElement>(null)

  const buscar = async (j: Juego, q: string) => {
    setEstado('buscando')
    try {
      const r = await buscarCaratulas(j.sistema, q)
      setRepo(r.repo)
      setCandidatos(r.candidatos)
      setEstado('listo')
    } catch {
      setEstado('error')
    }
  }

  useEffect(() => {
    if (!juego) return
    setConsulta(juego.nombre)
    setCandidatos(null)
    void buscar(juego, juego.nombre)
    void leerCaratula(juego.id).then((c) => setTieneCaratula(!!c))
  }, [juego])

  if (!juego) return null

  const poner = async (c: Omit<Caratula, 'fecha'>, anterior: Caratula | undefined) => {
    await guardarCaratula({ ...c, fecha: Date.now() })
    alCambiar()
    alCerrar()
    avisar('Carátula puesta', {
      fn: () => {
        void (anterior ? guardarCaratula(anterior) : borrarCaratula(c.id)).then(alCambiar)
      },
    })
  }

  const elegir = async (nombre: string) => {
    setGuardando(nombre)
    try {
      const anterior = await leerCaratula(juego.id)
      const datos = await descargarCaratula(urlCaratula(repo, nombre))
      await poner({ id: juego.id, datos, origen: 'libretro' }, anterior)
      registrar('info', 'Carátula descargada')
    } catch (e) {
      registrar('aviso', 'No se pudo descargar la carátula', (e as Error).message)
      avisar('No se ha podido descargar la carátula. Comprueba la conexión.')
    } finally {
      setGuardando(null)
    }
  }

  const alElegirFoto = async (f: File | undefined) => {
    if (selector.current) selector.current.value = ''
    if (!f) return
    try {
      const anterior = await leerCaratula(juego.id)
      await poner({ id: juego.id, datos: await reducirImagen(f), origen: 'propia' }, anterior)
      registrar('info', 'Carátula propia puesta')
    } catch {
      avisar('No se ha podido abrir la imagen')
    }
  }

  const quitar = async () => {
    const anterior = await leerCaratula(juego.id)
    await borrarCaratula(juego.id)
    alCambiar()
    alCerrar()
    if (anterior) avisar('Carátula quitada', { fn: () => void guardarCaratula(anterior).then(alCambiar) })
  }

  return (
    <Hoja abierta alCerrar={alCerrar} titulo="Carátula">
      <form
        className="mb-3 flex items-center gap-2 rounded-[10px] bg-zinc-200/70 px-3 dark:bg-zinc-800"
        onSubmit={(e) => {
          e.preventDefault()
          void buscar(juego, consulta)
        }}
      >
        <Search size={18} className="shrink-0 text-zinc-500" />
        <input
          className="min-w-0 flex-1 bg-transparent py-2 outline-none"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          enterKeyHint="search"
          aria-label="Buscar carátula"
          placeholder="Nombre del juego"
        />
      </form>

      {estado === 'buscando' && <p className="py-6 text-center text-[15px] text-zinc-500">Buscando…</p>}
      {estado === 'error' && <p className="py-6 text-center text-[15px] text-zinc-500">No se ha podido buscar. Comprueba la conexión.</p>}
      {estado === 'listo' && candidatos && candidatos.length === 0 && (
        <p className="py-6 text-center text-[15px] text-zinc-500">No hay carátulas con ese nombre. Prueba con otras palabras o elige una foto.</p>
      )}
      {estado === 'listo' && candidatos && candidatos.length > 0 && (
        <div className="grid grid-cols-3 gap-3" data-testid="candidatos">
          {candidatos.map((c) => (
            <button key={c.nombre} className="text-left active:opacity-60 disabled:opacity-40" disabled={!!guardando} onClick={() => void elegir(c.nombre)}>
              <span className="block aspect-square overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
                <img src={urlCaratula(repo, c.nombre)} alt="" loading="lazy" className="h-full w-full object-contain" crossOrigin="anonymous" />
              </span>
              <span className="mt-1 line-clamp-2 text-[11px] leading-tight text-zinc-600 dark:text-zinc-400">{guardando === c.nombre ? 'Guardando…' : nombreVisible(c.nombre)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="pie-grupo">Carátulas del archivo público de libretro. La búsqueda se hace en el iPhone; las miniaturas se cargan de ese archivo y se guarda solo la que elijas.</p>

      <div className="lista mt-4">
        <button className="fila text-acento dark:text-acento-oscuro" onClick={() => selector.current?.click()}>
          Elegir una foto
        </button>
        {tieneCaratula && (
          <>
            <div className="separador" />
            <button className="fila text-red-600 dark:text-red-500" onClick={() => void quitar()}>
              Quitar la carátula
            </button>
          </>
        )}
      </div>
      <input ref={selector} type="file" accept="image/*" className="hidden" data-testid="selector-foto" onChange={(e) => void alElegirFoto(e.target.files?.[0])} />
    </Hoja>
  )
}
