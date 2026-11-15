/** Ajustes: sonido, imagen y mando, copia de las partidas, espacio y versión. */
import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Interruptor, useInterfaz } from '../componentes/Interfaz'
import { aplicarTema, cambiarAjustes, useAjustes, type Ajustes as TipoAjustes } from '../lib/ajustes'
import { espacioUsado, pedirPersistencia } from '../lib/almacen'
import { compartirArchivo, crearArchivo, ErrorArchivo, importarArchivo, nombreArchivo } from '../lib/copias'
import { plural, tamano } from '../lib/formato'
import { APP_VERSION } from '../lib/version'

function Segmentado<T extends string | number>({ valor, opciones, alCambiar, etiqueta }: { valor: T; opciones: [T, string][]; alCambiar: (v: T) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid rounded-[9px] bg-zinc-200/80 p-0.5 dark:bg-zinc-800" style={{ gridTemplateColumns: `repeat(${opciones.length}, 1fr)` }}>
      {opciones.map(([v, texto]) => (
        <button
          key={String(v)}
          role="radio"
          aria-checked={v === valor}
          onClick={() => alCambiar(v)}
          className={`rounded-[7px] py-1.5 text-[13px] font-medium ${v === valor ? 'bg-white shadow-sm dark:bg-zinc-600' : 'text-zinc-600 dark:text-zinc-300'}`}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}

export function Ajustes({ alVolver }: { alVolver: () => void }) {
  const a = useAjustes()
  const { avisar, confirmar } = useInterfaz()
  const [conEstados, setConEstados] = useState(true)
  const [espacio, setEspacio] = useState<{ usado: number; cuota: number } | null>(null)
  const [persistente, setPersistente] = useState<boolean | null>(null)
  const selector = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void espacioUsado().then(setEspacio)
    void navigator.storage?.persisted?.().then(setPersistente, () => setPersistente(null))
  }, [])

  const cambiar = (c: Partial<TipoAjustes>) => {
    cambiarAjustes(c)
    if (c.tema) aplicarTema(c.tema)
  }

  const exportar = async () => {
    try {
      const archivo = await crearArchivo(conEstados, APP_VERSION)
      if (!archivo.partidas.length && !archivo.estados.length) {
        avisar('Aún no hay partidas que copiar')
        return
      }
      const r = await compartirArchivo(JSON.stringify(archivo), nombreArchivo())
      if (r !== 'cancelado') avisar(`Copia lista: ${plural(archivo.partidas.length, 'partida', 'partidas')}${archivo.estados.length ? ` y ${plural(archivo.estados.length, 'estado', 'estados')}` : ''}`)
    } catch (e) {
      console.error(e)
      avisar('No se ha podido crear la copia')
    }
  }

  const alElegirCopia = async (f: File | undefined) => {
    if (selector.current) selector.current.value = ''
    if (!f) return
    const ok = await confirmar({
      titulo: '¿Recuperar esta copia?',
      mensaje: 'Las partidas y estados de la copia sustituyen a los de esos mismos juegos en este iPhone. El resto no cambia.',
      aceptar: 'Recuperar',
    })
    if (!ok) return
    try {
      const r = await importarArchivo(await f.text())
      avisar(`Recuperadas ${plural(r.partidas, 'partida', 'partidas')}${r.estados ? ` y ${plural(r.estados, 'estado', 'estados')}` : ''}`)
    } catch (e) {
      avisar(e instanceof ErrorArchivo ? e.message : 'No se ha podido leer la copia')
    }
  }

  const proteger = async () => {
    const ok = await pedirPersistencia()
    setPersistente(ok)
    avisar(ok ? 'Datos protegidos' : 'Safari no lo ha permitido. Instala la app en la pantalla de inicio')
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
      <div className="flex h-11 items-center">
        <button className="boton-texto -ml-2 flex items-center" onClick={alVolver}>
          <ChevronLeft size={26} /> Juegos
        </button>
      </div>
      <h1 className="mb-4 px-1 text-[34px] leading-tight font-bold">Ajustes</h1>

      <p className="cabecera-grupo">Sonido</p>
      <div className="lista">
        <div className="fila justify-between">
          <span>Sonido</span>
          <Interruptor etiqueta="Sonido" activo={a.sonido} alCambiar={(v) => cambiar({ sonido: v })} />
        </div>
        <div className="separador" />
        <div className="fila justify-between">
          <span>Sonar con el iPhone en silencio</span>
          <Interruptor etiqueta="Sonar con el iPhone en silencio" activo={a.sonarEnSilencio} alCambiar={(v) => cambiar({ sonarEnSilencio: v })} />
        </div>
      </div>
      <p className="pie-grupo">Si está desactivado, el juego no suena con el interruptor de silencio puesto, como el resto de juegos del iPhone.</p>

      <p className="cabecera-grupo mt-6">Imagen y mando</p>
      <div className="lista">
        <div className="fila justify-between">
          <span>Píxeles nítidos</span>
          <Interruptor etiqueta="Píxeles nítidos" activo={a.nitido} alCambiar={(v) => cambiar({ nitido: v })} />
        </div>
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Botones en horizontal</span>
          <Segmentado
            etiqueta="Opacidad de los botones en horizontal"
            valor={a.opacidadMando}
            opciones={[
              [0.3, 'Discretos'],
              [0.6, 'Normal'],
              [1, 'Opacos'],
            ]}
            alCambiar={(v) => cambiar({ opacidadMando: v })}
          />
        </div>
        <div className="separador" />
        <div className="fila flex-col items-stretch gap-2 py-3">
          <span>Tema de la biblioteca</span>
          <Segmentado
            etiqueta="Tema"
            valor={a.tema}
            opciones={[
              ['auto', 'Automático'],
              ['claro', 'Claro'],
              ['oscuro', 'Oscuro'],
            ]}
            alCambiar={(v) => cambiar({ tema: v })}
          />
        </div>
      </div>
      <p className="pie-grupo">En horizontal los botones quedan encima del borde de la imagen. También funcionan un teclado y los mandos de PlayStation, Xbox o MFi conectados al iPhone.</p>

      <p className="cabecera-grupo mt-6">Copia de las partidas</p>
      <div className="lista">
        <div className="fila justify-between">
          <span>Incluir los estados guardados</span>
          <Interruptor etiqueta="Incluir los estados guardados" activo={conEstados} alCambiar={setConEstados} />
        </div>
        <div className="separador" />
        <button className="fila text-acento dark:text-acento-oscuro" onClick={() => void exportar()}>
          Guardar una copia en Archivos
        </button>
        <div className="separador" />
        <button className="fila text-acento dark:text-acento-oscuro" onClick={() => selector.current?.click()}>
          Recuperar una copia
        </button>
      </div>
      <p className="pie-grupo">Las partidas viven en este iPhone. La copia sirve para no perderlas si borras la app o para pasarlas a otro iPhone. No lleva los juegos.</p>
      <input ref={selector} type="file" className="hidden" data-testid="selector-copia" onChange={(e) => void alElegirCopia(e.target.files?.[0])} />

      <p className="cabecera-grupo mt-6">Almacenamiento</p>
      <div className="lista">
        <div className="fila justify-between">
          <span>Espacio usado</span>
          <span className="text-zinc-500">{espacio ? tamano(espacio.usado) : 'No disponible'}</span>
        </div>
        <div className="separador" />
        <div className="fila justify-between">
          <span>Datos protegidos</span>
          {persistente ? (
            <span className="text-zinc-500">Sí</span>
          ) : (
            <button className="boton-texto" onClick={() => void proteger()}>
              Proteger
            </button>
          )}
        </div>
      </div>
      <p className="pie-grupo">Instala la app en la pantalla de inicio (Compartir, Añadir a pantalla de inicio): así Safari no borra los datos aunque pases semanas sin jugar.</p>

      <p className="cabecera-grupo mt-6">Acerca de</p>
      <div className="lista">
        <div className="fila justify-between">
          <span>Versión</span>
          <span className="text-zinc-500">{APP_VERSION}</span>
        </div>
        <div className="separador" />
        <a className="fila justify-between" href="https://github.com/mgba-emu/mgba" target="_blank" rel="noreferrer">
          <span>Núcleo de Game Boy y GBA</span>
          <span className="text-zinc-500">mGBA (MPL 2.0)</span>
        </a>
      </div>
      <p className="pie-grupo">La app no incluye juegos ni BIOS. Usa copias de tus propios cartuchos.</p>
    </div>
  )
}
