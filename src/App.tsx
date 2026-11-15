/**
 * Navegación: biblioteca, ajustes y juego. Sin rutas en la dirección: la app instalada se abre
 * siempre en la biblioteca.
 */
import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Hoja, ProveedorInterfaz } from './componentes/Interfaz'
import { Ajustes } from './pantallas/Ajustes'
import { Biblioteca } from './pantallas/Biblioteca'
import { Juego } from './pantallas/Juego'
import { cargarNovedades, novedadesPosteriores, type Novedad } from './lib/version'

type Pantalla = { tipo: 'biblioteca' } | { tipo: 'ajustes' } | { tipo: 'juego'; id: string; reanudar: boolean }

function AvisoVersion({ visible }: { visible: boolean }) {
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
  })
  if (!pendiente || !visible) return null
  const verNovedades = async () => {
    const nuevas = novedadesPosteriores((await cargarNovedades()) ?? [])
    if (!nuevas.length) void updateServiceWorker(true)
    else setNovedades(nuevas)
  }
  return (
    <>
      <div
        className="fixed inset-x-4 z-30 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-zinc-800/95 px-4 py-3 text-[15px] text-white shadow-lg"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <span>Nueva versión disponible</span>
        <button className="font-semibold text-[#0a84ff]" onClick={() => void verNovedades()}>
          Actualizar
        </button>
      </div>
      <Hoja abierta={!!novedades} alCerrar={() => setNovedades(null)} titulo="Novedades">
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
        <button className="boton-lleno w-full" onClick={() => void updateServiceWorker(true)}>
          Actualizar
        </button>
      </Hoja>
    </>
  )
}

export function App() {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: 'biblioteca' })
  return (
    <ProveedorInterfaz>
      {pantalla.tipo === 'biblioteca' && (
        <Biblioteca alJugar={(id, reanudar) => setPantalla({ tipo: 'juego', id, reanudar })} alAjustes={() => setPantalla({ tipo: 'ajustes' })} />
      )}
      {pantalla.tipo === 'ajustes' && <Ajustes alVolver={() => setPantalla({ tipo: 'biblioteca' })} />}
      {pantalla.tipo === 'juego' && <Juego id={pantalla.id} reanudar={pantalla.reanudar} alSalir={() => setPantalla({ tipo: 'biblioteca' })} />}
      <AvisoVersion visible={pantalla.tipo !== 'juego'} />
    </ProveedorInterfaz>
  )
}
