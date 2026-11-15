/**
 * Pantalla de inicio: «Seguir jugando» con el último juego y una tarjeta por consola, con su dibujo
 * o una foto del usuario y cuántos juegos tiene. Tocar una consola abre su biblioteca.
 */
import { BarChart3, ChevronRight, Ellipsis, Play, Plus, Settings, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnadirJuegos } from '../componentes/AnadirJuegos'
import { DibujoConsola } from '../componentes/Consolas'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { altavoz } from '../emulador/audio'
import { leerAjustes, useAjustes } from '../lib/ajustes'
import { borrarCaratula, contarPartidas, guardarCaratula, leerCaratula, leerEstado, listarCaratulas, listarJuegos, listarSesiones, type Juego } from '../lib/almacen'
import { delPeriodo, duracion, total, type SesionJuego } from '../lib/estadisticas'
import { reducirImagen } from '../lib/caratulas'
import { seguirJugando } from '../lib/biblioteca'
import { aplazarCopia, diasSinCopia, exportarCopia, necesitaCopia } from '../lib/copias'
import { APP_VERSION } from '../lib/version'
import { buscarCaratulasPendientes } from '../lib/caratulasAuto'
import { cuando, plural } from '../lib/formato'
import { registrar } from '../lib/registro'
import { CONSOLAS, CONSOLAS_APP, SISTEMAS, type Consola } from '../lib/sistemas'

interface Props {
  alEstadisticas: () => void
  alAbrirConsola: (c: Consola) => void
  alJugar: (juego: Juego, reanudar: boolean) => void
  alAjustes: () => void
}

export const claveFotoConsola = (c: Consola) => `consola-${c}`

export function Inicio({ alEstadisticas, alAbrirConsola, alJugar, alAjustes }: Props) {
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

  const anadir = useAnadirJuegos(recargar)

  const tiempoDe = (id: string) => sesiones.filter((x) => x.juegoId === id).reduce((a, x) => a + x.ms, 0)

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
              {tiempoDe(ultimo.juego.id) > 0 && <span className="block truncate text-[13px] text-zinc-500">{duracion(tiempoDe(ultimo.juego.id))} jugadas</span>}
            </span>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-acento text-white dark:bg-acento-oscuro">
              <Play size={20} fill="currentColor" />
            </span>
          </button>
          {recientes.length > 1 && (
            <div className="-mt-3 mb-6 grid grid-cols-4 gap-3" data-testid="otros-recientes">
              {recientes.slice(1).map((r) => (
                <button
                  key={r.juego.id}
                  className="min-w-0 text-left active:opacity-70"
                  aria-label={`${r.juego.nombre}, ${SISTEMAS[r.juego.sistema].nombre}: seguir`}
                  onClick={() => {
                    void altavoz.activar(leerAjustes().sonarEnSilencio)
                    alJugar(r.juego, r.reanudar)
                  }}
                >
                  <span className="block aspect-square overflow-hidden rounded-xl shadow-sm" style={{ background: SISTEMAS[r.juego.sistema].color }}>
                    {r.caratula ? (
                      <img src={r.caratula} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-end p-1.5 text-[11px] leading-tight font-semibold text-white">{r.juego.nombre}</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[12px] text-zinc-600 dark:text-zinc-400">{r.juego.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {sesiones.length > 0 && (
        <button className="lista mb-6 flex w-full items-center gap-3 p-3 text-left active:opacity-70" onClick={alEstadisticas} aria-label="Estadísticas">
          <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-acento text-white dark:bg-acento-oscuro">
            <BarChart3 size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">Estadísticas</span>
            <span className="block truncate text-[13px] text-zinc-500">Esta semana, {duracion(total(delPeriodo(sesiones, 'semana', Date.now())))} jugadas</span>
          </span>
          <ChevronRight size={18} className="text-zinc-400" />
        </button>
      )}

      <div className="flex flex-col gap-3" data-testid="consolas">
        {CONSOLAS.map((s) => {
          const info = CONSOLAS_APP[s]
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
                    {info.descripcion && <span className="block text-[13px] text-zinc-500">{info.descripcion}</span>}
                    <span className="block text-[15px] text-zinc-500">{n ? plural(n, 'juego', 'juegos') : 'Sin juegos'}</span>
                  </span>
                  <span className="flex items-center text-[15px] text-acento dark:text-acento-oscuro">
                    Ver juegos <ChevronRight size={18} />
                  </span>
                </span>
                <span className="relative z-[1] flex w-[48%] items-center justify-center py-4 pr-4">
                  {foto ? <img src={foto} alt="" className="h-full w-full rounded-xl object-cover" /> : <DibujoConsola consola={s} />}
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
