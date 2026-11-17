/**
 * Ajustes, en el orden de la guía de usabilidad (apartado 16): opciones de la app, datos, copias de
 * seguridad, registro, aspecto y versión. Es una pantalla apilada: «‹ Juegos» o deslizar desde el
 * borde izquierdo para volver.
 */
import { ArchiveRestore, ChevronLeft, ChevronRight, Disc, FolderOpen, Gamepad2, HardDrive, Image as ImageIcon, Info, Monitor, Moon, Palette, ScrollText, SunMoon, Volume2, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useVolverDeslizando } from '../componentes/gestos'
import { SelectorTema } from '../componentes/SelectorTema'
import { AjustesMando } from '../componentes/AjustesMando'
import { AjustesPantalla } from '../componentes/AjustesPantalla'
import { SISTEMAS, type Sistema } from '../lib/sistemas'
import { temaPara } from '../lib/temas'
import { Hoja, Interruptor, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { aplicarTema, cambiarAjustes, useAjustes, type Ajustes as TipoAjustes } from '../lib/ajustes'
import { problemaBiosPsx } from '../lib/bios'
import { quitarDeLaBiblioteca } from '../lib/biblioteca'
import { guardadoSinJuego, ocupacionPorJuego, type OcupacionJuego } from '../lib/ocupacion'
import { borrarEstadosDe, espacioUsado, guardarBiosPsx, listarJuegos, ocupacionGuardada, restaurarEstados, listarPartidas, pedirPersistencia, sustituirPartidas } from '../lib/almacen'
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

/** Apartados de Ajustes (v0.25.0): una lista corta, como en los Ajustes del iPhone, y una pantalla por apartado. */
type Apartado = 'sonido' | 'pantalla' | 'mando' | 'cama' | 'temas' | 'caratulas' | 'bios' | 'partidas' | 'copias' | 'almacenamiento' | 'aspecto' | 'registro' | 'acerca'

/** Consolas, núcleo, licencia y código fuente. */
const NUCLEOS: [string, string, string, string][] = [
  ['Game Boy, Game Boy Color y Game Boy Advance', 'mGBA', 'MPL 2.0', 'https://github.com/libretro/mgba'],
  ['NES', 'FCEUmm', 'GPLv2', 'https://github.com/libretro/libretro-fceumm'],
  ['Super Nintendo', 'Snes9x', 'No comercial', 'https://github.com/libretro/snes9x'],
  ['Nintendo DS', 'melonDS', 'GPLv3', 'https://github.com/libretro/melonDS'],
  ['Mega Drive, Master System y Game Gear', 'Genesis Plus GX', 'No comercial', 'https://github.com/libretro/Genesis-Plus-GX'],
]

/**
 * Pantalla de un apartado, encima de la lista (que se queda montada debajo y conserva su posición):
 * entra desde la derecha y vuelve con «‹ Ajustes» o deslizando desde el borde, con la lista detrás.
 */
function PaginaApartado({ saliendo, alVolverDeslizando, fondo, children }: { saliendo: boolean; alVolverDeslizando: () => void; fondo: () => HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const mover = useCallback(() => ref.current, [])
  useVolverDeslizando(ref, alVolverDeslizando, { mover, fondo })
  return (
    <div ref={ref} className={`${saliendo ? 'apartado-sale' : 'apartado-entra'} fixed inset-0 z-20 overflow-y-auto overscroll-contain bg-[#F2F2F7] dark:bg-black`}>
      <div className="mx-auto max-w-lg px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
        {children}
      </div>
    </div>
  )
}

export function Ajustes({ alVolver }: { alVolver: () => void }) {
  const a = useAjustes()
  const { avisar, confirmar } = useInterfaz()
  const pantalla = useRef<HTMLDivElement>(null)
  const [conEstados, setConEstados] = useState(true)
  const [espacio, setEspacio] = useState<{ usado: number; cuota: number } | null>(null)
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const [copias, setCopias] = useState<MetaCopia[] | null>(null)
  const [copiaElegida, setCopiaElegida] = useState<MetaCopia | null>(null)
  // Almacenamiento por juego (v0.38.0): se calcula al abrir el apartado
  const [ocupacion, setOcupacion] = useState<{ juegos: OcupacionJuego[]; sinJuego: { juegos: number; bytes: number } } | null>(null)
  const [ocupacionElegida, setOcupacionElegida] = useState<OcupacionJuego | null>(null)
  const [verRegistro, setVerRegistro] = useState(false)
  const [novedades, setNovedades] = useState<Novedad[] | null>(null)
  const [temaDe, setTemaDe] = useState<Sistema | null>(null)
  const [buscandoCaratulas, setBuscandoCaratulas] = useState(false)
  const entradas = useRegistro()
  const selector = useRef<HTMLInputElement>(null)
  const [apartado, setApartado] = useState<Apartado | null>(null)
  // Al cerrar con «‹ Ajustes», el apartado sale hacia la derecha y la lista vuelve (500 ms)
  const [saliendo, setSaliendo] = useState(false)
  const temporizadorSalida = useRef(0)

  const abrirApartado = (ap: Apartado) => {
    window.clearTimeout(temporizadorSalida.current)
    setSaliendo(false)
    setApartado(ap)
  }

  const cerrarApartado = useCallback(() => {
    let reducir = false
    try {
      reducir = matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reducir = false
    }
    if (reducir) {
      setApartado(null)
      return
    }
    setSaliendo(true)
    temporizadorSalida.current = window.setTimeout(() => {
      setSaliendo(false)
      setApartado(null)
    }, 500)
  }, [])

  // Deslizando, el gesto ya ha hecho la animación
  const cerrarDeslizando = useCallback(() => setApartado(null), [])
  const fondoApartado = useCallback(() => pantalla.current, [])

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
      registrar('info', 'Copia de partidas recuperada', { partidas: r.partidas, estados: r.estados, sesiones: r.sesiones, notas: r.notas })
      recargarCopias()
      avisar(`Recuperadas ${plural(r.partidas, 'partida', 'partidas')}${r.estados ? ` y ${plural(r.estados, 'estado', 'estados')}` : ''}`, {
        fn: () =>
          void Promise.all([sustituirPartidas(antes), r.deshacerEstadosYNotas()]).then(() => registrar('info', 'Recuperar copia deshecho')),
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

  const calcularOcupacion = useCallback(async () => {
    const [juegos, guardado] = await Promise.all([listarJuegos(), ocupacionGuardada()])
    setOcupacion({ juegos: ocupacionPorJuego(juegos, guardado), sinJuego: guardadoSinJuego(juegos, guardado) })
  }, [])
  useEffect(() => {
    if (apartado === 'almacenamiento') void calcularOcupacion()
  }, [apartado, calcularOcupacion])

  const borrarEstadosDeJuego = async (o: OcupacionJuego) => {
    const ok = await confirmar({
      titulo: `¿Borrar los estados guardados de «${o.juego.nombre}»?`,
      mensaje: 'La partida del juego no se toca. Podrás deshacerlo durante unos segundos.',
      aceptar: 'Borrar estados',
      destructivo: true,
    })
    if (!ok) return
    setOcupacionElegida(null)
    const borrados = await borrarEstadosDe(o.juego.id)
    registrar('info', 'Estados de un juego borrados', { estados: borrados.length })
    await calcularOcupacion()
    void espacioUsado().then(setEspacio)
    avisar(plural(borrados.length, 'estado borrado', 'estados borrados'), {
      fn: async () => {
        await restaurarEstados(borrados, [])
        await calcularOcupacion()
      },
    })
  }

  const quitarJuegoDeAqui = async (o: OcupacionJuego) => {
    setOcupacionElegida(null)
    const deshacer = await quitarDeLaBiblioteca(o.juego)
    await calcularOcupacion()
    avisar('Juego quitado. La partida se conserva', {
      fn: async () => {
        await deshacer()
        await calcularOcupacion()
      },
    })
  }

  // BIOS de PlayStation (v0.37.0): opcional, solo en el iPhone
  const selectorBios = useRef<HTMLInputElement>(null)
  const alElegirBios = async (f: File | undefined) => {
    if (selectorBios.current) selectorBios.current.value = ''
    if (!f) return
    const problema = problemaBiosPsx(f.size)
    if (problema) {
      avisar(problema)
      return
    }
    await guardarBiosPsx(await f.arrayBuffer())
    cambiar({ biosPsx: { nombre: f.name, tam: f.size } })
    registrar('info', 'BIOS de PlayStation añadida')
    avisar('BIOS añadida: se usa al abrir el siguiente juego de PlayStation')
  }
  const quitarBios = async () => {
    const ok = await confirmar({ titulo: '¿Quitar la BIOS?', mensaje: 'Los juegos de PlayStation pasan a usar la BIOS libre del núcleo. Las partidas no cambian.', aceptar: 'Quitar', destructivo: true })
    if (!ok) return
    await guardarBiosPsx(null)
    cambiar({ biosPsx: undefined })
    registrar('info', 'BIOS de PlayStation quitada')
    avisar('BIOS quitada')
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

  const cabecera = (titulo: string, atras: string, alAtras: () => void) => (
    <div className="cabecera-fija sticky top-0 z-10 -mx-4 mb-3 grid grid-cols-[1fr_auto_1fr] items-center bg-[#F2F2F7]/85 px-2 backdrop-blur-xl dark:bg-black/85">
      <button className="boton-texto flex items-center justify-self-start" onClick={alAtras}>
        <ChevronLeft size={26} /> {atras}
      </button>
      <h1 className="text-[17px] font-semibold">{titulo}</h1>
    </div>
  )

  const NOMBRE_TEMA = { auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' } as const

  /** Cada apartado: título, icono, color de la baldosa y valor que se ve a la derecha en la lista. */
  const APARTADOS: Record<Apartado, { titulo: string; icono: LucideIcon; color: string; valor?: string }> = {
    sonido: { titulo: 'Sonido', icono: Volume2, color: '#FF2D55', valor: a.sonido ? 'Activado' : 'Desactivado' },
    pantalla: { titulo: 'Pantalla', icono: Monitor, color: '#007AFF' },
    mando: { titulo: 'Mando', icono: Gamepad2, color: '#34C759' },
    cama: { titulo: 'Para jugar en la cama', icono: Moon, color: '#5856D6' },
    temas: { titulo: 'Temas del juego', icono: Palette, color: '#FF9500' },
    caratulas: { titulo: 'Carátulas', icono: ImageIcon, color: '#AF52DE', valor: a.caratulasAuto ? 'Automáticas' : 'A mano' },
    bios: { titulo: 'BIOS de PlayStation', icono: Disc, color: '#8A8A93', valor: a.biosPsx ? 'Propia' : 'La libre' },
    partidas: { titulo: 'Guardar y recuperar partidas', icono: FolderOpen, color: '#007AFF' },
    copias: { titulo: 'Copias de seguridad', icono: ArchiveRestore, color: '#34C759', valor: copias ? String(copias.length) : undefined },
    almacenamiento: { titulo: 'Almacenamiento', icono: HardDrive, color: '#8E8E93', valor: espacio ? tamano(espacio.usado) : undefined },
    aspecto: { titulo: 'Aspecto', icono: SunMoon, color: '#007AFF', valor: NOMBRE_TEMA[a.tema] },
    registro: { titulo: 'Registro', icono: ScrollText, color: '#8E8E93', valor: String(entradas) },
    acerca: { titulo: 'Acerca de', icono: Info, color: '#8E8E93', valor: APP_VERSION },
  }

  const GRUPOS: Apartado[][] = [
    ['sonido', 'pantalla', 'mando', 'cama', 'temas', 'caratulas', 'bios'],
    ['partidas', 'copias', 'almacenamiento'],
    ['aspecto'],
    ['registro', 'acerca'],
  ]

  const contenido = (ap: Apartado) => {
    switch (ap) {
      case 'sonido':
        return (
          <>
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
            <p className="pie-grupo">Si está desactivado, el juego no suena con el interruptor de silencio puesto, como el resto de juegos del iPhone. El volumen del juego se cambia en el menú de cada partida.</p>
          </>
        )
      case 'pantalla':
        return (
          <>
            <AjustesPantalla />
          </>
        )
      case 'mando':
        return (
          <>
            <div className="lista mb-3">
              <div className="fila justify-between">
                <span>Vibrar al pulsar</span>
                <Interruptor etiqueta="Vibrar al pulsar" activo={a.vibracion} alCambiar={(v) => cambiar({ vibracion: v })} />
              </div>
            </div>
            <AjustesMando />
            <p className="pie-grupo">También funcionan un teclado y los mandos de PlayStation, Xbox o MFi conectados al iPhone.</p>
          </>
        )
      case 'cama':
        return (
          <>
            <div className="lista">
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
              <div className="separador" />
              <div className="fila flex-col items-stretch gap-2 py-3">
                <span>Pausar si no tocas nada</span>
                <Segmentado
                  etiqueta="Pausar si no tocas nada"
                  valor={a.pausaSinTocar}
                  opciones={[
                    [0, 'Nunca'],
                    [3, '3 min'],
                    [5, '5 min'],
                    [10, '10 min'],
                  ]}
                  alCambiar={(v) => cambiar({ pausaSinTocar: v })}
                />
              </div>
            </div>
            <p className="pie-grupo">
              El modo noche y el temporizador de sueño se encienden en el menú de cada partida. El modo noche oscurece la pantalla más que el brillo mínimo del iPhone, la vuelve más cálida y quita la vibración. Si te duermes jugando, el juego se pausa y se guarda tras los minutos elegidos sin tocar nada (el lápiz de DS también cuenta).
            </p>
          </>
        )
      case 'temas':
        return (
          <>
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
          </>
        )
      case 'caratulas':
        return (
          <>
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
          </>
        )
      case 'bios':
        return (
          <>
            <div className="lista" data-testid="bios">
              <div className="fila justify-between">
                <span>BIOS</span>
                <span className="text-zinc-500">{a.biosPsx ? `${a.biosPsx.nombre}, ${tamano(a.biosPsx.tam)}` : 'La libre del núcleo'}</span>
              </div>
              <div className="separador" />
              <button className="fila text-acento dark:text-acento-oscuro" onClick={() => selectorBios.current?.click()}>
                {a.biosPsx ? 'Cambiar por otra desde Archivos' : 'Añadir una BIOS desde Archivos'}
              </button>
              {a.biosPsx && (
                <>
                  <div className="separador" />
                  <button className="fila text-red-600 dark:text-red-500" onClick={() => void quitarBios()}>
                    Quitar la BIOS
                  </button>
                </>
              )}
            </div>
            <p className="pie-grupo">
              No hace falta: sin BIOS, los juegos usan la libre del núcleo, con la que funcionan casi todos. Con la de tu consola, algunos funcionan mejor (por ejemplo, la tarjeta de memoria desde el menú de la consola). Se guarda solo en este iPhone: no va en las copias de partidas.
            </p>
            <input ref={selectorBios} type="file" className="hidden" data-testid="selector-bios" onChange={(e) => void alElegirBios(e.target.files?.[0])} />
          </>
        )
      case 'partidas':
        return (
          <>
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
          </>
        )
      case 'copias':
        return (
          <>
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
          </>
        )
      case 'almacenamiento':
        return (
          <>
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

            <p className="cabecera-grupo mt-8">Por juego</p>
            <div className="lista" data-testid="ocupacion">
              {!ocupacion && <p className="fila text-zinc-500">Calculando…</p>}
              {ocupacion?.juegos.length === 0 && <p className="fila text-zinc-500">Ningún juego</p>}
              {ocupacion?.juegos.map((o, i) => (
                <div key={o.juego.id}>
                  {i > 0 && <div className="separador" />}
                  <button className="fila gap-3" onClick={() => setOcupacionElegida(o)} aria-label={`${o.juego.nombre}, ${SISTEMAS[o.juego.sistema].nombre}, ${tamano(o.total)}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.juego.nombre}</span>
                      <span className="block text-[13px] text-zinc-500">
                        {SISTEMAS[o.juego.sistema].nombre}
                        {o.estados ? `, ${plural(o.estados, 'estado', 'estados')}` : ''}
                      </span>
                    </span>
                    <span className="text-zinc-500">{tamano(o.total)}</span>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </button>
                </div>
              ))}
            </div>
            <p className="pie-grupo">
              Lo que ocupa cada juego: el juego, sus estados guardados y su partida.
              {ocupacion?.sinJuego.juegos
                ? ` Además, ${tamano(ocupacion.sinJuego.bytes)} de partidas y estados de ${plural(ocupacion.sinJuego.juegos, 'juego quitado', 'juegos quitados')}, que se conservan por si los vuelves a añadir.`
                : ''}
            </p>
          </>
        )
      case 'aspecto':
        return (
          <>
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
            <p className="pie-grupo">Colores de las pantallas de la app. Los del juego se eligen en Temas del juego.</p>
          </>
        )
      case 'registro':
        return (
          <>
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
          </>
        )
      case 'acerca':
        return (
          <>
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
            </div>
            <div className="lista mt-6">
              <div className="fila justify-between">
                <span>Emulación en un hilo aparte</span>
                <Interruptor etiqueta="Emulación en un hilo aparte" activo={a.emulacionEnHilo !== false} alCambiar={(v) => cambiar({ emulacionEnHilo: v })} />
              </div>
            </div>
            <p className="pie-grupo">Déjalo activado: el juego va en su propio hilo y no compite con la app. Desactívalo solo si un juego no se ve o va peor que antes; vuelve a ir como hasta la versión 0.30. Cuenta al abrir el siguiente juego.</p>
            <p className="cabecera-grupo mt-6">Núcleos de emulación</p>
            <div className="lista">
              {NUCLEOS.map(([consolas, nombre, licencia, url], i) => (
                <div key={nombre}>
                  {i > 0 && <div className="separador" />}
                  <a className="fila justify-between gap-3" href={url} target="_blank" rel="noreferrer">
                    <span className="min-w-0">
                      <span className="block">{nombre}</span>
                      <span className="block text-[13px] text-zinc-500">{consolas}</span>
                    </span>
                    <span className="shrink-0 text-zinc-500">{licencia}</span>
                  </a>
                </div>
              ))}
              <div className="separador" />
              <a className="fila justify-between" href="https://github.com/libretro-thumbnails/libretro-thumbnails" target="_blank" rel="noreferrer">
                <span>Carátulas</span>
                <span className="text-zinc-500">libretro-thumbnails</span>
              </a>
            </div>
            <p className="pie-grupo">La app no incluye juegos ni BIOS. Usa copias de tus propios cartuchos.</p>
          </>
        )
    }
  }

  return (
    <>
        <div ref={pantalla} className={`lista-ajustes min-h-dvh bg-[#F2F2F7] dark:bg-black ${saliendo ? 'apartado-vuelve' : apartado ? 'oculto-detras' : ''}`}>
          <div className="mx-auto max-w-lg px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
            {cabecera('Ajustes', 'Consolas', alVolver)}
            {GRUPOS.map((grupo, g) => (
              <div key={g} className={`lista ${g > 0 ? 'mt-8' : ''}`}>
                {grupo.map((ap, i) => {
                  const { titulo, icono: Icono, color, valor } = APARTADOS[ap]
                  return (
                    <div key={ap}>
                      {i > 0 && <div className="separador ml-[52px]" />}
                      <button className="fila gap-3" onClick={() => abrirApartado(ap)}>
                        <span className="grid size-[29px] shrink-0 place-items-center rounded-[7px] text-white" style={{ background: color }} aria-hidden>
                          <Icono size={18} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{titulo}</span>
                        {valor && <span className="shrink-0 text-zinc-500">{valor}</span>}
                        <ChevronRight size={18} className="shrink-0 text-zinc-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      {apartado && (
        <PaginaApartado key={apartado} saliendo={saliendo} alVolverDeslizando={cerrarDeslizando} fondo={fondoApartado}>
          {cabecera(APARTADOS[apartado].titulo, 'Ajustes', cerrarApartado)}
          {contenido(apartado)}
        </PaginaApartado>
      )}
      <input ref={selector} type="file" className="hidden" data-testid="selector-copia" onChange={(e) => void alElegirCopia(e.target.files?.[0])} />

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

      <Hoja abierta={!!ocupacionElegida} alCerrar={() => setOcupacionElegida(null)} titulo={ocupacionElegida?.juego.nombre}>
        {ocupacionElegida && (
          <>
            <div className="lista" data-testid="ocupacion-juego">
              <div className="fila justify-between">
                <span>{ocupacionElegida.juego.disco ? 'Disco' : 'Juego'}</span>
                <span className="text-zinc-500">{tamano(ocupacionElegida.bytesJuego)}</span>
              </div>
              <div className="separador" />
              <div className="fila justify-between">
                <span>Estados guardados</span>
                <span className="text-zinc-500">{ocupacionElegida.estados ? `${plural(ocupacionElegida.estados, 'estado', 'estados')}, ${tamano(ocupacionElegida.bytesEstados)}` : 'Ninguno'}</span>
              </div>
              <div className="separador" />
              <div className="fila justify-between">
                <span>Partida</span>
                <span className="text-zinc-500">{ocupacionElegida.bytesPartida ? tamano(ocupacionElegida.bytesPartida) : 'Ninguna'}</span>
              </div>
            </div>
            <div className="lista mt-6">
              {ocupacionElegida.estados > 0 && (
                <>
                  <button className="fila text-red-600 dark:text-red-500" onClick={() => void borrarEstadosDeJuego(ocupacionElegida)}>
                    Borrar los estados guardados
                  </button>
                  <div className="separador" />
                </>
              )}
              <button className="fila text-red-600 dark:text-red-500" onClick={() => void quitarJuegoDeAqui(ocupacionElegida)}>
                Quitar de la biblioteca
              </button>
            </div>
            <p className="pie-grupo">Quitar el juego conserva su partida y sus estados: si lo vuelves a añadir, los encuentra.</p>
          </>
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
    </>
  )
}
