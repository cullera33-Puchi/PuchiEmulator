/**
 * Pantalla de inicio: «Seguir jugando» con el último juego y una tarjeta por consola, con su dibujo
 * o una foto del usuario y cuántos juegos tiene. Tocar una consola abre su biblioteca.
 */
import { ChevronRight, Ellipsis, Play, Plus, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnadirJuegos } from '../componentes/AnadirJuegos'
import { DibujoConsola } from '../componentes/Consolas'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { altavoz } from '../emulador/audio'
import { leerAjustes } from '../lib/ajustes'
import { borrarCaratula, guardarCaratula, leerCaratula, leerEstado, listarCaratulas, listarJuegos, type Juego } from '../lib/almacen'
import { reducirImagen } from '../lib/caratulas'
import { cuando, plural } from '../lib/formato'
import { registrar } from '../lib/registro'
import { SISTEMAS, type Sistema } from '../lib/sistemas'

interface Props {
  alAbrirConsola: (s: Sistema) => void
  alJugar: (juego: Juego, reanudar: boolean) => void
  alAjustes: () => void
}

const CONSOLAS: Sistema[] = ['gb', 'gbc', 'gba']
export const claveFotoConsola = (s: Sistema) => `consola-${s}`

export function Inicio({ alAbrirConsola, alJugar, alAjustes }: Props) {
  const { avisar } = useInterfaz()
  const [juegos, setJuegos] = useState<Juego[] | null>(null)
  const [ultimo, setUltimo] = useState<{ juego: Juego; caratula?: string; reanudar: boolean } | null>(null)
  const [fotos, setFotos] = useState<Map<string, string>>(new Map())
  const [opciones, setOpciones] = useState<Sistema | null>(null)
  const selectorFoto = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    const [lista, imagenes] = await Promise.all([listarJuegos(), listarCaratulas()])
    const urls = new Map(imagenes.map((c) => [c.id, URL.createObjectURL(new Blob([c.datos], { type: 'image/jpeg' }))]))
    setFotos((antes) => {
      antes.forEach((u) => URL.revokeObjectURL(u))
      return urls
    })
    setJuegos(lista)
    const reciente = lista.filter((j) => j.ultimaVez).sort((a, b) => (b.ultimaVez ?? 0) - (a.ultimaVez ?? 0))[0]
    if (reciente) {
      const auto = await leerEstado(reciente.id, 'auto')
      setUltimo({ juego: reciente, caratula: urls.get(reciente.id), reanudar: !!auto })
    } else setUltimo(null)
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const anadir = useAnadirJuegos(recargar)

  const cuantos = (s: Sistema) => juegos?.filter((j) => j.sistema === s).length ?? 0

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

  const quitarFoto = async (s: Sistema) => {
    setOpciones(null)
    const anterior = await leerCaratula(claveFotoConsola(s))
    await borrarCaratula(claveFotoConsola(s))
    await recargar()
    if (anterior) avisar('Vuelve el dibujo', { fn: () => void guardarCaratula(anterior).then(recargar) })
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex h-11 items-center justify-between bg-[#F2F2F7]/85 px-4 backdrop-blur-xl dark:bg-black/85">
        <h1 className="text-[22px] font-bold">Consolas</h1>
        <div className="-mr-2 flex items-center">
          <button className="boton-icono" aria-label="Añadir juegos" onClick={anadir.abrir}>
            <Plus size={24} />
          </button>
          <button className="boton-icono" aria-label="Ajustes" onClick={alAjustes}>
            <Settings size={22} />
          </button>
        </div>
      </div>
      {anadir.elementos}

      {ultimo && (
        <>
          <p className="cabecera-grupo">Seguir jugando</p>
          <button
            className="lista mb-6 flex w-full items-center gap-3 p-3 text-left active:opacity-70"
            aria-label={`Seguir jugando a ${ultimo.juego.nombre}`}
            onClick={() => {
              void altavoz.activar(leerAjustes().sonarEnSilencio)
              alJugar(ultimo.juego, ultimo.reanudar)
            }}
          >
            <span className="size-16 shrink-0 overflow-hidden rounded-lg" style={{ background: SISTEMAS[ultimo.juego.sistema].color }}>
              {ultimo.caratula && <img src={ultimo.caratula} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-semibold">{ultimo.juego.nombre}</span>
              <span className="block truncate text-[13px] text-zinc-500">
                {SISTEMAS[ultimo.juego.sistema].nombre}, {cuando(ultimo.juego.ultimaVez ?? 0)}
              </span>
            </span>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-acento text-white dark:bg-acento-oscuro">
              <Play size={20} fill="currentColor" />
            </span>
          </button>
        </>
      )}

      <div className="flex flex-col gap-3" data-testid="consolas">
        {CONSOLAS.map((s) => {
          const info = SISTEMAS[s]
          const n = cuantos(s)
          const foto = fotos.get(claveFotoConsola(s))
          return (
            <div key={s} className="relative">
              <button
                className="relative flex h-40 w-full items-stretch overflow-hidden rounded-2xl bg-white text-left shadow-sm transition-transform active:scale-[0.98] dark:bg-zinc-900"
                aria-label={`${info.nombre}, ${n ? plural(n, 'juego', 'juegos') : 'sin juegos'}`}
                onClick={() => alAbrirConsola(s)}
              >
                <span className="absolute inset-0 opacity-20" style={{ background: `linear-gradient(120deg, transparent 30%, ${info.color})` }} />
                <span className="relative z-[1] flex flex-1 flex-col justify-between p-4">
                  <span>
                    <span className="block text-[22px] leading-tight font-bold">{info.nombre}</span>
                    <span className="block text-[15px] text-zinc-500">{n ? plural(n, 'juego', 'juegos') : 'Sin juegos'}</span>
                  </span>
                  <span className="flex items-center text-[15px] text-acento dark:text-acento-oscuro">
                    Ver juegos <ChevronRight size={18} />
                  </span>
                </span>
                <span className="relative z-[1] flex w-[48%] items-center justify-center py-4 pr-4">
                  {foto ? <img src={foto} alt="" className="h-full w-full rounded-xl object-cover" /> : <DibujoConsola sistema={s} />}
                </span>
              </button>
              <button className="absolute top-2 right-2 z-[2] grid size-9 place-items-center rounded-full bg-black/5 text-zinc-600 active:opacity-50 dark:bg-white/10 dark:text-zinc-300" aria-label={`Opciones de ${info.nombre}`} onClick={() => setOpciones(s)}>
                <Ellipsis size={18} />
              </button>
            </div>
          )
        })}
      </div>
      {juegos && juegos.length === 0 && <p className="pie-grupo mt-3 text-center">Añade tus juegos con «+». Cada uno va solo a su consola.</p>}

      <Hoja abierta={!!opciones} alCerrar={() => setOpciones(null)} titulo={opciones ? SISTEMAS[opciones].nombre : undefined}>
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
