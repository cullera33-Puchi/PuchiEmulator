/**
 * Carátulas automáticas: para cada juego sin carátula que aún no se ha buscado, se busca en el
 * índice de libretro y se pone solo si la coincidencia es segura (`elegirAutomatica`). Cada juego se
 * busca una vez (`caratulaBuscada`); si falla la red, se reintenta la próxima vez.
 */
import { actualizarJuego, guardarCaratula, leerCaratula, leerJuego, listarCaratulas, listarJuegos, type Juego } from './almacen'
import { buscarCaratulas, descargarCaratula, elegirAutomatica, urlCaratula } from './caratulas'
import { registrar } from './registro'

export interface ResultadoAuto {
  puestas: number
  sinCoincidencia: number
  fallidas: number
}

/** Las búsquedas van en fila: una que llega con otra en marcha espera y ve los juegos nuevos */
let cadena: Promise<unknown> = Promise.resolve()

async function una(j: Juego): Promise<'puesta' | 'sin' | 'fallo'> {
  try {
    const { repo, candidatos } = await buscarCaratulas(j.sistema, j.nombre)
    const elegida = elegirAutomatica(j.nombre, candidatos)
    const datos = elegida ? await descargarCaratula(urlCaratula(repo, elegida.nombre)) : null
    // Mientras se buscaba, el usuario pudo quitar el juego o poner otra carátula: no se pisa
    const actual = await leerJuego(j.id)
    if (!actual) return 'sin'
    if (datos && !(await leerCaratula(j.id))) await guardarCaratula({ id: j.id, datos, origen: 'libretro', fecha: Date.now() })
    await actualizarJuego({ ...actual, caratulaBuscada: true })
    return datos ? 'puesta' : 'sin'
  } catch {
    // Sin conexión o la imagen no está: se reintenta la próxima vez
    return 'fallo'
  }
}

/**
 * Busca las carátulas que faltan. Con `todas`, también las de juegos ya buscados (botón «Buscar
 * ahora las que faltan»).
 */
export function buscarCaratulasPendientes(todas = false): Promise<ResultadoAuto> {
  const p = cadena.then(async () => {
    const [juegos, caratulas] = await Promise.all([listarJuegos(), listarCaratulas()])
    const conCaratula = new Set(caratulas.map((c) => c.id))
    const pendientes = juegos.filter((j) => !conCaratula.has(j.id) && (todas || !j.caratulaBuscada))
    const r: ResultadoAuto = { puestas: 0, sinCoincidencia: 0, fallidas: 0 }
    for (const j of pendientes) {
      const e = await una(j)
      if (e === 'puesta') r.puestas++
      else if (e === 'sin') r.sinCoincidencia++
      else r.fallidas++
    }
    if (pendientes.length) registrar('info', 'Carátulas automáticas', r)
    return r
  })
  cadena = p.catch(() => undefined)
  return p
}
