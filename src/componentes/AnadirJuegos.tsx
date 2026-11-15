/**
 * Añadir juegos desde Archivos, desde el inicio o desde la biblioteca de una consola. Cada juego va
 * a su consola, aunque se añada desde otra.
 */
import { useRef, useState } from 'react'
import { anadirFichero } from '../lib/biblioteca'
import { plural } from '../lib/formato'
import { registrar } from '../lib/registro'
import { SISTEMAS, type Sistema } from '../lib/sistemas'
import { useInterfaz } from './Interfaz'

export function useAnadirJuegos(alTerminar: () => void | Promise<void>, desde?: Sistema) {
  const { avisar } = useInterfaz()
  const selector = useRef<HTMLInputElement>(null)
  const [anadiendo, setAnadiendo] = useState<string | null>(null)

  const alElegir = async (ficheros: FileList | null) => {
    if (!ficheros?.length) return
    let nuevos = 0
    let repetidos = 0
    const fallidos: string[] = []
    const consolas = new Set<Sistema>()
    for (const [i, f] of Array.from(ficheros).entries()) {
      setAnadiendo(ficheros.length > 1 ? `Añadiendo ${i + 1} de ${ficheros.length}…` : 'Añadiendo…')
      try {
        const r = await anadirFichero(f.name, await f.arrayBuffer())
        if (r.tipo === 'nuevo') {
          nuevos++
          consolas.add(r.juego.sistema)
        } else if (r.tipo === 'repetido') repetidos++
        else fallidos.push(f.name)
      } catch (e) {
        registrar('error', 'No se pudo añadir un juego', (e as Error).message)
        fallidos.push(f.name)
      }
    }
    setAnadiendo(null)
    if (selector.current) selector.current.value = ''
    registrar('info', 'Juegos añadidos', { nuevos, repetidos, fallidos: fallidos.length })
    await alTerminar()
    const partes: string[] = []
    if (nuevos) {
      // Se dice a qué consola han ido si no es la que se está viendo
      const otra = consolas.size === 1 ? [...consolas][0] : null
      const destino = otra && otra !== desde ? ` a ${SISTEMAS[otra].nombre}` : consolas.size > 1 ? ' a sus consolas' : ''
      partes.push((nuevos === 1 ? 'Juego añadido' : plural(nuevos, 'juego añadido', 'juegos añadidos')) + destino)
    }
    if (repetidos) partes.push(repetidos === 1 ? 'uno ya estaba en la biblioteca' : `${repetidos} ya estaban en la biblioteca`)
    if (fallidos.length) partes.push(fallidos.length === 1 ? `«${fallidos[0]}» no es un juego que se pueda abrir` : `${fallidos.length} ficheros no se han reconocido`)
    const texto = partes.join(', ')
    avisar(texto.charAt(0).toUpperCase() + texto.slice(1))
  }

  const elementos = (
    <>
      {/* Sin filtro de tipo: en el iPhone, Archivos no deja elegir extensiones que no conoce */}
      <input ref={selector} type="file" multiple className="hidden" data-testid="selector" onChange={(e) => void alElegir(e.target.files)} />
      {anadiendo && (
        <div className="velo fixed inset-0 z-50 grid place-items-center bg-black/40">
          <p className="rounded-2xl bg-white px-6 py-4 text-[15px] dark:bg-zinc-800">{anadiendo}</p>
        </div>
      )}
    </>
  )

  return { abrir: () => selector.current?.click(), elementos }
}
