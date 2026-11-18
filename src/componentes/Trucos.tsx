/**
 * Trucos de un juego (v0.48.0), en el menú del juego. La primera vez busca su fichero en el archivo de
 * libretro: si la coincidencia es segura lo descarga solo; si no, deja elegir entre los parecidos o
 * buscar con otro nombre. Cada truco se pone o se quita con su interruptor, al momento. También se
 * pueden escribir códigos propios.
 */
import { Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { guardarTrucos, leerTrucos, type Truco, type TrucosJuego } from '../lib/almacen'
import { nombreVisible } from '../lib/caratulas'
import { normalizar } from '../lib/biblioteca'
import { registrar } from '../lib/registro'
import type { Sistema } from '../lib/sistemas'
import { buscarTrucos, descargarTrucos, elegirTrucos, juntarTrucos, limpiarCodigo, type FicheroTrucos } from '../lib/trucos'
import { Interruptor, useInterfaz } from './Interfaz'

/** Cuántos trucos se pintan como mucho a la vez: un fichero puede traer más de mil */
const MAX_VISIBLES = 60
const CLAVE_AVISO = 'puchiemulator-aviso-trucos'

interface Props {
  juego: { id: string; nombre: string; sistema: Sistema }
  /** Manda los trucos al juego en marcha; devuelve los que no caben en esta consola */
  alPoner: (trucos: Truco[]) => Promise<{ fuera: Truco[] }>
  alVolver: () => void
}

type Fase = 'cargando' | 'buscando' | 'elegir' | 'lista' | 'sin-conexion'

const campo = 'block w-full rounded-xl bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-zinc-500'

export function Trucos({ juego, alPoner, alVolver }: Props) {
  const { avisar, confirmar } = useInterfaz()
  const [datos, setDatos] = useState<TrucosJuego>({ id: juego.id, trucos: [], fecha: 0 })
  const [fase, setFase] = useState<Fase>('cargando')
  const [candidatos, setCandidatos] = useState<FicheroTrucos[]>([])
  const [consulta, setConsulta] = useState(juego.nombre)
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState<{ nombre: string; codigo: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const guardar = async (d: TrucosJuego) => {
    setDatos(d)
    try {
      await guardarTrucos({ ...d, fecha: Date.now() })
    } catch (e) {
      registrar('error', 'No se pudieron guardar los trucos', (e as Error)?.message)
    }
  }

  /** Descarga un fichero y lo junta con lo que había */
  const usarFichero = async (f: FicheroTrucos, base: TrucosJuego) => {
    setFase('buscando')
    try {
      const descargados = await descargarTrucos(f)
      const d = { ...base, origen: nombreVisible(f.nombre), trucos: juntarTrucos(base.trucos, descargados) }
      await guardar(d)
      registrar('info', 'Trucos descargados', { sistema: juego.sistema, trucos: descargados.length })
      setFase('lista')
      if (!descargados.length) avisar('Ese fichero no trae trucos que se puedan usar')
    } catch (e) {
      registrar('aviso', 'No se pudieron descargar los trucos', (e as Error)?.message)
      setFase('sin-conexion')
    }
  }

  const buscar = async (texto: string, base: TrucosJuego, automatica: boolean) => {
    setFase('buscando')
    try {
      const lista = await buscarTrucos(juego.sistema, texto)
      const segura = automatica ? elegirTrucos(texto, lista) : null
      if (segura) return usarFichero(segura, base)
      setCandidatos(lista)
      setFase('elegir')
    } catch (e) {
      registrar('aviso', 'No se pudieron buscar los trucos', (e as Error)?.message)
      setFase('sin-conexion')
    }
  }

  useEffect(() => {
    let cancelado = false
    void leerTrucos(juego.id).then((t) => {
      if (cancelado) return
      const base = t ?? { id: juego.id, trucos: [], fecha: 0 }
      setDatos(base)
      // Ya buscados (o con códigos propios): la lista; si no, se buscan ahora
      if (t && (t.origen !== undefined || t.trucos.length)) setFase('lista')
      else void buscar(juego.nombre, base, true)
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juego.id])

  // `base`: la lista sobre la que se cambia (al añadir un código, la que ya lo lleva)
  const cambiar = async (i: number, activo: boolean, base: TrucosJuego = datos) => {
    if (ocupado) return
    if (activo) {
      let visto = false
      try {
        visto = localStorage.getItem(CLAVE_AVISO) === '1'
      } catch {
        // sin almacenamiento: se avisa cada vez
      }
      if (!visto) {
        const ok = await confirmar({
          titulo: '¿Poner el truco?',
          mensaje: 'Algunos trucos cuelgan el juego o estropean la partida guardada si se dejan puestos. Guarda un estado antes, por si acaso.',
          aceptar: 'Poner el truco',
        })
        if (!ok) return
        try {
          localStorage.setItem(CLAVE_AVISO, '1')
        } catch {
          // sin almacenamiento
        }
      }
    }
    setOcupado(true)
    try {
      const trucos = base.trucos.map((t, k) => (k === i ? { ...t, activo } : t))
      const { fuera } = await alPoner(trucos)
      if (activo && fuera.includes(trucos[i])) {
        avisar('Ese código es demasiado largo para esta consola')
        await alPoner(base.trucos)
        return
      }
      await guardar({ ...base, trucos })
    } finally {
      setOcupado(false)
    }
  }

  const anadir = async () => {
    if (!nuevo) return
    const codigo = limpiarCodigo(nuevo.codigo)
    if (!codigo) return
    const truco: Truco = { nombre: nuevo.nombre.trim() || 'Mi código', codigo, activo: false, propio: true }
    const d = { ...datos, trucos: [truco, ...datos.trucos] }
    await guardar(d)
    setNuevo(null)
    if (fase !== 'lista') setFase('lista')
    registrar('info', 'Código propio añadido')
    await cambiar(0, true, d).catch(() => undefined)
  }

  const quitar = async (i: number) => {
    const antes = datos
    const t = datos.trucos[i]
    const trucos = datos.trucos.filter((_, k) => k !== i)
    if (t.activo) await alPoner(trucos)
    await guardar({ ...datos, trucos })
    avisar('Código quitado', {
      fn: async () => {
        await guardar(antes)
        if (t.activo) await alPoner(antes.trucos)
      },
    })
  }

  // Los puestos, arriba; el resto, filtrado por el texto, sin pintar más de la cuenta
  const { puestos, visibles, coinciden } = useMemo(() => {
    const todos = datos.trucos.map((t, i) => ({ t, i }))
    const palabras = normalizar(filtro).split(/\s+/).filter(Boolean)
    const encajan = todos.filter(({ t }) => !t.activo && palabras.every((p) => normalizar(`${t.nombre} ${t.codigo}`).includes(p)))
    return { puestos: todos.filter(({ t }) => t.activo), visibles: encajan.slice(0, MAX_VISIBLES), coinciden: encajan.length }
  }, [datos.trucos, filtro])

  const fila = ({ t, i }: { t: Truco; i: number }, primera: boolean) => (
    <div key={i}>
      {!primera && <div className="separador" />}
      <div className="fila">
        <div className="min-w-0 flex-1">
          <p className="truncate">{t.nombre}</p>
          <p className="truncate font-mono text-[12px] text-zinc-500">{t.codigo}</p>
        </div>
        {t.propio && (
          <button className="boton-icono" aria-label={`Quitar el código «${t.nombre}»`} onClick={() => void quitar(i)}>
            <X size={18} />
          </button>
        )}
        <Interruptor etiqueta={t.nombre} activo={t.activo} desactivado={ocupado} alCambiar={(v) => void cambiar(i, v)} />
      </div>
    </div>
  )

  return (
    <div data-testid="trucos">
      {(fase === 'cargando' || fase === 'buscando') && <p className="py-6 text-center text-[15px] text-zinc-400">Buscando trucos…</p>}

      {fase === 'sin-conexion' && (
        <div className="mb-4">
          <p className="pie-grupo mb-2">No se han podido buscar los trucos: hace falta conexión. Puedes escribir tus códigos igualmente.</p>
          <button className="boton-texto w-full py-2" onClick={() => void buscar(consulta, datos, true)}>
            Volver a intentarlo
          </button>
        </div>
      )}

      {fase === 'elegir' && (
        <div className="mb-4">
          <p className="pie-grupo mb-2">{candidatos.length ? 'No está claro cuál es este juego. Elige su fichero de trucos o busca con otro nombre.' : 'No se han encontrado trucos con ese nombre. Prueba con otro.'}</p>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void buscar(consulta, datos, false)
            }}
          >
            <input className={campo} value={consulta} onChange={(e) => setConsulta(e.target.value)} aria-label="Nombre del juego para buscar trucos" />
            <button type="submit" className="boton-icono" aria-label="Buscar trucos">
              <Search size={20} />
            </button>
          </form>
          {candidatos.length > 0 && (
            <div className="lista">
              {candidatos.map((c, k) => (
                <div key={`${c.carpeta}/${c.nombre}`}>
                  {k > 0 && <div className="separador" />}
                  <button className="fila text-left" onClick={() => void usarFichero(c, datos)}>
                    {nombreVisible(c.nombre)}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className="boton-texto mt-2 w-full py-2"
            onClick={() => {
              void guardar({ ...datos, origen: datos.origen ?? '' })
              setFase('lista')
            }}
          >
            Ninguno: solo mis códigos
          </button>
        </div>
      )}

      {fase === 'lista' && (
        <>
          <p className="pie-grupo mb-2">
            {datos.origen ? `De «${datos.origen}». ` : ''}
            <button
              className="text-acento dark:text-acento-oscuro"
              onClick={() => {
                setConsulta(juego.nombre)
                void buscar(juego.nombre, datos, false)
              }}
            >
              {datos.origen ? 'Cambiar' : 'Buscar trucos'}
            </button>
          </p>
          {datos.trucos.length > 12 && (
            <input className={`${campo} mb-3`} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={`Buscar entre ${datos.trucos.length} trucos`} aria-label="Buscar entre los trucos" />
          )}
          {puestos.length > 0 && (
            <>
              <p className="cabecera-grupo">Puestos</p>
              <div className="lista mb-4">{puestos.map((x, k) => fila(x, k === 0))}</div>
            </>
          )}
          {visibles.length > 0 && (
            <>
              <p className="cabecera-grupo">{puestos.length ? 'El resto' : 'Trucos'}</p>
              <div className="lista">{visibles.map((x, k) => fila(x, k === 0))}</div>
            </>
          )}
          {coinciden > MAX_VISIBLES && <p className="pie-grupo">Y {coinciden - MAX_VISIBLES} más: escribe arriba para encontrarlos.</p>}
          {!datos.trucos.length && <p className="pie-grupo">Sin trucos todavía. Puedes escribir los tuyos.</p>}
        </>
      )}

      {fase !== 'cargando' && fase !== 'buscando' && (
        <div className="mt-4">
          {nuevo ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void anadir()
              }}
            >
              <input className={campo} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre (opcional)" aria-label="Nombre del código" />
              <textarea
                className={`${campo} resize-none font-mono`}
                rows={3}
                value={nuevo.codigo}
                onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
                placeholder="Código: Game Genie, Action Replay, GameShark…"
                aria-label="Código del truco"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <button type="button" className="boton-texto flex-1 py-2" onClick={() => setNuevo(null)}>
                  Cancelar
                </button>
                <button type="submit" className="boton-lleno flex-1" disabled={!limpiarCodigo(nuevo.codigo)}>
                  Añadir y poner
                </button>
              </div>
            </form>
          ) : (
            <button className="boton-texto flex w-full items-center justify-center gap-2 py-2" onClick={() => setNuevo({ nombre: '', codigo: '' })}>
              <Plus size={18} /> Escribir un código
            </button>
          )}
        </div>
      )}

      <p className="pie-grupo mt-3">Los trucos vienen del archivo libre de libretro (CC BY-SA 4.0), en inglés y tal como están. Si uno no hace nada, puede ser de otra versión del juego.</p>
      <button className="boton-texto mt-2 w-full py-2" onClick={alVolver}>
        Volver al menú
      </button>
    </div>
  )
}
