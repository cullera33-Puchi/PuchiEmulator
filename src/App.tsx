/**
 * Navegación: inicio (consolas), biblioteca de cada consola, ajustes y juego. Sin rutas en la
 * dirección: la app instalada se abre siempre en el inicio, y vuelve a él si se pasa más de dos
 * horas fuera (salvo en un juego). Al salir de un juego se vuelve a la biblioteca de su consola.
 */
import { Gamepad2, Hand, Rewind } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { seVolvioDeslizando } from './componentes/gestos'
import { Hoja, ProveedorInterfaz, useInterfaz } from './componentes/Interfaz'
import { cambiarAjustes, useAjustes } from './lib/ajustes'
import { registrar } from './lib/registro'
import { cargarNovedades, novedadesPosteriores, type Novedad } from './lib/version'
import { Ajustes } from './pantallas/Ajustes'
import { Biblioteca } from './pantallas/Biblioteca'
import { Estadisticas } from './pantallas/Estadisticas'
import { Inicio } from './pantallas/Inicio'
import { Juego } from './pantallas/Juego'
import type { Juego as TipoJuego } from './lib/almacen'
import { consolaDe, type Consola } from './lib/sistemas'

type Pantalla = { tipo: 'inicio' } | { tipo: 'estadisticas' } | { tipo: 'biblioteca'; consola: Consola } | { tipo: 'ajustes' } | { tipo: 'juego'; id: string; reanudar: boolean; consola: Consola }

const DOS_HORAS = 2 * 60 * 60 * 1000

function AvisoVersion({ visible }: { visible: boolean }) {
  const { avisar } = useInterfaz()
  const [novedades, setNovedades] = useState<Novedad[] | null>(null)
  const {
    needRefresh: [pendiente],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Al volver a la app se mira si hay versión nueva
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registro?.update().catch(() => undefined)
      })
    },
    onRegisterError(e) {
      registrar('aviso', 'Service worker no registrado', (e as Error)?.message)
    },
  })

  const actualizar = () => {
    registrar('info', 'Actualización aplicada por el usuario')
    void updateServiceWorker(true)
  }

  const verNovedades = async () => {
    const nuevas = novedadesPosteriores((await cargarNovedades()) ?? [])
    if (!nuevas.length) actualizar()
    else setNovedades(nuevas)
  }

  // Nunca durante una partida: el aviso sale al volver a la biblioteca
  useEffect(() => {
    if (!pendiente || !visible) return
    registrar('info', 'Nueva versión descargada, pendiente de aplicar')
    avisar('Nueva versión disponible', { texto: 'Actualizar', fn: () => void verNovedades() })
  }, [pendiente, visible])

  return (
    <Hoja abierta={!!novedades} alCerrar={() => setNovedades(null)} titulo={novedades ? `Novedades de la ${novedades[0].version}` : undefined}>
      {novedades?.map((n) => (
        <div key={n.version} className="mb-4">
          <p className="cabecera-grupo">
            Versión {n.version}, {n.fecha}
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
      <div className="grid grid-cols-2 gap-2">
        <button className="h-12 rounded-xl bg-zinc-200 text-[17px] font-semibold dark:bg-zinc-800" onClick={() => setNovedades(null)}>
          Más tarde
        </button>
        <button className="boton-lleno" onClick={actualizar}>
          Actualizar
        </button>
      </div>
    </Hoja>
  )
}

function Bienvenida() {
  const { bienvenidaVista } = useAjustes()
  const consejos = [
    { icono: Gamepad2, titulo: 'Añade tus juegos', texto: 'Con «+» eliges los ficheros en Archivos y cada uno va a su consola. Toca una consola para ver sus juegos.' },
    { icono: Hand, titulo: 'Mantén pulsado un juego', texto: 'Para poner su carátula, cambiarle el nombre o empezar desde el principio.' },
    { icono: Rewind, titulo: 'Guarda, carga y rebobina', texto: 'En el juego tienes guardar y cargar rápido, y rebobinar manteniendo pulsado. Tu partida se guarda sola.' },
  ]
  return (
    <Hoja abierta={!bienvenidaVista} alCerrar={() => cambiarAjustes({ bienvenidaVista: true })} titulo="Bienvenido">
      <div className="lista">
        {consejos.map(({ icono: Icono, titulo, texto }, i) => (
          <div key={titulo}>
            {i > 0 && <div className="separador" />}
            <div className="fila items-start py-3">
              <Icono size={26} strokeWidth={1.5} className="mt-0.5 shrink-0 text-acento dark:text-acento-oscuro" />
              <div>
                <p className="font-semibold">{titulo}</p>
                <p className="text-[15px] text-zinc-500">{texto}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="boton-lleno mt-4 w-full" onClick={() => cambiarAjustes({ bienvenidaVista: true })}>
        Entendido
      </button>
    </Hoja>
  )
}

type Transicion = 'entrar' | 'volver' | 'volver-deslizando' | 'abrir-juego' | 'cerrar-juego' | 'ninguna'

interface Vista {
  actual: Pantalla
  /** La pantalla que se va, mientras dura la animación */
  saliente: Pantalla | null
  transicion: Transicion
}

const DURACION_MS = 520

const clave = (p: Pantalla) => (p.tipo === 'biblioteca' ? `biblioteca-${p.consola}` : p.tipo === 'juego' ? `juego-${p.id}` : p.tipo)

/** Clases de cada capa según la transición (animaciones en index.css). */
function clases(t: Transicion, rol: 'actual' | 'saliente'): string {
  if (t === 'entrar') return rol === 'actual' ? 'entra-desde-derecha arriba' : 'sale-a-izquierda'
  if (t === 'volver') return rol === 'actual' ? 'entra-desde-izquierda' : 'sale-a-derecha arriba'
  if (t === 'volver-deslizando') return 'entra-desde-izquierda'
  if (t === 'abrir-juego') return rol === 'actual' ? 'aparece arriba' : ''
  if (t === 'cerrar-juego') return 'aparece-suave'
  return ''
}

function Pantallas() {
  const [vista, setVista] = useState<Vista>({ actual: { tipo: 'inicio' }, saliente: null, transicion: 'ninguna' })
  const ocupadoHasta = useRef(0)
  const temporizador = useRef(0)
  const ocultaDesde = useRef(0)

  /** Navega con su animación. Mientras dura, se ignoran más toques (guía 4.2). */
  const ir = useCallback((nueva: Pantalla, transicion: Transicion) => {
    const ahora = Date.now()
    if (ahora < ocupadoHasta.current) return
    let reducir = false
    try {
      reducir = matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reducir = false
    }
    const t: Transicion = reducir ? 'ninguna' : transicion
    setVista((v) => ({
      actual: nueva,
      // El juego que se cierra no se queda dibujado: su sesión se cierra al desmontarlo
      saliente: t === 'ninguna' || t === 'volver-deslizando' || t === 'cerrar-juego' || v.actual.tipo === 'juego' ? null : v.actual,
      transicion: t,
    }))
    if (t === 'ninguna') return
    ocupadoHasta.current = ahora + DURACION_MS
    clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setVista((v) => ({ ...v, saliente: null, transicion: 'ninguna' })), DURACION_MS)
  }, [])

  const volver = useCallback((destino: Pantalla) => ir(destino, seVolvioDeslizando() ? 'volver-deslizando' : 'volver'), [ir])

  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') ocultaDesde.current = Date.now()
      else if (ocultaDesde.current && Date.now() - ocultaDesde.current > DOS_HORAS) {
        setVista((v) => {
          if (v.actual.tipo === 'juego' || v.actual.tipo === 'inicio') return v
          registrar('info', 'Vuelta al inicio tras dos horas fuera')
          return { actual: { tipo: 'inicio' }, saliente: null, transicion: 'ninguna' }
        })
      }
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])

  const jugar = (j: TipoJuego, reanudar: boolean) => ir({ tipo: 'juego', id: j.id, reanudar, consola: consolaDe(j.sistema) }, 'abrir-juego')

  const dibujar = (p: Pantalla) => {
    switch (p.tipo) {
      case 'inicio':
        return (
          <Inicio
            alEstadisticas={() => ir({ tipo: 'estadisticas' }, 'entrar')}
            alAbrirConsola={(consola) => ir({ tipo: 'biblioteca', consola }, 'entrar')}
            alJugar={jugar}
            alAjustes={() => ir({ tipo: 'ajustes' }, 'entrar')}
          />
        )
      case 'biblioteca':
        return <Biblioteca consola={p.consola} alJugar={jugar} alVolver={() => volver({ tipo: 'inicio' })} />
      case 'estadisticas':
        return <Estadisticas alVolver={() => volver({ tipo: 'inicio' })} />
      case 'ajustes':
        return <Ajustes alVolver={() => volver({ tipo: 'inicio' })} />
      case 'juego':
        return <Juego id={p.id} reanudar={p.reanudar} alSalir={() => ir({ tipo: 'biblioteca', consola: p.consola }, 'cerrar-juego')} />
    }
  }

  const { actual, saliente, transicion } = vista
  // La que está encima en la animación se dibuja la última
  const capas: { p: Pantalla; rol: 'actual' | 'saliente' }[] = saliente
    ? transicion === 'volver'
      ? [
          { p: actual, rol: 'actual' },
          { p: saliente, rol: 'saliente' },
        ]
      : [
          { p: saliente, rol: 'saliente' },
          { p: actual, rol: 'actual' },
        ]
    : [{ p: actual, rol: 'actual' }]

  return (
    <>
      {capas.map(({ p, rol }) => (
        <div
          key={clave(p)}
          className={`capa ${clases(transicion, rol)}`}
          data-saliendo={rol === 'saliente' ? '' : undefined}
          aria-hidden={rol === 'saliente' ? true : undefined}
          inert={rol === 'saliente' ? true : undefined}
        >
          {dibujar(p)}
        </div>
      ))}
      <AvisoVersion visible={actual.tipo !== 'juego'} />
      {actual.tipo === 'inicio' && <Bienvenida />}
    </>
  )
}

export function App() {
  return (
    <ProveedorInterfaz>
      <Pantallas />
    </ProveedorInterfaz>
  )
}
