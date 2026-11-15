/** Tamaño de los botones, distribución en vertical (dos manos o una) y opacidad en horizontal. */
import { cambiarAjustes, leerAjustes, useAjustes } from '../lib/ajustes'
import { correrDe, mandoDe, menusDe, NOMBRE_BOTON, type MandoJuego } from '../lib/mandoJuego'
import type { Sistema } from '../lib/sistemas'
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
  const cambiar = (cambio: Partial<MandoJuego>) => {
    const mandos = leerAjustes().mandos
    cambiarAjustes({ mandos: { ...mandos, [id]: { ...m, ...cambio } } })
  }
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
              <Segmentado etiqueta="Botón de menú" valor={m.menu} opciones={menusDe(sistema).map((b) => [b, NOMBRE_BOTON[b]])} alCambiar={(v) => cambiar({ menu: v })} />
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
        Solo para este juego. A más grande donde descansa el pulgar, y B y el botón de menú a su alrededor. El botón con huellas deja {correr.length > 1 ? 'el botón elegido' : 'B'} pulsado para correr; tócalo otra vez para soltarlo.
      </p>
    </>
  )
}

export function AjustesMando({ juego }: { juego?: { id: string; sistema: Sistema } } = {}) {
  const a = useAjustes()
  return (
    <>
      {juego && <MandoDelJuego id={juego.id} sistema={juego.sistema} />}
      <div className="lista">
        <div className="fila justify-between">
          <span>Pantalla lo más grande posible</span>
          <Interruptor etiqueta="Pantalla lo más grande posible" activo={a.pantallaGrande} alCambiar={(v) => cambiarAjustes({ pantallaGrande: v })} />
        </div>
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Imagen de Super Nintendo</span>
          <Segmentado
            etiqueta="Imagen de Super Nintendo"
            valor={a.snesAspecto}
            opciones={[
              ['tv', 'Como en la tele (4:3)'],
              ['pixel', 'Píxel exacto (8:7)'],
            ]}
            alCambiar={(v) => cambiarAjustes({ snesAspecto: v })}
          />
        </div>
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Tamaño de los botones</span>
          <Segmentado etiqueta="Tamaño de los botones" valor={a.escalaMando} opciones={ESCALAS} alCambiar={(v) => cambiarAjustes({ escalaMando: v })} />
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
            alCambiar={(v) => cambiarAjustes({ modoMando: v })}
          />
          {a.modoMando === 'una-mano' && (
            <Segmentado
              etiqueta="Mano"
              valor={a.mano}
              opciones={[
                ['izquierda', 'Mano izquierda'],
                ['derecha', 'Mano derecha'],
              ]}
              alCambiar={(v) => cambiarAjustes({ mano: v })}
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
            alCambiar={(v) => cambiarAjustes({ opacidadMando: v })}
          />
        </div>
      </div>
      <p className="pie-grupo">
        Pantalla grande: sin margen ni marco, de borde a borde en vertical y a toda la altura en horizontal. Con «Una mano», en vertical todo queda abajo, al alcance del pulgar; en horizontal, la pantalla se pega al otro lado y los botones van en una columna translúcida. Cómodo para juegos de rol y de estrategia.
      </p>
    </>
  )
}
