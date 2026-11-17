/**
 * Apartado «Pantalla» (v0.18.0): todo lo de la imagen, separado de los botones. Dentro de un juego,
 * los cambios son solo para ese juego y solo salen las opciones de su consola; en Ajustes, son los
 * de por defecto para los juegos que no tienen los suyos.
 */
import { cambiarAjustes, useAjustes } from '../lib/ajustes'
import { CLAVES_PANTALLA, cambiarMandoJuego, controlesDe, tieneControlesPropios, usarControlesGenerales, type ControlesMando } from '../lib/mandoJuego'
import type { Sistema } from '../lib/sistemas'
import { esLibro } from '../emulador/pantallasDS'
import { Check } from 'lucide-react'
import { Interruptor, Segmentado } from './Interfaz'

/** Disposiciones de DS, con una línea que explica cada una. */
const OPCIONES_DS: ['apiladas' | 'lado' | 'libro' | 'grande', string, string][] = [
  ['apiladas', 'Apiladas', 'Una encima de otra, como en la consola'],
  ['lado', 'Lado a lado', 'Una junto a otra, con el iPhone en horizontal'],
  ['libro', 'Libro', 'Giradas, para Hotel Dusk y juegos parecidos'],
  ['grande', 'Grande y pequeña', 'Una grande y la otra en miniatura, que se mueve'],
]

export function AjustesPantalla({ juego }: { juego?: { id: string; sistema: Sistema } } = {}) {
  const ajustes = useAjustes()
  const a = juego ? controlesDe(ajustes, juego.id) : ajustes
  const cambiar = (cambio: Partial<ControlesMando>) => (juego ? cambiarMandoJuego(juego.id, cambio) : cambiarAjustes(cambio))
  const s = juego?.sistema
  const verSnes = !s || s === 'snes'
  const verDS = !s || s === 'nds'
  const verN64 = !s || s === 'n64'
  // La corrección de color es de mGBA: Game Boy Color y GBA
  const verColores = !s || s === 'gb' || s === 'gbc' || s === 'gba'
  return (
    <>
      {juego && <p className="cabecera-grupo">Pantalla de este juego</p>}
      <div className="lista">
        <div className="fila justify-between">
          <span>Lo más grande posible</span>
          <Interruptor etiqueta="Pantalla lo más grande posible" activo={a.pantallaGrande} alCambiar={(v) => cambiar({ pantallaGrande: v })} />
        </div>
        <div className="separador" />
        <div className="fila justify-between">
          <span>Píxeles nítidos</span>
          <Interruptor etiqueta="Píxeles nítidos" activo={a.nitido} alCambiar={(v) => cambiar({ nitido: v })} />
        </div>
        {verColores && (
          <>
            <div className="separador" />
            <div className="fila justify-between">
              <span>Colores como en la consola</span>
              <Interruptor etiqueta="Colores como en la consola" activo={a.coloresConsola} alCambiar={(v) => cambiar({ coloresConsola: v })} />
            </div>
          </>
        )}
        {verSnes && (
          <>
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
                alCambiar={(v) => cambiar({ snesAspecto: v })}
              />
            </div>
          </>
        )}
        {verN64 && (
          <>
            <div className="separador" />
            <div className="fila flex-col items-stretch gap-2 py-3">
              <span>Resolución de Nintendo 64</span>
              <Segmentado
                etiqueta="Resolución de Nintendo 64"
                valor={a.resolucionN64}
                opciones={[
                  ['alta', 'Alta (640 x 480)'],
                  ['normal', 'Normal (320 x 240)'],
                ]}
                alCambiar={(v) => cambiar({ resolucionN64: v })}
              />
            </div>
          </>
        )}
        {verDS && (
          <>
            <div className="separador" />
            <div className="fila flex-col items-stretch gap-2 py-3">
              <span>{juego ? 'Pantallas' : 'Pantallas de Nintendo DS'}</span>
              <div className="overflow-hidden rounded-[10px] bg-zinc-100 dark:bg-zinc-800" role="radiogroup" aria-label="Pantallas de Nintendo DS">
                {OPCIONES_DS.map(([valor, titulo, detalle], i) => {
                  const elegida = valor === 'libro' ? esLibro(a.pantallasDS) : a.pantallasDS === valor
                  return (
                    <button
                      key={valor}
                      role="radio"
                      aria-checked={elegida}
                      aria-label={titulo}
                      onClick={() => cambiar({ pantallasDS: valor === 'libro' ? (esLibro(a.pantallasDS) ? a.pantallasDS : 'libro-derecha') : valor })}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${i > 0 ? 'border-t border-zinc-200 dark:border-zinc-700' : ''}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px]">{titulo}</span>
                        <span className="block text-[13px] text-zinc-500">{detalle}</span>
                      </span>
                      {elegida && <Check size={20} className="shrink-0 text-acento dark:text-acento-oscuro" />}
                    </button>
                  )
                })}
              </div>
              {esLibro(a.pantallasDS) && (
                <Segmentado
                  etiqueta="Pantalla táctil"
                  valor={a.pantallasDS}
                  opciones={[
                    ['libro-izquierda', 'Táctil a la izquierda'],
                    ['libro-derecha', 'Táctil a la derecha'],
                  ]}
                  alCambiar={(v) => cambiar({ pantallasDS: v })}
                />
              )}
              {a.pantallasDS === 'grande' && (
                <Segmentado
                  etiqueta="Tamaño de la miniatura"
                  valor={a.tamanoMiniDS}
                  opciones={[
                    ['pequena', 'Miniatura pequeña'],
                    ['mediana', 'Mediana'],
                    ['grande', 'Grande'],
                  ]}
                  alCambiar={(v) => cambiar({ tamanoMiniDS: v })}
                />
              )}
            </div>
          </>
        )}
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Filtro de imagen</span>
          <Segmentado
            etiqueta="Filtro de imagen"
            valor={a.filtro}
            opciones={[
              ['ninguno', 'Ninguno'],
              ['consola', 'Consola'],
              ['lcd', 'LCD'],
              ['tv', 'Tele'],
            ]}
            alCambiar={(v) => cambiar({ filtro: v })}
          />
        </div>
        <div className="separador" />
        <div className="fila justify-between">
          <span>Ahorrar batería (30 imágenes por segundo)</span>
          {/* Con el ahorro en todos los juegos (v0.42.0), dentro de un juego se ve activado y no se puede quitar */}
          <Interruptor
            etiqueta="Ahorrar batería (30 imágenes por segundo)"
            activo={a.limite30 || (!!juego && ajustes.ahorroTodos)}
            desactivado={!!juego && ajustes.ahorroTodos}
            alCambiar={(v) => cambiar({ limite30: v })}
          />
        </div>
        {!juego && (
          <>
            <div className="separador" />
            <div className="fila justify-between">
              <span>Ahorrar batería en todos los juegos</span>
              <Interruptor etiqueta="Ahorrar batería en todos los juegos" activo={ajustes.ahorroTodos} alCambiar={(v) => cambiarAjustes({ ahorroTodos: v })} />
            </div>
          </>
        )}
      </div>
      <p className="mt-2 px-4 text-[13px] text-zinc-500">
        {juego && ajustes.ahorroTodos
          ? 'Activado para todos los juegos en Ajustes, Pantalla.'
          : juego
            ? 'El juego va a su velocidad y se dibuja la mitad de veces: menos trabajo y menos calor.'
            : 'Arriba, lo que usan los juegos que no tienen su propio ajuste. «En todos los juegos» manda sobre el ajuste de cada uno. Si el iPhone limita la pantalla a 30 refrescos (modo de bajo consumo o calor), el ahorro se activa solo.'}
      </p>
      {juego && tieneControlesPropios(ajustes, juego.id, CLAVES_PANTALLA) && (
        <div className="lista mt-3">
          <button className="fila text-acento dark:text-acento-oscuro" onClick={() => usarControlesGenerales(juego.id, CLAVES_PANTALLA)}>
            Usar los ajustes generales
          </button>
        </div>
      )}
      <p className="pie-grupo">
        {juego
          ? 'Solo para este juego; el resto sigue con los suyos. Los de por defecto se cambian en Ajustes, Pantalla. '
          : 'Para los juegos que no tengan los suyos: dentro de cada juego, en Menú, Pantalla, se cambian solo para ese juego. '}
        Lo más grande posible: sin margen ni marco, de borde a borde en vertical y a toda la altura en horizontal.
        {verColores && ' Colores como en la consola: la GBA y la Game Boy Color tenían pantallas apagadas y los juegos se pintaron con colores muy vivos para compensarlo; así se ven como en la consola.'}
        {verN64 && ' Resolución de Nintendo 64: «Normal» es la de la consola; se ve más pixelada, pero la tarjeta gráfica del iPhone trabaja la cuarta parte. Pruébala si el juego da tirones. Se aplica al volver a abrir el juego.'}
        {verDS && ' Pantallas de DS: «Libro» es para los juegos que se juegan con la consola de lado (Hotel Dusk, Last Window, Brain Training): gira el iPhone y elige el lado de la táctil como en el juego. En «Grande y pequeña», arrastra la miniatura para moverla y tócala para cambiar cuál va grande. «Lado a lado» se ve mejor con el iPhone en horizontal.'}
        {' Filtro «Consola»: la rejilla de la pantalla LCD en las portátiles y las líneas de la tele en Super Nintendo.'}
        {' Ahorrar batería: el juego va a su velocidad, pero la imagen se actualiza 30 veces por segundo en lugar de 60. Se ve algo menos fluido y el iPhone dibuja la mitad de veces; la emulación cuesta lo mismo.'}
      </p>
    </>
  )
}
