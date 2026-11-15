/**
 * Ajustes, en el orden de la guía de usabilidad (apartado 16): opciones de la app, datos, copias de
 * seguridad, registro, aspecto y versión. Es una pantalla apilada: «‹ Juegos» o deslizar desde el
 * borde izquierdo para volver.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVolverDeslizando } from '../componentes/gestos'
import { SelectorTema } from '../componentes/SelectorTema'
import { AjustesMando } from '../componentes/AjustesMando'
import { AjustesPantalla } from '../componentes/AjustesPantalla'
import { SISTEMAS, type Sistema } from '../lib/sistemas'
import { temaPara } from '../lib/temas'
import { Hoja, Interruptor, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { aplicarTema, cambiarAjustes, useAjustes, type Ajustes as TipoAjustes } from '../lib/ajustes'
import { espacioUsado, listarJuegos, listarPartidas, pedirPersistencia, sustituirPartidas } from '../lib/almacen'
import { ErrorArchivo, exportarCopia, importarArchivo } from '../lib/copias'
import { cuando, plural, tamano } from '../lib/formato'
import { borrarRegistro, copiarTexto, leerRegistro, registrar, suscribirRegistro, textoRegistro } from '../lib/registro'
import { buscarCaratulasPendientes } from '../lib/caratulasAuto'
import { borrarCopia, borrarTodasLasCopias, crearCopia, listarCopias, restaurarCopia, type MetaCopia } from '../lib/seguridad'
import { APP_VERSION, cargarNovedades, type Novedad } from '../lib/version'

function useRegistro() {
  const [n, setN] = useState(leerRegistro().length)
  useEffect(() => suscribirRegistro(() => setN(leerRegistro().length)), [])
  return n
}

const MOTIVOS: Record<MetaCopia['motivo'], string> = { diaria: 'Diaria', manual: 'Manual', previa: 'Antes de recuperar' }

export function Ajustes({ alVolver }: { alVolver: () => void }) {
  const a = useAjustes()
  const { avisar, confirmar } = useInterfaz()
  const pantalla = useRef<HTMLDivElement>(null)
  const [conEstados, setConEstados] = useState(true)
  const [espacio, setEspacio] = useState<{ usado: number; cuota: number } | null>(null)
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const [copias, setCopias] = useState<MetaCopia[] | null>(null)
  const [copiaElegida, setCopiaElegida] = useState<MetaCopia | null>(null)
  const [verRegistro, setVerRegistro] = useState(false)
  const [novedades, setNovedades] = useState<Novedad[] | null>(null)
  const [temaDe, setTemaDe] = useState<Sistema | null>(null)
  const [buscandoCaratulas, setBuscandoCaratulas] = useState(false)
  const entradas = useRegistro()
  const selector = useRef<HTMLInputElement>(null)

  useVolverDeslizando(pantalla, alVolver)

  const recargarCopias = useCallback(() => void listarCopias().then(setCopias, () => setCopias([])), [])

  useEffect(() => {
    void espacioUsado().then(setEspacio)
    void navigator.storage?.persisted?.().then(setPersistente, () => setPersistente(null))
    recargarCopias()
  }, [recargarCopias])

  const cambiar = (c: Partial<TipoAjustes>) => {
    cambiarAjustes(c)
    if (c.tema) aplicarTema(c.tema)
  }

  /* ---- Carátulas ---- */

  const buscarFaltan = async () => {
    setBuscandoCaratulas(true)
    try {
      const r = await buscarCaratulasPendientes(true)
      const partes: string[] = []
      if (r.puestas) partes.push(plural(r.puestas, 'carátula puesta', 'carátulas puestas'))
      if (r.sinCoincidencia) partes.push(`${r.sinCoincidencia} sin coincidencia segura`)
      if (r.fallidas) partes.push(`${r.fallidas} sin conexión`)
      avisar(partes.length ? partes.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'No falta ninguna carátula')
    } finally {
      setBuscandoCaratulas(false)
    }
  }

  /* ---- Datos ---- */

  const exportar = async () => {
    try {
      const r = await exportarCopia(conEstados, APP_VERSION)
      if (r.resultado === 'vacia') avisar('Aún no hay partidas que copiar')
      else if (r.resultado !== 'cancelado') avisar(`Copia lista: ${plural(r.partidas, 'partida', 'partidas')}${r.estados ? ` y ${plural(r.estados, 'estado', 'estados')}` : ''}`)
    } catch (e) {
      registrar('error', 'No se pudo exportar la copia', (e as Error).message)
      avisar('No se ha podido crear la copia')
    }
  }

  const alElegirCopia = async (f: File | undefined) => {
    if (selector.current) selector.current.value = ''
    if (!f) return
    let texto: string
    try {
      texto = await f.text()
    } catch {
      avisar('No se ha podido leer el archivo')
      return
    }
    try {
      const antes = await listarPartidas()
      await crearCopia('previa')
      const r = await importarArchivo(texto)
      registrar('info', 'Copia de partidas recuperada', r)
      recargarCopias()
      avisar(`Recuperadas ${plural(r.partidas, 'partida', 'partidas')}${r.estados ? ` y ${plural(r.estados, 'estado', 'estados')}` : ''}`, {
        fn: () => void sustituirPartidas(antes).then(() => registrar('info', 'Recuperar copia deshecho')),
      })
    } catch (e) {
      registrar('aviso', 'Copia de partidas no válida', (e as Error).message)
      avisar(e instanceof ErrorArchivo ? e.message : 'No se ha podido leer la copia')
    }
  }

  /* ---- Copias de seguridad ---- */

  const crearAhora = async () => {
    try {
      const m = await crearCopia('manual')
      recargarCopias()
      avisar(`Copia creada: ${plural(m.partidas, 'partida', 'partidas')}`)
    } catch {
      avisar('No se ha podido crear la copia')
    }
  }

  const restaurar = async (c: MetaCopia) => {
    setCopiaElegida(null)
    const ok = await confirmar({
      titulo: `¿Restaurar la copia ${cuando(c.creada)}?`,
      mensaje: `Las partidas guardadas de este iPhone se sustituyen por las ${plural(c.partidas, 'partida', 'partidas')} de la copia. Podrás deshacerlo durante unos segundos.`,
      aceptar: 'Restaurar',
    })
    if (!ok) return
    try {
      const { antes } = await restaurarCopia(c.fecha)
      recargarCopias()
      avisar('Copia restaurada', { fn: () => void sustituirPartidas(antes).then(() => registrar('info', 'Restaurar copia deshecho')) })
    } catch (e) {
      avisar((e as Error).message || 'No se ha podido restaurar')
    }
  }

  const borrarUna = async (c: MetaCopia) => {
    setCopiaElegida(null)
    const ok = await confirmar({
      titulo: '¿Borrar esta copia?',
      mensaje: `La copia ${cuando(c.creada)} (${plural(c.partidas, 'partida', 'partidas')}) se borrará de este iPhone. No se puede deshacer.`,
      aceptar: 'Borrar',
      destructivo: true,
    })
    if (!ok) return
    await borrarCopia(c.fecha)
    recargarCopias()
  }

  const borrarTodas = async () => {
    const ok = await confirmar({
      titulo: '¿Borrar todas las copias?',
      mensaje: `Las ${plural(copias?.length ?? 0, 'copia', 'copias')} de seguridad se borrarán de este iPhone. Las partidas no se tocan. No se puede deshacer.`,
      aceptar: 'Borrar todas',
      destructivo: true,
    })
    if (!ok) return
    await borrarTodasLasCopias()
    recargarCopias()
  }

  /* ---- Registro ---- */

  const recuentos = async () => {
    const [j, p] = await Promise.all([listarJuegos(), listarPartidas()])
    return `juegos ${j.length}, partidas ${p.length}`
  }

  const copiarRegistro = async () => {
    const ok = await copiarTexto(textoRegistro(await recuentos()))
    avisar(ok ? 'Registro copiado' : 'No se ha podido copiar')
  }

  const compartirRegistro = async () => {
    try {
      await navigator.share({ text: textoRegistro(await recuentos()) })
    } catch {
      // cancelado
    }
  }

  const borrarElRegistro = async () => {
    const ok = await confirmar({
      titulo: '¿Borrar el registro?',
      mensaje: `Las ${plural(entradas, 'entrada', 'entradas')} del registro de este iPhone se borrarán. Podrás deshacerlo durante unos segundos.`,
      aceptar: 'Borrar',
      destructivo: true,
    })
    if (!ok) return
    const deshacer = borrarRegistro()
    setVerRegistro(false)
    avisar('Registro borrado', { fn: deshacer })
  }

  const proteger = async () => {
    const ok = await pedirPersistencia()
    setPersistente(ok)
    registrar('info', 'Persistencia pedida', { concedida: ok })
    avisar(ok ? 'Datos protegidos' : 'Safari no lo ha permitido. Instala la app en la pantalla de inicio')
  }

  const abrirNovedades = async () => {
    const lista = await cargarNovedades()
    if (!lista) avisar('Sin conexión: no se pueden ver las novedades')
    else setNovedades(lista)
  }

  return (
    <div ref={pantalla} className="min-h-dvh bg-[#F2F2F7] dark:bg-black">
      <div className="mx-auto max-w-lg px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
        <div className="sticky top-0 z-10 -mx-4 mb-3 grid h-11 grid-cols-[1fr_auto_1fr] items-center bg-[#F2F2F7]/85 px-2 backdrop-blur-xl dark:bg-black/85">
          <button className="boton-texto flex items-center justify-self-start" onClick={alVolver}>
            <ChevronLeft size={26} /> Consolas
          </button>
          <h1 className="text-[17px] font-semibold">Ajustes</h1>
        </div>

        <p className="cabecera-grupo">Sonido</p>
        <div className="lista">
          <div className="fila justify-between">
            <span>Sonido</span>
            <Interruptor etiqueta="Sonido" activo={a.sonido} alCambiar={(v) => cambiar({ sonido: v })} />
          </div>
          <div className="separador" />
          <div className="fila justify-between">
            <span>Sonar con el iPhone en silencio</span>
            <Interruptor etiqueta="Sonar con el iPhone en silencio" activo={a.sonarEnSilencio} alCambiar={(v) => cambiar({ sonarEnSilencio: v })} />
          </div>
        </div>
        <p className="pie-grupo">Si está desactivado, el juego no suena con el interruptor de silencio puesto, como el resto de juegos del iPhone.</p>

        <p className="cabecera-grupo mt-6">Pantalla</p>
        <AjustesPantalla />
        <div className="lista mt-3">
          <div className="fila flex-col items-stretch gap-2 py-3">
            <span>Modo noche</span>
            <Segmentado
              etiqueta="Intensidad del modo noche"
              valor={a.intensidadNoche}
              opciones={[
                ['suave', 'Suave'],
                ['media', 'Media'],
                ['fuerte', 'Muy oscuro'],
              ]}
              alCambiar={(v) => cambiar({ intensidadNoche: v })}
            />
          </div>
        </div>
        <p className="pie-grupo">El modo noche se enciende en el menú de cada partida. Oscurece la pantalla más que el brillo mínimo del iPhone, la vuelve más cálida y quita la vibración.</p>

        <p className="cabecera-grupo mt-6">Mando</p>
        <div className="lista mb-3">
          <div className="fila justify-between">
            <span>Vibrar al pulsar</span>
            <Interruptor etiqueta="Vibrar al pulsar" activo={a.vibracion} alCambiar={(v) => cambiar({ vibracion: v })} />
          </div>
        </div>
        <AjustesMando />
        <p className="pie-grupo">También funcionan un teclado y los mandos de PlayStation, Xbox o MFi conectados al iPhone.</p>

        <p className="cabecera-grupo mt-6">Carátulas</p>
        <div className="lista">
          <div className="fila justify-between">
            <span>Poner la carátula al añadir un juego</span>
            <Interruptor etiqueta="Poner la carátula al añadir un juego" activo={a.caratulasAuto} alCambiar={(v) => cambiar({ caratulasAuto: v })} />
          </div>
          <div className="separador" />
          <button className="fila text-acento disabled:opacity-40 dark:text-acento-oscuro" disabled={buscandoCaratulas} onClick={() => void buscarFaltan()}>
            {buscandoCaratulas ? 'Buscando…' : 'Buscar ahora las que faltan'}
          </button>
        </div>
        <p className="pie-grupo">La app busca la carátula en el archivo de libretro la primera vez y solo la pone si el nombre coincide con seguridad; si no, la eliges tú desde el juego. Se descarga la imagen elegida; nada más sale del iPhone.</p>

        <p className="cabecera-grupo mt-6">Temas del juego</p>
        <div className="lista">
          {(Object.keys(SISTEMAS) as Sistema[]).map((s, i) => (
            <div key={s}>
              {i > 0 && <div className="separador" />}
              <button className="fila" onClick={() => setTemaDe(s)}>
                <span className="flex-1">{SISTEMAS[s].nombre}</span>
                <span className="text-zinc-500">{(a.temas[s] ?? 'auto') === 'auto' ? `Según la consola` : temaPara(s, a.temas[s]).nombre}</span>
                <ChevronRight size={18} className="text-zinc-400" />
              </button>
            </div>
          ))}
        </div>
        <p className="pie-grupo">Fondo, marco de la pantalla y botones mientras juegas. También se cambia desde el menú del juego.</p>

        <p className="cabecera-grupo mt-6">Datos</p>
        <div className="lista">
          <div className="fila justify-between">
            <span>Incluir los estados guardados</span>
            <Interruptor etiqueta="Incluir los estados guardados" activo={conEstados} alCambiar={setConEstados} />
          </div>
          <div className="separador" />
          <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void exportar()}>
            Guardar las partidas en Archivos
          </button>
          <div className="separador" />
          <button className="fila text-acento dark:text-acento-oscuro" onClick={() => selector.current?.click()}>
            Recuperar partidas desde Archivos
          </button>
        </div>
        <p className="pie-grupo">Sirve para no perder las partidas si borras la app o para pasarlas a otro iPhone. No lleva los juegos. Recuperar sustituye la partida de los juegos que vienen en el archivo; el resto no cambia.</p>
        <input ref={selector} type="file" className="hidden" data-testid="selector-copia" onChange={(e) => void alElegirCopia(e.target.files?.[0])} />

        <p className="cabecera-grupo mt-6">Copias de seguridad</p>
        <div className="lista" data-testid="copias">
          {copias && copias.length === 0 && <p className="fila text-zinc-500">Todavía ninguna</p>}
          {copias?.map((c, i) => (
            <div key={c.fecha}>
              {i > 0 && <div className="separador" />}
              <button className="fila" onClick={() => setCopiaElegida(c)}>
                <span className="min-w-0 flex-1">
                  <span className="block">{cuando(c.creada)}</span>
                  <span className="block text-[13px] text-zinc-500">
                    {MOTIVOS[c.motivo]}, {plural(c.partidas, 'partida', 'partidas')}
                  </span>
                </span>
                <ChevronRight size={18} className="text-zinc-400" />
              </button>
            </div>
          ))}
          <div className="separador" />
          <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void crearAhora()}>
            Crear copia ahora
          </button>
          {!!copias?.length && (
            <>
              <div className="separador" />
              <button className="fila text-red-600 dark:text-red-500" onClick={() => void borrarTodas()}>
                Borrar todas las copias
              </button>
            </>
          )}
        </div>
        <p className="pie-grupo">Una copia de las partidas al día, en este iPhone, y otra antes de recuperar o restaurar. Se guardan las 7 más recientes.</p>

        <p className="cabecera-grupo mt-6">Registro</p>
        <div className="lista">
          <button className="fila" onClick={() => setVerRegistro(true)}>
            <span className="flex-1 text-acento dark:text-acento-oscuro">Ver registro</span>
            <span className="text-zinc-500">{entradas}</span>
            <ChevronRight size={18} className="text-zinc-400" />
          </button>
          <div className="separador" />
          <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void copiarRegistro()}>
            Copiar registro
          </button>
          {entradas > 0 && (
            <>
              <div className="separador" />
              <button className="fila text-red-600 dark:text-red-500" onClick={() => void borrarElRegistro()}>
                Borrar registro
              </button>
            </>
          )}
        </div>
        <p className="pie-grupo">Si algo falla, copia el registro y pégalo en el chat. No lleva nombres de juegos ni partidas.</p>

        <p className="cabecera-grupo mt-6">Aspecto</p>
        <div className="lista">
          <div className="fila flex-col items-stretch gap-2 py-3">
            <span>Tema</span>
            <Segmentado
              etiqueta="Tema"
              valor={a.tema}
              opciones={[
                ['auto', 'Automático'],
                ['claro', 'Claro'],
                ['oscuro', 'Oscuro'],
              ]}
              alCambiar={(v) => cambiar({ tema: v })}
            />
          </div>
        </div>

        <p className="cabecera-grupo mt-6">Almacenamiento</p>
        <div className="lista">
          <div className="fila justify-between">
            <span>Espacio usado</span>
            <span className="text-zinc-500">{espacio ? tamano(espacio.usado) : 'No disponible'}</span>
          </div>
          <div className="separador" />
          <div className="fila justify-between">
            <span>Datos protegidos</span>
            {persistente ? (
              <span className="text-zinc-500">Sí</span>
            ) : (
              <button className="boton-texto" onClick={() => void proteger()}>
                Proteger
              </button>
            )}
          </div>
        </div>
        <p className="pie-grupo">Instala la app en la pantalla de inicio (Compartir, Añadir a pantalla de inicio): así Safari no borra los datos aunque pases semanas sin jugar.</p>

        <p className="cabecera-grupo mt-6">Versión</p>
        <div className="lista">
          <div className="fila justify-between">
            <span>Versión</span>
            <span className="text-zinc-500">{APP_VERSION}</span>
          </div>
          <div className="separador" />
          <button className="fila" onClick={() => void abrirNovedades()}>
            <span className="flex-1 text-acento dark:text-acento-oscuro">Novedades</span>
            <ChevronRight size={18} className="text-zinc-400" />
          </button>
          <div className="separador" />
          <a className="fila justify-between" href="https://github.com/mgba-emu/mgba" target="_blank" rel="noreferrer">
            <span>Núcleo de Game Boy y GBA</span>
            <span className="text-zinc-500">mGBA (MPL 2.0)</span>
          </a>
          <div className="separador" />
          <a className="fila justify-between" href="https://github.com/snes9xgit/snes9x" target="_blank" rel="noreferrer">
            <span>Núcleo de Super Nintendo</span>
            <span className="text-zinc-500">Snes9x (no comercial)</span>
          </a>
          <div className="separador" />
          <a className="fila justify-between" href="https://github.com/libretro-thumbnails/libretro-thumbnails" target="_blank" rel="noreferrer">
            <span>Carátulas</span>
            <span className="text-zinc-500">libretro-thumbnails</span>
          </a>
        </div>
        <p className="pie-grupo">La app no incluye juegos ni BIOS. Usa copias de tus propios cartuchos.</p>
      </div>

      <SelectorTema sistema={temaDe} alCerrar={() => setTemaDe(null)} />

      <Hoja abierta={!!copiaElegida} alCerrar={() => setCopiaElegida(null)} titulo={copiaElegida ? `Copia ${cuando(copiaElegida.creada)}` : undefined}>
        {copiaElegida && (
          <div className="lista">
            <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void restaurar(copiaElegida)}>
              Restaurar esta copia
            </button>
            <div className="separador" />
            <button className="fila text-red-600 dark:text-red-500" onClick={() => void borrarUna(copiaElegida)}>
              Borrar esta copia
            </button>
          </div>
        )}
      </Hoja>

      <Hoja abierta={verRegistro} alCerrar={() => setVerRegistro(false)} titulo={`Registro (${entradas})`}>
        <textarea
          readOnly
          value={verRegistro ? textoRegistro() : ''}
          className="h-[50dvh] w-full resize-none rounded-xl bg-white p-3 font-mono text-[12px] leading-snug dark:bg-zinc-900"
          style={{ fontSize: 12 }}
          aria-label="Registro"
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className="boton-lleno text-[15px]" onClick={() => void copiarRegistro()}>
            Copiar
          </button>
          <button className="boton-lleno text-[15px]" disabled={typeof navigator.share !== 'function'} onClick={() => void compartirRegistro()}>
            Compartir
          </button>
          <button className="boton-lleno bg-red-600 text-[15px] dark:bg-red-600" disabled={!entradas} onClick={() => void borrarElRegistro()}>
            Borrar
          </button>
        </div>
      </Hoja>

      <Hoja abierta={!!novedades} alCerrar={() => setNovedades(null)} titulo="Novedades">
        {novedades?.map((n) => (
          <div key={n.version} className="mb-4">
            <p className="cabecera-grupo">
              Versión {n.version}, {n.fecha}
              {n.version === APP_VERSION ? ' (instalada)' : ''}
            </p>
            <ul className="lista list-none px-4 py-2 text-[15px]">
              {n.cambios.map((c) => (
                <li key={c} className="py-1">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Hoja>
    </div>
  )
}
