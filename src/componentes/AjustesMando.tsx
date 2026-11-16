/** Botones: tamaño, distribución (dos manos o una), mano y opacidad en horizontal, y el modo JRPG del juego. La imagen va aparte, en AjustesPantalla. */
import { cambiarAjustes, useAjustes } from '../lib/ajustes'
import {
  botonesTurbo,
  cambiarMandoJuego,
  controlesDe,
  correrDe,
  mandoDe,
  menusDe,
  NOMBRE_BOTON,
  tieneControlesPropios,
  usarControlesGenerales,
  CLAVES_MANDO,
  type ControlesMando,
  type MandoJuego,
} from '../lib/mandoJuego'
import { SISTEMAS, type Sistema } from '../lib/sistemas'
import type { NombreBoton } from '../emulador/botones'
import { Interruptor, Segmentado } from './Interfaz'

export const ESCALAS: [number, string][] = [
  [0.8, 'Pequeños'],
  [1, 'Normales'],
  [1.15, 'Grandes'],
  [1.3, 'Enormes'],
]

/** Modo JRPG del juego abierto: se guarda por juego. */
function MandoDelJuego({ id, sistema }: { id: string; sistema: Sistema }) {
  const a = useAjustes()
  const m = mandoDe(a.mandos, id, sistema)
  const cambiar = (cambio: Partial<MandoJuego>) => cambiarMandoJuego(id, { ...m, ...cambio })
  const correr = correrDe(sistema)
  return (
    <>
      <p className="cabecera-grupo">Este juego</p>
      <div className="lista">
        <div className="fila justify-between">
          <span>Mando para juegos de rol</span>
          <Interruptor etiqueta="Mando para juegos de rol" activo={m.jrpg} alCambiar={(v) => cambiar({ jrpg: v })} />
        </div>
        {m.jrpg && (
          <>
            <div className="separador" />
            <div className="fila flex-col items-stretch gap-2 py-3">
              <span>Botón de menú</span>
              <Segmentado
                etiqueta="Botón de menú"
                valor={m.menu}
                opciones={menusDe(sistema).map((b) => [b, b === 'SELECT' ? NOMBRE_BOTON[b] : (SISTEMAS[sistema].etiquetas?.[b] ?? NOMBRE_BOTON[b])])}
                alCambiar={(v) => cambiar({ menu: v })}
              />
            </div>
            <div className="separador" />
            <div className="fila flex-col items-stretch gap-2 py-3">
              <span>Cruceta</span>
              <Segmentado
                etiqueta="Direcciones de la cruceta"
                valor={m.direcciones}
                opciones={[
                  [8, 'Con diagonales'],
                  [4, 'Sin diagonales'],
                ]}
                alCambiar={(v) => cambiar({ direcciones: v })}
              />
            </div>
            {correr.length > 1 && (
              <>
                <div className="separador" />
                <div className="fila flex-col items-stretch gap-2 py-3">
                  <span>Correr con</span>
                  <Segmentado etiqueta="Correr con" valor={m.correr} opciones={correr.map((b) => [b, NOMBRE_BOTON[b]])} alCambiar={(v) => cambiar({ correr: v })} />
                </div>
              </>
            )}
          </>
        )}
      </div>
      <p className="pie-grupo mb-4">
        Solo para este juego. A más grande donde descansa el pulgar, y B y el botón de menú a su alrededor. «Correr», debajo de la A, deja {correr.length > 1 ? 'el botón elegido' : 'B'} pulsado; tócalo otra vez para soltarlo. Sin diagonales, la cruceta solo da arriba, abajo, izquierda y derecha: va mejor en los juegos que se mueven por casillas.
      </p>
    </>
  )
}

/**
 * Botones. Dentro de un juego, los cambios son solo para ese juego; en Ajustes, son los de por
 * defecto para los juegos que no tienen los suyos.
 */
export function AjustesMando({ juego, alEditar }: { juego?: { id: string; sistema: Sistema }; alEditar?: () => void } = {}) {
  const ajustes = useAjustes()
  const a = juego ? controlesDe(ajustes, juego.id) : ajustes
  const cambiar = (cambio: Partial<ControlesMando>) => (juego ? cambiarMandoJuego(juego.id, cambio) : cambiarAjustes(cambio))
  return (
    <>
      {juego && !SISTEMAS[juego.sistema].n64 && <MandoDelJuego id={juego.id} sistema={juego.sistema} />}
      {juego && <p className="cabecera-grupo">Botones de este juego</p>}
      {juego && alEditar && (
        <>
          <div className="lista mb-1">
            <button className="fila text-acento dark:text-acento-oscuro" onClick={alEditar}>
              Mover y cambiar de tamaño los botones
            </button>
          </div>
          <p className="pie-grupo mb-4">Arrastra cada botón a donde te venga mejor el pulgar. Se guarda para este juego, por separado en vertical y en horizontal.</p>
        </>
      )}
      <div className="lista">
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Tamaño de los botones</span>
          <Segmentado etiqueta="Tamaño de los botones" valor={a.escalaMando} opciones={ESCALAS} alCambiar={(v) => cambiar({ escalaMando: v })} />
        </div>
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Distribución</span>
          <Segmentado
            etiqueta="Distribución del mando"
            valor={a.modoMando}
            opciones={[
              ['dos-manos', 'Dos manos'],
              ['una-mano', 'Una mano'],
            ]}
            alCambiar={(v) => cambiar({ modoMando: v })}
          />
          {a.modoMando === 'una-mano' && (
            <Segmentado
              etiqueta="Mano"
              valor={a.mano}
              opciones={[
                ['izquierda', 'Mano izquierda'],
                ['derecha', 'Mano derecha'],
              ]}
              alCambiar={(v) => cambiar({ mano: v })}
            />
          )}
        </div>
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Botones en horizontal</span>
          <Segmentado
            etiqueta="Opacidad de los botones en horizontal"
            valor={a.opacidadMando}
            opciones={[
              [0.3, 'Discretos'],
              [0.6, 'Normales'],
              [1, 'Opacos'],
            ]}
            alCambiar={(v) => cambiar({ opacidadMando: v })}
          />
        </div>
      </div>
      {juego && <Turbo id={juego.id} sistema={juego.sistema} />}
      {juego && tieneControlesPropios(ajustes, juego.id, CLAVES_MANDO) && (
        <div className="lista mt-3">
          <button className="fila text-acento dark:text-acento-oscuro" onClick={() => usarControlesGenerales(juego.id, CLAVES_MANDO)}>
            Usar los ajustes generales
          </button>
        </div>
      )}
      <p className="pie-grupo">
        {juego
          ? 'Solo para este juego; el resto sigue con los suyos. Los de por defecto se cambian en Ajustes, Mando. '
          : 'Para los juegos que no tengan los suyos: dentro de cada juego, en Menú, Mando, se cambian solo para ese juego. '}
        Con «Una mano», en vertical todo queda abajo, al alcance del pulgar; en horizontal, la pantalla se pega al otro lado y los botones van en una columna translúcida. Cómodo para juegos de rol y de estrategia.
      </p>
    </>
  )
}

/** Turbo por botón, solo de este juego (v0.19.0). */
function Turbo({ id, sistema }: { id: string; sistema: Sistema }) {
  const a = useAjustes()
  const etiqueta = (b: NombreBoton) => SISTEMAS[sistema].etiquetas?.[b as 'A'] ?? b
  const activos = a.mandos[id]?.turbo ?? []
  const cambiar = (b: NombreBoton) =>
    cambiarMandoJuego(id, { turbo: activos.includes(b) ? activos.filter((x) => x !== b) : [...activos, b] })
  return (
    <>
      <p className="cabecera-grupo mt-5">Turbo</p>
      <div className="lista flex flex-wrap gap-2 p-3" role="group" aria-label="Botones con turbo">
        {botonesTurbo(sistema).map((b) => {
          const activo = activos.includes(b)
          return (
            <button
              key={b}
              role="switch"
              aria-checked={activo}
              aria-label={`Turbo en ${etiqueta(b)}`}
              onClick={() => cambiar(b)}
              className={`h-10 min-w-12 rounded-full px-4 text-[15px] font-semibold ${activo ? 'bg-acento text-white dark:bg-acento-oscuro' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}
            >
              {etiqueta(b)}
            </button>
          )
        })}
      </div>
      <p className="pie-grupo mb-4">Solo para este juego. Mientras mantienes un botón con turbo, se pulsa y se suelta solo unas diez veces por segundo; en pantalla lleva una «T».</p>
    </>
  )
}
