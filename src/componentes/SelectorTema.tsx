/** Elegir el tema de la pantalla de juego de una consola, con una muestra de cada uno. */
import { Check } from 'lucide-react'
import { cambiarAjustes, useAjustes } from '../lib/ajustes'
import { SISTEMAS, type Sistema } from '../lib/sistemas'
import { PALETAS, TEMA_DE_CONSOLA, TEMAS, temaPorId, type IdTema, type Tema } from '../lib/temas'
import { Hoja, Segmentado } from './Interfaz'

function Muestra({ tema }: { tema: Tema }) {
  const v = tema.vars
  const fondo = v['--fondo'] ?? '#000'
  return (
    <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl border border-black/10" style={{ background: fondo }} aria-hidden>
      <span className="absolute inset-x-[12%] top-[8%] h-[34%] rounded-md" style={{ background: v['--marco'] ?? '#111', padding: 4 }}>
        <span className="block h-full w-full rounded-sm bg-[#8bac0f]/80" />
      </span>
      <span className="absolute bottom-[22%] left-[12%] h-[20%] w-[8%] rounded-sm" style={{ background: v['--cruceta'] ?? '#444' }} />
      <span className="absolute bottom-[28%] left-[4%] h-[8%] w-[24%] rounded-sm" style={{ background: v['--cruceta'] ?? '#444' }} />
      <span className="absolute right-[10%] bottom-[30%] size-[16%] rounded-full" style={{ background: v['--ab'] ?? '#444' }} />
      <span className="absolute right-[30%] bottom-[22%] size-[16%] rounded-full" style={{ background: v['--ab'] ?? '#444' }} />
    </span>
  )
}

export function SelectorTema({ sistema, alCerrar, oscura, alCambiarPaleta }: { sistema: Sistema | null; alCerrar: () => void; oscura?: boolean; alCambiarPaleta?: () => void }) {
  const a = useAjustes()
  if (!sistema) return null
  const elegido = a.temas[sistema] ?? 'auto'
  const elegir = (id: IdTema | 'auto') => cambiarAjustes({ temas: { ...a.temas, [sistema]: id } })
  const opciones: [IdTema | 'auto', string, Tema][] = [
    ['auto', `Según la consola (${temaPorId(TEMA_DE_CONSOLA[sistema]).nombre})`, temaPorId(TEMA_DE_CONSOLA[sistema])],
    ...TEMAS.map((t): [IdTema, string, Tema] => [t.id, t.nombre, t]),
  ]
  return (
    <Hoja abierta oscura={oscura} alCerrar={alCerrar} titulo={`Tema de ${SISTEMAS[sistema].nombre}`}>
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Tema">
        {opciones.map(([id, nombre, tema]) => (
          <button key={id} role="radio" aria-checked={elegido === id} aria-label={nombre} className="text-left active:opacity-70" onClick={() => elegir(id)}>
            <span className={`block rounded-[14px] p-0.5 ${elegido === id ? 'ring-2 ring-acento dark:ring-acento-oscuro' : ''}`}>
              <Muestra tema={tema} />
            </span>
            <span className="mt-1 flex items-center gap-1 text-[12px] leading-tight">
              {elegido === id && <Check size={12} className="shrink-0 text-acento dark:text-acento-oscuro" />}
              <span className="line-clamp-2">{nombre}</span>
            </span>
          </button>
        ))}
      </div>
      {sistema === 'gb' && (
        <>
          <p className="cabecera-grupo mt-5">Colores de la pantalla</p>
          <div className="lista p-3">
            <Segmentado
              etiqueta="Colores de la pantalla"
              valor={a.paletaGb}
              opciones={PALETAS.map(([v, t]) => [v, t.replace('Según el tema', 'Tema')])}
              alCambiar={(v) => {
                cambiarAjustes({ paletaGb: v })
                alCambiarPaleta?.()
              }}
            />
          </div>
          <p className="pie-grupo">Para los juegos de Game Boy sin color. Con «Tema», la Clásica usa el verde original.</p>
        </>
      )}
      <p className="pie-grupo mt-3">Diseños propios inspirados en las consolas, sin logotipos.</p>
    </Hoja>
  )
}
