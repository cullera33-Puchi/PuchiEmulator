/** Tamaño de los botones, distribución en vertical (dos manos o una) y opacidad en horizontal. */
import { cambiarAjustes, useAjustes } from '../lib/ajustes'
import { Interruptor, Segmentado } from './Interfaz'

export const ESCALAS: [number, string][] = [
  [0.8, 'Pequeños'],
  [1, 'Normales'],
  [1.15, 'Grandes'],
  [1.3, 'Enormes'],
]

export function AjustesMando() {
  const a = useAjustes()
  return (
    <>
      <div className="lista">
        <div className="fila justify-between">
          <span>Pantalla lo más grande posible</span>
          <Interruptor etiqueta="Pantalla lo más grande posible" activo={a.pantallaGrande} alCambiar={(v) => cambiarAjustes({ pantallaGrande: v })} />
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
