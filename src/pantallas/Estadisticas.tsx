/**
 * Estadísticas: tiempo jugado por periodo, por día o mes, por juego y por consola, a qué hora se
 * juega y récords. Un solo tono (el acento) para todas las marcas: lo que distingue juegos y consolas
 * es su nombre escrito, nunca el color. Pantalla apilada sobre el inicio.
 */
import { BarChart3, ChevronLeft, Clock, Flame, Gamepad2, Timer, Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVolverDeslizando } from '../componentes/gestos'
import { Segmentado } from '../componentes/Interfaz'
import { listarCaratulas, listarSesiones } from '../lib/almacen'
import {
  columnas,
  delPeriodo,
  duracion,
  duracionCorta,
  franjaFavorita,
  porConsola,
  porHora,
  porJuego,
  racha,
  records,
  total,
  type Columna,
  type Periodo,
  type SesionJuego,
} from '../lib/estadisticas'
import { cuandoCorto, plural } from '../lib/formato'
import { SISTEMAS, type Sistema } from '../lib/sistemas'

const PERIODOS: [Periodo, string][] = [
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['ano', 'Año'],
  ['siempre', 'Siempre'],
]

const TEXTO_PERIODO: Record<Periodo, string> = {
  semana: 'en los últimos 7 días',
  mes: 'en los últimos 30 días',
  ano: 'en los últimos 12 meses',
  siempre: 'desde que usas la app',
}

function Tarjeta({ titulo, children, testid }: { titulo?: string; children: ReactNode; testid?: string }) {
  return (
    <section className="mb-5" data-testid={testid}>
      {titulo && <p className="cabecera-grupo">{titulo}</p>}
      <div className="lista p-4">{children}</div>
    </section>
  )
}

function Cifra({ icono: Icono, valor, texto }: { icono: typeof Clock; valor: string; texto: string }) {
  return (
    <div className="lista flex flex-col gap-1 p-3.5">
      <Icono size={18} className="text-acento dark:text-acento-oscuro" aria-hidden />
      <span className="text-[22px] leading-tight font-bold tabular-nums">{valor}</span>
      <span className="text-[13px] leading-tight text-zinc-500">{texto}</span>
    </div>
  )
}

/** Columnas de un solo tono con detalle al tocar o pasar por encima de cada una. */
function GraficoColumnas({ datos, etiquetaCada = 1, resumen, testid }: { datos: Columna[]; etiquetaCada?: number; resumen: string; testid?: string }) {
  const [elegida, setElegida] = useState<number | null>(null)
  const max = Math.max(...datos.map((d) => d.ms), 1)
  const detalle = elegida !== null ? datos[elegida] : null
  return (
    <div data-testid={testid}>
      <p className="mb-3 min-h-5 text-[15px]" aria-live="polite">
        {detalle ? (
          <>
            <span>{detalle.titulo.charAt(0).toUpperCase() + detalle.titulo.slice(1)}</span>: <span className="font-semibold tabular-nums">{detalle.ms ? duracion(detalle.ms) : 'sin jugar'}</span>
          </>
        ) : (
          <span className="text-zinc-500">{resumen}</span>
        )}
      </p>
      <div className="relative h-36" role="group" aria-label={resumen} onPointerLeave={(e) => e.pointerType === 'mouse' && setElegida(null)}>
        {/* Referencia: el máximo, con una línea fina y recesiva */}
        <span className="absolute top-0 right-0 left-0 border-t border-zinc-200 dark:border-zinc-800" aria-hidden />
        <span className="absolute -top-2.5 left-0 bg-white pr-1 text-[11px] text-zinc-400 tabular-nums dark:bg-zinc-900" aria-hidden>
          {duracionCorta(max)}
        </span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-zinc-300 dark:border-zinc-700">
          {datos.map((d, i) => (
            <button
              key={d.clave}
              className="flex h-full min-w-0 flex-1 items-end justify-center"
              aria-label={`${d.titulo}: ${d.ms ? duracion(d.ms) : 'sin jugar'}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setElegida(i)}
              onClick={() => setElegida(elegida === i ? null : i)}
            >
              <span
                className={`block w-full max-w-6 rounded-t-[4px] transition-opacity ${elegida === null || elegida === i ? 'opacity-100' : 'opacity-40'} bg-acento dark:bg-acento-oscuro`}
                style={{ height: d.ms ? `max(3px, ${(d.ms / max) * 100}%)` : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden>
        {datos.map((d, i) => (
          <span key={d.clave} className="min-w-0 flex-1 text-center text-[11px] text-zinc-500">
            {i % etiquetaCada === 0 || i === datos.length - 1 ? d.etiqueta : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Fila con nombre, barra horizontal del acento y valor a la derecha. */
function FilaBarra({ izquierda, titulo, subtitulo, valor, proporcion }: { izquierda?: ReactNode; titulo: string; subtitulo?: string; valor: string; proporcion: number }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {izquierda}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px]">{titulo}</span>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums">{valor}</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-acento dark:bg-acento-oscuro" style={{ width: `${Math.max(2, proporcion * 100)}%` }} />
        </div>
        {subtitulo && <p className="mt-1 truncate text-[12px] text-zinc-500">{subtitulo}</p>}
      </div>
    </div>
  )
}

export function Estadisticas({ alVolver }: { alVolver: () => void }) {
  const pantalla = useRef<HTMLDivElement>(null)
  useVolverDeslizando(pantalla, alVolver)
  const [sesiones, setSesiones] = useState<SesionJuego[] | null>(null)
  const [caratulas, setCaratulas] = useState<Map<string, string>>(new Map())
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [todos, setTodos] = useState(false)
  const ahora = useMemo(() => Date.now(), [])

  const cargar = useCallback(async () => {
    const [s, c] = await Promise.all([listarSesiones(), listarCaratulas()])
    setSesiones(s)
    setCaratulas((antes) => {
      antes.forEach((u) => URL.revokeObjectURL(u))
      return new Map(c.map((x) => [x.id, URL.createObjectURL(new Blob([x.datos], { type: 'image/jpeg' }))]))
    })
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const d = useMemo(() => {
    if (!sesiones) return null
    const del = delPeriodo(sesiones, periodo, ahora)
    const juegos = porJuego(del)
    const consolas = porConsola(del)
    const horas = porHora(del)
    const cols = columnas(sesiones, periodo, ahora)
    const t = total(del)
    const dias = cols.length
    return {
      total: t,
      sesiones: del.length,
      juegos,
      consolas,
      horas,
      cols,
      media: periodo === 'semana' || periodo === 'mes' ? t / dias : 0,
      racha: racha(sesiones, ahora),
      records: records(del),
      franja: franjaFavorita(horas),
    }
  }, [sesiones, periodo, ahora])

  const horasColumnas: Columna[] = (d?.horas ?? []).map((ms, h) => ({ clave: String(h), etiqueta: String(h), titulo: `De ${h}:00 a ${h + 1}:00`, ms }))
  const maxJuego = Math.max(...(d?.juegos.map((j) => j.ms) ?? [1]), 1)
  const maxConsola = Math.max(...(d ? [...d.consolas.values()] : [1]), 1)

  return (
    <div ref={pantalla} className="min-h-dvh bg-[#F2F2F7] dark:bg-black">
      <div className="mx-auto max-w-lg px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
        <div className="sticky top-0 z-10 -mx-4 mb-3 grid h-11 grid-cols-[1fr_auto_1fr] items-center bg-[#F2F2F7]/85 px-2 backdrop-blur-xl dark:bg-black/85">
          <button className="boton-texto flex items-center justify-self-start" onClick={alVolver}>
            <ChevronLeft size={26} /> Consolas
          </button>
          <h1 className="text-[17px] font-semibold">Estadísticas</h1>
        </div>

        <div className="mb-5">
          <Segmentado etiqueta="Periodo" valor={periodo} opciones={PERIODOS} alCambiar={setPeriodo} />
        </div>

        {d && sesiones && sesiones.length === 0 && (
          <div className="mt-16 flex flex-col items-center px-6 text-center">
            <BarChart3 size={56} strokeWidth={1.25} className="text-zinc-400" />
            <p className="mt-4 text-[20px] font-semibold">Aún no hay partidas</p>
            <p className="mt-2 text-[15px] text-zinc-500">Juega un rato y aquí verás cuánto tiempo llevas, a qué juegas más y cuándo.</p>
          </div>
        )}

        {d && sesiones && sesiones.length > 0 && (
          <>
            <section className="mb-5 px-1" data-testid="total">
              <p className="text-[40px] leading-none font-bold tracking-tight tabular-nums">{d.total ? duracion(d.total) : '0 min'}</p>
              <p className="mt-1.5 text-[15px] text-zinc-500">
                jugadas {TEXTO_PERIODO[periodo]}
                {d.media >= 60_000 ? `, unos ${duracion(d.media)} al día` : ''}
              </p>
            </section>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <Cifra icono={Gamepad2} valor={String(d.sesiones)} texto={d.sesiones === 1 ? 'partida' : 'partidas'} />
              <Cifra icono={Timer} valor={d.sesiones ? duracionCorta(d.total / d.sesiones) : '0 min'} texto="de media por partida" />
              <Cifra icono={Flame} valor={plural(d.racha.actual, 'día', 'días')} texto={`seguidos jugando; tu récord, ${plural(d.racha.mejor, 'día', 'días')}`} />
              <Cifra icono={Trophy} valor={String(d.juegos.length)} texto={d.juegos.length === 1 ? 'juego distinto' : 'juegos distintos'} />
            </div>

            <Tarjeta titulo={periodo === 'semana' || periodo === 'mes' ? 'Tiempo por día' : 'Tiempo por mes'} testid="grafico-tiempo">
              <GraficoColumnas
                datos={d.cols}
                etiquetaCada={periodo === 'mes' ? 5 : 1}
                resumen={d.records.mejorDia ? `Tu mejor día: ${cuandoCorto(new Date(d.records.mejorDia.clave + 'T12:00').getTime(), ahora)}, ${duracion(d.records.mejorDia.ms)}` : 'Toca una barra para ver su tiempo'}
              />
            </Tarjeta>

            {d.juegos.length > 0 && (
              <Tarjeta titulo="Tus juegos" testid="tus-juegos">
                {(todos ? d.juegos : d.juegos.slice(0, 6)).map((j, i) => {
                  const info = SISTEMAS[j.sistema]
                  const imagen = caratulas.get(j.juegoId)
                  return (
                    <FilaBarra
                      key={j.juegoId}
                      izquierda={
                        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg" style={{ background: info.color }}>
                          {imagen ? <img src={imagen} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[10px] font-bold text-white">{info.corto}</span>}
                          <span className="absolute top-0.5 left-0.5 grid size-4 place-items-center rounded-full bg-black/55 text-[10px] font-bold text-white">{i + 1}</span>
                        </span>
                      }
                      titulo={j.nombre}
                      subtitulo={`${info.nombre}, ${plural(j.sesiones, 'partida', 'partidas')}, ${cuandoCorto(j.ultima, ahora)}`}
                      valor={duracion(j.ms)}
                      proporcion={j.ms / maxJuego}
                    />
                  )
                })}
                {d.juegos.length > 6 && (
                  <button className="boton-texto mt-1 text-[15px]" onClick={() => setTodos(!todos)}>
                    {todos ? 'Ver menos' : `Ver los ${d.juegos.length}`}
                  </button>
                )}
              </Tarjeta>
            )}

            {d.consolas.size > 0 && (
              <Tarjeta titulo="Por consola" testid="por-consola">
                {(['gb', 'gbc', 'gba'] as Sistema[])
                  .filter((s) => d.consolas.get(s))
                  .sort((a, b) => (d.consolas.get(b) ?? 0) - (d.consolas.get(a) ?? 0))
                  .map((s) => {
                    const ms = d.consolas.get(s) ?? 0
                    return <FilaBarra key={s} titulo={SISTEMAS[s].nombre} valor={duracion(ms)} subtitulo={`${Math.round((ms / Math.max(d.total, 1)) * 100)} % del tiempo`} proporcion={ms / maxConsola} />
                  })}
              </Tarjeta>
            )}

            <Tarjeta titulo="Cuándo juegas" testid="cuando-juegas">
              <GraficoColumnas datos={horasColumnas} etiquetaCada={6} resumen={d.franja ? `Juegas sobre todo ${d.franja}` : 'Toca una barra para ver su tiempo'} />
            </Tarjeta>

            <Tarjeta titulo="Récords">
              <div className="flex flex-col gap-3 text-[15px]">
                {d.records.sesionMasLarga && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block">Partida más larga</span>
                      <span className="block truncate text-[13px] text-zinc-500">
                        {d.records.sesionMasLarga.nombre}, {cuandoCorto(d.records.sesionMasLarga.inicio, ahora)}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{duracion(d.records.sesionMasLarga.ms)}</span>
                  </div>
                )}
                {d.records.mejorDia && (
                  <div className="flex items-center justify-between gap-3">
                    <span>Día con más juego</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{duracion(d.records.mejorDia.ms)}</span>
                      <span className="block text-[13px] text-zinc-500">{cuandoCorto(new Date(d.records.mejorDia.clave + 'T12:00').getTime(), ahora)}</span>
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span>Mejor racha</span>
                  <span className="font-semibold tabular-nums">{plural(d.racha.mejor, 'día', 'días')}</span>
                </div>
                {periodo !== 'siempre' && (
                  <div className="flex items-center justify-between gap-3">
                    <span>Desde que usas la app</span>
                    <span className="font-semibold tabular-nums">{duracion(total(sesiones))}</span>
                  </div>
                )}
              </div>
            </Tarjeta>
            <p className="pie-grupo">Cuenta el tiempo con el juego en marcha. Si pasas más de 10 minutos sin tocar un botón, el reloj se para hasta que vuelves a jugar.</p>
          </>
        )}
      </div>
    </div>
  )
}
