/**
 * Comprobación en el iPhone (v0.44.0, mejora 20): la lista de lo que queda por confirmar, en Ajustes.
 * Cada punto se marca como «Bien» o «Falla» mientras se juega; al final, «Enviar resultados» manda la
 * lista y el registro desde que se empezó, por la hoja de compartir del iPhone (o copiados).
 */
import { useEffect, useState } from 'react'
import { useInterfaz, Segmentado } from './Interfaz'
import { COMPROBACION, guardarComprobacion, leerComprobacion, marcar, recuento, textoComprobacion, TOTAL_PUNTOS, type EstadoComprobacion, type Resultado } from '../lib/comprobacion'
import { enviarTexto, registrar, textoRegistro } from '../lib/registro'

const OPCIONES: [Resultado, string][] = [
  ['pendiente', 'Sin probar'],
  ['bien', 'Bien'],
  ['falla', 'Falla'],
]

const oyentes = new Set<() => void>()

/** Lo que se ve a la derecha en la lista de Ajustes: «3 de 16» o nada */
export function useResumenComprobacion(): string | undefined {
  const [, refrescar] = useState(0)
  useEffect(() => {
    const f = () => refrescar((n) => n + 1)
    oyentes.add(f)
    return () => void oyentes.delete(f)
  }, [])
  const { hechos } = recuento(leerComprobacion())
  return hechos ? `${hechos} de ${TOTAL_PUNTOS}` : undefined
}

export function Comprobacion({ recuentos }: { recuentos: () => Promise<string> }) {
  const { avisar, confirmar } = useInterfaz()
  const [estado, setEstado] = useState<EstadoComprobacion>(leerComprobacion)

  const cambiar = (nuevo: EstadoComprobacion) => {
    setEstado(nuevo)
    guardarComprobacion(nuevo)
    oyentes.forEach((f) => f())
  }

  const enviar = async () => {
    const texto = `${textoComprobacion(estado)}\n\n${textoRegistro(await recuentos(), false, estado.inicio)}`
    const r = await enviarTexto(texto)
    const { bien, falla } = recuento(estado)
    if (r === 'enviado' || r === 'copiado') registrar('info', 'Comprobación enviada', { bien, falla })
    if (r === 'copiado') avisar('Resultados copiados: pégalos en el chat')
    else if (r === 'fallo') avisar('No se ha podido enviar')
  }

  const empezarDeNuevo = async () => {
    const ok = await confirmar({ titulo: '¿Empezar la comprobación de nuevo?', mensaje: 'Se borran las marcas y las notas de esta lista.', aceptar: 'Empezar de nuevo', destructivo: true })
    if (!ok) return
    const antes = estado
    cambiar({ resultados: {}, notas: '' })
    avisar('Comprobación vacía', { fn: () => cambiar(antes) })
  }

  const { bien, falla, hechos } = recuento(estado)
  const minutos = COMPROBACION.reduce((n, g) => n + g.minutos, 0)

  return (
    <>
      <p className="pie-grupo mb-2">
        Unos {minutos} minutos. Ve haciendo cada punto en el juego que digas y vuelve aquí a marcarlo: se recuerda aunque cierres la app. Al acabar, envía los resultados y pégalos en el chat.
      </p>
      {COMPROBACION.map((g) => (
        <div key={g.titulo} className="mb-4">
          <p className="cabecera-grupo">
            {g.titulo}, unos {g.minutos} minutos
          </p>
          <div className="lista">
            {g.puntos.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <div className="separador" />}
                <div className="flex flex-col gap-2 px-4 py-3">
                  <p className={`text-[15px] ${estado.resultados[p.id] === 'falla' ? 'text-red-600 dark:text-red-500' : ''}`}>{p.texto}</p>
                  <Segmentado etiqueta={p.texto} valor={estado.resultados[p.id] ?? 'pendiente'} opciones={OPCIONES} alCambiar={(r) => cambiar(marcar(estado, p.id, r))} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="cabecera-grupo">Notas</p>
      <div className="lista">
        <textarea
          className="block min-h-24 w-full resize-none bg-transparent px-4 py-3 text-[15px] outline-none"
          placeholder="Qué ha fallado y en qué juego (opcional)"
          aria-label="Notas de la comprobación"
          value={estado.notas}
          onChange={(e) => cambiar({ ...estado, notas: e.target.value })}
        />
      </div>
      <div className="lista mt-4">
        <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void enviar()}>
          Enviar resultados
        </button>
        {(hechos > 0 || estado.notas) && (
          <>
            <div className="separador" />
            <button className="fila text-red-600 dark:text-red-500" onClick={() => void empezarDeNuevo()}>
              Empezar de nuevo
            </button>
          </>
        )}
      </div>
      <p className="pie-grupo">
        {hechos ? `${bien} bien y ${falla} ${falla === 1 ? 'falla' : 'fallan'} de ${TOTAL_PUNTOS}. ` : ''}Con los resultados va el registro desde que marcaste el primer punto. No lleva nombres de juegos ni partidas, salvo lo que escribas en las notas.
      </p>
    </>
  )
}
