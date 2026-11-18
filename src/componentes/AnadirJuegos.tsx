/**
 * Añadir juegos desde Archivos, desde el inicio o desde la biblioteca de una consola. Cada juego va
 * a su consola, aunque se añada desde otra.
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { leerAjustes } from '../lib/ajustes'
import { pedirPersistencia } from '../lib/almacen'
import { anadirDisco, anadirFichero, type ResultadoAnadir } from '../lib/biblioteca'
import { agruparDiscos, seLeeEntero, type GrupoDisco } from '../lib/discos'
import { buscarCaratulasPendientes } from '../lib/caratulasAuto'
import { plural } from '../lib/formato'
import { registrar } from '../lib/registro'
import { CONSOLAS_APP, consolaDe, type Consola } from '../lib/sistemas'
import { useInterfaz } from './Interfaz'

export function useAnadirJuegos(alTerminar: () => void | Promise<void>, desde?: Consola) {
  const { avisar } = useInterfaz()
  const selector = useRef<HTMLInputElement>(null)
  const [anadiendo, setAnadiendo] = useState<string | null>(null)

  const alElegir = async (ficheros: FileList | null) => {
    if (!ficheros?.length) return
    let nuevos = 0
    let repetidos = 0
    const fallidos: string[] = []
    const consolas = new Set<Consola>()
    let sinEspacio = false
    const contar = (r: ResultadoAnadir, nombre: string) => {
      if (r.tipo === 'nuevo') {
        nuevos++
        consolas.add(consolaDe(r.juego.sistema))
      } else if (r.tipo === 'repetido') repetidos++
      else fallidos.push(nombre)
    }
    setAnadiendo('Añadiendo…')
    let discos: GrupoDisco[] = []
    let resto: File[] = []
    try {
      // Discos de PlayStation (v0.37.0): el CUE con sus BIN, el CHD o un BIN suelto. Se copian al iPhone
      // por trozos, sin leerlos enteros a la memoria
      const grupos = await agruparDiscos(Array.from(ficheros))
      discos = grupos.discos
      resto = grupos.resto
      for (const n of grupos.incompletos) fallidos.push(`${n} (falta su .bin: elígelos juntos)`)
      for (const n of grupos.sinHoja) fallidos.push(`${n} (falta su .cue: elígelos juntos)`)
    } catch (e) {
      // Un fichero que no se deja leer (v0.43.2): antes el velo de «Añadiendo…» se quedaba para siempre
      registrar('error', 'No se pudieron leer los ficheros elegidos', (e as Error)?.message)
      setAnadiendo(null)
      if (selector.current) selector.current.value = ''
      avisar('No se han podido leer los ficheros elegidos')
      return
    }
    if (discos.length) await pedirPersistencia().catch(() => false)
    const total = discos.length + resto.length
    for (const [i, g] of discos.entries()) {
      const cual = total > 1 ? `${i + 1} de ${total}: ` : ''
      setAnadiendo(`${cual}copiando el disco…`)
      try {
        contar(await anadirDisco(g, (f) => setAnadiendo(`${cual}copiando el disco, ${Math.floor(f * 100)} %`)), g.nombreFichero)
      } catch (e) {
        const mensaje = (e as Error).message
        registrar('error', 'No se pudo añadir un disco', mensaje)
        if (/no cabe/i.test(mensaje)) sinEspacio = true
        fallidos.push(g.nombreFichero)
      }
    }
    for (const [i, f] of resto.entries()) {
      setAnadiendo(total > 1 ? `Añadiendo ${discos.length + i + 1} de ${total}…` : 'Añadiendo…')
      try {
        if (!seLeeEntero(f.name, f.size)) {
          fallidos.push(f.name)
          continue
        }
        contar(await anadirFichero(f.name, await f.arrayBuffer()), f.name)
      } catch (e) {
        registrar('error', 'No se pudo añadir un juego', (e as Error).message)
        fallidos.push(f.name)
      }
    }
    setAnadiendo(null)
    if (selector.current) selector.current.value = ''
    registrar('info', 'Juegos añadidos', { nuevos, repetidos, fallidos: fallidos.length, discos: discos.length })
    await alTerminar()
    const partes: string[] = []
    if (nuevos) {
      // Se dice a qué consola han ido si no es la que se está viendo
      const otra = consolas.size === 1 ? [...consolas][0] : null
      const destino = otra && otra !== desde ? ` a ${CONSOLAS_APP[otra].nombre}` : consolas.size > 1 ? ' a sus consolas' : ''
      partes.push((nuevos === 1 ? 'Juego añadido' : plural(nuevos, 'juego añadido', 'juegos añadidos')) + destino)
    }
    if (repetidos) partes.push(repetidos === 1 ? 'uno ya estaba en la biblioteca' : `${repetidos} ya estaban en la biblioteca`)
    if (sinEspacio) partes.push('no queda espacio en el iPhone para el disco')
    else if (fallidos.length) partes.push(fallidos.length === 1 ? `«${fallidos[0]}» no es un juego que se pueda abrir` : `${fallidos.length} ficheros no se han reconocido`)
    const texto = partes.join(', ')
    avisar(texto.charAt(0).toUpperCase() + texto.slice(1))
    // Carátulas de los nuevos, por detrás
    if (nuevos && leerAjustes().caratulasAuto) {
      const r = await buscarCaratulasPendientes()
      if (r.puestas) {
        await alTerminar()
        avisar(r.puestas === 1 ? 'Carátula puesta' : plural(r.puestas, 'carátula puesta', 'carátulas puestas'))
      }
    }
  }

  const elementos = (
    <>
      {/* Sin filtro de tipo: en el iPhone, Archivos no deja elegir extensiones que no conoce */}
      <input ref={selector} type="file" multiple className="hidden" data-testid="selector" onChange={(e) => void alElegir(e.target.files)} />
      {/* En el body (v0.37.3): el inicio va en su propia capa y lo fijo dentro quedaría atado a ella */}
      {anadiendo &&
        createPortal(
          <div className="velo fixed inset-0 z-50 grid place-items-center bg-black/40">
            <p className="rounded-2xl bg-white px-6 py-4 text-[15px] dark:bg-zinc-800">{anadiendo}</p>
          </div>,
          document.body,
        )}
    </>
  )

  return { abrir: () => selector.current?.click(), elementos }
}
