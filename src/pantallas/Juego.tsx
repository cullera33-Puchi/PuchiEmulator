/**
 * Pantalla de juego a pantalla completa, en vertical u horizontal (la distribución la decide el CSS
 * según la orientación). El menú pausa el juego; al pasar la app a segundo plano también se pausa y
 * se guarda todo.
 */
import { BedDouble, BookOpen, Check, ChevronRight, Disc, RotateCw, Wind, FastForward, Pencil, FolderOpen, Gamepad2, Menu, Monitor, Moon, NotebookPen, Palette, Play, Rewind, RotateCcw, Save, Upload, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mando } from '../componentes/Mando'
import { Hoja, Interruptor, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { bit, TECLAS } from '../emulador/botones'
import { cargaAutoFallida, MANDO_DUALSHOCK, Sesion } from '../emulador/sesion'
import { aplicarTema, cambiarAjustes, COLOR_NOCHE, leerAjustes, useAjustes } from '../lib/ajustes'
import { nombreBiosPsx } from '../lib/bios'
import { actualizarJuego, estadosDe, leerBiosPsx, leerEstado, leerJuego, leerRomGuardada, RANURAS_USUARIO, renombrarEstado, type Estado, type Ranura } from '../lib/almacen'
import { cuando } from '../lib/formato'
import { duracion } from '../lib/estadisticas'
import { registrar } from '../lib/registro'
import { SISTEMAS, type Sistema } from '../lib/sistemas'
import { nucleoPreparado } from '../emulador/nucleo'
import { preparadoEnHilo } from '../emulador/conexion'
import { paletaPara, temaPara } from '../lib/temas'
import { SelectorTema } from '../componentes/SelectorTema'
import { EditorNotas } from '../componentes/Notas'
import { AjustesMando, ESCALAS } from '../componentes/AjustesMando'
import { AjustesPantalla } from '../componentes/AjustesPantalla'
import { EditorMando } from '../componentes/EditorMando'
import { estiloPieza, type DisposicionPiezas, type Orientacion, type Pieza } from '../lib/disposicionMando'
import { bitCorrer, cambiarMandoJuego, controlesDe, extrasJrpg, mandoDe, mascaraTurbo } from '../lib/mandoJuego'
import { esLibro, type PrincipalDS } from '../emulador/pantallasDS'
import { MiniaturaDS } from '../componentes/MiniaturaDS'
import { alAbrir } from '../lib/biblioteca'
import { estadoSueno, MINUTOS_SUENO, textoRestante } from '../lib/sueno'

interface Props {
  id: string
  reanudar: boolean
  alSalir: () => void
}


export function Juego({ id, reanudar, alSalir }: Props) {
  const ajustes = useAjustes()
  const { avisar, confirmar } = useInterfaz()
  const lienzo = useRef<HTMLCanvasElement>(null)
  const zona = useRef<HTMLDivElement>(null)
  const imagen = useRef<HTMLSpanElement>(null)
  const sesion = useRef<Sesion | null>(null)
  const [nombre, setNombre] = useState('')
  const [hombros, setHombros] = useState(false)
  const [cuatro, setCuatro] = useState(false)
  const [conRebobinado, setConRebobinado] = useState(false)
  const [esTactil, setEsTactil] = useState(false)
  const [nativo, setNativo] = useState({ ancho: 240, alto: 160 })
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [menu, setMenu] = useState(false)
  const [pausaFondo, setPausaFondo] = useState(false)
  // Por qué está en pausa: al pasar a segundo plano o por no tocar nada
  const [motivoPausa, setMotivoPausa] = useState<'fondo' | 'inactividad'>('fondo')
  // Temporizador de sueño (v0.19.0): hora a la que se para y si ya se ha avisado
  const [finSueno, setFinSueno] = useState<number | null>(null)
  /** Minutos elegidos en el temporizador, para marcarlos en la hoja */
  const [minutosSueno, setMinutosSueno] = useState<number | null>(null)
  const avisadoSueno = useRef(false)
  const [hora, setHora] = useState(() => Date.now())
  const [dormir, setDormir] = useState(false)
  const [verSueno, setVerSueno] = useState(false)
  // Varios discos (PlayStation, v0.38.0): cuántos hay y cuál está puesto; se lee al abrir el menú
  const [discos, setDiscos] = useState<{ total: number; actual: number } | null>(null)
  const [verDiscos, setVerDiscos] = useState(false)

  // DS: soplar al micrófono (mientras se mantiene) y la tapa cerrada (v0.20.0)
  const [soplando, setSoplando] = useState(false)
  // Botones movibles (v0.20.0): orientación actual y, mientras se edita, el borrador
  const [orientacionIPhone, setOrientacion] = useState<Orientacion>(() => (matchMedia('(orientation: landscape)').matches ? 'horizontal' : 'vertical'))
  // Girada (v0.22.0): con el iPhone en vertical, el juego se coloca como en horizontal
  const girada = ajustes.girarPantalla !== 'no' && orientacionIPhone === 'vertical'
  const orientacion: Orientacion = girada ? 'horizontal' : orientacionIPhone
  const [borrador, setBorrador] = useState<{ orientacion: Orientacion; piezas: DisposicionPiezas } | null>(null)
  const [tapaCerrada, setTapaCerrada] = useState(false)
  const [estados, setEstados] = useState<Estado[] | null>(null)
  const [verEstados, setVerEstados] = useState(false)
  const [velocidad, setVelocidad] = useState(1)
  const [rebobinando, setRebobinando] = useState(false)
  const [hayRapido, setHayRapido] = useState(false)
  const [sistema, setSistema] = useState<Sistema>('gba')
  const [verTemas, setVerTemas] = useState(false)
  const [verMando, setVerMando] = useState(false)
  const [verPantalla, setVerPantalla] = useState(false)
  const [verNotas, setVerNotas] = useState(false)
  const tema = temaPara(sistema, ajustes.temas[sistema])
  // Mando de este juego (modo JRPG) y correr fijo
  const mando = mandoDe(ajustes.mandos, id, sistema)
  const palancasPsx = !!SISTEMAS[sistema].psx && mando.palancas
  const esMgba = SISTEMAS[sistema].nucleo === 'mgba'
  // Al activar o quitar las palancas con el juego abierto, el mando cambia en marcha (v0.38.0)
  useEffect(() => {
    void sesion.current?.ponerPalancasPsx(palancasPsx)
  }, [palancasPsx])
  // Pantalla y botones de este juego (los suyos o los generales)
  const controles = controlesDe(ajustes, id)
  // Filtro de imagen: «consola» es la rejilla en las portátiles y las líneas en la tele
  const filtro = controles.filtro === 'consola' ? (sistema === 'snes' ? 'tv' : 'lcd') : controles.filtro
  // Pantallas de DS (v0.17.0): en «libro», la columna de botones del modo una mano, en el lado libre
  const pantallas = sistema === 'nds' ? controles.pantallasDS : 'apiladas'
  const libro = esLibro(pantallas)
  const unaMano = libro || controles.modoMando === 'una-mano'
  const mano = libro ? (pantallas === 'libro-derecha' ? 'izquierda' : 'derecha') : controles.mano
  const principal: PrincipalDS = ajustes.mandos[id]?.principalDS ?? 'abajo'
  const mini = useRef<HTMLCanvasElement>(null)
  const [corriendo, setCorriendo] = useState(false)
  const turbo = mascaraTurbo(ajustes.mandos, id, sistema)
  const ajustesRef = useRef(ajustes)
  ajustesRef.current = ajustes

  // Mientras se colocan los botones, el juego no se reanuda (v0.30.0): ni al volver de segundo plano
  // ni desde el aviso del temporizador
  const editandoRef = useRef(false)
  const seguir = useCallback(() => {
    if (editandoRef.current) return
    setMenu(false)
    setVerNotas(false)
    setVerPantalla(false)
    setVerSueno(false)
    setPausaFondo(false)
    setVerEstados(false)
    void sesion.current?.jugar(ajustesRef.current.sonido, ajustesRef.current.sonarEnSilencio)
  }, [])

  // Arranque
  useEffect(() => {
    let cancelado = false
    let creada: Sesion | null = null
    ;(async () => {
      try {
        const t0 = performance.now()
        const [juego, rom, bios] = await Promise.all([leerJuego(id), leerRomGuardada(id), leerBiosPsx()])
        const msLeer = Math.round(performance.now() - t0)
        const preparado = !!juego && (preparadoEnHilo(SISTEMAS[juego.sistema].nucleo) || nucleoPreparado(SISTEMAS[juego.sistema].nucleo))
        // Los discos (PlayStation) no tienen ROM guardada: los abre el motor desde los ficheros de la app
        if (!juego || (!rom && !juego.disco)) throw new Error('El juego ya no está en la biblioteca.')
        if (cancelado) return
        setNombre(juego.nombre)
        setSistema(juego.sistema)
        setHombros(SISTEMAS[juego.sistema].hombros)
        setCuatro(SISTEMAS[juego.sistema].cuatroBotones)
        // Rebobinar, desactivado salvo que se active en los ajustes (v0.37.3)
        setConRebobinado(SISTEMAS[juego.sistema].rebobinado && ajustesRef.current.rebobinado)
        setEsTactil(SISTEMAS[juego.sistema].tactil)
        const temaJuego = temaPara(juego.sistema, ajustesRef.current.temas[juego.sistema])
        const abrir = (desdeAuto: boolean) =>
          Sesion.iniciar({
            juego,
            rom,
            // BIOS de PlayStation del usuario, si la ha añadido (v0.37.0); si no, la libre del núcleo
            sistema: juego.sistema === 'psx' && bios ? [{ nombre: nombreBiosPsx(ajustesRef.current.biosPsx?.nombre), datos: bios }] : undefined,
            lienzo: lienzo.current!,
            reanudar: desdeAuto,
            opciones: {
              mgba_gb_colors: paletaPara(temaJuego, ajustesRef.current.paletaGb),
              mgba_color_correction: controlesDe(ajustesRef.current, juego.id).coloresConsola ? 'Auto' : 'OFF',
              // Nintendo 64 (v0.34.0): resolución con la que dibuja; el lienzo del núcleo se crea a esa medida
              ...(juego.sistema === 'n64' ? { 'mupen64plus-43screensize': controlesDe(ajustesRef.current, juego.id).resolucionN64 === 'normal' ? '320x240' : '640x480' } : {}),
              // PlayStation (v0.38.0): L1, R1 y Select a la vez hacen de botón ANALOG del DualShock
              ...(juego.sistema === 'psx' ? { pcsx_rearmed_analog_combo: 'l1+r1+select' } : {}),
            },
            // Palancas analógicas de PlayStation, si el juego las tiene activadas (v0.38.0): mando DualShock
            mando: juego.sistema === 'psx' && mandoDe(ajustesRef.current.mandos, juego.id, juego.sistema).palancas ? MANDO_DUALSHOCK : undefined,
            alCambiarTamano: (ancho, alto) => setNativo({ ancho, alto }),
            alInactividad: () => {
              if (cancelado) return
              setMotivoPausa('inactividad')
              setPausaFondo(true)
            },
            alFallar: () => {
              if (!cancelado) setError('El emulador ha fallado. Lo guardado antes del fallo está a salvo: vuelve a abrir el juego.')
            },
          })
        // La última vez que se intentó seguir donde se dejó, la página se cayó: sin ese punto
        const saltarAuto = reanudar && cargaAutoFallida(juego.id)
        if (saltarAuto) {
          registrar('aviso', 'La última vez no se pudo seguir donde se dejó; se abre con la partida guardada')
          avisar('No se ha podido seguir donde lo dejaste: se abre con la partida guardada')
        }
        try {
          creada = await abrir(reanudar && !saltarAuto)
        } catch (e) {
          // Si no carga el punto donde se dejó (por ejemplo, guardado justo después de un fallo), se
          // abre con la partida guardada del juego, sin ese punto
          if (!reanudar || saltarAuto || cancelado) throw e
          registrar('aviso', 'No se pudo seguir donde se dejó; se abre con la partida guardada', (e as Error)?.message)
          creada = await abrir(false)
          avisar('No se ha podido seguir donde lo dejaste: se abre con la partida guardada')
        }
        if (cancelado) {
          void creada.cerrar()
          return
        }
        sesion.current = creada
        // Lo que ha tardado en abrirse (v0.28.0): leer la ROM, el núcleo (compilarlo si no estaba
        // preparado), cargar el juego y su partida, y el estado donde se dejó
        registrar('info', 'Juego abierto', {
          sistema: juego.sistema,
          reanudar,
          nucleoPreparado: preparado,
          // Dónde va la emulación y con qué se pinta (v0.31.0)
          hilo: creada.enHilo,
          pintor: creada.pintor,
          // Quién marca el ritmo de los fotogramas: el hilo (Nintendo 64, v0.33.0) o la pantalla
          ritmo: creada.ritmoPropio ? (creada.alPulso ? 'propio-pulso' : 'propio') : 'pantalla',
          ...(creada.pintorMs ? { pintorMs: { webgl: Math.round(creada.pintorMs.webgl * 100) / 100, '2d': Math.round(creada.pintorMs['2d'] * 100) / 100 } } : {}),
          ...(creada.motivoLocal ? { motivo: creada.motivoLocal } : {}),
          // Nintendo 64: si había lista de sombreadores de la vez anterior (v0.40.0)
          ...(creada.juego.sistema === 'n64' ? { sombreadores: creada.sombreadoresAlAbrir > 0 } : {}),
          ms: { leer: msLeer, ...creada.tiempos, total: Math.round(performance.now() - t0) },
        })
        if (creada.motivoLocal && ajustesRef.current.emulacionEnHilo !== false) registrar('aviso', 'La emulación va en el hilo principal', creada.motivoLocal)
        void actualizarJuego(alAbrir(juego))
        void leerEstado(juego.id, 'rapida').then((e) => !cancelado && setHayRapido(!!e))
        setCargando(false)
        await creada.jugar(ajustesRef.current.sonido, ajustesRef.current.sonarEnSilencio)
      } catch (e) {
        registrar('error', 'No se pudo abrir el juego', (e as Error).message)
        if (!cancelado) setError((e as Error).message || 'No se ha podido abrir el juego.')
      }
    })()
    return () => {
      cancelado = true
      sesion.current = null
      void creada?.cerrar()
    }
  }, [id, reanudar])

  // Los avisos van arriba para no tapar los botones
  useEffect(() => {
    document.body.classList.add('en-juego')
    return () => {
      document.body.classList.remove('en-juego')
      document.documentElement.style.background = ''
      document.body.style.background = ''
      aplicarTema()
    }
  }, [])

  // La barra de estado toma el color de arriba del tema; la paleta de Game Boy sigue al tema
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', tema.arriba))
    // En la app instalada, iOS deja a veces una franja abajo con el fondo de la página: del color del tema
    document.documentElement.style.background = tema.abajo
    document.body.style.background = tema.abajo
    // Solo a mGBA: en otro núcleo, una opción que no es suya le hace releer todas en mitad de la partida
    // (v0.40.0; antes el puente no la guardaba porque su lista estaba llena)
    if (esMgba) sesion.current?.opcion('mgba_gb_colors', paletaPara(tema, ajustes.paletaGb))
  }, [tema, ajustes.paletaGb, esMgba])

  useEffect(() => {
    if (esMgba) sesion.current?.opcion('mgba_color_correction', controles.coloresConsola ? 'Auto' : 'OFF')
  }, [controles.coloresConsola, esMgba])

  // Segundo plano: pausa y guardado
  useEffect(() => {
    const alOcultar = () => {
      const s = sesion.current
      if (!s) return
      if (document.visibilityState === 'hidden') {
        if (s.enMarcha) {
          setMotivoPausa('fondo')
          setPausaFondo(true)
        }
        s.pausar()
        void s.guardarTodo()
      }
    }
    const alSalirPagina = () => void sesion.current?.guardarTodo()
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', alSalirPagina)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', alSalirPagina)
    }
  }, [])

  // Teclado
  useEffect(() => {
    let m = 0
    const tecla = (abajo: boolean) => (e: KeyboardEvent) => {
      const b = TECLAS[e.code]
      if (!b) return
      // Escribiendo una nota, las teclas son para el texto
      if ((e.target as HTMLElement | null)?.closest?.('textarea, input')) return
      e.preventDefault()
      m = abajo ? m | bit(b) : m & ~bit(b)
      sesion.current?.ponerBotonesTeclado(m)
    }
    const bajar = tecla(true)
    const subir = tecla(false)
    window.addEventListener('keydown', bajar)
    window.addEventListener('keyup', subir)
    return () => {
      window.removeEventListener('keydown', bajar)
      window.removeEventListener('keyup', subir)
    }
  }, [])

  const abrirMenu = () => {
    sesion.current?.pausar()
    void sesion.current?.guardarPartidaSiCambia()
    setMenu(true)
    if (SISTEMAS[sistema].psx) void sesion.current?.discos().then(setDiscos)
  }

  const cambiarDisco = async (indice: number) => {
    setVerDiscos(false)
    const ok = await sesion.current?.cambiarDisco(indice)
    if (ok) {
      setDiscos((d) => (d ? { ...d, actual: indice } : d))
      avisar(`Disco ${indice + 1} puesto`)
    } else avisar('No se ha podido cambiar de disco')
  }

  const cargarListaEstados = async () => setEstados(await estadosDe(id))

  const abrirEstados = () => {
    setVerEstados(true)
    void cargarListaEstados()
  }

  const nombreRanura = (r: Ranura) => estadoDe(r)?.nombre ?? `Ranura ${r}`

  const guardarEn = async (r: Ranura) => {
    const ok = await sesion.current?.guardarEstado(r)
    registrar(ok ? 'info' : 'aviso', ok ? 'Estado guardado' : 'No se pudo guardar el estado', { ranura: r })
    avisar(ok ? `Guardado en «${nombreRanura(r)}»` : 'No se ha podido guardar el estado')
    await cargarListaEstados()
  }

  const cargarDe = async (r: Ranura) => {
    const ok = await sesion.current?.cargarEstado(r)
    if (ok) {
      avisar(`«${nombreRanura(r)}» cargado`)
      seguir()
    } else avisar('No se ha podido cargar el estado')
  }

  // Nombre de una ranura (v0.19.0): «Antes del jefe», «Tienda del pueblo»…
  const renombrar = async (r: Ranura) => {
    const e = estadoDe(r)
    if (!e) return
    const nombre = window.prompt('Nombre de la ranura', e.nombre ?? '')
    if (nombre === null) return
    await renombrarEstado(id, r, nombre.slice(0, 60))
    registrar('info', 'Ranura renombrada', { ranura: r })
    await cargarListaEstados()
  }

  const reiniciar = async () => {
    if (!(await confirmar({ titulo: '¿Reiniciar el juego?', mensaje: 'Se pierde lo que no hayas guardado dentro del juego.', aceptar: 'Reiniciar', destructivo: true }))) return
    sesion.current?.reiniciar()
    seguir()
  }

  const guardarRapido = async () => {
    const ok = await sesion.current?.guardarEstado('rapida')
    registrar(ok ? 'info' : 'aviso', ok ? 'Guardado rápido' : 'No se pudo hacer el guardado rápido')
    if (ok) setHayRapido(true)
    avisar(ok ? 'Guardado rápido' : 'No se ha podido guardar')
  }

  const cargarRapido = async () => {
    const s = sesion.current
    if (!s) return
    if (!(await s.cargarEstado('rapida'))) {
      avisar('Aún no hay guardado rápido')
      return
    }
    avisar('Guardado rápido cargado', { fn: () => void s.deshacerCarga() })
  }

  // Pantallas de DS: se aplican al abrir el juego y al cambiarlas
  useEffect(() => {
    if (cargando) return
    sesion.current?.ponerPantallas(pantallas, principal, pantallas === 'grande' ? mini.current : null)
  }, [pantallas, principal, cargando])

  // Temporizador de sueño: aviso a 5 minutos y, al acabar, pausa con todo guardado
  useEffect(() => {
    if (finSueno === null) return
    const mirar = () => {
      const ahora = Date.now()
      // Solo con el menú abierto, que es donde se ve (v0.30.0): si no, se redibujaba todo el juego cada
      // 5 s mientras se juega
      if (menuRef.current) setHora(ahora)
      const e = estadoSueno(finSueno, ahora, avisadoSueno.current)
      if (e.avisar) {
        avisadoSueno.current = true
        avisar('Quedan 5 minutos: busca dónde guardar')
      }
      if (e.terminado) {
        setFinSueno(null)
        sesion.current?.pausar()
        void sesion.current?.guardarTodo()
        registrar('info', 'Temporizador de sueño terminado')
        setMenu(false)
        setDormir(true)
      }
    }
    mirar()
    const t = window.setInterval(mirar, 5000)
    return () => clearInterval(t)
  }, [finSueno, avisar])

  // Al abrir el menú, el tiempo que queda, al día
  const menuRef = useRef(false)
  menuRef.current = menu
  useEffect(() => {
    if (menu) setHora(Date.now())
  }, [menu])

  const ponerSueno = (minutos: number | null) => {
    setMinutosSueno(minutos)
    setHora(Date.now())
    avisadoSueno.current = false
    setFinSueno(minutos ? Date.now() + minutos * 60_000 : null)
    setVerSueno(false)
    if (minutos) {
      registrar('info', 'Temporizador de sueño', { minutos })
      avisar(`Te avisaré 5 minutos antes de los ${minutos} minutos`)
    }
  }

  const soplar = (activo: boolean) => {
    setSoplando(activo)
    sesion.current?.ponerExtra('SOPLAR', activo)
  }

  const cambiarTapa = (cerrada: boolean) => {
    setTapaCerrada(cerrada)
    sesion.current?.ponerExtra('TAPA', cerrada)
    registrar('info', cerrada ? 'Tapa de DS cerrada' : 'Tapa de DS abierta')
  }

  useEffect(() => {
    const m = matchMedia('(orientation: landscape)')
    const cambio = () => setOrientacion(m.matches ? 'horizontal' : 'vertical')
    m.addEventListener('change', cambio)
    return () => m.removeEventListener('change', cambio)
  }, [])

  editandoRef.current = !!borrador

  // Si se gira el iPhone mientras se colocan los botones, se guarda lo hecho en la orientación de
  // antes y se sigue con la de ahora (v0.30.0): antes se guardaba en la de partida lo que se veía en la otra
  useEffect(() => {
    if (!borrador || borrador.orientacion === orientacion) return
    const anterior = leerAjustes().mandos[id]?.disposicion ?? {}
    cambiarMandoJuego(id, { disposicion: { ...anterior, [borrador.orientacion]: borrador.piezas } })
    setBorrador({ orientacion, piezas: anterior[orientacion] ?? {} })
  }, [orientacion, borrador, id])

  const colocaciones = borrador?.piezas ?? ajustes.mandos[id]?.disposicion?.[orientacion]
  /** Las herramientas también se mueven (v0.35.0): su nombre para el editor y, si se han movido, su sitio */
  const piezaHerramienta = (p: Pieza) => ({ 'data-pieza': p, style: colocaciones?.[p] ? (estiloPieza(colocaciones[p]!) as React.CSSProperties) : undefined })

  const editarBotones = () => {
    setVerMando(false)
    setMenu(false)
    setBorrador({ orientacion, piezas: ajustes.mandos[id]?.disposicion?.[orientacion] ?? {} })
    registrar('info', 'Editar los botones', { orientacion })
  }

  const terminarEdicion = () => {
    if (!borrador) return
    const anterior = ajustes.mandos[id]?.disposicion ?? {}
    cambiarMandoJuego(id, { disposicion: { ...anterior, [borrador.orientacion]: borrador.piezas } })
    registrar('info', 'Botones colocados', { piezas: Object.keys(borrador.piezas).length, orientacion: borrador.orientacion })
    setBorrador(null)
    editandoRef.current = false
    seguir()
  }

  useEffect(() => {
    sesion.current?.altavoz.ponerVolumen(ajustes.volumen)
  }, [ajustes.volumen, cargando])

  // 30 imágenes por segundo (v0.28.0): al abrir el juego y al cambiarlo; o en todos los juegos (v0.42.0)
  useEffect(() => {
    if (!cargando) sesion.current?.ponerLimite30(ajustes.ahorroTodos || controles.limite30, ajustes.ahorroTodos ? 'todos' : 'juego')
  }, [controles.limite30, ajustes.ahorroTodos, cargando])

  // Turbo: al abrir el juego y al cambiarlo
  useEffect(() => {
    if (!cargando) sesion.current?.ponerTurbo(turbo)
  }, [turbo, cargando])

  // Al cambiar el modo o el botón de correr, se suelta
  useEffect(() => {
    setCorriendo(false)
    sesion.current?.ponerCorrer(0)
  }, [mando.jrpg, mando.correr])

  const cambiarCorrer = () => {
    const activo = !corriendo
    setCorriendo(activo)
    sesion.current?.ponerCorrer(activo ? bitCorrer(mando.correr) : 0)
  }

  const cambiarVelocidad = () => {
    const siguiente = velocidad === 1 ? 2 : velocidad === 2 ? 4 : 1
    setVelocidad(siguiente)
    sesion.current?.ponerVelocidad(siguiente)
  }

  const rebobinar = (activo: boolean) => {
    setRebobinando(activo)
    sesion.current?.rebobinar(activo)
  }

  const salir = async () => {
    // Con el tiempo de avance rápido de la partida (v0.42.0)
    registrar('info', 'Juego cerrado', { avanceSeg: sesion.current?.segundosAvance ?? 0 })
    setMenu(false)
    await sesion.current?.cerrar()
    sesion.current = null
    alSalir()
  }

  const estadoDe = (r: Ranura) => estados?.find((e) => e.ranura === r)

  // Proporción de la imagen: la del núcleo; en Super Nintendo, la de la televisión (4:3) salvo que
  // se elija el píxel exacto. 256 x 224 a 4:3 ocupa en horizontal un 17 % más de ancho. PlayStation,
  // siempre 4:3 (v0.42.3): sus juegos cambian de resolución en marcha (320 x 240, 512 x 240, 368 x 480…)
  // y con la proporción de cada una la imagen se estrechaba o encogía; en la tele, siempre 4:3
  const aspecto = (sistema === 'snes' && controles.snesAspecto === 'tv') || sistema === 'psx' ? 4 / 3 : nativo.ancho / nativo.alto
  const proporcion = 1 / aspecto

  // El lienzo se dimensiona a mano para poder estirar la imagen a otra proporción; ocupa lo máximo que
  // cabe en su zona y queda centrado (o pegado a un lado en el modo una mano, por CSS)
  useEffect(() => {
    const z = zona.current
    const c = lienzo.current
    if (!z || !c) return
    const ajustar = () => {
      const estilo = getComputedStyle(z)
      const ancho = z.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight)
      const alto = z.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom)
      if (ancho <= 0 || alto <= 0) return
      const w = Math.floor(Math.min(ancho, alto * aspecto))
      const h = Math.floor(w / aspecto)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
      // Tamaño de un píxel del juego en pantalla, para los filtros de imagen
      imagen.current?.style.setProperty('--px', `${w / nativo.ancho}px`)
      imagen.current?.style.setProperty('--py', `${h / nativo.alto}px`)
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(z)
    return () => ro.disconnect()
  }, [aspecto, nativo.ancho, nativo.alto])

  return (
    <div className={`giro ${girada ? `girada ${ajustes.girarPantalla}` : ''}`} data-giro={girada ? (ajustes.girarPantalla === 'derecha' ? 90 : -90) : 0}>
    <div
      className={`juego ${controles.nitido ? '' : 'suave'} ${unaMano ? 'una-mano' : ''} ${controles.pantallaGrande ? 'grande' : ''} ${mando.jrpg ? 'jrpg' : ''}`}
      data-tema={tema.id}
      data-mano={mano}
      data-sistema={sistema}
      data-disposicion={pantallas}
      style={{ ...tema.vars, '--proporcion': proporcion, '--opacidad-horizontal': controles.opacidadMando, '--escala': controles.escalaMando } as React.CSSProperties}
      data-testid="juego"
    >
      <div ref={zona} className="zona-pantalla">
        <span ref={imagen} className="imagen">
          <canvas ref={lienzo} width={240} height={160} aria-label="Pantalla del juego" data-testid="pantalla" />
          {filtro !== 'ninguno' && <span className={`filtro ${filtro}`} data-testid="filtro" aria-hidden />}
        </span>
      </div>

      {pantallas === 'grande' && (
        <MiniaturaDS
          ref={mini}
          posicion={ajustes.mandos[id]?.miniDS}
          alMover={(miniDS) => cambiarMandoJuego(id, { miniDS })}
          alTocar={() => cambiarMandoJuego(id, { principalDS: principal === 'abajo' ? 'arriba' : 'abajo' })}
          tamano={controles.tamanoMiniDS}
        />
      )}

      <Mando
        hombros={hombros}
        cuatro={cuatro}
        jrpg={mando.jrpg ? { menu: mando.menu, extras: extrasJrpg(sistema, mando.menu) } : undefined}
        cuatroDirecciones={mando.jrpg && mando.direcciones === 4}
        turbo={turbo}
        tres={SISTEMAS[sistema].tresBotones}
        etiquetas={SISTEMAS[sistema].etiquetas}
        sinSelect={SISTEMAS[sistema].sinSelect}
        n64={SISTEMAS[sistema].n64 ? { alPalanca: (x, y) => sesion.current?.ponerPalanca(x, y) } : undefined}
        psx={SISTEMAS[sistema].psx}
        palancasPsx={palancasPsx ? { alMover: (lado, x, y) => sesion.current?.ponerPalanca(x, y, lado) } : undefined}
        colocaciones={colocaciones}
        editando={!!borrador}
        correr={mando.jrpg ? { activo: corriendo, boton: mando.correr, alCambiar: cambiarCorrer } : undefined}
        tactil={esTactil ? { lienzo, alTocar: (x, y) => sesion.current?.ponerPuntero(x, y) } : undefined}
        alCambiar={(m) => sesion.current?.ponerBotonesTactil(m)} alToque={() => {
        // Safari solo deja sonar después de un toque: se reintenta en cada uno hasta que suena
        if (!sesion.current?.altavoz.activo) void sesion.current?.altavoz.activar(ajustesRef.current.sonarEnSilencio)
      }} />

      <div className="herramientas izquierda" {...piezaHerramienta('guardar')}>
        <button className="herramienta" aria-label="Guardar rápido" onClick={() => void guardarRapido()}>
          <Save size={20} />
        </button>
        <button className="herramienta" aria-label="Cargar rápido" disabled={!hayRapido} onClick={() => void cargarRapido()}>
          <FolderOpen size={20} />
        </button>
      </div>
      <button className="boton-menu herramienta" aria-label="Menú" onClick={abrirMenu} {...piezaHerramienta('menu')}>
        <Menu size={22} />
      </button>
      <div className="herramientas derecha" {...piezaHerramienta('herramientas')}>
        {conRebobinado && (
        <button
          className={`herramienta ${rebobinando ? 'activa' : ''}`}
          aria-label="Rebobinar (mantén pulsado)"
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // sin captura: basta con soltar encima
            }
            rebobinar(true)
          }}
          onPointerUp={() => rebobinar(false)}
          onPointerCancel={() => rebobinar(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Rewind size={20} />
        </button>
        )}
        {sistema === 'nds' && (
          <button
            className={`herramienta ${soplando ? 'activa' : ''}`}
            aria-label="Soplar al micrófono (mantén pulsado)"
            onPointerDown={(e) => {
              try {
                e.currentTarget.setPointerCapture(e.pointerId)
              } catch {
                // sin captura: basta con soltar encima
              }
              soplar(true)
            }}
            onPointerUp={() => soplar(false)}
            onPointerCancel={() => soplar(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Wind size={20} />
          </button>
        )}
        <button className={`herramienta ${velocidad > 1 ? 'activa' : ''}`} aria-label={`Avance rápido (${velocidad > 1 ? `x${velocidad}` : 'desactivado'})`} onClick={cambiarVelocidad}>
          {velocidad > 1 ? <span className="text-[14px] font-bold">x{velocidad}</span> : <FastForward size={20} />}
        </button>
      </div>

      {ajustes.modoNoche && <div className="capa-noche" style={{ background: COLOR_NOCHE[ajustes.intensidadNoche] }} data-testid="modo-noche" aria-hidden />}

      {(cargando || error) && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/80 p-8 text-center">
          {error ? (
            <div>
              <p className="text-[17px] font-semibold">No se ha podido abrir el juego</p>
              <p className="mt-2 text-[15px] text-zinc-400">{error}</p>
              <button className="boton-lleno mt-6" onClick={alSalir}>
                Volver a la biblioteca
              </button>
            </div>
          ) : (
            <p className="text-[15px] text-zinc-400">Cargando…</p>
          )}
        </div>
      )}

      {pausaFondo && !menu && (
        <button className="absolute inset-0 z-10 grid place-items-center bg-black/70" onClick={seguir} aria-label="Seguir jugando">
          <span className="flex flex-col items-center gap-3">
            <span className="grid size-16 place-items-center rounded-full bg-white/15">
              <Play size={30} />
            </span>
            <span className="text-[17px] font-semibold">En pausa</span>
            {motivoPausa === 'inactividad' && (
              <span className="max-w-64 text-center text-[13px] text-zinc-400">Llevabas {ajustes.pausaSinTocar} minutos sin tocar nada. La partida está guardada.</span>
            )}
            <span className="text-[13px] text-zinc-400">Toca para seguir</span>
          </span>
        </button>
      )}

      {borrador && (
        <EditorMando
          colocaciones={borrador.piezas}
          alCambiar={(piezas) => setBorrador({ ...borrador, piezas })}
          alRestablecer={() => setBorrador({ ...borrador, piezas: {} })}
          alListo={terminarEdicion}
        />
      )}

      {tapaCerrada && !menu && (
        <button className="absolute inset-0 z-10 grid place-items-center bg-black/85 p-8 text-center" onClick={() => cambiarTapa(false)} data-testid="tapa-cerrada">
          <span className="flex flex-col items-center gap-3">
            <BookOpen size={40} strokeWidth={1.5} className="text-zinc-400" />
            <span className="text-[17px] font-semibold">Tapa cerrada</span>
            <span className="text-[13px] text-zinc-400">Toca para abrirla</span>
          </span>
        </button>
      )}

      {dormir && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black p-8 text-center" data-testid="hora-de-dormir">
          <div className="flex flex-col items-center gap-3">
            <BedDouble size={44} strokeWidth={1.5} className="text-zinc-400" />
            <p className="text-[20px] font-semibold">Hora de dormir</p>
            <p className="text-[15px] text-zinc-400">La partida está guardada. Mañana sigues donde lo dejaste.</p>
            <button
              className="boton-texto mt-4 py-2"
              onClick={() => {
                setDormir(false)
                ponerSueno(10)
                seguir()
              }}
            >
              Seguir 10 minutos más
            </button>
            <button className="boton-lleno mt-1" onClick={() => void salir()}>
              Salir del juego
            </button>
          </div>
        </div>
      )}

      {menu && verTemas && <SelectorTema oscura sistema={sistema} alCerrar={() => setVerTemas(false)} />}

      <Hoja oscura abierta={menu && verNotas} alCerrar={() => setVerNotas(false)} titulo="Notas">
        <EditorNotas juegoId={id} oscura />
        <button className="boton-texto mt-2 w-full py-2" onClick={() => setVerNotas(false)}>
          Volver al menú
        </button>
      </Hoja>

      <Hoja oscura abierta={menu && verSueno} alCerrar={() => setVerSueno(false)} titulo="Temporizador de sueño">
        <div className="lista" role="radiogroup" aria-label="Minutos del temporizador">
          {[...MINUTOS_SUENO, null].map((m, i) => (
            <div key={m ?? 'apagado'}>
              {i > 0 && <div className="separador" />}
              <button className="fila" role="radio" aria-checked={m === null ? !finSueno : !!finSueno && minutosSueno === m} onClick={() => ponerSueno(m)}>
                <span className="flex-1">{m ? `${m} minutos` : 'Apagado'}</span>
              </button>
            </div>
          ))}
        </div>
        <p className="pie-grupo">
          {finSueno ? `${textoRestante(finSueno - hora)}. ` : ''}Cinco minutos antes te aviso para que busques dónde guardar; al acabar, el juego se pausa y se guarda todo.
        </p>
        <button className="boton-texto mt-2 w-full py-2" onClick={() => setVerSueno(false)}>
          Volver al menú
        </button>
      </Hoja>

      <Hoja oscura abierta={menu && verPantalla} alCerrar={() => setVerPantalla(false)} titulo="Pantalla">
        <AjustesPantalla juego={{ id, sistema }} />
        <button className="boton-texto mt-4 w-full py-2" onClick={() => setVerPantalla(false)}>
          Volver al menú
        </button>
      </Hoja>

      <Hoja oscura abierta={menu && verMando} alCerrar={() => setVerMando(false)} titulo="Mando">
        <AjustesMando juego={{ id, sistema }} alEditar={editarBotones} />
        <button className="boton-texto mt-4 w-full py-2" onClick={() => setVerMando(false)}>
          Volver al menú
        </button>
      </Hoja>

      <Hoja oscura abierta={menu && verDiscos} alCerrar={() => setVerDiscos(false)} titulo="Disco">
        {discos && (
          <div className="lista" role="radiogroup" aria-label="Disco">
            {Array.from({ length: discos.total }, (_, i) => (
              <div key={i}>
                {i > 0 && <div className="separador" />}
                <button className="fila" role="radio" aria-checked={discos.actual === i} onClick={() => void cambiarDisco(i)}>
                  <Disc size={20} className="text-acento dark:text-acento-oscuro" />
                  <span className="flex-1">Disco {i + 1}</span>
                  {discos.actual === i && <Check size={20} className="text-acento dark:text-acento-oscuro" />}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="pie-grupo">Cámbialo cuando el juego te pida el siguiente disco. Se recuerda: al seguir donde lo dejaste, se pone ese disco.</p>
        <button className="boton-texto mt-4 w-full py-2" onClick={() => setVerDiscos(false)}>
          Volver al menú
        </button>
      </Hoja>

      <Hoja oscura abierta={menu && !verEstados && !verTemas && !verMando && !verPantalla && !verSueno && !verDiscos} alCerrar={seguir} titulo={nombre}>
        <div className="lista">
          <button className="fila font-semibold text-acento dark:text-acento-oscuro" onClick={seguir}>
            <Play size={20} /> Seguir jugando
          </button>
          <div className="separador" />
          <button className="fila" onClick={abrirEstados}>
            <Save size={20} className="text-acento dark:text-acento-oscuro" /> Estados guardados
          </button>
          <div className="separador" />
          <button className="fila" onClick={() => setVerNotas(true)}>
            <NotebookPen size={20} className="text-acento dark:text-acento-oscuro" /> Notas
          </button>
          <div className="separador" />
          {discos && discos.total > 1 && (
            <>
              <button className="fila" onClick={() => setVerDiscos(true)}>
                <Disc size={20} className="text-acento dark:text-acento-oscuro" />
                <span className="flex-1">Disco</span>
                <span className="text-zinc-500">
                  {discos.actual + 1} de {discos.total}
                </span>
                <ChevronRight size={18} className="text-zinc-400" />
              </button>
              <div className="separador" />
            </>
          )}
          {sistema === 'nds' && (
            <>
              <div className="fila justify-between">
                <span className="flex flex-1 items-center gap-3">
                  <BookOpen size={20} className="text-acento dark:text-acento-oscuro" /> Cerrar la tapa
                </span>
                <Interruptor etiqueta="Cerrar la tapa" activo={tapaCerrada} alCambiar={cambiarTapa} />
              </div>
              <div className="separador" />
            </>
          )}
          <button className="fila" onClick={() => setVerSueno(true)}>
            <BedDouble size={20} className="text-acento dark:text-acento-oscuro" />
            <span className="flex-1">Temporizador de sueño</span>
            <span className="text-zinc-500">{finSueno ? textoRestante(finSueno - hora) : 'Apagado'}</span>
          </button>
          <div className="separador" />
          <div className="fila justify-between">
            <span className="flex flex-1 items-center gap-3">
              <Moon size={20} className="text-acento dark:text-acento-oscuro" /> Modo noche
            </span>
            <Interruptor etiqueta="Modo noche" activo={ajustes.modoNoche} alCambiar={(v) => cambiarAjustes({ modoNoche: v })} />
          </div>
          <div className="separador" />
          <button className="fila" onClick={() => cambiarAjustes({ sonido: !ajustes.sonido })}>
            {ajustes.sonido ? <Volume2 size={20} className="text-acento dark:text-acento-oscuro" /> : <VolumeX size={20} className="text-zinc-400" />}
            <span className="flex-1">Sonido</span>
            <span className="text-zinc-500">{ajustes.sonido ? 'Activado' : 'Desactivado'}</span>
          </button>
          <div className="separador" />
          <div className="fila gap-3">
            <Volume1 size={20} className="shrink-0 text-acento dark:text-acento-oscuro" />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(ajustes.volumen * 100)}
              onChange={(e) => cambiarAjustes({ volumen: Number(e.target.value) / 100 })}
              aria-label="Volumen del juego"
              className="deslizador flex-1"
            />
            <span className="w-14 shrink-0 whitespace-nowrap text-right text-zinc-500 tabular-nums">{Math.round(ajustes.volumen * 100)} %</span>
          </div>
          <div className="separador" />
          <div className="fila flex-col items-stretch gap-2 py-3">
            <span className="flex items-center gap-3">
              <RotateCw size={20} className="text-acento dark:text-acento-oscuro" /> Girar la pantalla
            </span>
            <Segmentado
              etiqueta="Girar la pantalla"
              valor={ajustes.girarPantalla}
              opciones={[
                ['no', 'No'],
                ['izquierda', 'A la izquierda'],
                ['derecha', 'A la derecha'],
              ]}
              alCambiar={(v) => cambiarAjustes({ girarPantalla: v })}
            />
          </div>
          <div className="separador" />
          <button className="fila" onClick={() => setVerPantalla(true)}>
            <Monitor size={20} className="text-acento dark:text-acento-oscuro" />
            <span className="flex-1">Pantalla</span>
            <ChevronRight size={18} className="text-zinc-400" />
          </button>
          <div className="separador" />
          <button className="fila" onClick={() => setVerMando(true)}>
            <Gamepad2 size={20} className="text-acento dark:text-acento-oscuro" />
            <span className="flex-1">Mando</span>
            <span className="text-zinc-500">
              {controles.modoMando === 'una-mano' ? 'Una mano' : 'Dos manos'}, {ESCALAS.find(([v]) => v === controles.escalaMando)?.[1].toLowerCase() ?? 'normales'}
            </span>
          </button>
          <div className="separador" />
          <button className="fila" onClick={() => setVerTemas(true)}>
            <Palette size={20} className="text-acento dark:text-acento-oscuro" />
            <span className="flex-1">Tema</span>
            <span className="text-zinc-500">{tema.nombre}</span>
          </button>
          <div className="separador" />
          <button className="fila" onClick={reiniciar}>
            <RotateCcw size={20} className="text-acento dark:text-acento-oscuro" /> Reiniciar
          </button>
        </div>
        <p className="pie-grupo">
          {menu && (sesion.current?.tiempoJugado ?? 0) >= 1000 ? `Llevas ${duracion(sesion.current?.tiempoJugado ?? 0)} en esta partida. ` : ''}
          La partida que guardas dentro del juego se guarda sola en el iPhone.
        </p>
        <div className="lista mt-4">
          <button className="fila text-red-600 dark:text-red-500" onClick={salir}>
            <X size={20} /> Salir a la biblioteca
          </button>
        </div>
      </Hoja>

      <Hoja oscura abierta={menu && verEstados} alCerrar={() => setVerEstados(false)} titulo="Estados guardados">
        <p className="pie-grupo mb-2">Un estado guarda el momento exacto del juego. Hay nueve ranuras por juego y puedes ponerles nombre con el lápiz; al salir se guarda otro aparte para seguir donde lo dejaste.</p>
        <div className="lista">
          {RANURAS_USUARIO.map((r, i) => {
            const e = estadoDe(r)
            return (
              <div key={r}>
                {i > 0 && <div className="separador" />}
                <div className="fila">
                  <Captura estado={e} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{e?.nombre ?? `Ranura ${r}`}</p>
                    <p className="truncate text-[13px] text-zinc-500">{e ? `${e.nombre ? `Ranura ${r}, ` : ''}${cuando(e.fecha)}` : 'Vacía'}</p>
                  </div>
                  {e && (
                    <button className="boton-icono" aria-label={`Poner nombre a la ranura ${r}`} onClick={() => void renombrar(r)}>
                      <Pencil size={18} />
                    </button>
                  )}
                  <button className="boton-icono" aria-label={`Guardar en la ranura ${r}`} onClick={() => void guardarEn(r)}>
                    <Save size={20} />
                  </button>
                  <button className="boton-icono" aria-label={`Cargar la ranura ${r}`} disabled={!e} onClick={() => void cargarDe(r)}>
                    <Upload size={20} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <button className="boton-texto mt-4 w-full py-2" onClick={() => setVerEstados(false)}>
          Volver al menú
        </button>
      </Hoja>
    </div>
    </div>
  )
}

function Captura({ estado }: { estado?: Estado }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!estado?.captura) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(new Blob([estado.captura], { type: 'image/png' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [estado])
  return (
    <span className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
      {url && <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />}
    </span>
  )
}
