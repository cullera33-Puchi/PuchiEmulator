/**
 * Navegación: inicio (consolas), biblioteca de cada consola, ajustes y juego. Sin rutas en la
 * dirección: la app instalada se abre siempre en el inicio, y vuelve a él si se pasa más de dos
 * horas fuera (salvo en un juego). Al salir de un juego se vuelve a la biblioteca de su consola.
 */
import { Gamepad2, Hand, Rewind } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
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
import type { Sistema } from './lib/sistemas'

type Pantalla = { tipo: 'inicio' } | { tipo: 'estadisticas' } | { tipo: 'biblioteca'; sistema: Sistema } | { tipo: 'ajustes' } | { tipo: 'juego'; id: string; reanudar: boolean; sistema: Sistema }

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

function Pantallas() {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: 'inicio' })
  const ocultaDesde = useRef(0)

  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') ocultaDesde.current = Date.now()
      else if (ocultaDesde.current && Date.now() - ocultaDesde.current > DOS_HORAS) {
        setPantalla((p) => {
          if (p.tipo === 'juego' || p.tipo === 'inicio') return p
          registrar('info', 'Vuelta al inicio tras dos horas fuera')
          return { tipo: 'inicio' }
        })
      }
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])

  const jugar = (j: TipoJuego, reanudar: boolean) => setPantalla({ tipo: 'juego', id: j.id, reanudar, sistema: j.sistema })

  return (
    <>
      {pantalla.tipo === 'inicio' && (
        <Inicio alEstadisticas={() => setPantalla({ tipo: 'estadisticas' })} alAbrirConsola={(sistema) => setPantalla({ tipo: 'biblioteca', sistema })} alJugar={jugar} alAjustes={() => setPantalla({ tipo: 'ajustes' })} />
      )}
      {pantalla.tipo === 'biblioteca' && <Biblioteca sistema={pantalla.sistema} alJugar={jugar} alVolver={() => setPantalla({ tipo: 'inicio' })} />}
      {pantalla.tipo === 'estadisticas' && <Estadisticas alVolver={() => setPantalla({ tipo: 'inicio' })} />}
      {pantalla.tipo === 'ajustes' && <Ajustes alVolver={() => setPantalla({ tipo: 'inicio' })} />}
      {pantalla.tipo === 'juego' && <Juego id={pantalla.id} reanudar={pantalla.reanudar} alSalir={() => setPantalla({ tipo: 'biblioteca', sistema: pantalla.sistema })} />}
      <AvisoVersion visible={pantalla.tipo !== 'juego'} />
      {pantalla.tipo === 'inicio' && <Bienvenida />}
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
